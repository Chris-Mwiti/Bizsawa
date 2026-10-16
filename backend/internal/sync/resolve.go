package sync

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// resolve.go: kept_client conflict resolution — the resolving device's payload
// wins outright (server version bump, no conflict row).
func (s *Service) ForceApplyClientPayload(ctx context.Context, businessID uuid.UUID, table string, recordID uuid.UUID, payload map[string]any) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		update := map[string]any{}

		for k, v := range payload {
			if k == "id" || k == "sync_version" || k == "syncVersion" || k == "business_id" || k == "tenant_id" || (len(k) > 0 && k[0] == '_') {
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
		update["updated_at"] = time.Now()

		return tx.Table(table).Where("id = ? AND business_id = ?", recordID, businessID).Updates(update).Error
	})
}
