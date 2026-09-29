// Package cache guarda las respuestas de factorizaciones ya calculadas.
//
// La factorización QR y sus estadísticas son deterministas: la misma matriz
// produce siempre el mismo resultado, así que puede reutilizarse sin recalcular
// ni volver a llamar a la Stats API.
package cache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache guarda valores por clave con un tiempo de vida.
type Cache interface {
	// Get devuelve el valor y true si la clave existe.
	Get(ctx context.Context, key string) ([]byte, bool, error)
	// Set guarda el valor durante ttl.
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
}

// Key genera la clave de una matriz: el mismo contenido produce la misma clave.
// El prefijo "v1" permite invalidar todo el caché si cambia el formato de la respuesta.
func Key(matrix [][]float64) string {
	data, _ := json.Marshal(matrix) // [][]float64 siempre se puede serializar
	sum := sha256.Sum256(data)
	return "qr:v1:" + hex.EncodeToString(sum[:])
}

// Redis implementa Cache con Redis.
type Redis struct {
	client *redis.Client
}

// NewRedis crea un cliente a partir de una URL (redis://:clave@host:6379/0).
// Usa tiempos de espera cortos: si Redis falla, la API debe seguir respondiendo
// (calculando sin caché) en lugar de quedarse esperando.
func NewRedis(url string) (*Redis, error) {
	options, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("REDIS_URL inválida: %w", err)
	}
	options.DialTimeout = 500 * time.Millisecond
	options.ReadTimeout = 300 * time.Millisecond
	options.WriteTimeout = 300 * time.Millisecond
	return &Redis{client: redis.NewClient(options)}, nil
}

// Get implementa Cache.
func (r *Redis) Get(ctx context.Context, key string) ([]byte, bool, error) {
	value, err := r.client.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return value, true, nil
}

// Set implementa Cache.
func (r *Redis) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return r.client.Set(ctx, key, value, ttl).Err()
}

// Ping comprueba la conexión.
func (r *Redis) Ping(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}

// Close cierra las conexiones.
func (r *Redis) Close() error {
	return r.client.Close()
}

// Disabled es un Cache vacío: se usa cuando no se configura REDIS_URL.
type Disabled struct{}

// Get implementa Cache (nunca encuentra nada).
func (Disabled) Get(context.Context, string) ([]byte, bool, error) { return nil, false, nil }

// Set implementa Cache (no guarda nada).
func (Disabled) Set(context.Context, string, []byte, time.Duration) error { return nil }
