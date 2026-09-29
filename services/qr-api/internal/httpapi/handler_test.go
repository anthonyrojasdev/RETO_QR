package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"reto-qr/qr-api/internal/history"
	"reto-qr/qr-api/internal/stats"
)

// --- Dobles de prueba ---------------------------------------------------------

// fakeStats simula la Stats API y registra lo que recibe.
type fakeStats struct {
	result    stats.Statistics
	err       error
	gotR      [][]float64
	requestID string
	calls     int
}

func (f *fakeStats) Compute(_ context.Context, _, r [][]float64, requestID string) (stats.Statistics, error) {
	f.calls++
	f.gotR, f.requestID = r, requestID
	return f.result, f.err
}

// fakeCache es un caché en memoria que puede simular fallos.
type fakeCache struct {
	data map[string][]byte
	err  error
	ttl  time.Duration
}

func (f *fakeCache) Get(_ context.Context, key string) ([]byte, bool, error) {
	if f.err != nil {
		return nil, false, f.err
	}
	value, ok := f.data[key]
	return value, ok, nil
}

func (f *fakeCache) Set(_ context.Context, key string, value []byte, ttl time.Duration) error {
	if f.err != nil {
		return f.err
	}
	f.data[key], f.ttl = value, ttl
	return nil
}

// fakeHistory es un historial en memoria que puede simular fallos.
type fakeHistory struct {
	saved   []history.NewEntry
	entries []history.Entry
	saveErr error
	listErr error
	gotUser string
	gotMax  int
	gotAll  bool
	usage   history.Usage
}

func (f *fakeHistory) Save(_ context.Context, e history.NewEntry) error {
	if f.saveErr != nil {
		return f.saveErr
	}
	f.saved = append(f.saved, e)
	return nil
}

func (f *fakeHistory) List(_ context.Context, username string, limit int) ([]history.Entry, error) {
	f.gotUser, f.gotMax = username, limit
	return f.entries, f.listErr
}

func (f *fakeHistory) ListAll(_ context.Context, limit int) ([]history.Entry, error) {
	f.gotAll, f.gotMax = true, limit
	return f.entries, f.listErr
}

func (f *fakeHistory) Usage(context.Context) (history.Usage, error) {
	return f.usage, f.listErr
}

// --- Utilidades ---------------------------------------------------------------

type testEnv struct {
	stats   *fakeStats
	cache   *fakeCache
	history *fakeHistory
	do      func(req *http.Request) *http.Response
}

func newTestEnv() *testEnv {
	env := &testEnv{
		stats:   &fakeStats{result: stats.Statistics{Max: 6.5, Count: 10}},
		cache:   &fakeCache{data: map[string][]byte{}},
		history: &fakeHistory{},
	}
	app := NewApp(Dependencies{
		Stats: env.stats, Cache: env.cache, CacheTTL: time.Minute, History: env.history, MaxDimension: 10,
	})
	env.do = func(req *http.Request) *http.Response {
		resp, err := app.Test(req, -1)
		if err != nil {
			panic(err)
		}
		return resp
	}
	return env
}

// bearer arma una cabecera Authorization con un JWT de prueba (Kong ya validó la firma).
func bearer(sub string) string {
	return bearerWithRole(sub, "analyst")
}

func bearerWithRole(sub, role string) string {
	encode := base64.RawURLEncoding.EncodeToString
	return "Bearer " + encode([]byte(`{"alg":"HS256"}`)) + "." +
		encode([]byte(`{"sub":"`+sub+`","role":"`+role+`"}`)) + ".firma"
}

func getAs(path, authorization string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", authorization)
	return req
}

func postJSON(body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/qr", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func decode[T any](t *testing.T, resp *http.Response) T {
	t.Helper()
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("la respuesta no es JSON válido: %v\n%s", err, raw)
	}
	return out
}

// --- POST /qr -----------------------------------------------------------------

func TestFactorizeReturnsQRAndStatistics(t *testing.T) {
	env := newTestEnv()
	req := postJSON(`{"matrix": [[1,2,3],[4,5,6]]}`)
	req.Header.Set("X-Request-ID", "req-abc")

	resp := env.do(req)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("estado = %d, se esperaba 200", resp.StatusCode)
	}
	if got := resp.Header.Get("X-Request-ID"); got != "req-abc" {
		t.Errorf("X-Request-ID = %q, se esperaba req-abc", got)
	}
	if got := resp.Header.Get("X-Cache"); got != "MISS" {
		t.Errorf("X-Cache = %q, se esperaba MISS", got)
	}
	body := decode[FactorizeResponse](t, resp)
	if len(body.Q) != 2 || len(body.Q[0]) != 2 || len(body.R) != 2 || len(body.R[0]) != 3 {
		t.Fatalf("dimensiones inesperadas: Q %dx%d, R %dx%d", len(body.Q), len(body.Q[0]), len(body.R), len(body.R[0]))
	}
	if math.Abs(body.R[0][0]-math.Sqrt(17)) > 1e-10 {
		t.Errorf("R[0][0] = %g, se esperaba √17", body.R[0][0])
	}
	if body.Statistics.Max != 6.5 || body.Statistics.Count != 10 {
		t.Errorf("las estadísticas no son las de la Stats API: %+v", body.Statistics)
	}
	if env.stats.calls != 1 || env.stats.requestID != "req-abc" || len(env.stats.gotR[0]) != 3 {
		t.Errorf("la Stats API no recibió R con el X-Request-ID: calls=%d id=%q", env.stats.calls, env.stats.requestID)
	}
}

func TestFactorizeUsesCacheForRepeatedMatrices(t *testing.T) {
	env := newTestEnv()

	first := env.do(postJSON(`{"matrix": [[2,0],[0,3]]}`))
	second := env.do(postJSON(`{"matrix": [[2.0, 0], [0, 3.0]]}`)) // mismo contenido, otro formato

	if first.Header.Get("X-Cache") != "MISS" || second.Header.Get("X-Cache") != "HIT" {
		t.Fatalf("X-Cache = %q y %q, se esperaba MISS y HIT", first.Header.Get("X-Cache"), second.Header.Get("X-Cache"))
	}
	if env.stats.calls != 1 {
		t.Errorf("la Stats API se llamó %d veces, se esperaba 1", env.stats.calls)
	}
	if env.cache.ttl != time.Minute {
		t.Errorf("TTL = %v, se esperaba 1m", env.cache.ttl)
	}
	a, b := decode[FactorizeResponse](t, first), decode[FactorizeResponse](t, second)
	if a.R[1][1] != b.R[1][1] || a.Statistics.Max != b.Statistics.Max {
		t.Error("la respuesta del caché no coincide con la calculada")
	}
}

func TestFactorizeWorksWhenCacheFails(t *testing.T) {
	env := newTestEnv()
	env.cache.err = errors.New("redis caído")

	resp := env.do(postJSON(`{"matrix": [[1,2],[3,4]]}`))

	if resp.StatusCode != http.StatusOK || resp.Header.Get("X-Cache") != "MISS" {
		t.Fatalf("estado = %d, X-Cache = %q; se esperaba 200 MISS", resp.StatusCode, resp.Header.Get("X-Cache"))
	}
}

func TestFactorizeSavesHistoryForTheTokenUser(t *testing.T) {
	env := newTestEnv()
	req := postJSON(`{"matrix": [[1,2],[3,4]]}`)
	req.Header.Set("Authorization", bearer("ana"))
	req.Header.Set("X-Request-ID", "req-hist")

	if resp := env.do(req); resp.StatusCode != http.StatusOK {
		t.Fatalf("estado = %d", resp.StatusCode)
	}

	if len(env.history.saved) != 1 {
		t.Fatalf("se guardaron %d entradas, se esperaba 1", len(env.history.saved))
	}
	saved := env.history.saved[0]
	if saved.Username != "ana" || saved.RequestID != "req-hist" || saved.Cached || len(saved.Matrix) != 2 || len(saved.Q) != 2 {
		t.Errorf("entrada inesperada: %+v", saved)
	}
}

func TestFactorizeSkipsHistoryWithoutUserAndToleratesFailures(t *testing.T) {
	env := newTestEnv()
	env.do(postJSON(`{"matrix": [[1]]}`)) // sin token: llamada interna
	if len(env.history.saved) != 0 {
		t.Error("no debería guardarse historial sin usuario")
	}

	env.history.saveErr = errors.New("postgres caído")
	req := postJSON(`{"matrix": [[1]]}`)
	req.Header.Set("Authorization", bearer("ana"))
	if resp := env.do(req); resp.StatusCode != http.StatusOK {
		t.Errorf("estado = %d; un fallo del historial no debe afectar la respuesta", resp.StatusCode)
	}
}

func TestFactorizeValidatesInput(t *testing.T) {
	cases := map[string]struct {
		body string
		code string
	}{
		"JSON mal formado":       {`{"matrix": [[1,2]`, "INVALID_JSON"},
		"texto en la matriz":     {`{"matrix": [["a"]]}`, "INVALID_JSON"},
		"elemento null":          {`{"matrix": [[1, null]]}`, "INVALID_MATRIX"},
		"sin campo matrix":       {`{}`, "INVALID_MATRIX"},
		"matriz vacía":           {`{"matrix": []}`, "INVALID_MATRIX"},
		"fila vacía":             {`{"matrix": [[]]}`, "INVALID_MATRIX"},
		"no rectangular":         {`{"matrix": [[1,2,3],[4]]}`, "INVALID_MATRIX"},
		"supera el máximo 10x10": {`{"matrix": [[1,2,3,4,5,6,7,8,9,10,11]]}`, "INVALID_MATRIX"},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			env := newTestEnv()
			resp := env.do(postJSON(tc.body))

			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("estado = %d, se esperaba 400", resp.StatusCode)
			}
			body := decode[ErrorResponse](t, resp)
			if body.Error.Code != tc.code || body.Error.Message == "" || body.Error.RequestID == "" {
				t.Errorf("error inesperado: %+v", body.Error)
			}
			if env.stats.calls != 0 {
				t.Error("no debería llamarse a la Stats API con una entrada inválida")
			}
		})
	}
}

func TestFactorizeRequiresJSONContentType(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/qr", strings.NewReader(`{"matrix": [[1]]}`))
	req.Header.Set("Content-Type", "text/plain")

	resp := newTestEnv().do(req)
	if resp.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("estado = %d, se esperaba 415", resp.StatusCode)
	}
	if body := decode[ErrorResponse](t, resp); body.Error.Code != "UNSUPPORTED_MEDIA_TYPE" {
		t.Errorf("código = %q", body.Error.Code)
	}
}

func TestFactorizeReportsStatsFailureAsBadGateway(t *testing.T) {
	env := newTestEnv()
	env.stats.err = errors.New("connection refused")

	resp := env.do(postJSON(`{"matrix": [[1,2],[3,4]]}`))

	if resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("estado = %d, se esperaba 502", resp.StatusCode)
	}
	body := decode[ErrorResponse](t, resp)
	if body.Error.Code != "STATS_SERVICE_ERROR" || strings.Contains(body.Error.Message, "connection refused") {
		t.Errorf("error inesperado (no debe filtrar detalles internos): %+v", body.Error)
	}
	if len(env.cache.data) != 0 {
		t.Error("no debe guardarse en caché un resultado incompleto")
	}
}

// --- GET /qr/history ----------------------------------------------------------

func TestHistoryListsTheUserEntries(t *testing.T) {
	env := newTestEnv()
	env.history.entries = []history.Entry{{ID: 7, Rows: 2, Columns: 3}}
	req := httptest.NewRequest(http.MethodGet, "/qr/history?limit=500", nil)
	req.Header.Set("Authorization", bearer("ana"))

	resp := env.do(req)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("estado = %d, se esperaba 200", resp.StatusCode)
	}
	body := decode[HistoryResponse](t, resp)
	if len(body.Items) != 1 || body.Items[0].ID != 7 {
		t.Errorf("items inesperados: %+v", body.Items)
	}
	if env.history.gotUser != "ana" || env.history.gotMax != maxHistoryLimit {
		t.Errorf("List(%q, %d); se esperaba List(\"ana\", %d)", env.history.gotUser, env.history.gotMax, maxHistoryLimit)
	}
}

func TestHistoryReturnsEmptyListInsteadOfNull(t *testing.T) {
	env := newTestEnv()
	req := httptest.NewRequest(http.MethodGet, "/qr/history", nil)
	req.Header.Set("Authorization", bearer("ana"))

	resp := env.do(req)
	raw, _ := io.ReadAll(resp.Body)
	if string(raw) != `{"items":[]}` {
		t.Errorf("cuerpo = %s, se esperaba {\"items\":[]}", raw)
	}
	if env.history.gotMax != defaultHistoryLimit {
		t.Errorf("límite = %d, se esperaba %d", env.history.gotMax, defaultHistoryLimit)
	}
}

func TestHistoryRequiresUser(t *testing.T) {
	resp := newTestEnv().do(httptest.NewRequest(http.MethodGet, "/qr/history", nil))
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("estado = %d, se esperaba 401", resp.StatusCode)
	}
}

func TestHistoryUnavailable(t *testing.T) {
	for name, err := range map[string]error{
		"sin configurar": history.ErrUnavailable,
		"base caída":     errors.New("connection refused"),
	} {
		t.Run(name, func(t *testing.T) {
			env := newTestEnv()
			env.history.listErr = err
			req := httptest.NewRequest(http.MethodGet, "/qr/history", nil)
			req.Header.Set("Authorization", bearer("ana"))

			resp := env.do(req)
			if resp.StatusCode != http.StatusServiceUnavailable {
				t.Fatalf("estado = %d, se esperaba 503", resp.StatusCode)
			}
			if body := decode[ErrorResponse](t, resp); body.Error.Code != "HISTORY_UNAVAILABLE" {
				t.Errorf("código = %q", body.Error.Code)
			}
		})
	}
}

// --- Otras rutas --------------------------------------------------------------

func TestDefaultsWithoutCacheAndHistory(t *testing.T) {
	app := NewApp(Dependencies{Stats: &fakeStats{}, MaxDimension: 10})
	resp, _ := app.Test(postJSON(`{"matrix": [[1]]}`), -1)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("estado = %d, se esperaba 200 sin caché ni historial", resp.StatusCode)
	}

	req := httptest.NewRequest(http.MethodGet, "/qr/history", nil)
	req.Header.Set("Authorization", bearer("ana"))
	resp, _ = app.Test(req, -1)
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("estado = %d, se esperaba 503 sin historial configurado", resp.StatusCode)
	}
}

func TestUnknownRouteReturnsJSONError(t *testing.T) {
	resp := newTestEnv().do(httptest.NewRequest(http.MethodGet, "/no-existe", nil))

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("estado = %d, se esperaba 404", resp.StatusCode)
	}
	if body := decode[ErrorResponse](t, resp); body.Error.Code != "NOT_FOUND" {
		t.Errorf("código = %q, se esperaba NOT_FOUND", body.Error.Code)
	}
}

func TestHealth(t *testing.T) {
	resp := newTestEnv().do(httptest.NewRequest(http.MethodGet, "/health", nil))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("estado = %d, se esperaba 200", resp.StatusCode)
	}
}

// Detrás de Kong la UI se sirve en /api/docs/qr/index.html con X-Forwarded-Prefix;
// la especificación debe pedirse con una URL relativa para resolver a /api/docs/qr/doc.json.
func TestSwaggerUIUsesRelativeSpecURLBehindGateway(t *testing.T) {
	env := newTestEnv()
	req := httptest.NewRequest(http.MethodGet, "/docs/index.html", nil)
	req.Header.Set("X-Forwarded-Prefix", "/api/docs/qr")
	resp := env.do(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("estado = %d, se esperaba 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), `"doc.json"`) || strings.Contains(string(body), "/docs/doc.json") {
		t.Errorf("la UI no usa la URL relativa doc.json")
	}

	if resp := env.do(httptest.NewRequest(http.MethodGet, "/docs/doc.json", nil)); resp.StatusCode != http.StatusOK {
		t.Errorf("doc.json: estado = %d, se esperaba 200", resp.StatusCode)
	}
}

func TestHistoryScopeAllIsOnlyForAdmins(t *testing.T) {
	env := newTestEnv()
	env.history.entries = []history.Entry{{ID: 1, Username: "ana", Rows: 1, Columns: 1}}

	resp := env.do(getAs("/qr/history?scope=all", bearer("ana")))
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("analyst: estado = %d, se esperaba 403", resp.StatusCode)
	}
	if env.history.gotAll {
		t.Error("un analyst no debe llegar a leer el historial de todos")
	}

	resp = env.do(getAs("/qr/history?scope=all&limit=20", bearerWithRole("root", "admin")))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("admin: estado = %d, se esperaba 200", resp.StatusCode)
	}
	body := decode[HistoryResponse](t, resp)
	if !env.history.gotAll || env.history.gotMax != 20 || len(body.Items) != 1 || body.Items[0].Username != "ana" {
		t.Errorf("admin debe recibir el historial de todos con su autor: %+v", body)
	}
}

func TestHistoryRejectsUnknownScope(t *testing.T) {
	resp := newTestEnv().do(getAs("/qr/history?scope=otros", bearer("ana")))
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("estado = %d, se esperaba 400", resp.StatusCode)
	}
	if body := decode[ErrorResponse](t, resp); body.Error.Code != "INVALID_SCOPE" {
		t.Errorf("código = %q, se esperaba INVALID_SCOPE", body.Error.Code)
	}
}

func TestUsageIsOnlyForAdmins(t *testing.T) {
	env := newTestEnv()
	env.history.usage = history.Usage{Total: 3, CacheHits: 1, Users: []history.UserUsage{{Username: "ana", Count: 3, CacheHits: 1}}}

	if resp := env.do(getAs("/qr/usage", bearer("ana"))); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("analyst: estado = %d, se esperaba 403", resp.StatusCode)
	}

	resp := env.do(getAs("/qr/usage", bearerWithRole("root", "admin")))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("admin: estado = %d, se esperaba 200", resp.StatusCode)
	}
	if body := decode[history.Usage](t, resp); body.Total != 3 || len(body.Users) != 1 || body.Users[0].Username != "ana" {
		t.Errorf("uso inesperado: %+v", body)
	}
}

func TestUsageReturnsEmptyListAndHandlesUnavailableHistory(t *testing.T) {
	env := newTestEnv()
	resp := env.do(getAs("/qr/usage", bearerWithRole("root", "admin")))
	if body := decode[map[string]any](t, resp); body["users"] == nil {
		t.Error("users debe ser una lista vacía, no null")
	}

	env.history.listErr = history.ErrUnavailable
	if resp := env.do(getAs("/qr/usage", bearerWithRole("root", "admin"))); resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("estado = %d, se esperaba 503", resp.StatusCode)
	}
}

func TestHistoryOfAnotherUserIsOnlyForAdmins(t *testing.T) {
	env := newTestEnv()
	env.history.entries = []history.Entry{{ID: 5, Rows: 2, Columns: 2}}

	if resp := env.do(getAs("/qr/history?user=maria", bearer("ana"))); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("analyst pidiendo a otro: estado = %d, se esperaba 403", resp.StatusCode)
	}

	resp := env.do(getAs("/qr/history?user=ana", bearer("ana")))
	if resp.StatusCode != http.StatusOK || env.history.gotUser != "ana" {
		t.Fatalf("pedir el propio historial con user debe funcionar: estado %d, usuario %q", resp.StatusCode, env.history.gotUser)
	}
	if body := decode[HistoryResponse](t, resp); body.Items[0].Username != "" {
		t.Error("el historial propio no incluye el autor")
	}

	resp = env.do(getAs("/qr/history?user=maria", bearerWithRole("root", "admin")))
	if resp.StatusCode != http.StatusOK || env.history.gotUser != "maria" {
		t.Fatalf("admin: estado %d, usuario consultado %q", resp.StatusCode, env.history.gotUser)
	}
	if body := decode[HistoryResponse](t, resp); body.Items[0].Username != "maria" {
		t.Errorf("admin debe ver el autor de cada cálculo: %+v", body.Items)
	}

	if resp := env.do(getAs("/qr/history?user=maria&scope=all", bearerWithRole("root", "admin"))); resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("scope=all con user: estado = %d, se esperaba 400", resp.StatusCode)
	}
}
