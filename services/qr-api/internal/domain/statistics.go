package domain

// Statistics resume los valores de Q y R. Las calcula la Stats API; el dominio
// solo define su forma, sin atarla a ningún formato de serialización.
type Statistics struct {
	Max           float64
	Min           float64
	Average       float64
	Sum           float64
	Count         int
	IsAnyDiagonal bool
	// Matrices resume cada matriz por nombre ("Q" y "R").
	Matrices map[string]MatrixSummary
}

// MatrixSummary describe una de las matrices analizadas.
type MatrixSummary struct {
	Rows       int
	Columns    int
	IsDiagonal bool
}
