package payments

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/shopspring/decimal"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
)

type MpesaClient struct {
	cfg        config.MpesaConfig
	httpClient *http.Client
	logger     *slog.Logger
}

type mpesaTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   string `json:"expires_in"`
}

type mpesaAPIResponse struct {
	MerchantRequestID        string `json:"MerchantRequestID"`
	CheckoutRequestID        string `json:"CheckoutRequestID"`
	ConversationID           string `json:"ConversationID"`
	OriginatorConversationID string `json:"OriginatorConversationID"`
	ResponseCode             string `json:"ResponseCode"`
	ResponseDescription      string `json:"ResponseDescription"`
	ResultCode               string `json:"ResultCode"`
	ResultDesc               string `json:"ResultDesc"`
	Raw                      json.RawMessage
}

func NewMpesaClient(cfg config.MpesaConfig, logger *slog.Logger) *MpesaClient {
	if logger == nil {
		logger = slog.Default()
	}

	return &MpesaClient{cfg: cfg, logger: logger, httpClient: &http.Client{Timeout: 30 * time.Second}}
}

func (c *MpesaClient) ProcessPayment(ctx context.Context, cmd PaymentCommand) (ProviderResult, error) {
	switch cmd.Type {
	case CommandSTKPush:
		return c.STKPush(ctx, STKPushRequest{Phone: cmd.Phone, Amount: cmd.Amount, AccountReference: cmd.AccountReference, TransactionDesc: c.defaultDesc()})
	case CommandB2C:
		return c.B2C(ctx, B2CRequest{Phone: cmd.Phone, Amount: cmd.Amount, Remarks: c.defaultDesc(), Occasion: cmd.AccountReference})
	case CommandC2B:
		return c.SimulateC2B(ctx, C2BSimulateRequest{Phone: cmd.Phone, Amount: cmd.Amount, BillRefNumber: cmd.AccountReference})
	case CommandCash:
		raw, _ := json.Marshal(map[string]any{
			"provider": "cash",
			"status":   "accepted",
		})

		return ProviderResult{RequestID: cmd.ID.String(), Receipt: cmd.ID.String(), Raw: raw, Status: StatusSucceeded}, nil
	default:
		return ProviderResult{}, fmt.Errorf("unsupported payment command type %q", cmd.Type)
	}
}

type STKPushRequest struct {
	Phone            string
	Amount           decimal.Decimal
	AccountReference string
	TransactionDesc  string
}

type B2CRequest struct {
	Phone    string
	Amount   decimal.Decimal
	Remarks  string
	Occasion string
}

type C2BRegisterRequest struct {
	ResponseType string
}

type C2BSimulateRequest struct {
	Phone         string
	Amount        decimal.Decimal
	BillRefNumber string
}

// dummy comment for the day

type TransactionStatusRequest struct {
	TransactionID string
	Remarks       string
	Occasion      string
}

func (c *MpesaClient) STKPush(ctx context.Context, req STKPushRequest) (ProviderResult, error) {
	timestamp := time.Now().Format("20060102150405")
	password := base64.StdEncoding.EncodeToString([]byte(c.cfg.BusinessShortCode + c.cfg.Passkey + timestamp))
	payload := map[string]any{
		"BusinessShortCode": c.cfg.BusinessShortCode,
		"Password":          password,
		"Timestamp":         timestamp,
		"TransactionType":   "CustomerPayBillOnline",
		"Amount":            req.Amount.Round(0).IntPart(),
		"PartyA":            normalizePhone(req.Phone),
		"PartyB":            c.cfg.BusinessShortCode,
		"PhoneNumber":       normalizePhone(req.Phone),
		"CallBackURL":       c.cfg.STKCallbackURL,
		"AccountReference":  req.AccountReference,
		"TransactionDesc":   firstNonEmpty(req.TransactionDesc, c.defaultDesc()),
	}

	resp, err := c.post(ctx, "/mpesa/stkpush/v1/processrequest", payload)
	if err != nil {
		c.logger.ErrorContext(ctx, "[STK_PUSH]-stk push failed", "err", err)
		return ProviderResult{}, err
	}

	return providerResult(resp), nil
}

func (c *MpesaClient) B2C(ctx context.Context, req B2CRequest) (ProviderResult, error) {
	payload := map[string]any{
		"InitiatorName":      c.cfg.InitiatorName,
		"SecurityCredential": c.cfg.SecurityCredential,
		"CommandID":          "BusinessPayment",
		"Amount":             req.Amount.Round(0).IntPart(),
		"PartyA":             c.cfg.BusinessShortCode,
		"PartyB":             normalizePhone(req.Phone),
		"Remarks":            firstNonEmpty(req.Remarks, c.defaultDesc()),
		"QueueTimeOutURL":    c.cfg.QueueTimeoutURL,
		"ResultURL":          c.cfg.ResultURL,
		"Occasion":           req.Occasion,
	}

	resp, err := c.post(ctx, "/mpesa/b2c/v1/paymentrequest", payload)
	if err != nil {
		return ProviderResult{}, err
	}

	return providerResult(resp), nil
}

func (c *MpesaClient) RegisterC2BURLs(ctx context.Context, req C2BRegisterRequest) (ProviderResult, error) {
	payload := map[string]any{
		"ShortCode":       c.cfg.BusinessShortCode,
		"ResponseType":    firstNonEmpty(req.ResponseType, "Completed"),
		"ConfirmationURL": c.cfg.C2BConfirmationURL,
		"ValidationURL":   c.cfg.C2BValidationURL,
	}

	resp, err := c.post(ctx, "/mpesa/c2b/v1/registerurl", payload)
	if err != nil {
		return ProviderResult{}, err
	}

	return providerResult(resp), nil
}

func (c *MpesaClient) SimulateC2B(ctx context.Context, req C2BSimulateRequest) (ProviderResult, error) {
	payload := map[string]any{
		"ShortCode":     c.cfg.BusinessShortCode,
		"CommandID":     "CustomerPayBillOnline",
		"Amount":        req.Amount.Round(0).IntPart(),
		"Msisdn":        normalizePhone(req.Phone),
		"BillRefNumber": req.BillRefNumber,
	}

	resp, err := c.post(ctx, "/mpesa/c2b/v1/simulate", payload)
	if err != nil {
		return ProviderResult{}, err
	}

	return providerResult(resp), nil
}

func (c *MpesaClient) TransactionStatus(ctx context.Context, req TransactionStatusRequest) (ProviderResult, error) {
	payload := map[string]any{
		"Initiator":          c.cfg.InitiatorName,
		"SecurityCredential": c.cfg.SecurityCredential,
		"CommandID":          "TransactionStatusQuery",
		"TransactionID":      req.TransactionID,
		"PartyA":             c.cfg.BusinessShortCode,
		"IdentifierType":     "4",
		"ResultURL":          c.cfg.ResultURL,
		"QueueTimeOutURL":    c.cfg.QueueTimeoutURL,
		"Remarks":            firstNonEmpty(req.Remarks, c.defaultDesc()),
		"Occasion":           req.Occasion,
	}

	resp, err := c.post(ctx, "/mpesa/transactionstatus/v1/query", payload)
	if err != nil {
		return ProviderResult{}, err
	}

	return providerResult(resp), nil
}

func (c *MpesaClient) token(ctx context.Context) (string, error) {
	if c.cfg.ConsumerKey == "" || c.cfg.ConsumerSecret == "" {
		return "", fmt.Errorf("mpesa consumer credentials are not configured")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.cfg.BaseURL, "/")+"/oauth/v1/generate?grant_type=client_credentials", nil)
	if err != nil {
		return "", err
	}

	req.SetBasicAuth(c.cfg.ConsumerKey, c.cfg.ConsumerSecret)

	res, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}

	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("mpesa token request failed: status=%d body=%s", res.StatusCode, string(body))
	}

	var out mpesaTokenResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}

	if out.AccessToken == "" {
		return "", fmt.Errorf("mpesa token response missing access token")
	}

	return out.AccessToken, nil
}

func (c *MpesaClient) post(ctx context.Context, path string, payload any) (mpesaAPIResponse, error) {
	token, err := c.token(ctx)
	if err != nil {
		return mpesaAPIResponse{}, err
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return mpesaAPIResponse{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.cfg.BaseURL, "/")+path, bytes.NewReader(body))
	if err != nil {
		return mpesaAPIResponse{}, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.httpClient.Do(req)
	if err != nil {
		return mpesaAPIResponse{}, err
	}

	defer res.Body.Close()

	resBody, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return mpesaAPIResponse{}, fmt.Errorf("mpesa request failed: path=%s status=%d body=%s", path, res.StatusCode, string(resBody))
	}

	var out mpesaAPIResponse
	if err := json.Unmarshal(resBody, &out); err != nil {
		return mpesaAPIResponse{}, err
	}

	out.Raw = append(out.Raw[:0], resBody...)

	return out, nil
}

func providerResult(resp mpesaAPIResponse) ProviderResult {
	requestID := firstNonEmpty(resp.CheckoutRequestID, resp.ConversationID, resp.OriginatorConversationID, resp.MerchantRequestID)
	receipt := firstNonEmpty(resp.ResponseCode, resp.ResultCode, requestID)

	return ProviderResult{RequestID: requestID, Receipt: receipt, Raw: resp.Raw, Status: StatusProcessing}
}

func (c *MpesaClient) defaultDesc() string {
	return firstNonEmpty(c.cfg.DefaultTransactionDesc, "BizSawa payment")
}

func normalizePhone(phone string) string {
	phone = strings.TrimSpace(strings.TrimPrefix(phone, "+"))
	if strings.HasPrefix(phone, "0") && len(phone) == 10 {
		return "254" + phone[1:]
	}

	return phone
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
}
