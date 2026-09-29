package domain

import (
	"errors"
	"math"
	"testing"
)

const tolerance = 1e-10

func TestFactorizeSpecExample(t *testing.T) {
	// Ejemplo del enunciado: A (2×3). Resultado exacto con s = 1/√17.
	a := Matrix{{1, 2, 3}, {4, 5, 6}}
	s := 1 / math.Sqrt(17)
	wantQ := Matrix{{s, 4 * s}, {4 * s, -s}}
	wantR := Matrix{{17 * s, 22 * s, 27 * s}, {0, 3 * s, 6 * s}}

	got, err := Factorize(a)
	if err != nil {
		t.Fatalf("Factorize() error = %v", err)
	}
	assertClose(t, "Q", got.Q, wantQ)
	assertClose(t, "R", got.R, wantR)
}

func TestFactorizeProperties(t *testing.T) {
	cases := map[string]Matrix{
		"cuadrada 3x3":        {{12, -51, 4}, {6, 167, -68}, {-4, 24, -41}},
		"alta 4x2":            {{1, 2}, {3, 4}, {5, 6}, {7, 8}},
		"ancha 2x4":           {{1, -2, 3, 0.5}, {4, 5, -6, 2}},
		"una celda":           {{-7}},
		"una fila":            {{3, 4, 5}},
		"una columna":         {{3}, {4}},
		"rango incompleto":    {{1, 2}, {2, 4}, {3, 6}},
		"ceros":               {{0, 0}, {0, 0}},
		"identidad":           {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}},
		"diagonal con signos": {{-2, 0}, {0, 3}},
	}

	for name, a := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := Factorize(a)
			if err != nil {
				t.Fatalf("Factorize() error = %v", err)
			}
			m, n := a.Dims()
			assertDims(t, "Q", got.Q, m, m)
			assertDims(t, "R", got.R, m, n)
			assertClose(t, "QᵀQ", multiply(transpose(got.Q), got.Q), identity(m))
			assertClose(t, "Q·R", multiply(got.Q, got.R), a)
			for i := range got.R {
				for j := 0; j < i && j < n; j++ {
					if got.R[i][j] != 0 {
						t.Errorf("R[%d][%d] = %g, se esperaba 0 bajo la diagonal", i, j, got.R[i][j])
					}
				}
				if i < n && got.R[i][i] < 0 {
					t.Errorf("R[%d][%d] = %g, la diagonal debe ser no negativa", i, i, got.R[i][i])
				}
			}
		})
	}
}

func TestFactorizeDoesNotModifyInput(t *testing.T) {
	a := Matrix{{1, 2}, {3, 4}}
	if _, err := Factorize(a); err != nil {
		t.Fatalf("Factorize() error = %v", err)
	}
	assertClose(t, "entrada", a, Matrix{{1, 2}, {3, 4}})
}

func TestFactorizeRejectsInvalidShapes(t *testing.T) {
	for name, a := range map[string]Matrix{"nil": nil, "fila vacía": {{}}, "no rectangular": {{1, 2}, {3}}} {
		t.Run(name, func(t *testing.T) {
			if _, err := Factorize(a); !errors.Is(err, ErrInvalidMatrix) {
				t.Fatalf("Factorize() error = %v, se esperaba ErrInvalidMatrix", err)
			}
		})
	}
}

func assertDims(t *testing.T, name string, m Matrix, rows, cols int) {
	t.Helper()
	if len(m) != rows {
		t.Fatalf("%s tiene %d filas, se esperaban %d", name, len(m), rows)
	}
	for i, row := range m {
		if len(row) != cols {
			t.Fatalf("%s fila %d tiene %d columnas, se esperaban %d", name, i, len(row), cols)
		}
	}
}

func assertClose(t *testing.T, name string, got, want Matrix) {
	t.Helper()
	assertDims(t, name, got, len(want), len(want[0]))
	for i := range want {
		for j := range want[i] {
			if math.Abs(got[i][j]-want[i][j]) > tolerance {
				t.Fatalf("%s[%d][%d] = %.15g, se esperaba %.15g", name, i, j, got[i][j], want[i][j])
			}
		}
	}
}

func multiply(a, b Matrix) Matrix {
	out := make(Matrix, len(a))
	for i := range a {
		out[i] = make([]float64, len(b[0]))
		for j := range b[0] {
			for k := range b {
				out[i][j] += a[i][k] * b[k][j]
			}
		}
	}
	return out
}

func transpose(a Matrix) Matrix {
	out := make(Matrix, len(a[0]))
	for j := range out {
		out[j] = make([]float64, len(a))
		for i := range a {
			out[j][i] = a[i][j]
		}
	}
	return out
}

func identity(n int) Matrix {
	out := make(Matrix, n)
	for i := range out {
		out[i] = make([]float64, n)
		out[i][i] = 1
	}
	return out
}
