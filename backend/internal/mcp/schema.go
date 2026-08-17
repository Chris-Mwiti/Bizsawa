package mcp

func ObjectSchema(properties map[string]any, required ...string) map[string]any {
	schema := map[string]any{
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": false,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func StringSchema(description string) map[string]any {
	return map[string]any{"type": "string", "description": description}
}

func IntegerSchema(description string, minimum, maximum int) map[string]any {
	return map[string]any{"type": "integer", "description": description, "minimum": minimum, "maximum": maximum}
}

func BooleanSchema(description string) map[string]any {
	return map[string]any{"type": "boolean", "description": description}
}
