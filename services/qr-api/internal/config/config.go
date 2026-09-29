// Package config carga la configuración del servicio desde variables de entorno.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config reúne la configuración de la QR API.
type Config struct {
	// Port es el puerto HTTP (PORT, por defecto 8080).
	Port string
	// StatsURL es la URL base de la Stats API (STATS_API_URL).
	StatsURL string
	// StatsTimeout es el tiempo máximo de cada llamada a la Stats API (STATS_API_TIMEOUT).
	StatsTimeout time.Duration
	// StatsRetries es el número de reintentos ante fallos de la Stats API (STATS_API_RETRIES).
	StatsRetries int
	// MaxDimension es el máximo de filas y de columnas aceptado (MAX_MATRIX_DIMENSION).
	MaxDimension int
	// RedisURL activa el caché de resultados (REDIS_URL; vacío = sin caché).
	RedisURL string
	// CacheTTL es el tiempo de vida de cada resultado en caché (CACHE_TTL).
	CacheTTL time.Duration
	// DatabaseURL activa el historial en PostgreSQL (DATABASE_URL; vacío = sin historial).
	DatabaseURL string
}

// Load lee la configuración y aplica valores por defecto razonables para desarrollo.
func Load() (Config, error) {
	cfg := Config{
		Port:        getEnv("PORT", "8080"),
		StatsURL:    getEnv("STATS_API_URL", "http://localhost:3000"),
		RedisURL:    os.Getenv("REDIS_URL"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
	}

	var err error
	if cfg.StatsTimeout, err = time.ParseDuration(getEnv("STATS_API_TIMEOUT", "3s")); err != nil {
		return Config{}, fmt.Errorf("STATS_API_TIMEOUT inválido: %w", err)
	}
	if cfg.CacheTTL, err = time.ParseDuration(getEnv("CACHE_TTL", "10m")); err != nil || cfg.CacheTTL <= 0 {
		return Config{}, fmt.Errorf("CACHE_TTL debe ser una duración positiva (por ejemplo 10m)")
	}
	if cfg.StatsRetries, err = positiveInt("STATS_API_RETRIES", "1", true); err != nil {
		return Config{}, err
	}
	if cfg.MaxDimension, err = positiveInt("MAX_MATRIX_DIMENSION", "100", false); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// positiveInt lee un entero mayor que cero (o mayor o igual si allowZero).
func positiveInt(key, fallback string, allowZero bool) (int, error) {
	value, err := strconv.Atoi(getEnv(key, fallback))
	if err != nil || value < 0 || (value == 0 && !allowZero) {
		return 0, fmt.Errorf("%s debe ser un entero positivo", key)
	}
	return value, nil
}
