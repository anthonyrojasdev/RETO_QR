package app

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"

	"reto-qr/qr-api/internal/domain"
)

// CacheKey identifica una matriz por su contenido: la misma matriz produce
// siempre la misma clave, sin importar cómo se escribió en el JSON (1 o 1.0).
// Se aplica un hash a las dimensiones y a los valores en binario.
func CacheKey(m domain.Matrix) string {
	h := sha256.New()
	rows, cols := m.Dims()
	// Escribir en un hash.Hash nunca devuelve error.
	_ = binary.Write(h, binary.LittleEndian, [2]int64{int64(rows), int64(cols)})
	for _, row := range m {
		_ = binary.Write(h, binary.LittleEndian, row)
	}
	return hex.EncodeToString(h.Sum(nil))
}
