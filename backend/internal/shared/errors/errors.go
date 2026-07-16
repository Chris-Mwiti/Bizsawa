package errors

import (
	stderrors "errors"
	"fmt"
	"net/http"
)

type AppError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	StatusCode int    `json:"-"`
	Cause      error  `json:"-"`
}

func (e *AppError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
	return e.Cause
}

func (e *AppError) WithMessage(message string) *AppError {
	copy := *e
	copy.Message = message
	return &copy
}

func (e *AppError) WithCause(cause error) *AppError {
	copy := *e
	copy.Cause = cause
	return &copy
}

func FromError(err error) *AppError {
	if err == nil {
		return nil
	}
	var appErr *AppError
	if stderrors.As(err, &appErr) {
		return appErr
	}
	return ErrInternal.WithCause(err).WithMessage("internal server error")
}

var (
	ErrInternal             = &AppError{Code: "INTERNAL", StatusCode: http.StatusInternalServerError}
	ErrNotFound             = &AppError{Code: "NOT_FOUND", StatusCode: http.StatusNotFound}
	ErrUnauthorized         = &AppError{Code: "UNAUTHORIZED", StatusCode: http.StatusUnauthorized}
	ErrForbidden            = &AppError{Code: "FORBIDDEN", StatusCode: http.StatusForbidden}
	ErrConflict             = &AppError{Code: "CONFLICT", StatusCode: http.StatusConflict}
	ErrUnprocessable        = &AppError{Code: "UNPROCESSABLE", StatusCode: http.StatusUnprocessableEntity}
	ErrTooManyRequests      = &AppError{Code: "RATE_LIMITED", StatusCode: http.StatusTooManyRequests}
	ErrPaymentFailed        = &AppError{Code: "PAYMENT_FAILED", StatusCode: http.StatusPaymentRequired}
	ErrServiceUnavailable   = &AppError{Code: "SERVICE_UNAVAILABLE", StatusCode: http.StatusServiceUnavailable}
	ErrBusinessLimitReached = &AppError{Code: "BUSINESS_LIMIT_REACHED", StatusCode: http.StatusForbidden}
)
