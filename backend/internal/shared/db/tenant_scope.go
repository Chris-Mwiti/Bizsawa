package db

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func TenantScope(tenantID uuid.UUID) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		return tx.Where("tenant_id = ?", tenantID)
	}
}

func BusinessScope(businessID uuid.UUID) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		return tx.Where("business_id = ?", businessID)
	}
}
