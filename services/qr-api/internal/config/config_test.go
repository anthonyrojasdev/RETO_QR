package config

import (
	"testing"
	"time"
)

var allKeys = []string{
	"PORT", "STATS_API_URL", "STATS_API_TIMEOUT", "STATS_API_RETRIES",
	"MAX_MATRIX_DIMENSION", "REDIS_URL", "CACHE_TTL", "DATABASE_URL",
}

func clearEnv(t *testing.T) {
	for _, key := range allKeys {
		t.Setenv(key, "")
	}
}

func TestLoadDefaults(t *testing.T) {
	clearEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	want := Config{
		Port: "8080", StatsURL: "http://localhost:3000", StatsTimeout: 3 * time.Second,
		StatsRetries: 1, MaxDimension: 100, CacheTTL: 10 * time.Minute,
	}
	if cfg != want {
		t.Errorf("Load() = %+v, se esperaba %+v", cfg, want)
	}
}

func TestLoadFromEnvironment(t *testing.T) {
	clearEnv(t)
	t.Setenv("PORT", "9000")
	t.Setenv("STATS_API_URL", "http://stats-api:3000")
	t.Setenv("STATS_API_TIMEOUT", "500ms")
	t.Setenv("STATS_API_RETRIES", "0")
	t.Setenv("MAX_MATRIX_DIMENSION", "50")
	t.Setenv("REDIS_URL", "redis://:clave@redis:6379/0")
	t.Setenv("CACHE_TTL", "1h")
	t.Setenv("DATABASE_URL", "postgres://qr_app:clave@postgres:5432/qr")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	want := Config{
		Port: "9000", StatsURL: "http://stats-api:3000", StatsTimeout: 500 * time.Millisecond,
		StatsRetries: 0, MaxDimension: 50, RedisURL: "redis://:clave@redis:6379/0",
		CacheTTL: time.Hour, DatabaseURL: "postgres://qr_app:clave@postgres:5432/qr",
	}
	if cfg != want {
		t.Errorf("Load() = %+v, se esperaba %+v", cfg, want)
	}
}

func TestLoadRejectsInvalidValues(t *testing.T) {
	cases := map[string][2]string{
		"timeout no es duración": {"STATS_API_TIMEOUT", "tres"},
		"reintentos negativos":   {"STATS_API_RETRIES", "-1"},
		"dimensión cero":         {"MAX_MATRIX_DIMENSION", "0"},
		"dimensión no numérica":  {"MAX_MATRIX_DIMENSION", "cien"},
		"TTL inválido":           {"CACHE_TTL", "mucho"},
		"TTL negativo":           {"CACHE_TTL", "-1m"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			clearEnv(t)
			t.Setenv(tc[0], tc[1])
			if _, err := Load(); err == nil {
				t.Fatalf("se esperaba un error con %s=%s", tc[0], tc[1])
			}
		})
	}
}
