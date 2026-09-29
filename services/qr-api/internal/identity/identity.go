// Package identity obtiene el usuario autenticado a partir del JWT de la petición.
//
// La firma, la expiración y el rol del token ya los verificó Kong. La QR API no
// es accesible desde fuera de la red interna, así que aquí solo se leen los claims.
package identity

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
)

// ErrMissing indica que la petición no trae un JWT con el claim "sub".
var ErrMissing = errors.New("la petición no incluye un token de usuario")

// Identity es el usuario que hace la petición.
type Identity struct {
	// Username es el claim "sub" del JWT.
	Username string `json:"sub"`
	// Role es el claim "role" del JWT (admin o analyst).
	Role string `json:"role"`
}

// FromAuthorization lee los claims de una cabecera "Authorization: Bearer <jwt>".
func FromAuthorization(header string) (Identity, error) {
	const prefix = "bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return Identity{}, ErrMissing
	}

	parts := strings.Split(header[len(prefix):], ".")
	if len(parts) != 3 {
		return Identity{}, ErrMissing
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Identity{}, ErrMissing
	}

	var id Identity
	if err := json.Unmarshal(payload, &id); err != nil || id.Username == "" {
		return Identity{}, ErrMissing
	}
	return id, nil
}
