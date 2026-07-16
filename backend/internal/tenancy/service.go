package tenancy

import (
	"context"
	"errors"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

func (s *Service) EnsureDefaultSubscription(ctx context.Context, userID uuid.UUID) (*Subscription, error) {
	sub, err := s.repo.ActiveByUser(ctx, userID)
	if err == nil {
		return sub, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	sub = &Subscription{UserID: userID, PlanCode: PlanFree, Status: "ACTIVE"}
	if err := s.repo.Create(ctx, sub); err != nil {
		return nil, err
	}
	return sub, nil
}

func (s *Service) EnforceBusinessLimit(ctx context.Context, userID uuid.UUID) error {
	sub, err := s.EnsureDefaultSubscription(ctx, userID)
	if err != nil {
		return err
	}
	plan := PlanByCode(sub.PlanCode)
	if plan.MaxBusinesses == 0 {
		return nil
	}
	count, err := s.repo.CountBusinessesByOwner(ctx, userID)
	if err != nil {
		return err
	}
	if count >= int64(plan.MaxBusinesses) {
		return apperrors.ErrBusinessLimitReached.WithMessage("business limit reached for subscription plan")
	}
	return nil
}
