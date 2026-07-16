package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

type Manager struct {
	masterKey   []byte
	indexSecret []byte
}

func NewManager(masterKey, indexSecret []byte) (*Manager, error) {
	if len(masterKey) != 32 || len(indexSecret) != 32 {
		return nil, errors.New("crypto keys must be exactly 32 bytes")
	}
	return &Manager{masterKey: masterKey, indexSecret: indexSecret}, nil
}

func (m *Manager) BlindIndex(value string) string {
	h := hmac.New(sha256.New, m.indexSecret)
	_, _ = h.Write([]byte(value))
	return hex.EncodeToString(h.Sum(nil))
}

func (m *Manager) Encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(m.masterKey)
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

func (m *Manager) Decrypt(ciphertextHex string) (string, error) {
	ciphertext, err := hex.DecodeString(ciphertextHex)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(m.masterKey)
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	nonce, encrypted := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, encrypted, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed: %w", err)
	}
	return string(plaintext), nil
}
