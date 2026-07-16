# Implementation Plan - Phase 1: Frontend-Backend Integration

## Overview
This phase focuses on integrating the React frontend with the Express/Prisma backend. We will transition from local state/localStorage to a robust data-fetching layer using TanStack Query and Axios.

## 1. Infrastructure Setup
- [ ] Install dependencies: `axios`, `@tanstack/react-query`, `react-markdown`.
- [ ] Create `frontend/src/lib/axios.ts` for a configured Axios instance.
- [ ] Create `frontend/src/hooks/api` directory for custom TanStack Query hooks.
- [ ] Wrap `App.tsx` with `QueryClientProvider`.

## 2. API Integration - Services & Hooks
Establish request/response formats based on backend routes:

### Business Service
- `GET /api/business`: List all businesses.
- `GET /api/business/:id`: Get business details.
- `POST /api/business`: Create a new business (Onboarding).
- `PUT /api/business/:id`: Update business.

### Product/Inventory Service
- `GET /api/products?businessId=X`: List products for a business.
- `POST /api/products`: Add new product.
- `PUT /api/products/:id`: Update product.
- `POST /api/products/:id/generate-image`: Generate product image via AI.

### Customer Service
- `GET /api/customers?businessId=X`: List customers.
- `POST /api/customers`: Add customer.

### Orders & Sales Service
- `GET /api/orders?businessId=X`: List orders.
- `POST /api/orders`: Create order (handles sales and order items).
- `GET /api/sales?businessId=X`: List sales.

### Chatbot Service
- `POST /api/chatbot/chat`: Send message and history, receive AI response.

## 3. UI Component Integration

### Business Onboarding
- [ ] Modify `BusinessOnboarding.tsx` to call `POST /api/business` on completion.
- [ ] Store the returned `businessId` in a global state or context (instead of just `true/false` flag).

### Inventory Manager
- [ ] Replace `mockInventory` with data from `useProducts` hook.
- [ ] Connect "Add Item" form to `useCreateProduct` mutation.

### Sales Tracker
- [ ] Connect to `useSales` and `useCreateOrder` hooks.

### AICoach (Chatbot)
- [ ] Update `generateBotResponse` to use the backend `/api/chatbot/chat` endpoint.
- [ ] Integrate `react-markdown` for response formatting.
- [ ] Maintain chat history in the backend-compatible format.

## 4. Reusable Components & Data Capturing
- [ ] Ensure all forms (Add Product, Add Sale, Onboarding) are robust and validate against backend expectations.
- [ ] Create a `BusinessProvider` to manage the current active business context.

## 5. Design & Aesthetics
- [ ] Maintain the existing "NumeraAI" color palette (Blue/Purple/Green).
- [ ] Ensure loading and error states are visually consistent with the current design.
