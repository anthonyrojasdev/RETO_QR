// Command server inicia la QR API: factorización QR de matrices con Go, Fiber y Gonum.
//
//	@title						QR API
//	@version					1.0
//	@description				Factorización QR de matrices rectangulares. Tras factorizar, envía Q y R a la Stats API (Node.js) y devuelve ambos resultados.
//	@description				Se expone a través de Kong en /api/qr y requiere un JWT (obtenlo con POST /api/auth/login).
//	@BasePath					/api
//	@securityDefinitions.apikey	BearerAuth
//	@in							header
//	@name						Authorization
//	@description				Escribe "Bearer <token>".
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"reto-qr/qr-api/internal/cache"
	"reto-qr/qr-api/internal/config"
	"reto-qr/qr-api/internal/history"
	"reto-qr/qr-api/internal/httpapi"
	"reto-qr/qr-api/internal/stats"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuración inválida", "error", err)
		os.Exit(1)
	}

	// "healthcheck" permite a Docker comprobar el servicio en una imagen sin shell ni curl.
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck(cfg.Port))
	}

	deps := httpapi.Dependencies{
		Stats:        stats.NewClient(cfg.StatsURL, cfg.StatsTimeout, cfg.StatsRetries),
		CacheTTL:     cfg.CacheTTL,
		MaxDimension: cfg.MaxDimension,
		Logger:       logger,
		AccessLog:    true,
	}

	// Redis es opcional: si no responde, la API calcula sin caché.
	if cfg.RedisURL != "" {
		redisCache, err := cache.NewRedis(cfg.RedisURL)
		if err != nil {
			logger.Error("configuración de Redis inválida", "error", err)
			os.Exit(1)
		}
		defer redisCache.Close()
		pingCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		if err := redisCache.Ping(pingCtx); err != nil {
			logger.Warn("Redis no responde; se reintentará en cada petición", "error", err)
		}
		cancel()
		deps.Cache = redisCache
	}

	// PostgreSQL: si está configurado debe estar disponible (se reintenta unos segundos).
	if cfg.DatabaseURL != "" {
		store, err := history.Connect(context.Background(), cfg.DatabaseURL, 15)
		if err != nil {
			logger.Error("no se pudo iniciar el historial", "error", err)
			os.Exit(1)
		}
		defer store.Close()
		deps.History = store
	}

	app := httpapi.NewApp(deps)

	go func() {
		logger.Info("qr-api escuchando", "port", cfg.Port, "statsApi", cfg.StatsURL)
		if err := app.Listen(":" + cfg.Port); err != nil {
			logger.Error("el servidor se detuvo", "error", err)
			os.Exit(1)
		}
	}()

	// Apagado ordenado: termina las peticiones en curso antes de salir.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()
	logger.Info("apagando qr-api")
	if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
		logger.Error("error al apagar", "error", err)
	}
}

// healthcheck devuelve 0 si GET /health responde 200.
func healthcheck(port string) int {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/health")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
