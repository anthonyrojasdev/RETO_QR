// Package history guarda y consulta el historial de factorizaciones en PostgreSQL.
package history

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"reto-qr/qr-api/internal/stats"
)

// ErrUnavailable indica que el historial no está configurado (sin DATABASE_URL).
var ErrUnavailable = errors.New("el historial no está disponible")

// Entry es una factorización guardada.
type Entry struct {
	ID int64 `json:"id" example:"42"`
	// Username es el autor del cálculo; solo se incluye en el historial de todos los usuarios.
	Username   string           `json:"username,omitempty" example:"analyst"`
	CreatedAt  time.Time        `json:"createdAt" example:"2026-09-28T18:30:00Z"`
	Rows       int              `json:"rows" example:"2"`
	Columns    int              `json:"columns" example:"3"`
	Matrix     [][]float64      `json:"matrix"`
	Q          [][]float64      `json:"Q"`
	R          [][]float64      `json:"R"`
	Statistics stats.Statistics `json:"statistics"`
	// Cached indica si el resultado se obtuvo del caché de Redis.
	Cached bool `json:"cached" example:"false"`
}

// NewEntry son los datos de una factorización por guardar.
type NewEntry struct {
	Username   string
	RequestID  string
	Matrix     [][]float64
	Q          [][]float64
	R          [][]float64
	Statistics stats.Statistics
	Cached     bool
}

// UserUsage resume la actividad de un usuario.
type UserUsage struct {
	Username  string    `json:"username" example:"analyst"`
	Count     int       `json:"count" example:"12"`
	CacheHits int       `json:"cacheHits" example:"4"`
	LastAt    time.Time `json:"lastAt" example:"2026-09-28T18:30:00Z"`
}

// Usage resume el uso del servicio por todos los usuarios.
type Usage struct {
	Total     int         `json:"total" example:"30"`
	CacheHits int         `json:"cacheHits" example:"9"`
	Users     []UserUsage `json:"users"`
}

// Store guarda y lista factorizaciones.
type Store interface {
	Save(ctx context.Context, entry NewEntry) error
	List(ctx context.Context, username string, limit int) ([]Entry, error)
	// ListAll devuelve las últimas factorizaciones de todos los usuarios, con su autor.
	ListAll(ctx context.Context, limit int) ([]Entry, error)
	// Usage resume cuántos cálculos hizo cada usuario y cuántos salieron del caché.
	Usage(ctx context.Context) (Usage, error)
}

// schema crea la tabla del servicio. Es idempotente y se ejecuta al arrancar.
const schema = `
CREATE TABLE IF NOT EXISTS factorizations (
    id           BIGSERIAL   PRIMARY KEY,
    username     TEXT        NOT NULL,
    request_id   TEXT,
    row_count    INT         NOT NULL,
    column_count INT         NOT NULL,
    matrix       JSONB       NOT NULL,
    q            JSONB       NOT NULL,
    r            JSONB       NOT NULL,
    statistics   JSONB       NOT NULL,
    cached       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS factorizations_username_created_at_idx
    ON factorizations (username, created_at DESC);`

// Postgres implementa Store con PostgreSQL.
type Postgres struct {
	pool *pgxpool.Pool
}

// Connect abre el pool de conexiones, espera a que la base de datos responda
// (reintenta durante unos segundos) y crea la tabla si no existe.
func Connect(ctx context.Context, url string, attempts int) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL inválida: %w", err)
	}

	for attempt := 1; ; attempt++ {
		pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		err = pool.Ping(pingCtx)
		cancel()
		if err == nil {
			break
		}
		if attempt >= attempts {
			pool.Close()
			return nil, fmt.Errorf("no se pudo conectar a PostgreSQL: %w", err)
		}
		time.Sleep(time.Second)
	}

	if _, err := pool.Exec(ctx, schema); err != nil {
		pool.Close()
		return nil, fmt.Errorf("crear el esquema: %w", err)
	}
	return &Postgres{pool: pool}, nil
}

// Save implementa Store.
func (p *Postgres) Save(ctx context.Context, e NewEntry) error {
	_, err := p.pool.Exec(ctx, `
		INSERT INTO factorizations
		    (username, request_id, row_count, column_count, matrix, q, r, statistics, cached)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		e.Username, e.RequestID, len(e.Matrix), len(e.Matrix[0]), e.Matrix, e.Q, e.R, e.Statistics, e.Cached)
	return err
}

// List implementa Store: devuelve las últimas factorizaciones del usuario.
func (p *Postgres) List(ctx context.Context, username string, limit int) ([]Entry, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id, created_at, row_count, column_count, matrix, q, r, statistics, cached
		FROM factorizations
		WHERE username = $1
		ORDER BY created_at DESC, id DESC
		LIMIT $2`, username, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Entry, error) {
		var e Entry
		err := row.Scan(&e.ID, &e.CreatedAt, &e.Rows, &e.Columns, &e.Matrix, &e.Q, &e.R, &e.Statistics, &e.Cached)
		return e, err
	})
}

// ListAll implementa Store.
func (p *Postgres) ListAll(ctx context.Context, limit int) ([]Entry, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id, username, created_at, row_count, column_count, matrix, q, r, statistics, cached
		FROM factorizations
		ORDER BY created_at DESC, id DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Entry, error) {
		var e Entry
		err := row.Scan(&e.ID, &e.Username, &e.CreatedAt, &e.Rows, &e.Columns, &e.Matrix, &e.Q, &e.R, &e.Statistics, &e.Cached)
		return e, err
	})
}

// Usage implementa Store.
func (p *Postgres) Usage(ctx context.Context) (Usage, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT username, count(*), count(*) FILTER (WHERE cached), max(created_at)
		FROM factorizations
		GROUP BY username
		ORDER BY count(*) DESC, username`)
	if err != nil {
		return Usage{}, err
	}
	users, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (UserUsage, error) {
		var u UserUsage
		err := row.Scan(&u.Username, &u.Count, &u.CacheHits, &u.LastAt)
		return u, err
	})
	if err != nil {
		return Usage{}, err
	}
	usage := Usage{Users: users}
	for _, u := range users {
		usage.Total += u.Count
		usage.CacheHits += u.CacheHits
	}
	return usage, nil
}

// Close cierra el pool de conexiones.
func (p *Postgres) Close() {
	p.pool.Close()
}

// Disabled es un Store vacío: se usa cuando no se configura DATABASE_URL.
type Disabled struct{}

// Save implementa Store (no guarda nada).
func (Disabled) Save(context.Context, NewEntry) error { return nil }

// List implementa Store (el historial no está disponible).
func (Disabled) List(context.Context, string, int) ([]Entry, error) { return nil, ErrUnavailable }

// ListAll implementa Store (el historial no está disponible).
func (Disabled) ListAll(context.Context, int) ([]Entry, error) { return nil, ErrUnavailable }

// Usage implementa Store (el historial no está disponible).
func (Disabled) Usage(context.Context) (Usage, error) { return Usage{}, ErrUnavailable }
