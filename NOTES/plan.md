# Chatbot Implementation Plan

This plan outlines the steps to implement a LangChain-powered chatbot with MCP tools for managing business operations (Orders, Products, Customers, Sales, Inventory, and Payments).

## Phase 1: Environment Setup
- [ ] Install necessary dependencies:
    - `@modelcontextprotocol/sdk`: For creating the MCP server.
    - `langchain`: Core framework.
    - `@langchain/openai`: To connect to OpenRouter (using OpenAI-compatible API).
    - `dotenv`: For environment variable management.
- [ ] Configure environment variables:
    - `OPENROUTER_API_KEY`
    - `DATABASE_URL` (existing)
    - `REDIS_URL` (existing)

## Phase 2: MCP Server Implementation
- [ ] Create an MCP server that exposes tools for each module:
    - **Products/Inventory**: `create_product`, `get_product`, `list_products`, `update_stock`.
    - **Customers**: `create_customer`, `get_customer`, `list_customers`.
    - **Orders**: `create_order`, `get_order`, `list_orders`, `update_order_status`.
    - **Sales**: `get_sales_report`, `create_sale`.
    - **Payments**: `initiate_payment`, `check_payment_status`.
- [ ] Wrap existing service methods into MCP tool definitions.

## Phase 3: LangChain Integration
- [ ] Implement a LangChain agent.
- [ ] Configure `ChatOpenAI` to use OpenRouter's base URL and models.
- [ ] Connect the MCP tools to the LangChain agent using an MCP-to-LangChain bridge or custom tool wrappers.
- [ ] Implement conversation memory (e.g., `BufferMemory`).

## Phase 4: Prompt Engineering
- [ ] Draft system prompts to define the chatbot's persona and rules.
- [ ] Create template prompts for common business operations.

## Phase 5: Testing & Validation
- [ ] Verify each MCP tool individually.
- [ ] Test the agent's ability to chain multiple tools (e.g., "Check stock, then create an order if available").
- [ ] Validate OpenRouter connectivity and response quality.
