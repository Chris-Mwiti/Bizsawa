/**
 * Bound an async operation so the UI can never spin forever.
 *
 * Auth/OTP flows chain several sequential network calls (sign-in, then a
 * businesses probe, then storage writes). Each leg inherits axios's 30s
 * timeout, so the worst case was 60s+ of spinner with zero feedback — the
 * "app freezes after I enter the code" hang. Racing every leg against a
 * short, explicit timeout keeps the total bounded and yields a friendly
 * error the screen can render inline instead of hanging.
 */
export class TimeoutError extends Error {
  constructor(
    public readonly label: string,
    ms: number,
  ) {
    super(`${label} timed out after ${Math.round(ms / 1000)}s — check your connection and try again.`)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}
