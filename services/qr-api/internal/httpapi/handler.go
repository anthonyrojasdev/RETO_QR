package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"

	"reto-qr/qr-api/internal/cache"
	"reto-qr/qr-api/internal/history"
	"reto-qr/qr-api/internal/identity"
	"reto-qr/qr-api/internal/qr"
	"reto-qr/qr-api/internal/stats"
)

const (
	// Tiempos máximos de las operaciones opcionales: si Redis o PostgreSQL
	// fallan, la factorización debe responder igual.
	cacheTimeout   = 300 * time.Millisecond
	historyTimeout = time.Second

	defaultHistoryLimit = 10
	maxHistoryLimit     = 50
)

// StatisticsService calcula estadísticas sobre el resultado de la factorización.
// En producción lo implementa stats.Client; en las pruebas, un doble.
type StatisticsService interface {
	Compute(ctx context.Context, q, r [][]float64, requestID string) (stats.Statistics, error)
}

// FactorizeRequest es el cuerpo de POST /qr.
type FactorizeRequest struct {
	// Matrix es la matriz rectangular A (m×n) a factorizar.
	Matrix Matrix `json:"matrix"`
}

// FactorizeResponse es la respuesta de POST /qr.
type FactorizeResponse struct {
	// Q es la matriz ortogonal (m×m).
	Q [][]float64 `json:"Q"`
	// R es la matriz triangular superior (m×n), con diagonal no negativa.
	R [][]float64 `json:"R"`
	// Statistics son las estadísticas calculadas por la Stats API sobre Q y R.
	Statistics stats.Statistics `json:"statistics"`
}

// HistoryResponse es la respuesta de GET /qr/history.
type HistoryResponse struct {
	Items []history.Entry `json:"items"`
}

// Handler agrupa los endpoints de la API.
type Handler struct {
	stats        StatisticsService
	cache        cache.Cache
	cacheTTL     time.Duration
	history      history.Store
	maxDimension int
	logger       *slog.Logger
}

// Factorize calcula la factorización QR y obtiene las estadísticas de Q y R.
//
//	@Summary		Factorización QR de una matriz
//	@Description	Recibe una matriz rectangular A (m×n), calcula A = Q·R (Q ortogonal m×m, R triangular superior m×n) y envía Q y R a la Stats API. Devuelve Q, R y las estadísticas.
//	@Description	Si la misma matriz ya se calculó, responde desde el caché de Redis (cabecera X-Cache: HIT). Cada cálculo se guarda en el historial del usuario.
//	@Tags			qr
//	@Accept			json
//	@Produce		json
//	@Param			request	body		FactorizeRequest	true	"Matriz a factorizar"
//	@Success		200		{object}	FactorizeResponse
//	@Header			200		{string}	X-Cache			"HIT si la respuesta salió del caché, MISS si se calculó"
//	@Failure		400		{object}	ErrorResponse	"JSON o matriz inválidos"
//	@Failure		401		{object}	GatewayError	"Token ausente, inválido o expirado (responde Kong)"
//	@Failure		415		{object}	ErrorResponse	"El cuerpo no es application/json"
//	@Failure		429		{object}	GatewayError	"Límite de peticiones superado (responde Kong)"
//	@Failure		502		{object}	ErrorResponse	"La Stats API no respondió correctamente"
//	@Security		BearerAuth
//	@Router			/qr [post]
func (h *Handler) Factorize(c *fiber.Ctx) error {
	if !c.Is("json") {
		return newAPIError(fiber.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE",
			"el cuerpo debe enviarse como application/json")
	}

	var req FactorizeRequest
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		if errors.Is(err, errNullElement) {
			return newAPIError(fiber.StatusBadRequest, "INVALID_MATRIX", err.Error())
		}
		return newAPIError(fiber.StatusBadRequest, "INVALID_JSON", "JSON inválido: "+err.Error())
	}
	if err := req.Matrix.Validate(h.maxDimension); err != nil {
		return newAPIError(fiber.StatusBadRequest, "INVALID_MATRIX", err.Error())
	}

	ctx, reqID := c.UserContext(), requestID(c)
	key := cache.Key(req.Matrix)

	resp, cached := h.fromCache(ctx, key, reqID)
	if !cached {
		result, err := qr.Factorize(req.Matrix)
		if err != nil {
			return newAPIError(fiber.StatusBadRequest, "INVALID_MATRIX", err.Error())
		}
		statistics, err := h.stats.Compute(ctx, result.Q, result.R, reqID)
		if err != nil {
			h.logger.Error("no se pudieron obtener las estadísticas", "requestId", reqID, "error", err)
			return newAPIError(fiber.StatusBadGateway, "STATS_SERVICE_ERROR",
				"no se pudieron calcular las estadísticas; inténtalo de nuevo")
		}
		resp = FactorizeResponse{Q: result.Q, R: result.R, Statistics: statistics}
		h.toCache(ctx, key, resp, reqID)
	}

	h.saveHistory(ctx, c.Get(fiber.HeaderAuthorization), req.Matrix, resp, cached, reqID)

	if cached {
		c.Set("X-Cache", "HIT")
	} else {
		c.Set("X-Cache", "MISS")
	}
	return c.JSON(resp)
}

// History devuelve las últimas factorizaciones del usuario autenticado.
//
//	@Summary		Historial de factorizaciones
//	@Description	Devuelve las últimas factorizaciones del usuario del token, de la más reciente a la más antigua.
//	@Tags			qr
//	@Produce		json
//	@Param			limit	query		int	false	"Cantidad máxima de resultados (1-50)"	default(10)
//	@Success		200		{object}	HistoryResponse
//	@Failure		401		{object}	GatewayError	"Token ausente, inválido o expirado (responde Kong)"
//	@Failure		503		{object}	ErrorResponse	"El historial no está disponible"
//	@Security		BearerAuth
//	@Router			/qr/history [get]
func (h *Handler) History(c *fiber.Ctx) error {
	user, err := identity.FromAuthorization(c.Get(fiber.HeaderAuthorization))
	if err != nil {
		return newAPIError(fiber.StatusUnauthorized, "UNAUTHENTICATED", err.Error())
	}

	limit := c.QueryInt("limit", defaultHistoryLimit)
	limit = max(1, min(limit, maxHistoryLimit))

	ctx, cancel := context.WithTimeout(c.UserContext(), 3*time.Second)
	defer cancel()
	entries, err := h.history.List(ctx, user.Username, limit)
	if err != nil {
		if !errors.Is(err, history.ErrUnavailable) {
			h.logger.Error("no se pudo leer el historial", "requestId", requestID(c), "error", err)
		}
		return newAPIError(fiber.StatusServiceUnavailable, "HISTORY_UNAVAILABLE", "el historial no está disponible")
	}
	if entries == nil {
		entries = []history.Entry{}
	}
	return c.JSON(HistoryResponse{Items: entries})
}

// Health indica que el servicio está en funcionamiento (lo usa Docker).
func (h *Handler) Health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

// fromCache busca una respuesta calculada antes. Un fallo de Redis se trata como "no está".
func (h *Handler) fromCache(ctx context.Context, key, reqID string) (FactorizeResponse, bool) {
	ctx, cancel := context.WithTimeout(ctx, cacheTimeout)
	defer cancel()

	data, found, err := h.cache.Get(ctx, key)
	if err != nil {
		h.logger.Warn("caché no disponible, se calcula sin caché", "requestId", reqID, "error", err)
		return FactorizeResponse{}, false
	}
	var resp FactorizeResponse
	if !found || json.Unmarshal(data, &resp) != nil {
		return FactorizeResponse{}, false
	}
	return resp, true
}

// toCache guarda la respuesta; si falla solo se registra.
func (h *Handler) toCache(ctx context.Context, key string, resp FactorizeResponse, reqID string) {
	data, err := json.Marshal(resp)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, cacheTimeout)
	defer cancel()
	if err := h.cache.Set(ctx, key, data, h.cacheTTL); err != nil {
		h.logger.Warn("no se pudo guardar en caché", "requestId", reqID, "error", err)
	}
}

// saveHistory guarda la factorización en el historial del usuario del token.
// Un fallo no afecta la respuesta: el historial es un complemento.
func (h *Handler) saveHistory(ctx context.Context, authorization string, matrix Matrix, resp FactorizeResponse, cached bool, reqID string) {
	user, err := identity.FromAuthorization(authorization)
	if err != nil {
		return // llamada interna sin usuario: no hay historial que guardar
	}
	ctx, cancel := context.WithTimeout(ctx, historyTimeout)
	defer cancel()
	err = h.history.Save(ctx, history.NewEntry{
		Username: user.Username, RequestID: reqID, Matrix: matrix,
		Q: resp.Q, R: resp.R, Statistics: resp.Statistics, Cached: cached,
	})
	if err != nil {
		h.logger.Warn("no se pudo guardar el historial", "requestId", reqID, "error", err)
	}
}
