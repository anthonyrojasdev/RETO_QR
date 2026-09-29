package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ErrorResponse es el formato común de los errores de la API.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

// ErrorBody describe un error de forma legible para personas y programas.
type ErrorBody struct {
	// Code es un identificador estable del tipo de error.
	Code string `json:"code" example:"INVALID_MATRIX"`
	// Message explica el error en lenguaje natural.
	Message string `json:"message" example:"la matriz debe ser rectangular: la fila 2 tiene 1 columnas y la fila 1 tiene 3"`
	// RequestID permite encontrar la petición en los logs.
	RequestID string `json:"requestId,omitempty" example:"3f1b6c2e-7a55-4a8e-9b1d-0c5e2f7a9d10"`
}

// GatewayError es el formato de los errores que responde Kong antes de llegar
// a la API (401 sin token válido, 429 por límite de peticiones).
type GatewayError struct {
	Message string `json:"message" example:"Unauthorized"`
}

// apiError es un error de negocio con su estado HTTP.
type apiError struct {
	status  int
	code    string
	message string
}

func (e *apiError) Error() string { return e.message }

func newAPIError(status int, code, message string) error {
	return &apiError{status: status, code: code, message: message}
}

// errorHandler convierte cualquier error en un ErrorResponse con el estado adecuado.
func errorHandler(c *fiber.Ctx, err error) error {
	status, code, message := fiber.StatusInternalServerError, "INTERNAL_ERROR", "Error interno del servidor"

	var apiErr *apiError
	var fiberErr *fiber.Error
	switch {
	case errors.As(err, &apiErr):
		status, code, message = apiErr.status, apiErr.code, apiErr.message
	case errors.As(err, &fiberErr):
		status, code, message = fiberErr.Code, codeFromStatus(fiberErr.Code), fiberErr.Message
	}

	return c.Status(status).JSON(ErrorResponse{
		Error: ErrorBody{Code: code, Message: message, RequestID: requestID(c)},
	})
}

// codeFromStatus genera un código a partir del estado HTTP (404 → NOT_FOUND).
func codeFromStatus(status int) string {
	return strings.ToUpper(strings.ReplaceAll(http.StatusText(status), " ", "_"))
}

// requestID devuelve el identificador de la petición (cabecera X-Request-ID).
func requestID(c *fiber.Ctx) string {
	if id, ok := c.Locals(requestIDKey).(string); ok {
		return id
	}
	return ""
}
