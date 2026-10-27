package payments

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func testCapture(source CaptureSource, amount int64, eventID uuid.UUID) CapturedPayment {
	receipt := "QHX7K2M9AB"
	return CapturedPayment{
		BusinessID:         uuid.New(),
		Source:             source,
		VerificationStatus: statusForSource(source),
		MpesaReceipt:       &receipt,
		AmountMinor:        amount,
		Currency:           "KES",
		OccurredAt:         time.Now().UTC(),
		ChannelType:        ChannelTill,
		ClientEventID:      eventID,
	}
}

func TestDecideMerge(t *testing.T) {
	e1 := uuid.New()
	e2 := uuid.New()

	t.Run("nil existing creates", func(t *testing.T) {
		d := DecideMerge(nil, testCapture(SourceSMSDevice, 10000, e1))
		if d.Action != MergeCreate {
			t.Fatalf("action = %v, want create", d.Action)
		}
	})

	t.Run("same client event is duplicate", func(t *testing.T) {
		existing := testCapture(SourceSMSDevice, 10000, e1)
		d := DecideMerge(&existing, testCapture(SourceSMSDevice, 10000, e1))
		if d.Action != MergeDuplicate {
			t.Fatalf("action = %v, want duplicate", d.Action)
		}
	})

	t.Run("same receipt same amount merges without upgrade", func(t *testing.T) {
		existing := testCapture(SourceSMSDevice, 10000, e1)
		d := DecideMerge(&existing, testCapture(SourceManual, 10000, e2))
		if d.Action != MergeMerged || d.UpgradeTo != nil {
			t.Fatalf("action = %v upgrade = %v, want merged without upgrade", d.Action, d.UpgradeTo)
		}
	})

	t.Run("verified source upgrades device record", func(t *testing.T) {
		existing := testCapture(SourceSMSDevice, 10000, e1)
		d := DecideMerge(&existing, testCapture(SourceDaraja, 10000, e2))
		if d.Action != MergeMerged || d.UpgradeTo == nil {
			t.Fatalf("action = %v, want merged with upgrade", d.Action)
		}
		if d.UpgradeTo.VerificationStatus != StatusVerified {
			t.Fatalf("status = %v, want verified", d.UpgradeTo.VerificationStatus)
		}
		if d.UpgradeTo.Source != SourceDaraja {
			t.Fatalf("source = %v, want daraja", d.UpgradeTo.Source)
		}
	})

	t.Run("verified record never downgrades", func(t *testing.T) {
		existing := testCapture(SourceDaraja, 10000, e1)
		existing.VerificationStatus = StatusVerified
		d := DecideMerge(&existing, testCapture(SourceSMSDevice, 10000, e2))
		if d.Action != MergeMerged || d.UpgradeTo != nil {
			t.Fatalf("action = %v upgrade = %v, want merged without downgrade", d.Action, d.UpgradeTo)
		}
	})

	t.Run("same receipt different amount disputes keeping both", func(t *testing.T) {
		existing := testCapture(SourceSMSDevice, 10000, e1)
		d := DecideMerge(&existing, testCapture(SourceDaraja, 12000, e2))
		if d.Action != MergeDisputed {
			t.Fatalf("action = %v, want disputed", d.Action)
		}
		if d.UpgradeTo == nil || d.UpgradeTo.VerificationStatus != StatusDisputed {
			t.Fatalf("existing must be marked disputed")
		}
		if d.DisputeWith == nil || d.DisputeWith.VerificationStatus != StatusDisputed {
			t.Fatalf("incoming must be kept disputed")
		}
		if d.DisputeWith.AmountMinor != 12000 {
			t.Fatalf("disputed incoming amount = %d, want 12000", d.DisputeWith.AmountMinor)
		}
	})

	t.Run("pesapal counts as verified source", func(t *testing.T) {
		if statusForSource(SourcePesapal) != StatusVerified {
			t.Fatalf("pesapal must map to verified")
		}
		if statusForSource(SourceManual) != StatusDeviceReported {
			t.Fatalf("manual must map to device_reported")
		}
	})
}
