package sync

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// resolve.go: kept_client conflict resolution — the resolving device's payload
// wins and that device becomes the writer, so a later edit from the same
// device follows last-write-wins instead of conflicting again.

func (s *Service) ForceApplyClientPayload(ctx context.Context, businessID uuid.UUID, table string, recordID uuid.UUID, payload map[string]any) error {
	return s.ForceApplyClientPayloadWithDevice(ctx, businessID, table, recordID, payload, "")
}

// ForceApplyClientPayloadWithDevice is the kept_client resolution path: the
// resolving device becomes the writer of record so a later edit from that
// same device follows last-write-wins instead of conflicting again.
func (s *Service) ForceApplyClientPayloadWithDevice(ctx context.Context, businessID uuid.UUID, table string, recordID uuid.UUID, payload map[string]any, deviceID string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		update := map[string]any{}

		for k, v := range payload {
			if k == "id" || k == "sync_version" || k == "syncVersion" || k == "business_id" || k == "tenant_id" || k == "created_at" || k == "updated_at" || (len(k) > 0 && k[0] == '_') {
				continue
			}

			if isTimestampColumn(k) {
				if t := asTime(v); t != nil {
					update[k] = *t
					continue
				}
			}

			update[k] = v
		}

		update["sync_version"] = gorm.Expr("sync_version + 1")
		update["updated_at"] = gorm.Expr("NOW()") // database clock, see updateRecord

		if err := tx.Table(table).Where("id = ? AND business_id = ?", recordID, businessID).Updates(update).Error; err != nil {
			return err
		}
		s.setWriter(tx, businessID, table, recordID, deviceID)
		return nil
	})
}
