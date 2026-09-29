// Package stats contiene el cliente HTTP de la Stats API (Node.js + Express),
// que calcula estadísticas sobre las matrices Q y R.
package stats

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// MatrixSummary describe una de las matrices analizadas.
type MatrixSummary struct {
	Rows       int  `json:"rows" example:"2"`
	Columns    int  `json:"columns" example:"3"`
	IsDiagonal bool `json:"isDiagonal" example:"false"`
}

// Statistics es la respuesta de la Stats API.
type Statistics struct {
	// Max es el valor máximo entre todos los elementos de Q y R.
	Max float64 `json:"max" example:"6.548462"`
	// Min es el valor mínimo entre todos los elementos de Q y R.
	Min float64 `json:"min" example:"-0.242536"`
	// Average es el promedio de todos los elementos de Q y R.
	Average float64 `json:"average" example:"2.013046"`
	// Sum es la suma de todos los elementos de Q y R.
	Sum float64 `json:"sum" example:"20.130457"`
	// Count es la cantidad de elementos analizados.
	Count int `json:"count" example:"10"`
	// IsAnyDiagonal indica si al menos una de las matrices es diagonal.
	IsAnyDiagonal bool `json:"isAnyDiagonal" example:"false"`
	// Matrices resume cada matriz por nombre ("Q" y "R").
	Matrices map[string]MatrixSummary `json:"matrices"`
}

// Client llama a la Stats API por HTTP.
type Client struct {
	endpoint   string
	httpClient *http.Client
	retries    int
	backoff    time.Duration
}

// NewClient crea un cliente para la Stats API ubicada en baseURL
// (por ejemplo, http://stats-api:3000).
//
// timeout se aplica a cada intento. retries es el número de reintentos
// adicionales ante errores de red o respuestas 5xx; reintentar es seguro
// porque calcular estadísticas no tiene efectos secundarios.
func NewClient(baseURL string, timeout time.Duration, retries int) *Client {
	return &Client{
		endpoint:   strings.TrimRight(baseURL, "/") + "/statistics",
		httpClient: &http.Client{Timeout: timeout},
		retries:    retries,
		backoff:    200 * time.Millisecond,
	}
}

// statisticsRequest es el cuerpo que espera POST /statistics.
type statisticsRequest struct {
	Q [][]float64 `json:"Q"`
	R [][]float64 `json:"R"`
}

// Compute envía Q y R a la Stats API y devuelve las estadísticas calculadas.
// requestID se propaga en la cabecera X-Request-ID para poder trazar la
// petición completa (Kong → QR API → Stats API) en los logs.
func (c *Client) Compute(ctx context.Context, q, r [][]float64, requestID string) (Statistics, error) {
	body, err := json.Marshal(statisticsRequest{Q: q, R: r})
	if err != nil {
		return Statistics{}, fmt.Errorf("serializar la petición: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt <= c.retries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return Statistics{}, ctx.Err()
			case <-time.After(c.backoff * time.Duration(attempt)):
			}
		}
		stats, retryable, err := c.send(ctx, body, requestID)
		if err == nil {
			return stats, nil
		}
		lastErr = err
		if !retryable {
			break
		}
	}
	return Statistics{}, lastErr
}

// send hace un intento e indica si el error permite reintentar.
func (c *Client) send(ctx context.Context, body []byte, requestID string) (stats Statistics, retryable bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return Statistics{}, false, fmt.Errorf("crear la petición: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if requestID != "" {
		req.Header.Set("X-Request-ID", requestID)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Statistics{}, true, fmt.Errorf("llamar a la Stats API: %w", err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body) // permite reutilizar la conexión
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		return Statistics{}, resp.StatusCode >= 500,
			fmt.Errorf("la Stats API respondió con estado %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return Statistics{}, false, fmt.Errorf("decodificar la respuesta de la Stats API: %w", err)
	}
	return stats, false, nil
}
