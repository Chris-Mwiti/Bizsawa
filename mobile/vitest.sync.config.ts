import { defineConfig } from 'vitest/config'

// End-to-end offline sync suites. Need a running backend (E2E_API_URL,
// default http://localhost:5504/api/v1): `bun run test:e2e:sync`.
//   e2e/sync         — protocol level: multi-device HTTP against /sync/*
//   e2e/sync-client  — the app's real sync/client.ts on the web (LokiJS +
//                      IndexedDB) and Android (SQLite) storage engines
export default defineConfig({
  test: {
    include: ['e2e/sync/**/*.test.ts', 'e2e/sync-client/**/*.test.ts'],
    setupFiles: ['e2e/sync-client/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Suites run sequentially: each creates its own tenants, but the server's
    // timing-sensitive cases (cursor races, volume) are noisy under parallel load.
    fileParallelism: false,
    reporters: ['verbose'],
  },
})
