package crypto

import "testing"

func TestManagerEncryptDecryptAndBlindIndex(t *testing.T) {
	manager, err := NewManager([]byte("0123456789abcdef0123456789abcdef"), []byte("fedcba9876543210fedcba9876543210"))
	if err != nil {
		t.Fatal(err)
	}

	first := manager.BlindIndex("600999")
	second := manager.BlindIndex("600999")
	if first == "" || first != second {
		t.Fatal("blind index should be deterministic and non-empty")
	}

	ciphertext, err := manager.Encrypt("600999")
	if err != nil {
		t.Fatal(err)
	}
	if ciphertext == "600999" {
		t.Fatal("ciphertext should not equal plaintext")
	}
	plaintext, err := manager.Decrypt(ciphertext)
	if err != nil {
		t.Fatal(err)
	}
	if plaintext != "600999" {
		t.Fatalf("plaintext = %q, want 600999", plaintext)
	}
}
