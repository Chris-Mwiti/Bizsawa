import AsyncStorage from "@react-native-async-storage/async-storage";

const IDEMPOTENCY_KEY_PREFIX = "bizsawa_idempotency_";

function fallbackUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createIdempotencyKey(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  return typeof randomUUID === "function" 
    ? randomUUID.call(globalThis.crypto) 
    : fallbackUUID();
}

/**
 * Idempotency key lifecycle:
 * 1. generateIdempotencyKey(operationId) - Call ONCE when user initiates action (e.g., button press)
 * 2. getIdempotencyKey(operationId) - Returns existing key for retries
 * 3. clearIdempotencyKey(operationId) - Call ONLY after operation succeeds definitively
 * 
 * The interceptor in api.ts should NOT generate keys - it should only attach
 * keys that were explicitly set via generateIdempotencyKey()
 */

export async function generateIdempotencyKey(operationId: string): Promise<string> {
  const storageKey = `${IDEMPOTENCY_KEY_PREFIX}${operationId}`;
  const existing = await AsyncStorage.getItem(storageKey);
  if (existing) return existing;
  
  const key = createIdempotencyKey();
  await AsyncStorage.setItem(storageKey, key);
  return key;
}

export async function getIdempotencyKey(operationId: string): Promise<string | null> {
  const storageKey = `${IDEMPOTENCY_KEY_PREFIX}${operationId}`;
  return AsyncStorage.getItem(storageKey);
}

export async function clearIdempotencyKey(operationId: string): Promise<void> {
  await AsyncStorage.removeItem(`${IDEMPOTENCY_KEY_PREFIX}${operationId}`);
}

/**
 * Helper to create operation IDs for common operations
 */
export const OperationId = {
  createOrder: (draftHash: string) => `create_order_${draftHash}`,
  createSale: (draftHash: string) => `create_sale_${draftHash}`,
  confirmOrder: (orderId: string) => `confirm_order_${orderId}`,
  fulfillOrder: (orderId: string) => `fulfill_order_${orderId}`,
  cancelOrder: (orderId: string) => `cancel_order_${orderId}`,
  initiatePayment: (orderId: string, amount: string) => `payment_${orderId}_${amount}`,
} as const;

/**
 * Generate a stable hash from draft data to use as operation ID
 * This ensures the same draft content gets the same idempotency key
 */
export function createDraftHash(data: Record<string, any>): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}