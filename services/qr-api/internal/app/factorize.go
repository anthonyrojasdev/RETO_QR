package app

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"time"

	"reto-qr/qr-api/internal/domain"
)

// Tiempos máximos de las operaciones opcionales: si el caché o el historial
// fallan, la factorización debe responder igual.
const (
	cacheTimeout   = 300 * time.Millisecond
	historyTimeout = time.Second
)

// FactorizeDeps agrupa las dependencias del caso de uso Factorize.
type FactorizeDeps struct {
	Stats        StatisticsCalculator
	Cache        ResultCache   // opcional: sin caché si es nil
	History      HistoryWriter // opcional: sin historial si es nil
	MaxDimension int
	Logger       *slog.Logger // opcional
}

// Factorize es el caso de uso principal: valida la matriz, reutiliza el
// resultado si ya está en caché o lo calcula (QR + estadísticas), y registra
// el cálculo en el historial del usuario.
type Factorize struct {
	stats        StatisticsCalculator
	cache        ResultCache
	history      HistoryWriter
	maxDimension int
	logger       *slog.Logger
}

// NewFactorize crea el caso de uso; las dependencias opcionales se reemplazan
// por implementaciones nulas.
func NewFactorize(deps FactorizeDeps) *Factorize {
	uc := &Factorize{
		stats:        deps.Stats,
		cache:        deps.Cache,
		history:      deps.History,
		maxDimension: deps.MaxDimension,
		logger:       deps.Logger,
	}
	if uc.cache == nil {
		uc.cache = NoCache{}
	}
	if uc.history == nil {
		uc.history = NoHistory{}
	}
	if uc.logger == nil {
		uc.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return uc
}

// FactorizeInput son los datos de entrada del caso de uso.
type FactorizeInput struct {
	Matrix domain.Matrix
	// Username es el usuario autenticado; vacío en llamadas internas (sin historial).
	Username  string
	RequestID string
}

// FactorizeOutput es el resultado del caso de uso.
type FactorizeOutput struct {
	Result Result
	// Cached indica si el resultado salió del caché.
	Cached bool
}

// Execute ejecuta el caso de uso. Devuelve domain.ErrInvalidMatrix si la matriz
// no es válida y ErrStatisticsUnavailable si la Stats API falla.
func (uc *Factorize) Execute(ctx context.Context, in FactorizeInput) (FactorizeOutput, error) {
	if err := in.Matrix.Validate(uc.maxDimension); err != nil {
		return FactorizeOutput{}, err
	}

	key := CacheKey(in.Matrix)
	result, cached := uc.fromCache(ctx, key, in.RequestID)
	if !cached {
		var err error
		if result, err = uc.compute(ctx, in); err != nil {
			return FactorizeOutput{}, err
		}
		uc.toCache(ctx, key, result, in.RequestID)
	}

	uc.record(ctx, in, result, cached)
	return FactorizeOutput{Result: result, Cached: cached}, nil
}

// compute factoriza la matriz y pide las estadísticas de Q y R.
func (uc *Factorize) compute(ctx context.Context, in FactorizeInput) (Result, error) {
	factorization, err := domain.Factorize(in.Matrix)
	if err != nil {
		return Result{}, err
	}
	statistics, err := uc.stats.Calculate(ctx, factorization, in.RequestID)
	if err != nil {
		uc.logger.Error("no se pudieron obtener las estadísticas", "requestId", in.RequestID, "error", err)
		return Result{}, fmt.Errorf("%w: %w", ErrStatisticsUnavailable, err)
	}
	return Result{Factorization: factorization, Statistics: statistics}, nil
}

// fromCache busca un resultado calculado antes. Un fallo del caché se trata como "no está".
func (uc *Factorize) fromCache(ctx context.Context, key, requestID string) (Result, bool) {
	ctx, cancel := context.WithTimeout(ctx, cacheTimeout)
	defer cancel()

	result, found, err := uc.cache.Get(ctx, key)
	if err != nil {
		uc.logger.Warn("caché no disponible, se calcula sin caché", "requestId", requestID, "error", err)
		return Result{}, false
	}
	return result, found
}

// toCache guarda el resultado; si falla solo se registra.
func (uc *Factorize) toCache(ctx context.Context, key string, result Result, requestID string) {
	ctx, cancel := context.WithTimeout(ctx, cacheTimeout)
	defer cancel()

	if err := uc.cache.Set(ctx, key, result); err != nil {
		uc.logger.Warn("no se pudo guardar en caché", "requestId", requestID, "error", err)
	}
}

// record guarda el cálculo en el historial del usuario. Un fallo no afecta la
// respuesta: el historial es un complemento.
func (uc *Factorize) record(ctx context.Context, in FactorizeInput, result Result, cached bool) {
	if in.Username == "" {
		return // llamada interna sin usuario: no hay historial que guardar
	}
	ctx, cancel := context.WithTimeout(ctx, historyTimeout)
	defer cancel()

	err := uc.history.Save(ctx, NewHistoryEntry{
		Username: in.Username, RequestID: in.RequestID, Matrix: in.Matrix, Result: result, Cached: cached,
	})
	if err != nil {
		uc.logger.Warn("no se pudo guardar el historial", "requestId", in.RequestID, "error", err)
	}
}
