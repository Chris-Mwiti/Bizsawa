package db

import (
	"context"
	"database/sql"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Open(cfg config.DatabaseConfig) (*gorm.DB, error) {
	gormDB, err := gorm.Open(postgres.Open(cfg.DSN), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	sqlDB, err := gormDB.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Hour)

	return gormDB, nil
}

func Ping(ctx context.Context, gormDB *gorm.DB) error {
	sqlDB, err := SQLDB(gormDB)
	if err != nil {
		return err
	}
	return sqlDB.PingContext(ctx)
}

func SQLDB(gormDB *gorm.DB) (*sql.DB, error) {
	return gormDB.DB()
}
