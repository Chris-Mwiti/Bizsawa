package waha

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is a thin HTTP client for the WAHA (WhatsApp HTTP API) service.
type Client struct {
	baseURL    string
	session    string
	apiKey     string
	httpClient *http.Client
}

func NewClient(baseURL, session, apiKey string) *Client {
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}

	return &Client{
		baseURL:    baseURL,
		session:    session,
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// Message is a WAHA text message request body.
type Message struct {
	ChatID    string `json:"chatId"`
	Text      string `json:"text"`
	Session   string `json:"session"`
	MediaURL  string `json:"mediaUrl,omitempty"`
	MediaType string `json:"mediaType,omitempty"`
}

// Response is the WAHA acknowledgement for a queued message.
type Response struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Timestamp int64  `json:"timestamp"`
}

// SendText sends a plain-text WhatsApp message to a recipient.
func (c *Client) SendText(ctx context.Context, chatID, text string) (*Response, error) {
	return c.send(ctx, &Message{ChatID: chatID, Text: text, Session: c.session})
}

// SendMedia sends a WhatsApp message with a media attachment.
func (c *Client) SendMedia(ctx context.Context, chatID, text, mediaURL, mediaType string) (*Response, error) {
	if mediaType == "" {
		mediaType = "document"
	}

	return c.send(ctx, &Message{
		ChatID:    chatID,
		Text:      text,
		Session:   c.session,
		MediaURL:  mediaURL,
		MediaType: mediaType,
	})
}

func (c *Client) send(ctx context.Context, msg *Message) (*Response, error) {
	endpoint := c.baseURL + "/api/sendText"

	body, err := json.Marshal(msg)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")

	if c.apiKey != "" {
		req.Header.Set("X-Api-Key", c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("waha: unexpected status %d: %s", resp.StatusCode, string(raw))
	}

	var out Response
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}

	return &out, nil
}

// normalizeChatID ensures an international phone number has no leading "+".
func normalizeChatID(phone string) string {
	if len(phone) > 0 && phone[0] == '+' {
		return phone[1:]
	}

	return phone
}
