// Package httpapi expone la API HTTP del servicio QR con Fiber.
package httpapi

import (
	"io"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/gofiber/swagger"

	_ "reto-qr/qr-api/docs" // documentación OpenAPI generada con swag
	"reto-qr/qr-api/internal/cache"
	"reto-qr/qr-api/internal/history"
)

// requestIDKey es la clave donde el middleware requestid guarda el X-Request-ID.
const requestIDKey = "requestid"

// Dependencies agrupa lo que necesita la aplicación HTTP.
type Dependencies struct {
	// Stats calcula las estadísticas de Q y R (Stats API).
	Stats StatisticsService
	// Cache guarda resultados ya calculados (Redis); si es nil no se usa caché.
	Cache cache.Cache
	// CacheTTL es el tiempo de vida de cada resultado en caché.
	CacheTTL time.Duration
	// History guarda el historial de cada usuario (PostgreSQL); si es nil no hay historial.
	History history.Store
	// MaxDimension es el número máximo de filas y de columnas aceptado.
	MaxDimension int
	// Logger recibe los logs de la aplicación; si es nil se descartan.
	Logger *slog.Logger
	// AccessLog activa el log de cada petición (se desactiva en las pruebas).
	AccessLog bool
}

// NewApp crea la aplicación Fiber con sus middlewares y rutas.
func NewApp(deps Dependencies) *fiber.App {
	if deps.Logger == nil {
		deps.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if deps.Cache == nil {
		deps.Cache = cache.Disabled{}
	}
	if deps.History == nil {
		deps.History = history.Disabled{}
	}

	app := fiber.New(fiber.Config{
		AppName:               "qr-api",
		BodyLimit:             1 << 20, // 1 MB, igual que el límite de Kong
		ReadTimeout:           10 * time.Second,
		WriteTimeout:          20 * time.Second,
		ErrorHandler:          errorHandler,
		DisableStartupMessage: true,
	})

	app.Use(recover.New())
	// Reutiliza el X-Request-ID que genera Kong (o crea uno) y lo devuelve en la respuesta.
	app.Use(requestid.New(requestid.Config{ContextKey: requestIDKey}))
	if deps.AccessLog {
		app.Use(logger.New(logger.Config{
			Format: `{"time":"${time}","requestId":"${locals:requestid}","method":"${method}",` +
				`"path":"${path}","status":${status},"latency":"${latency}"}` + "\n",
			TimeFormat: time.RFC3339,
		}))
	}

	h := &Handler{
		stats:        deps.Stats,
		cache:        deps.Cache,
		cacheTTL:     deps.CacheTTL,
		history:      deps.History,
		maxDimension: deps.MaxDimension,
		logger:       deps.Logger,
	}
	app.Get("/health", h.Health)
	app.Post("/qr", h.Factorize)
	app.Get("/qr/history", h.History)
	app.Get("/qr/usage", h.Usage)
	// URL relativa: detrás de Kong (/api/docs/qr/index.html) resuelve a /api/docs/qr/doc.json.
	// Con la URL por defecto la librería añade X-Forwarded-Prefix + /docs/ y apunta a una ruta inexistente.
	app.Get("/docs/*", swagger.New(swagger.Config{URL: "doc.json"}))

	return app
}
