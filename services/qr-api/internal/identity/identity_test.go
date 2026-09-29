package identity

import (
	"encoding/base64"
	"errors"
	"testing"
)

// token arma un JWT con el payload indicado (la firma no se verifica aquí: lo hace Kong).
func token(payload string) string {
	encode := base64.RawURLEncoding.EncodeToString
	return encode([]byte(`{"alg":"HS256","typ":"JWT"}`)) + "." + encode([]byte(payload)) + ".firma"
}

func TestFromAuthorization(t *testing.T) {
	got, err := FromAuthorization("Bearer " + token(`{"sub":"ana","role":"analyst","iss":"qr-analyst"}`))
	if err != nil {
		t.Fatalf("FromAuthorization() error = %v", err)
	}
	if got != (Identity{Username: "ana", Role: "analyst"}) {
		t.Errorf("FromAuthorization() = %+v", got)
	}
}

func TestFromAuthorizationIgnoresBearerCase(t *testing.T) {
	if _, err := FromAuthorization("bearer " + token(`{"sub":"ana"}`)); err != nil {
		t.Fatalf("FromAuthorization() error = %v", err)
	}
}

func TestFromAuthorizationRejectsInvalidHeaders(t *testing.T) {
	cases := map[string]string{
		"vacía":             "",
		"sin Bearer":        token(`{"sub":"ana"}`),
		"Basic":             "Basic YWxhZGRpbjpvcGVuc2VzYW1l",
		"no es JWT":         "Bearer abc",
		"payload inválido":  "Bearer a.%%%.c",
		"payload no JSON":   "Bearer a." + base64.RawURLEncoding.EncodeToString([]byte("hola")) + ".c",
		"sin claim sub":     "Bearer " + token(`{"role":"admin"}`),
	}
	for name, header := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := FromAuthorization(header); !errors.Is(err, ErrMissing) {
				t.Errorf("FromAuthorization(%q) error = %v, se esperaba ErrMissing", header, err)
			}
		})
	}
}
