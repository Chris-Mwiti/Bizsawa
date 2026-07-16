package audit

import (
	"context"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Insertion of entry to the audit log table...
// Returns for validation of action
func (r *Repository) Insert(ctx context.Context, entry *Entry) error {
	return r.db.WithContext(ctx).Create(entry).Error
}
