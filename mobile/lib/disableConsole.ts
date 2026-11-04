/**
 * Silence console output in production builds.
 *
 * `__DEV__` is inlined by Metro, so in release builds this module replaces
 * every console method with a no-op before the app renders. Development
 * logging is untouched.
 */
const METHODS = [
  'assert',
  'count',
  'countReset',
  'debug',
  'dir',
  'dirxml',
  'error',
  'group',
  'groupCollapsed',
  'groupEnd',
  'info',
  'log',
  'profile',
  'profileEnd',
  'table',
  'time',
  'timeEnd',
  'timeLog',
  'trace',
  'warn',
] as const

if (!__DEV__) {
  const noop = () => {}
  for (const method of METHODS) {
    ;(console as unknown as Record<string, () => void>)[method] = noop
  }
}

export {}
