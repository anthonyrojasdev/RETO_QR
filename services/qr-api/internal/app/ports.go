// Package app contiene los casos de uso del servicio y los puertos (interfaces)
// que necesitan para comunicarse con el exterior.
//
// Los casos de uso no conocen Fiber, Redis, PostgreSQL ni el formato JSON: los
// adaptadores implementan estos puertos y cmd/server los conecta. Así las
// dependencias apuntan siempre hacia adentro: adaptadores → app → dominio.
package app

import (
	"context"
	"errors"
	"time"

	"reto-qr/qr-api/internal/domain"
)

var (
	// ErrStatisticsUnavailable indica que la Stats API no respondió correctamente.
	ErrStatisticsUnavailable = errors.New("no se pudieron calcular las estadísticas")
	// ErrHistoryUnavailable indica que el historial no está configurado o no responde.
	ErrHistoryUnavailable = errors.New("el historial no está disponible")
)

// Result es el resultado completo de una factorización.
type Result struct {
	Factorization domain.Factorization
	Statistics    domain.Statistics
}

// NewHistoryEntry son los datos de una factorización por registrar.
type NewHistoryEntry struct {
	Username  string
	RequestID string
	Matrix    domain.Matrix
	Result    Result
	Cached    bool
}

// HistoryEntry es una factorización guardada en el historial.
type HistoryEntry struct {
	ID        int64
	CreatedAt time.Time
	Matrix    domain.Matrix
	Result    Result
	// Cached indica si el resultado se obtuvo del caché.
	Cached bool
}

// --- Puertos: interfaces pequeñas, cada una con una sola responsabilidad. ---

// StatisticsCalculator calcula las estadísticas de Q y R (cliente de la Stats API).
type StatisticsCalculator interface {
	Calculate(ctx context.Context, f domain.Factorization, requestID string) (domain.Statistics, error)
}

// ResultCache guarda resultados ya calculados (Redis).
type ResultCache interface {
	Get(ctx context.Context, key string) (Result, bool, error)
	Set(ctx context.Context, key string, result Result) error
}

// HistoryWriter registra factorizaciones en el historial (PostgreSQL).
type HistoryWriter interface {
	Save(ctx context.Context, entry NewHistoryEntry) error
}

// HistoryReader consulta el historial de un usuario (PostgreSQL).
type HistoryReader interface {
	ListByUser(ctx context.Context, username string, limit int) ([]HistoryEntry, error)
}

// --- Implementaciones nulas: se usan cuando Redis o PostgreSQL no están configurados. ---

// NoCache es un ResultCache que nunca encuentra ni guarda nada.
type NoCache struct{}

// Get implementa ResultCache.
func (NoCache) Get(context.Context, string) (Result, bool, error) { return Result{}, false, nil }

// Set implementa ResultCache.
func (NoCache) Set(context.Context, string, Result) error { return nil }

// NoHistory no guarda nada y no se puede consultar.
type NoHistory struct{}

// Save implementa HistoryWriter.
func (NoHistory) Save(context.Context, NewHistoryEntry) error { return nil }

// ListByUser implementa HistoryReader.
func (NoHistory) ListByUser(context.Context, string, int) ([]HistoryEntry, error) {
	return nil, ErrHistoryUnavailable
}
