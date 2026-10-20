// Stand-ins for the React Native / Expo modules the real sync client imports.
// Only platform glue is replaced; all sync logic under test is the app's own.
import { randomUUID as nodeRandomUUID, randomBytes } from 'node:crypto'
import { ctx } from './context'

export const NetInfo = {
  fetch: async () => ({
    isConnected: ctx().online,
    type: ctx().online ? 'wifi' : 'none',
  }),
  addEventListener: () => () => {},
}

export const AsyncStorage = {
  getItem: async (k: string) => ctx().storage.get(k) ?? null,
  setItem: async (k: string, v: string) => void ctx().storage.set(k, v),
  removeItem: async (k: string) => void ctx().storage.delete(k),
  multiGet: async (keys: string[]) =>
    keys.map((k) => [k, ctx().storage.get(k) ?? null]),
  multiSet: async (pairs: [string, string][]) =>
    pairs.forEach(([k, v]) => ctx().storage.set(k, v)),
  multiRemove: async (keys: string[]) =>
    keys.forEach((k) => ctx().storage.delete(k)),
  getAllKeys: async () => [...ctx().storage.keys()],
  clear: async () => ctx().storage.clear(),
}

export const ReactNative = {
  InteractionManager: {
    runAfterInteractions: (fn: () => void) => (
      setTimeout(fn, 0),
      { cancel() {} }
    ),
  },
  Platform: { OS: 'android', select: (o: any) => o.android ?? o.default },
}

export const ExpoCrypto = {
  randomUUID: () => nodeRandomUUID(),
  getRandomBytes: (n: number) => new Uint8Array(randomBytes(n)),
}
