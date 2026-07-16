package products

import (
	"context"
	"errors"
	"strings"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

type ProductRequest struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	SKU         string           `json:"sku"`
	Category    string           `json:"category"`
	Barcode     string           `json:"barcode"`
	ImageURL    string           `json:"imageUrl"`
	TaxRuleID   *uuid.UUID       `json:"taxRuleId"`
	Price       decimal.Decimal  `json:"price"`
	Cost        decimal.Decimal  `json:"cost"`
	IsActive    *bool            `json:"isActive"`
	Variants    []VariantRequest `json:"variants"`
}

type VariantRequest struct {
	Name     string          `json:"name"`
	SKU      string          `json:"sku"`
	Barcode  string          `json:"barcode"`
	Price    decimal.Decimal `json:"price"`
	Cost     decimal.Decimal `json:"cost"`
	IsActive *bool           `json:"isActive"`
}

func (s *Service) Create(ctx context.Context, businessID uuid.UUID, req ProductRequest) (*Product, error) {
	product, variants, err := productFromRequest(businessID, uuid.Nil, req)
	if err != nil {
		return nil, err
	}
	if err := s.repo.Create(ctx, product); err != nil {
		return nil, err
	}
	if len(variants) > 0 {
		for i := range variants {
			variants[i].ProductID = product.ID
		}
		if err := s.repo.ReplaceVariants(ctx, product, variants); err != nil {
			return nil, err
		}
	}
	return s.repo.Find(ctx, businessID, product.ID)
}

func (s *Service) List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]Product, error) {
	products, err := s.repo.List(ctx, businessID, page)
	if len(products) <= 0 {
		return nil, apperrors.ErrNotFound	
	}

	if err != nil {
		return nil, err
	}	

	return products, nil
}

func (s *Service) Get(ctx context.Context, businessID, productID uuid.UUID) (*Product, error) {
	product, err := s.repo.Find(ctx, businessID, productID)

	if err != nil {
		
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}

		return nil, err
	}

	return product, nil
}

func (s *Service) FindProductVariant(ctx context.Context, businessId, productId uuid.UUID) (*ProductVariant, error) {
	productVariant, err := s.repo.FindProductVariant(ctx, businessId, productId)

	if err != nil {

		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}

		return nil, err
	}

	return productVariant, nil
}

func (s *Service) Update(ctx context.Context, businessID, productID uuid.UUID, req ProductRequest) (*Product, error) {
	product, err := s.repo.Find(ctx, businessID, productID)
	if err != nil {
		return nil, err
	}
	updated, variants, err := productFromRequest(businessID, productID, req)
	if err != nil {
		return nil, err
	}

	product.Name = updated.Name

	if updated.Description != "" {
		product.Description = updated.Description	
	}

	if updated.SKU != "" {
		product.SKU = updated.SKU
	}
	 
	if updated.Category != "" {
		product.Category = updated.Category
	}
	
	if updated.Barcode != "" {
		product.Barcode = updated.Barcode
	}
	
	if updated.ImageURL != "" {
		product.ImageURL = updated.ImageURL
	}

	if updated.TaxRuleID != nil {
		product.TaxRuleID = updated.TaxRuleID
	}	

	if updated.Price.GreaterThan(decimal.Zero){
     product.Price = updated.Price  
	}

	if updated.Price.GreaterThan(decimal.Zero) {
		product.Cost = updated.Cost
	}
	product.IsActive = updated.IsActive

	if err := s.repo.Update(ctx, product); err != nil {
		return nil, err
	}
	for i := range variants {
		variants[i].ProductID = product.ID
	}
	if err := s.repo.ReplaceVariants(ctx, product, variants); err != nil {
		return nil, err
	}
	return s.repo.Find(ctx, businessID, product.ID)
}

func (s *Service) Delete(ctx context.Context, businessID, productID uuid.UUID) error {
	return s.repo.Delete(ctx, businessID, productID)
}

func (s *Service) GenerateDescription(ctx context.Context, businessID, productID uuid.UUID) (string, error) {
	product, err := s.repo.Find(ctx, businessID, productID)
	if err != nil {
		return "", err
	}
	parts := []string{product.Name}
	if product.Category != "" {
		parts = append(parts, "in "+product.Category)
	}
	return strings.TrimSpace(strings.Join(parts, " ") + " for your business catalogue."), nil
}

func productFromRequest(businessID, productID uuid.UUID, req ProductRequest) (*Product, []ProductVariant, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, nil, apperrors.ErrUnprocessable.WithMessage("product name is required")
	}
	active := true
	if req.IsActive != nil {
		active = *req.IsActive
	}
	product := &Product{
		BaseModel: shareddb.BaseModel{
			ID: productID, 
			TenantID: businessID,
		}, 
		BusinessID: businessID, 
		Name: strings.TrimSpace(req.Name), 
		Description: strings.TrimSpace(req.Description), 
		SKU: normalizeSKU(req.SKU), 
		Category: strings.TrimSpace(req.Category), 
		Barcode: strings.TrimSpace(req.Barcode), 
		ImageURL: strings.TrimSpace(req.ImageURL), 
		TaxRuleID: req.TaxRuleID, 
		Price: req.Price, 
		Cost: req.Cost, 
		IsActive: active,
	}
	variants := make([]ProductVariant, 0, len(req.Variants))
	for _, item := range req.Variants {
		if strings.TrimSpace(item.Name) == "" {
			return nil, nil, apperrors.ErrUnprocessable.WithMessage("variant name is required")
		}
		variantActive := true
		if item.IsActive != nil {
			variantActive = *item.IsActive
		}
		variants = append(variants, ProductVariant{
			BaseModel: shareddb.BaseModel{
				TenantID: businessID,
			}, 
			BusinessID: businessID, 
			Name: strings.TrimSpace(item.Name), 
			SKU: normalizeSKU(item.SKU), 
			Barcode: strings.TrimSpace(item.Barcode), 
			Price: item.Price, 
			Cost: item.Cost, 
			IsActive: variantActive,
		})
	}
	return product, variants, nil
}

func normalizeSKU(sku string) string {
	return strings.ToUpper(strings.TrimSpace(sku))
}
