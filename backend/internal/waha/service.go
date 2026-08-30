package waha

import (
	"context"
	"log/slog"
)

// Service is the WhatsApp (WAHA) notification service.
type Service struct {
	client *Client
	logger *slog.Logger
}

func NewService(client *Client, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{client: client, logger: logger}
}

// SendRequest is the payload for a direct text message send.
type SendRequest struct {
	Phone   string `json:"phone"`
	Message string `json:"message"`
}

// Send delivers a plain-text WhatsApp message to a recipient.
func (s *Service) Send(ctx context.Context, phone, message string) (*Response, error) {
	if s.client == nil {
		return nil, errNotConfigured()
	}
	if phone == "" {
		return nil, errPhoneRequired()
	}
	s.logger.InfoContext(ctx, "[WAHA]-sending text", "phone", phone)
	resp, err := s.client.SendText(ctx, normalizeChatID(phone), message)
	if err != nil {
		s.logger.ErrorContext(ctx, "[WAHA]-send failed", "phone", phone, "err", err.Error())
		return nil, err
	}
	return resp, nil
}

// SendMedia delivers a WhatsApp message with a media attachment.
func (s *Service) SendMedia(ctx context.Context, phone, message, mediaURL, mediaType string) (*Response, error) {
	if s.client == nil {
		return nil, errNotConfigured()
	}
	if phone == "" {
		return nil, errPhoneRequired()
	}
	return s.client.SendMedia(ctx, normalizeChatID(phone), message, mediaURL, mediaType)
}

// SendNotification dispatches a typed notification using the appropriate
// message template.
func (s *Service) SendNotification(ctx context.Context, phone, kind string, data map[string]any) (*Response, error) {
	message, err := RenderNotification(kind, data)
	if err != nil {
		return nil, err
	}
	return s.Send(ctx, phone, message)
}