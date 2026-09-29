package stats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

var (
	sampleQ = [][]float64{{1, 0}, {0, 1}}
	sampleR = [][]float64{{2, 3}, {0, 4}}
)

const sampleResponse = `{"max":4,"min":0,"average":1.375,"sum":11,"count":8,"isAnyDiagonal":true,
"matrices":{"Q":{"rows":2,"columns":2,"isDiagonal":true},"R":{"rows":2,"columns":2,"isDiagonal":false}}}`

func TestComputeSendsMatricesAndDecodesResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/statistics" {
			t.Errorf("petición inesperada: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Errorf("Content-Type = %q", got)
		}
		if got := r.Header.Get("X-Request-ID"); got != "req-123" {
			t.Errorf("X-Request-ID = %q, se esperaba req-123", got)
		}
		var body statisticsRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("cuerpo inválido: %v", err)
		}
		if len(body.Q) != 2 || len(body.R) != 2 || body.R[0][1] != 3 {
			t.Errorf("cuerpo inesperado: %+v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(sampleResponse))
	}))
	defer server.Close()

	got, err := NewClient(server.URL+"/", time.Second, 0).Compute(context.Background(), sampleQ, sampleR, "req-123")
	if err != nil {
		t.Fatalf("Compute() error = %v", err)
	}
	if got.Max != 4 || got.Sum != 11 || got.Count != 8 || !got.IsAnyDiagonal {
		t.Errorf("estadísticas inesperadas: %+v", got)
	}
	if !got.Matrices["Q"].IsDiagonal || got.Matrices["R"].Columns != 2 {
		t.Errorf("resumen de matrices inesperado: %+v", got.Matrices)
	}
}

func TestComputeRetriesOnServerError(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte(sampleResponse))
	}))
	defer server.Close()

	client := NewClient(server.URL, time.Second, 1)
	client.backoff = time.Millisecond
	if _, err := client.Compute(context.Background(), sampleQ, sampleR, ""); err != nil {
		t.Fatalf("Compute() error = %v", err)
	}
	if calls.Load() != 2 {
		t.Errorf("se hicieron %d intentos, se esperaban 2", calls.Load())
	}
}

func TestComputeDoesNotRetryClientErrors(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	client := NewClient(server.URL, time.Second, 3)
	client.backoff = time.Millisecond
	if _, err := client.Compute(context.Background(), sampleQ, sampleR, ""); err == nil {
		t.Fatal("se esperaba un error")
	}
	if calls.Load() != 1 {
		t.Errorf("se hicieron %d intentos, se esperaba 1", calls.Load())
	}
}

func TestComputeFailsAfterExhaustingRetries(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewClient(server.URL, time.Second, 2)
	client.backoff = time.Millisecond
	if _, err := client.Compute(context.Background(), sampleQ, sampleR, ""); err == nil {
		t.Fatal("se esperaba un error")
	}
	if calls.Load() != 3 {
		t.Errorf("se hicieron %d intentos, se esperaban 3", calls.Load())
	}
}

func TestComputeTimesOut(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(200 * time.Millisecond)
		_, _ = w.Write([]byte(sampleResponse))
	}))
	defer server.Close()

	client := NewClient(server.URL, 20*time.Millisecond, 0)
	if _, err := client.Compute(context.Background(), sampleQ, sampleR, ""); err == nil {
		t.Fatal("se esperaba un error por timeout")
	}
}
