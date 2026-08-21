import AsyncStorage from "@react-native-async-storage/async-storage";

const PAYMENT_KEY_PREFIX = "bizsawa_idempotency_payment_";

function fallbackUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createIdempotencyKey(scope = "mobile"): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  const key = typeof randomUUID === "function" ? randomUUID.call(globalThis.crypto) : fallbackUUID();
  return key;
}

export async function getPaymentIdempotencyKey(operationId: string): Promise<string> {
  const storageKey = `${PAYMENT_KEY_PREFIX}${operationId}`;
  const existing = await AsyncStorage.getItem(storageKey);
  if (existing) return existing;
  const key = createIdempotencyKey("payment");
  await AsyncStorage.setItem(storageKey, key);
  return key;
}

export async function clearPaymentIdempotencyKey(operationId: string): Promise<void> {
  await AsyncStorage.removeItem(`${PAYMENT_KEY_PREFIX}${operationId}`);
}
