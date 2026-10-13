// M-PESA sender allowlist. Only Safaricom-originated sender IDs are
// accepted; everything else resolves to non_mpesa_sender without parsing.

const MPESA_SENDERS = new Set(['mpesa', 'm-pesa', 'safaricom', 'mpesa alerts'])

export function isMpesaSender(sender: string | undefined | null): boolean {
  if (!sender) return false
  return MPESA_SENDERS.has(sender.trim().toLowerCase())
}
