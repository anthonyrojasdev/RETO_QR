package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
)

// errNullElement indica que la matriz contiene un null en lugar de un número.
var errNullElement = errors.New("la matriz contiene un valor null")

// Matrix es una matriz de números representada fila a fila.
type Matrix [][]float64

// UnmarshalJSON rechaza los elementos null. Sin esta comprobación,
// encoding/json los convertiría en 0 sin avisar.
func (m *Matrix) UnmarshalJSON(data []byte) error {
	var raw [][]*float64
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if raw == nil {
		*m = nil
		return nil
	}
	out := make(Matrix, len(raw))
	for i, row := range raw {
		out[i] = make([]float64, len(row))
		for j, value := range row {
			if value == nil {
				return fmt.Errorf("%w (fila %d, columna %d)", errNullElement, i+1, j+1)
			}
			out[i][j] = *value
		}
	}
	*m = out
	return nil
}

// Validate comprueba que la matriz no esté vacía, sea rectangular y no supere
// maxDimension filas ni columnas (límite que protege al servicio de matrices
// demasiado costosas de factorizar).
func (m Matrix) Validate(maxDimension int) error {
	if len(m) == 0 {
		return errors.New("el campo matrix es obligatorio y debe tener al menos una fila")
	}
	columns := len(m[0])
	if columns == 0 {
		return errors.New("la matriz debe tener al menos una columna")
	}
	if len(m) > maxDimension || columns > maxDimension {
		return fmt.Errorf("la matriz es de %d×%d y el máximo permitido es %d×%d",
			len(m), columns, maxDimension, maxDimension)
	}
	for i, row := range m {
		if len(row) != columns {
			return fmt.Errorf("la matriz debe ser rectangular: la fila %d tiene %d columnas y la fila 1 tiene %d",
				i+1, len(row), columns)
		}
	}
	return nil
}
