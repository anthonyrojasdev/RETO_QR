package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
)

// Límites de GET /qr/history.
const (
	DefaultHistoryLimit = 10
	MaxHistoryLimit     = 50
)

// ListHistory devuelve las últimas factorizaciones de un usuario.
type ListHistory struct {
	history HistoryReader
	logger  *slog.Logger
}

// NewListHistory crea el caso de uso. Si history es nil, el historial no está disponible.
func NewListHistory(history HistoryReader, logger *slog.Logger) *ListHistory {
	if history == nil {
		history = NoHistory{}
	}
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return &ListHistory{history: history, logger: logger}
}

// Execute devuelve hasta limit entradas del usuario, de la más reciente a la más
// antigua. Un límite fuera de rango se ajusta a [1, MaxHistoryLimit]
// (0 o negativo usa DefaultHistoryLimit). Devuelve ErrHistoryUnavailable si falla.
func (uc *ListHistory) Execute(ctx context.Context, username string, limit int) ([]HistoryEntry, error) {
	if limit <= 0 {
		limit = DefaultHistoryLimit
	}
	limit = min(limit, MaxHistoryLimit)

	entries, err := uc.history.ListByUser(ctx, username, limit)
	if err != nil {
		if errors.Is(err, ErrHistoryUnavailable) {
			return nil, err
		}
		uc.logger.Error("no se pudo leer el historial", "error", err)
		return nil, fmt.Errorf("%w: %w", ErrHistoryUnavailable, err)
	}
	if entries == nil {
		entries = []HistoryEntry{}
	}
	return entries, nil
}
