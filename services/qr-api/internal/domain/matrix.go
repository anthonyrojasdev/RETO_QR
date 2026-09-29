// Package domain contiene las entidades y reglas de negocio del servicio.
//
// Es la capa más interna de la arquitectura: no depende de HTTP, bases de
// datos ni formatos de serialización; solo de la biblioteca estándar y de Gonum.
package domain

import (
	"errors"
	"fmt"
)

// ErrInvalidMatrix permite reconocer cualquier error de validación con errors.Is.
var ErrInvalidMatrix = errors.New("matriz inválida")

// ValidationError explica por qué una matriz no cumple las reglas de entrada.
type ValidationError struct {
	Reason string
}

func (e *ValidationError) Error() string { return e.Reason }

// Is hace que errors.Is(err, ErrInvalidMatrix) reconozca este error.
func (e *ValidationError) Is(target error) bool { return target == ErrInvalidMatrix }

func invalidMatrix(format string, args ...any) error {
	return &ValidationError{Reason: fmt.Sprintf(format, args...)}
}

// Matrix es una matriz de números representada fila a fila.
type Matrix [][]float64

// Dims devuelve el número de filas y columnas. Solo tiene sentido en una matriz válida.
func (m Matrix) Dims() (rows, cols int) {
	if len(m) == 0 {
		return 0, 0
	}
	return len(m), len(m[0])
}

// Validate comprueba que la matriz sea rectangular y no vacía, y que no supere
// maxDimension filas ni columnas (límite que protege al servicio de cálculos muy costosos).
func (m Matrix) Validate(maxDimension int) error {
	if err := m.checkShape(); err != nil {
		return err
	}
	if rows, cols := m.Dims(); rows > maxDimension || cols > maxDimension {
		return invalidMatrix("la matriz es de %d×%d y el máximo permitido es %d×%d",
			rows, cols, maxDimension, maxDimension)
	}
	return nil
}

// checkShape comprueba que la matriz no esté vacía y sea rectangular.
func (m Matrix) checkShape() error {
	if len(m) == 0 {
		return invalidMatrix("la matriz debe tener al menos una fila")
	}
	cols := len(m[0])
	if cols == 0 {
		return invalidMatrix("la matriz debe tener al menos una columna")
	}
	for i, row := range m {
		if len(row) != cols {
			return invalidMatrix("la matriz debe ser rectangular: la fila %d tiene %d columnas y la fila 1 tiene %d",
				i+1, len(row), cols)
		}
	}
	return nil
}

// flatten devuelve los valores en orden por filas, como los espera Gonum.
func (m Matrix) flatten() []float64 {
	rows, cols := m.Dims()
	data := make([]float64, 0, rows*cols)
	for _, row := range m {
		data = append(data, row...)
	}
	return data
}
