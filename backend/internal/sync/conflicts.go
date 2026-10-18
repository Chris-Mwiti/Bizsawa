package sync

import (
	"github.com/google/uuid"
)

// Version-mismatch rule (local-first §4): when the device pushing the edit
// is the same one that wrote the record last, its write wins silently —
// no conflict row, no user interruption. Anything else (another device,
// unknown writer, device-less push) raises a conflict the user resolves
// explicitly on /sync-conflicts.
type VersionMismatchAction string

const (
	MismatchApply    VersionMismatchAction = "apply"
	MismatchConflict VersionMismatchAction = "conflict"
)

func DecideVersionMismatch(clientDevice, writerDevice string) VersionMismatchAction {
	if clientDevice != "" && clientDevice == writerDevice {
		return MismatchApply
	}
	return MismatchConflict
}

func strptrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// newConflict builds the explicit-conflict row for a version mismatch that
// is NOT same-device LWW. Client payload is sanitised (NUL bytes break
// UTF8 jsonb inserts); server payload is read as ::text to avoid the
// pg-driver jsonb → []uint8 scan mismatch.
func newConflict(businessID uuid.UUID, table string, recordID uuid.UUID, client, server []byte, clientVersion, serverVersion int, clientDevice, serverDevice string) Conflict {
	return Conflict{
		ID:             uuid.New(),
		BusinessID:     businessID,
		Table:          table,
		RecordID:       recordID,
		ClientPayload:  client,
		ServerPayload:  server,
		ClientVersion:  clientVersion,
		ServerVersion:  serverVersion,
		ClientDeviceID: strptrOrNil(clientDevice),
		ServerDeviceID: strptrOrNil(serverDevice),
	}
}
