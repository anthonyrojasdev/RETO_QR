package domain

import "gonum.org/v1/gonum/mat"

// Factorization es el resultado de A = Q·R.
type Factorization struct {
	// Q es una matriz ortogonal de m×m (Qᵀ·Q = I).
	Q Matrix
	// R es una matriz triangular superior de m×n con diagonal no negativa.
	R Matrix
}

// Factorize calcula la factorización QR completa de la matriz a (m×n) con la
// descomposición de Householder de Gonum.
//
// Gonum solo factoriza matrices con m ≥ n. Para m < n (por ejemplo, 2×3) se
// factoriza el bloque cuadrado A[:, :m] = Q·R₁ y el resto de R se obtiene como
// Qᵀ·A[:, m:], lo que mantiene A = Q·R porque Q es ortogonal.
//
// Los signos se normalizan para que la diagonal de R no tenga valores
// negativos; así el resultado es único cuando A tiene rango completo.
func Factorize(a Matrix) (Factorization, error) {
	if err := a.checkShape(); err != nil {
		return Factorization{}, err
	}
	m, n := a.Dims()
	dense := mat.NewDense(m, n, a.flatten())

	var f Factorization
	if m >= n {
		f = factorizeTall(dense)
	} else {
		f = factorizeWide(dense, m, n)
	}
	f.normalizeSigns()
	return f, nil
}

// factorizeTall resuelve el caso m ≥ n directamente con Gonum.
func factorizeTall(a *mat.Dense) Factorization {
	var qr mat.QR
	qr.Factorize(a)

	var q, r mat.Dense
	qr.QTo(&q)
	qr.RTo(&r)
	return Factorization{Q: fromDense(&q), R: fromDense(&r)}
}

// factorizeWide resuelve el caso m < n: R = [R₁ | Qᵀ·A[:, m:]].
func factorizeWide(a *mat.Dense, m, n int) Factorization {
	var qr mat.QR
	qr.Factorize(a.Slice(0, m, 0, m))

	var q, r1, rest mat.Dense
	qr.QTo(&q)
	qr.RTo(&r1)
	rest.Mul(q.T(), a.Slice(0, m, m, n))

	r := make(Matrix, m)
	for i := range r {
		r[i] = make([]float64, n)
		for j := 0; j < m; j++ {
			r[i][j] = r1.At(i, j)
		}
		for j := m; j < n; j++ {
			r[i][j] = rest.At(i, j-m)
		}
	}
	return Factorization{Q: fromDense(&q), R: r}
}

// normalizeSigns cambia el signo de la fila i de R y de la columna i de Q
// cuando R[i][i] < 0. Como D·D = I para D = diag(±1), el producto Q·R no cambia.
// Además convierte los "-0" en 0 para que la salida sea limpia.
func (f *Factorization) normalizeSigns() {
	rows, cols := f.R.Dims()
	for i := 0; i < min(rows, cols); i++ {
		if f.R[i][i] >= 0 {
			continue
		}
		for j := range f.R[i] {
			f.R[i][j] = -f.R[i][j]
		}
		for row := range f.Q {
			f.Q[row][i] = -f.Q[row][i]
		}
	}
	for _, matrix := range []Matrix{f.Q, f.R} {
		for _, row := range matrix {
			for j, v := range row {
				if v == 0 {
					row[j] = 0
				}
			}
		}
	}
}

// fromDense convierte una matriz de Gonum a Matrix.
func fromDense(d *mat.Dense) Matrix {
	m, n := d.Dims()
	rows := make(Matrix, m)
	for i := range rows {
		rows[i] = make([]float64, n)
		mat.Row(rows[i], i, d)
	}
	return rows
}
