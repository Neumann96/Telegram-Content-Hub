package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port                 string
	PostgresHost         string
	PostgresPort         string
	PostgresDB           string
	PostgresUser         string
	PostgresPassword     string
	MinIOEndpoint        string
	MinIOBucket          string
	TelegramBotToken     string
	TelegramLoginBotName string
	WebAllowedOrigins    []string
}

func Load() Config {
	return Config{
		Port:                 env("API_PORT", "8080"),
		PostgresHost:         env("POSTGRES_HOST", "localhost"),
		PostgresPort:         env("POSTGRES_PORT", "5432"),
		PostgresDB:           env("POSTGRES_DB", "telegram_content_hub"),
		PostgresUser:         env("POSTGRES_USER", "telegram_hub"),
		PostgresPassword:     env("POSTGRES_PASSWORD", "telegram_hub_password"),
		MinIOEndpoint:        env("MINIO_ENDPOINT", "localhost:9000"),
		MinIOBucket:          env("MINIO_BUCKET", "telegram-media"),
		TelegramBotToken:     env("TELEGRAM_BOT_TOKEN", ""),
		TelegramLoginBotName: env("TELEGRAM_LOGIN_BOT_USERNAME", ""),
		WebAllowedOrigins:    csvEnv("WEB_ALLOWED_ORIGINS", "http://localhost:3000"),
	}
}

func (c Config) DatabaseDSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable TimeZone=UTC",
		c.PostgresHost,
		c.PostgresPort,
		c.PostgresUser,
		c.PostgresPassword,
		c.PostgresDB,
	)
}

func env(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func csvEnv(key, fallback string) []string {
	raw := env(key, fallback)
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			values = append(values, part)
		}
	}
	return values
}
