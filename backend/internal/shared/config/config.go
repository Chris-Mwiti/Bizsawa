package config

import (
	"os"
	"strconv"
	"strings"
	"time"
	"log"

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
	WhatsApp        WhatsAppConfig
	Crypto          CryptoConfig
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

type WhatsAppConfig struct {
	Driver      string
	WAHABase    string
	WAHASession string
}

type CryptoConfig struct {
	MasterKey   string
	IndexSecret string
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
		WhatsApp: WhatsAppConfig{
			Driver:      env("WHATSAPP_DRIVER", "waha"),
			WAHABase:    env("WAHA_BASE_URL", "http://localhost:3000"),
			WAHASession: env("WAHA_SESSION_ID", "bizsawa-dev"),
		},
		Crypto: CryptoConfig{
			MasterKey:   env("CRYPTO_MASTER_KEY", "0123456789abcdef0123456789abcdef"),
			IndexSecret: env("CRYPTO_INDEX_SECRET", "fedcba9876543210fedcba9876543210"),
		},
	}
}

func env(key, fallback string) string {
	err := godotenv.Load(".env.development")

	if err != nil {
		log.Fatalf("Could not load up the environment variables")
	}
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
