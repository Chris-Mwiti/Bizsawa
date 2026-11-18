package sync

import "testing"

func TestReadOnlySyncTables(t *testing.T) {
	if !isReadOnly("payment_commands") {
		t.Fatal("payment_commands must be read-only")
	}

	if isReadOnly("sales") {
		t.Fatal("sales must remain writable")
	}
}
