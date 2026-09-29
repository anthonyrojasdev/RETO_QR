package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateAcceptsRectangularMatrices(t *testing.T) {
	for _, m := range []Matrix{{{1}}, {{1, 2, 3}, {4, 5, 6}}, {{1}, {2}, {3}}} {
		if err := m.Validate(10); err != nil {
			t.Errorf("Validate(%v) error = %v", m, err)
		}
	}
}

func TestValidateRejectsInvalidMatrices(t *testing.T) {
	cases := map[string]struct {
		matrix Matrix
		reason string
	}{
		"nil":             {nil, "al menos una fila"},
		"sin filas":       {Matrix{}, "al menos una fila"},
		"fila vacía":      {Matrix{{}}, "al menos una columna"},
		"no rectangular":  {Matrix{{1, 2, 3}, {4}}, "la fila 2 tiene 1 columnas y la fila 1 tiene 3"},
		"demasiadas filas": {Matrix{{1}, {2}, {3}}, "máximo permitido es 2×2"},
		"demasiadas columnas": {Matrix{{1, 2, 3}}, "máximo permitido es 2×2"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			err := tc.matrix.Validate(2)
			if !errors.Is(err, ErrInvalidMatrix) {
				t.Fatalf("Validate() error = %v, se esperaba ErrInvalidMatrix", err)
			}
			if !strings.Contains(err.Error(), tc.reason) {
				t.Errorf("mensaje = %q, se esperaba que contuviera %q", err.Error(), tc.reason)
			}
		})
	}
}

func TestDims(t *testing.T) {
	if rows, cols := (Matrix{{1, 2, 3}, {4, 5, 6}}).Dims(); rows != 2 || cols != 3 {
		t.Errorf("Dims() = %d×%d, se esperaba 2×3", rows, cols)
	}
	if rows, cols := Matrix(nil).Dims(); rows != 0 || cols != 0 {
		t.Errorf("Dims() de nil = %d×%d, se esperaba 0×0", rows, cols)
	}
}
