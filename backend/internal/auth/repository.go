package auth

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) CreateUser(ctx context.Context, user *User) error {
	user.Email = normalizeEmail(user.Email)
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *Repository) FindByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	err := r.db.WithContext(ctx).Where("email = ?", normalizeEmail(email)).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *Repository) FindByID(ctx context.Context, id uuid.UUID) (*User, error) {
	var user User
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *Repository) CreateRefreshToken(ctx context.Context, token *RefreshToken) error {
	return r.db.WithContext(ctx).Create(token).Error
}

func (r *Repository) FindRefreshToken(ctx context.Context, tokenHash string) (*RefreshToken, error) {
	var token RefreshToken
	err := r.db.WithContext(ctx).Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", tokenHash, time.Now().UTC()).First(&token).Error
	if err != nil {
		return nil, err
	}
	return &token, nil
}

func (r *Repository) RevokeRefreshToken(ctx context.Context, id uuid.UUID) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&RefreshToken{}).Where("id = ?", id).Update("revoked_at", now).Error
}

func normalizeEmail(email string) string { 
	return strings.ToLower(strings.TrimSpace(email)) 
}
