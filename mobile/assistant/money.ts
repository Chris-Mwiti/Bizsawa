const MONEY_SCALE = 100
const QUANTITY_SCALE = 1000

function toScaled(value: string | number | null | undefined, scale: number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(value ?? '0')
  if (!Number.isFinite(n)) return 0
  return Math.round(n * scale)
}

function fromScaled(value: number, scale: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const whole = Math.floor(abs / scale)
  const fraction = String(abs % scale)
    .padStart(String(scale).length - 1, '0')
    .replace(/0+$/, '')

  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`
}

export function parseMoney(value: string | number | null | undefined): number {
  return toScaled(value, MONEY_SCALE)
}

export function formatMoneyUnits(minor: number): string {
  return fromScaled(minor, MONEY_SCALE)
}

export function parseQuantity(value: string | number | null | undefined): number {
  return toScaled(value, QUANTITY_SCALE)
}

export function formatQuantity(milli: number): string {
  return fromScaled(milli, QUANTITY_SCALE)
}

export function addMoney(values: Array<string | number | null | undefined>): number {
  return values.reduce<number>((sum, value) => sum + parseMoney(value), 0)
}

export function displayMoney(value: string | number | null | undefined): string {
  const minor = parseMoney(value)
  const amount = minor / MONEY_SCALE
  const fractionDigits = minor % MONEY_SCALE === 0 ? 0 : 2

  return `KES ${amount.toLocaleString('en-KE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  })}`
}

export function displayMoneyUnits(minor: number): string {
  return displayMoney(minor / MONEY_SCALE)
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function formatDate(iso: string | number | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

export function formatPeriod(from: string, to: string): string {
  return `${formatDate(from)} – ${formatDate(to)}`
}
