package payments

// On-device M-Pesa SMS capture foundation (Track 1).
//
// CapturedPayment rows start as device_reported (unverified) and are
// upgraded to verified only by a receipt+amount match against a
// processor-side record (pesapal IPN now, Daraja C2B later).
//
// QUARANTINE RULE: device_reported and disputed rows must NEVER feed
// sales totals, analytics snapshots, insights or tax reports. Only
// verification_status = 'verified' rows may aggregate. Enforced by
// VerifiedScope() below — use it in every query that sums or reports.

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
)

type CaptureSource string

const (
	SourceSMSDevice      CaptureSource = "sms_device"
	SourceManual         CaptureSource = "manual"
	SourceStatement      CaptureSource = "statement_import"
	SourcePesapal        CaptureSource = "pesapal"
	SourceDaraja         CaptureSource = "daraja"
)

type VerificationStatus string

const (
	StatusDeviceReported VerificationStatus = "device_reported"
	StatusVerified       VerificationStatus = "verified"
	StatusDisputed       VerificationStatus = "disputed"
)

type ChannelType string

const (
	ChannelTill    ChannelType = "till"
	ChannelPaybill ChannelType = "paybill"
	ChannelPochi   ChannelType = "pochi"
	ChannelUnknown ChannelType = "unknown"
)

type CapturedPayment struct {
	shareddb.BaseModel
	BusinessID         uuid.UUID          `gorm:"type:uuid;not null;index" json:"businessId"`
	Source             CaptureSource      `gorm:"type:text;not null;index" json:"source"`
	VerificationStatus VerificationStatus `gorm:"type:text;not null;default:'device_reported';index" json:"verificationStatus"`
	MpesaReceipt       *string            `gorm:"type:text;uniqueIndex:idx_captured_payments_business_receipt" json:"mpesaReceipt,omitempty"`
	AmountMinor        int64              `gorm:"not null" json:"amountMinor"`
	Currency           string             `gorm:"type:text;not null;default:'KES'" json:"currency"`
	OccurredAt         time.Time          `gorm:"not null;index" json:"occurredAt"`
	ChannelType        ChannelType        `gorm:"type:text;not null;default:'unknown'" json:"channelType"`
	PayerHash          *string            `gorm:"type:text" json:"-"`
	ParserVersion      *string            `gorm:"type:text" json:"parserVersion,omitempty"`
	ConsentVersion     *string            `gorm:"type:text" json:"consentVersion,omitempty"`
	DeviceID           *uuid.UUID         `gorm:"type:uuid;index" json:"deviceId,omitempty"`
	ClientEventID      uuid.UUID          `gorm:"type:uuid;not null;uniqueIndex:idx_captured_payments_business_event" json:"clientEventId"`
}

func (CapturedPayment) TableName() string { return "captured_payments" }

type CaptureDevice struct {
	shareddb.TenantModel
	BusinessID    uuid.UUID `gorm:"type:uuid;not null;index" json:"businessId"`
	Platform      string    `gorm:"type:text;not null;default:'android'" json:"platform"`
	AppVersion    *string   `gorm:"type:text" json:"appVersion,omitempty"`
	ParserVersion *string   `gorm:"type:text" json:"parserVersion,omitempty"`
}

func (CaptureDevice) TableName() string { return "capture_devices" }

// VerifiedScope restricts a query to verified captures — the quarantine
// enforcement point. Every sum/report over captured payments must apply it.
func VerifiedScope() func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		return tx.Where("verification_status = ?", StatusVerified)
	}
}

// trustRank orders sources for merge upgrades. Processor-side records
// outrank anything the device reported; never downgrade on merge.
func trustRank(s CaptureSource) int {
	switch s {
	case SourceDaraja, SourcePesapal:
		return 2
	case SourceSMSDevice, SourceManual, SourceStatement:
		return 1
	default:
		return 0
	}
}

func statusForSource(s CaptureSource) VerificationStatus {
	if trustRank(s) >= 2 {
		return StatusVerified
	}
	return StatusDeviceReported
}

type MergeAction string

const (
	MergeCreate    MergeAction = "create"
	MergeDuplicate MergeAction = "duplicate"
	MergeMerged    MergeAction = "merged"
	MergeDisputed  MergeAction = "disputed"
)

// MergeDecision is the outcome of folding an incoming record into an
// existing one (matched by receipt). Pure function — no DB — so Pesapal and
// Daraja ingestion paths can reuse it later with full table-test coverage.
type MergeDecision struct {
	Action MergeAction
	// UpgradeTo is set when the existing row should adopt the incoming
	// source/status (verified upgrade, never a downgrade).
	UpgradeTo *CapturedPayment
	// DisputeWith is set when the same receipt carries a different amount:
	// keep both rows for review, both marked disputed.
	DisputeWith *CapturedPayment
}

// DecideMerge folds incoming into existing (nil existing = fresh record).
// Callers handle persistence + outbox emission per Action.
func DecideMerge(existing *CapturedPayment, incoming CapturedPayment) MergeDecision {
	if existing == nil {
		return MergeDecision{Action: MergeCreate}
	}
	// Same client event replayed: idempotent duplicate, no write.
	if existing.ClientEventID == incoming.ClientEventID {
		return MergeDecision{Action: MergeDuplicate}
	}
	// Same receipt, same amount: merge; verified source upgrades status.
	if existing.AmountMinor == incoming.AmountMinor {
		if trustRank(incoming.Source) > trustRank(existing.Source) {
			upgraded := *existing
			upgraded.Source = incoming.Source
			upgraded.VerificationStatus = statusForSource(incoming.Source)
			return MergeDecision{Action: MergeMerged, UpgradeTo: &upgraded}
		}
		return MergeDecision{Action: MergeMerged}
	}
	// Same receipt, different amount: dispute — keep both for review.
	disputedExisting := *existing
	disputedExisting.VerificationStatus = StatusDisputed
	disputedIncoming := incoming
	disputedIncoming.VerificationStatus = StatusDisputed
	return MergeDecision{Action: MergeDisputed, UpgradeTo: &disputedExisting, DisputeWith: &disputedIncoming}
}
