package sync

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// recordWriter returns the device that last wrote the record ("" if unknown:
// predates attribution or written by a device-less push / REST write).
func (s *Service) recordWriter(tx *gorm.DB, businessID uuid.UUID, table string, recordID uuid.UUID) string {
	var device string
	_ = tx.Raw(`SELECT device_id FROM record_writers WHERE business_id = ? AND table_name = ? AND record_id = ?`, businessID, table, recordID).Scan(&device).Error
	return device
}

func (s *Service) setWriter(tx *gorm.DB, businessID uuid.UUID, table string, recordID uuid.UUID, device string) {
	if device == "" {
		return
	}
	_ = tx.Exec(`INSERT INTO record_writers (business_id, table_name, record_id, device_id, updated_at) VALUES (?, ?, ?, ?, NOW()) ON CONFLICT (business_id, table_name, record_id) DO UPDATE SET device_id = EXCLUDED.device_id, updated_at = NOW()`, businessID, table, recordID, device).Error
}
