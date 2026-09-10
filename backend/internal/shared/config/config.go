package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Env             string
	Addr            string
	ShutdownTimeout time.Duration
	Database        DatabaseConfig
	Redis           RedisConfig
	CORS            CORSConfig
	JWT             JWTConfig
	Google          GoogleConfig
	MCP             MCPConfig
	WhatsApp        WhatsAppConfig
	Crypto          CryptoConfig
	Mpesa           MpesaConfig
}

type DatabaseConfig struct {
	DSN          string
	MaxOpenConns int
	MaxIdleConns int
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type CORSConfig struct {
	AllowedOrigins []string
}

type JWTConfig struct {
	Issuer     string
	SigningKey string
}

type MCPConfig struct {
	Addr                  string
	PublicURL             string
	AuthIssuer            string
	AuthAudience          string
	ToolPayloadLimitBytes int64
	EnableCustomerService bool
	EnableBusinessOwner   bool
	TelemetryEnabled      bool
}

type WhatsAppConfig struct {
	Driver      string
	WAHABase    string
	WAHASession string
	WAHAAPIKey  string
}

type CryptoConfig struct {
	MasterKey   string
	IndexSecret string
}

type GoogleConfig struct {
	// Better-Auth parity: Agents_Documents/BetterAuth/GoogleSocialLogin.md
	// baseURL avoids redirect_uri_mismatch; clientIds array handles web/ios/android audiences
	BaseURL              string
	ClientIDs            []string // GOOGLE_CLIENT_ID or GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID
	ClientSecret         string
	HD                   string // hosted domain restriction, e.g. "company.com" or "*" for any workspace
	Prompt               string // e.g. "select_account" or "select_account consent"
	AccessType           string // "offline" to obtain refresh_token
	IncludeGrantedScopes bool
}

type MpesaConfig struct {
	BaseURL                string
	ConsumerKey            string
	ConsumerSecret         string
	Passkey                string
	BusinessShortCode      string
	InitiatorName          string
	SecurityCredential     string
	QueueTimeoutURL        string
	ResultURL              string
	STKCallbackURL         string
	C2BConfirmationURL     string
	C2BValidationURL       string
	DefaultTransactionDesc string
}

func Load() Config {
	return Config{
		Env:             env("APP_ENV", "development"),
		Addr:            env("APP_ADDR", ":5564"),
		ShutdownTimeout: durationEnv("APP_SHUTDOWN_TIMEOUT", 30*time.Second),
		Database: DatabaseConfig{
			DSN:          env("DATABASE_DSN", ""),
			MaxOpenConns: intEnv("DATABASE_MAX_OPEN_CONNS", 25),
			MaxIdleConns: intEnv("DATABASE_MAX_IDLE_CONNS", 10),
		},
		Redis: RedisConfig{
			Addr:     env("REDIS_ADDR", "localhost:6379"),
			Password: env("REDIS_PASSWORD", ""),
			DB:       intEnv("REDIS_DB", 0),
		},
		CORS: CORSConfig{
			AllowedOrigins: listEnv("CORS_ALLOWED_ORIGINS", []string{"http://localhost:3000", "https://*.bizsawa.com"}),
		},
		JWT: JWTConfig{
			Issuer:     env("JWT_ISSUER", "bizsawa"),
			SigningKey: env("JWT_SIGNING_KEY", "change-me"),
		},
		Google: GoogleConfig{
			BaseURL:              env("BETTER_AUTH_URL", env("GOOGLE_BASE_URL", "")),
			ClientIDs:            googleClientIDs(),
			ClientSecret:         env("GOOGLE_CLIENT_SECRET", ""),
			HD:                   env("GOOGLE_HD", ""),
			Prompt:               env("GOOGLE_PROMPT", "select_account"),
			AccessType:           env("GOOGLE_ACCESS_TYPE", "offline"),
			IncludeGrantedScopes: boolEnv("GOOGLE_INCLUDE_GRANTED_SCOPES", true),
		},
		MCP: MCPConfig{
			Addr:                  env("MCP_ADDR", ":5574"),
			PublicURL:             env("MCP_PUBLIC_URL", "http://localhost:5574"),
			AuthIssuer:            env("MCP_AUTH_ISSUER", env("JWT_ISSUER", "bizsawa")),
			AuthAudience:          env("MCP_AUTH_AUDIENCE", "bizsawa-mcp"),
			ToolPayloadLimitBytes: int64Env("MCP_TOOL_PAYLOAD_LIMIT_BYTES", 64*1024),
			EnableCustomerService: boolEnv("MCP_ENABLE_CUSTOMER_SERVICE", true),
			EnableBusinessOwner:   boolEnv("MCP_ENABLE_BUSINESS_OWNER", true),
			TelemetryEnabled:      boolEnv("MCP_TELEMETRY_ENABLED", true),
		},
		WhatsApp: WhatsAppConfig{
			Driver:      env("WHATSAPP_DRIVER", "waha"),
			WAHABase:    env("WAHA_BASE_URL", "http://localhost:3000"),
			WAHASession: env("WAHA_SESSION_ID", "bizsawa-dev"),
			WAHAAPIKey:  env("WAHA_API_KEY", ""),
		},
		Crypto: CryptoConfig{
			MasterKey:   env("CRYPTO_MASTER_KEY", "0123456789abcdef0123456789abcdef"),
			IndexSecret: env("CRYPTO_INDEX_SECRET", "fedcba9876543210fedcba9876543210"),
		},
		Mpesa: MpesaConfig{
			BaseURL:                env("MPESA_BASE_URL", "https://sandbox.safaricom.co.ke"),
			ConsumerKey:            env("MPESA_CONSUMER_KEY", ""),
			ConsumerSecret:         env("MPESA_CONSUMER_SECRET", ""),
			Passkey:                env("MPESA_PASSKEY", ""),
			BusinessShortCode:      env("MPESA_BUSINESS_SHORTCODE", ""),
			InitiatorName:          env("MPESA_INITIATOR_NAME", ""),
			SecurityCredential:     env("MPESA_SECURITY_CREDENTIAL", ""),
			QueueTimeoutURL:        env("MPESA_QUEUE_TIMEOUT_URL", ""),
			ResultURL:              env("MPESA_RESULT_URL", ""),
			STKCallbackURL:         env("MPESA_STK_CALLBACK_URL", ""),
			C2BConfirmationURL:     env("MPESA_C2B_CONFIRMATION_URL", ""),
			C2BValidationURL:       env("MPESA_C2B_VALIDATION_URL", ""),
			DefaultTransactionDesc: env("MPESA_DEFAULT_TRANSACTION_DESC", "BizSawa payment"),
		},
	}
}

func env(key, fallback string) string {
	// Load local env files if present; ignore missing in cloud/Docker where env is injected
	_ = godotenv.Load(".env.development")
	_ = godotenv.Load(".env")

	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}

	return fallback
}

func intEnv(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func int64Env(key string, fallback int64) int64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}

	return parsed
}

func boolEnv(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func googleClientIDs() []string {
	// Support both single GOOGLE_CLIENT_ID and cross-platform array per Better-Auth docs
	single := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID"))
	web := strings.TrimSpace(os.Getenv("GOOGLE_WEB_CLIENT_ID"))
	ios := strings.TrimSpace(os.Getenv("GOOGLE_IOS_CLIENT_ID"))
	android := strings.TrimSpace(os.Getenv("GOOGLE_ANDROID_CLIENT_ID"))
	var ids []string
	if single != "" {
		ids = append(ids, single)
	}
	if web != "" {
		ids = append(ids, web)
	}
	if ios != "" {
		ids = append(ids, ios)
	}
	if android != "" {
		ids = append(ids, android)
	}
	// Also support comma-separated GOOGLE_CLIENT_IDS
	if envIDs := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_IDS")); envIDs != "" {
		for _, p := range strings.Split(envIDs, ",") {
			p = strings.TrimSpace(p)
			if p != "" {
				ids = append(ids, p)
			}
		}
	}
	// Deduplicate
	seen := map[string]bool{}
	out := []string{}
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func listEnv(key string, fallback []string) []string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))

	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			out = append(out, item)
		}
	}

	if len(out) == 0 {
		return fallback
	}

	return out
}
