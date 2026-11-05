package mcp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type assistantContract struct {
	Name  string `json:"name"`
	Input any    `json:"input"`
}

// TestAssistantToolContracts keeps the checked-in assistant contracts in sync
// with the MCP tool schemas that the backend actually serves. The mobile app
// mirrors these schemas, so drifting descriptions or required fields would
// silently break offline answers.
func TestAssistantToolContracts(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "contracts", "assistant", "tools")

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read contract dir: %v", err)
	}

	tools := make(map[string]Tool)

	for _, tool := range DefaultTools(Services{}) {
		if tool.Profile != ProfileBusinessOwner {
			continue
		}

		tools[tool.Name] = tool
	}

	found := 0

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		raw, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", entry.Name(), err)
		}

		var contract assistantContract
		if err := json.Unmarshal(raw, &contract); err != nil {
			t.Fatalf("parse %s: %v", entry.Name(), err)
		}

		tool, ok := tools[contract.Name]
		if !ok {
			t.Fatalf("%s: no business-owner MCP tool named %q", entry.Name(), contract.Name)
		}

		encoded, err := json.Marshal(tool.InputSchema)
		if err != nil {
			t.Fatalf("marshal schema for %s: %v", contract.Name, err)
		}

		var actual any
		if err := json.Unmarshal(encoded, &actual); err != nil {
			t.Fatalf("normalize schema for %s: %v", contract.Name, err)
		}

		if !reflect.DeepEqual(actual, contract.Input) {
			t.Fatalf("%s: input schema drifted from MCP tool %s\ncontract: %#v\nactual:   %#v", entry.Name(), contract.Name, contract.Input, actual)
		}

		found++
	}

	if found == 0 {
		t.Fatal("no assistant contracts found")
	}
}
