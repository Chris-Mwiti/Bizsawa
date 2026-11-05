import type { AssistantLocale, AssistantToolName } from './types'

export interface AssistantRoute {
  tool: AssistantToolName
  arguments: Record<string, unknown>
  locale: AssistantLocale
}

export interface Period {
  from: string
  to: string
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function startOfWeek(date: Date): Date {
  const copy = startOfDay(date)
  const day = copy.getDay()
  const offset = day === 0 ? 6 : day - 1
  copy.setDate(copy.getDate() - offset)
  return copy
}

function startOfMonth(date: Date): Date {
  const copy = startOfDay(date)
  copy.setDate(1)
  return copy
}

function startOfYear(date: Date): Date {
  const copy = startOfDay(date)
  copy.setMonth(0, 1)
  return copy
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date)
  copy.setMonth(copy.getMonth() + months)
  return copy
}

export function resolvePeriod(query: string, now: Date): Period {
  const text = query.toLowerCase()
  const to = now

  if (/\b(today|leo)\b/.test(text)) {
    return { from: startOfDay(now).toISOString(), to: to.toISOString() }
  }

  if (/\b(yesterday|jana)\b/.test(text)) {
    const today = startOfDay(now)
    return { from: addDays(today, -1).toISOString(), to: today.toISOString() }
  }

  if (/\b(this week|wiki hii)\b/.test(text)) {
    return { from: startOfWeek(now).toISOString(), to: to.toISOString() }
  }

  if (/\b(last week|wiki iliyopita)\b/.test(text)) {
    const thisWeek = startOfWeek(now)
    return {
      from: addDays(thisWeek, -7).toISOString(),
      to: thisWeek.toISOString(),
    }
  }

  if (/\b(this month|mwezi huu)\b/.test(text)) {
    return { from: startOfMonth(now).toISOString(), to: to.toISOString() }
  }

  if (/\b(last month|mwezi uliopita)\b/.test(text)) {
    const thisMonth = startOfMonth(now)
    return {
      from: addMonths(thisMonth, -1).toISOString(),
      to: thisMonth.toISOString(),
    }
  }

  if (/\b(this year|mwaka huu)\b/.test(text)) {
    return { from: startOfYear(now).toISOString(), to: to.toISOString() }
  }

  const days = text.match(/\b(?:last|past|siku)\s+(\d{1,3})\s*(?:days?|siku)?\b/)
  if (days) {
    const count = Math.min(Math.max(Number(days[1]), 1), 370)
    return { from: addDays(now, -count).toISOString(), to: to.toISOString() }
  }

  return { from: addMonths(now, -1).toISOString(), to: to.toISOString() }
}

const SWAHILI = /\b(mauzo|mapato|matumizi|gharama|bidhaa|stoo|akiba|mteja|wateja|ankara|thamani|mwezi|wiki|leo|jana|mwaka|nini|kiasi|gani|zilizoongoza|zinazokwisha|zinaisha|yasiyofanyika|niliuza|nimetumia|tafuta|nionyeshe|nipe|mzigo)\b/

export function detectLocale(query: string): AssistantLocale {
  return SWAHILI.test(query.toLowerCase()) ? 'sw' : 'en'
}

export function extractCustomerQuery(query: string): string {
  return query
    .replace(/\b(search|find|look up|lookup|show|list|tafuta|nionyeshe|nipe)\b/gi, ' ')
    .replace(/\b(customers?|clients?|mteja|wateja)\b/gi, ' ')
    .replace(/\b(named|called|aitwaye)\b/gi, ' ')
    .replace(/[?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Rule {
  tool: AssistantToolName
  pattern: RegExp
  args: (query: string, now: Date) => Record<string, unknown>
}

const PERIOD_ARGS = (query: string, now: Date) => ({
  ...resolvePeriod(query, now),
})
const LIMIT_ARGS = () => ({ limit: 10 })
const PAGE_ARGS = () => ({ limit: 10, offset: 0 })

const RULES: Rule[] = [
  {
    tool: 'list_low_stock_items',
    pattern:
      /\b(low[ -]?stock|restock|out of stock|running out|stock running|stoo|akiba|zinazokwisha|zinaisha|mzigo)\b/,
    args: LIMIT_ARGS,
  },
  {
    tool: 'get_inventory_valuation',
    pattern:
      /\b(inventory value|stock value|value of (my )?(inventory|stock)|how (much|many) (stock|inventory)|thamani ya (bidhaa|stoo)|hesabu ya stoo|idadi ya bidhaa)\b/,
    args: LIMIT_ARGS,
  },
  {
    tool: 'list_sales_by_product',
    pattern:
      /\b((top|best)[ -]?(selling|products?)|sales by product|product sales|bidhaa (zinazoongoza|zinazouza)|mauzo kwa bidhaa)\b/,
    args: LIMIT_ARGS,
  },
  {
    tool: 'summarize_expenses_by_category',
    pattern: /\b(expenses?|spend(?:ing)?|spent|matumizi|gharama|nimetumia)\b/,
    args: PERIOD_ARGS,
  },
  {
    tool: 'list_invoices',
    pattern:
      /\b(invoices?|unpaid|overdue|receivables?|ankara|malipo yasiyofanyika|deni)\b/,
    args: PAGE_ARGS,
  },
  {
    tool: 'search_customers',
    pattern: /\b(customers?|clients?|mteja|wateja)\b/,
    args: (query) => ({ query: extractCustomerQuery(query), limit: 10 }),
  },
  {
    tool: 'summarize_sales',
    pattern:
      /\b(sales?|revenue|turnover|sold|sell|mauzo|mapato|niliuza|kiasi gani)\b/,
    args: PERIOD_ARGS,
  },
]

export function route(query: string, now: Date = new Date()): AssistantRoute | null {
  const text = query.toLowerCase()
  const locale = detectLocale(query)
  const rule = RULES.find((candidate) => candidate.pattern.test(text))

  if (!rule) return null

  return { tool: rule.tool, arguments: rule.args(query, now), locale }
}
