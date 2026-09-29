package cache

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

func TestKeyDependsOnlyOnContent(t *testing.T) {
	a := Key([][]float64{{1, 2}, {3, 4}})
	if a != Key([][]float64{{1.0, 2.0}, {3.0, 4.0}}) {
		t.Error("la misma matriz debe producir la misma clave")
	}
	if a == Key([][]float64{{1, 2, 3, 4}}) || a == Key([][]float64{{4, 3}, {2, 1}}) {
		t.Error("matrices distintas deben producir claves distintas")
	}
	if !strings.HasPrefix(a, "qr:v1:") || len(a) != len("qr:v1:")+64 {
		t.Errorf("formato de clave inesperado: %q", a)
	}
}

func TestDisabledNeverStores(t *testing.T) {
	var c Cache = Disabled{}
	if err := c.Set(context.Background(), "k", []byte("v"), time.Minute); err != nil {
		t.Fatal(err)
	}
	if _, found, err := c.Get(context.Background(), "k"); found || err != nil {
		t.Errorf("Get() = found %v, err %v; se esperaba que no guarde nada", found, err)
	}
}

func TestNewRedisRejectsInvalidURL(t *testing.T) {
	if _, err := NewRedis("http://no-es-redis"); err == nil {
		t.Fatal("se esperaba un error con una URL inválida")
	}
}

// TestRedisIntegration se ejecuta solo si TEST_REDIS_URL apunta a un Redis real (CI).
func TestRedisIntegration(t *testing.T) {
	url := os.Getenv("TEST_REDIS_URL")
	if url == "" {
		t.Skip("define TEST_REDIS_URL para ejecutar la prueba contra Redis")
	}
	r, err := NewRedis(url)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	ctx := context.Background()
	key := "qr:test:" + time.Now().Format(time.RFC3339Nano)

	if _, found, err := r.Get(ctx, key); found || err != nil {
		t.Fatalf("clave nueva: found %v, err %v", found, err)
	}
	if err := r.Set(ctx, key, []byte(`{"ok":true}`), time.Minute); err != nil {
		t.Fatal(err)
	}
	value, found, err := r.Get(ctx, key)
	if err != nil || !found || string(value) != `{"ok":true}` {
		t.Fatalf("Get() = %q, %v, %v", value, found, err)
	}
}
