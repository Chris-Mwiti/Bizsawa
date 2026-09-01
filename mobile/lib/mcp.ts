import { api } from "./api";

// Direct MCP client for business-owner — demonstrates Dynamic_ToolDiscovery + Why Less Is More.
// Mobile can call mcp/business-owner directly via JSON-RPC if needed, but preferred path is /chatbot/chat gateway.
// This client is used for tool introspection and debugging in coach.

export type MCPTool = { name: string; description: string; inputSchema: any };

export async function mcpListTools(): Promise<MCPTool[]> {
  // Calls the MCP server's tools/list via our API gateway proxy? For local dev we proxy through api server's MCP registry
  // Here we hit the same registry via chat service's tool introspection endpoint or direct MCP server.
  // Fallback: ask chat backend for tool list via header
  const res = await api.post("/chat/tools", {}).catch(async () => {
    // direct MCP JSON-RPC to mcp-server (requires MCP_PUBLIC_URL + JWT with mcp:business-owner scope)
    // Example: POST http://localhost:5574/mcp/business-owner {jsonrpc:"2.0", id:1, method:"tools/list", params:{}}
    return { data: { tools: [] } } as any;
  });
  return res.data.tools || [];
}

export async function mcpCallTool(name: string, args: Record<string, any>) {
  const res = await api.post("/chat/tools/call", { name, arguments: args });
  return res.data;
}
