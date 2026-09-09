package db

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type BaseModel struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"tenantId"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
	SyncVersion int            `gorm:"not null;default:1" json:"syncVersion"`
}

// TenantModel is for tenancy/membership tables that are NOT syncable (business_members, user_profiles, etc).
// They must NOT have sync_version — otherwise GORM tries to INSERT sync_version and fails with
// "column sync_version of relation business_members does not exist" (SQLSTATE 42703).
// See migration 000002 (business_members) which correctly omits sync_version, vs 000013 which only adds it to syncable tables.
type TenantModel struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID  uuid.UUID      `gorm:"type:uuid;not null;index" json:"tenantId"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
