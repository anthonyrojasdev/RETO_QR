// Package qr implementa la factorización QR de matrices rectangulares.
//
// Dada una matriz A de m×n, calcula Q (m×m, ortogonal) y R (m×n, triangular
// superior) tales que A = Q·R. El cálculo se apoya en la descomposición de
// Householder de Gonum (gonum.org/v1/gonum/mat).
package qr

import (
	"errors"
	"fmt"

	"gonum.org/v1/gonum/mat"
)

// ErrInvalidShape indica que la matriz está vacía o no es rectangular.
var ErrInvalidShape = errors.New("la matriz debe ser rectangular y no estar vacía")

// Result contiene los factores de la descomposición A = Q·R.
type Result struct {
	// Q es una matriz ortogonal de m×m (Qᵀ·Q = I).
	Q [][]float64
	// R es una matriz triangular superior de m×n.
	R [][]float64
}

// Factorize calcula la factorización QR completa de la matriz a (m×n).
//
// Gonum solo factoriza matrices con m ≥ n. Para m < n (por ejemplo, 2×3) se
// factoriza el bloque cuadrado A[:, :m] = Q·R₁ y el resto de R se obtiene como
// Qᵀ·A[:, m:], lo que mantiene A = Q·R porque Q es ortogonal.
//
// Los signos se normalizan para que la diagonal de R no tenga valores
// negativos; así el resultado es único cuando A tiene rango completo.
func Factorize(a [][]float64) (Result, error) {
	m, n, err := dims(a)
	if err != nil {
		return Result{}, err
	}
	dense := mat.NewDense(m, n, flatten(a, m*n))

	var result Result
	if m >= n {
		result = factorizeTall(dense)
	} else {
		result = factorizeWide(dense, m, n)
	}
	normalizeSigns(result)
	return result, nil
}

// factorizeTall resuelve el caso m ≥ n directamente con Gonum.
func factorizeTall(a *mat.Dense) Result {
	var f mat.QR
	f.Factorize(a)

	var q, r mat.Dense
	f.QTo(&q)
	f.RTo(&r)
	return Result{Q: toRows(&q), R: toRows(&r)}
}

// factorizeWide resuelve el caso m < n: R = [R₁ | Qᵀ·A[:, m:]].
func factorizeWide(a *mat.Dense, m, n int) Result {
	var f mat.QR
	f.Factorize(a.Slice(0, m, 0, m))

	var q, r1, rest mat.Dense
	f.QTo(&q)
	f.RTo(&r1)
	rest.Mul(q.T(), a.Slice(0, m, m, n))

	r := make([][]float64, m)
	for i := range r {
		r[i] = make([]float64, n)
		for j := 0; j < m; j++ {
			r[i][j] = r1.At(i, j)
		}
		for j := m; j < n; j++ {
			r[i][j] = rest.At(i, j-m)
		}
	}
	return Result{Q: toRows(&q), R: r}
}

// normalizeSigns cambia el signo de la fila i de R y de la columna i de Q
// cuando R[i][i] < 0. Como D·D = I para D = diag(±1), el producto Q·R no cambia.
// Además convierte los "-0" en 0 para que la salida JSON sea limpia.
func normalizeSigns(res Result) {
	k := min(len(res.R), len(res.R[0]))
	for i := 0; i < k; i++ {
		if res.R[i][i] >= 0 {
			continue
		}
		for j := range res.R[i] {
			res.R[i][j] = -res.R[i][j]
		}
		for row := range res.Q {
			res.Q[row][i] = -res.Q[row][i]
		}
	}
	for _, matrix := range [][][]float64{res.Q, res.R} {
		for _, row := range matrix {
			for j, v := range row {
				if v == 0 {
					row[j] = 0
				}
			}
		}
	}
}

// dims devuelve las dimensiones de a y comprueba que sea rectangular.
func dims(a [][]float64) (m, n int, err error) {
	if len(a) == 0 || len(a[0]) == 0 {
		return 0, 0, ErrInvalidShape
	}
	m, n = len(a), len(a[0])
	for i, row := range a {
		if len(row) != n {
			return 0, 0, fmt.Errorf("%w: la fila %d tiene %d columnas y se esperaban %d",
				ErrInvalidShape, i+1, len(row), n)
		}
	}
	return m, n, nil
}

// flatten convierte la matriz a un slice en orden por filas, como espera Gonum.
func flatten(a [][]float64, size int) []float64 {
	data := make([]float64, 0, size)
	for _, row := range a {
		data = append(data, row...)
	}
	return data
}

// toRows convierte una matriz de Gonum a [][]float64.
func toRows(d *mat.Dense) [][]float64 {
	m, n := d.Dims()
	rows := make([][]float64, m)
	for i := range rows {
		rows[i] = make([]float64, n)
		mat.Row(rows[i], i, d)
	}
	return rows
}
