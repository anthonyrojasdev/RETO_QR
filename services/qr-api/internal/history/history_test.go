package history

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"reto-qr/qr-api/internal/stats"
)

func TestDisabledStore(t *testing.T) {
	var s Store = Disabled{}
	if err := s.Save(context.Background(), NewEntry{}); err != nil {
		t.Errorf("Save() error = %v", err)
	}
	if _, err := s.List(context.Background(), "ana", 10); !errors.Is(err, ErrUnavailable) {
		t.Errorf("List() error = %v, se esperaba ErrUnavailable", err)
	}
	if _, err := s.ListAll(context.Background(), 10); !errors.Is(err, ErrUnavailable) {
		t.Errorf("ListAll() error = %v, se esperaba ErrUnavailable", err)
	}
	if _, err := s.Usage(context.Background()); !errors.Is(err, ErrUnavailable) {
		t.Errorf("Usage() error = %v, se esperaba ErrUnavailable", err)
	}
}

func TestConnectFailsWithInvalidURL(t *testing.T) {
	if _, err := Connect(context.Background(), "::no-es-una-url::", 1); err == nil {
		t.Fatal("se esperaba un error")
	}
}

// TestPostgresIntegration se ejecuta solo si TEST_DATABASE_URL apunta a un PostgreSQL real (CI).
func TestPostgresIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("define TEST_DATABASE_URL para ejecutar la prueba contra PostgreSQL")
	}
	ctx := context.Background()
	store, err := Connect(ctx, url, 5)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	user := fmt.Sprintf("test-%d", time.Now().UnixNano())
	for i := 1; i <= 3; i++ {
		err := store.Save(ctx, NewEntry{
			Username: user, RequestID: fmt.Sprintf("req-%d", i),
			Matrix: [][]float64{{float64(i), 2, 3}, {4, 5, 6}},
			Q:      [][]float64{{1, 0}, {0, 1}},
			R:      [][]float64{{float64(i), 2, 3}, {0, 5, 6}},
			Statistics: stats.Statistics{
				Max: 6, Min: 0, Count: 10, Matrices: map[string]stats.MatrixSummary{"Q": {Rows: 2, Columns: 2, IsDiagonal: true}},
			},
			Cached: i == 3,
		})
		if err != nil {
			t.Fatalf("Save() error = %v", err)
		}
	}

	entries, err := store.List(ctx, user, 2)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("List() devolvió %d entradas, se esperaban 2", len(entries))
	}
	latest := entries[0]
	if latest.Matrix[0][0] != 3 || !latest.Cached || latest.Rows != 2 || latest.Columns != 3 {
		t.Errorf("la entrada más reciente no es la esperada: %+v", latest)
	}
	if !latest.Statistics.Matrices["Q"].IsDiagonal || latest.Statistics.Max != 6 {
		t.Errorf("las estadísticas no se guardaron completas: %+v", latest.Statistics)
	}

	if others, _ := store.List(ctx, user+"-otro", 10); len(others) != 0 {
		t.Error("un usuario no debe ver el historial de otro")
	}

	all, err := store.ListAll(ctx, 1)
	if err != nil {
		t.Fatalf("ListAll() error = %v", err)
	}
	if len(all) != 1 || all[0].Username != user || all[0].Matrix[0][0] != 3 {
		t.Errorf("ListAll() debe devolver la última entrada con su autor: %+v", all)
	}

	usage, err := store.Usage(ctx)
	if err != nil {
		t.Fatalf("Usage() error = %v", err)
	}
	var mine *UserUsage
	for i := range usage.Users {
		if usage.Users[i].Username == user {
			mine = &usage.Users[i]
		}
	}
	if mine == nil || mine.Count != 3 || mine.CacheHits != 1 || mine.LastAt.IsZero() {
		t.Errorf("Usage() no resume bien al usuario: %+v", mine)
	}
	if usage.Total < 3 || usage.CacheHits < 1 {
		t.Errorf("Usage() totales incorrectos: %+v", usage)
	}
}
