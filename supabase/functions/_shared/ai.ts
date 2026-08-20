export type AIActionClass = 'READ' | 'PREPARE' | 'MUTATE';

export type AICard = {
  id?: string;
  type:
    | 'invoice'
    | 'invoice_confirmation'
    | 'customer'
    | 'product'
    | 'inventory_alert'
    | 'reminder'
    | 'receipt'
    | 'daily_briefing'
    | 'confirmation'
    | 'selection'
    | 'tool_result'
    | 'error';
  title?: string;
  data: Record<string, unknown>;
};

export type AIEnvelope = {
  message: string;
  cards: AICard[];
  suggestedQuestions: string[];
};

export type ToolExecution = {
  data: Record<string, unknown>;
  cards?: AICard[];
  pendingActionIds?: string[];
  resourceIds?: string[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  actionClass: AIActionClass;
  permission?: string;
  permissionAny?: string[];
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ToolExecution>;
};

export type DeepSeekToolCall = {
  id: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

export type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: DeepSeekToolCall[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function stringArg(
  args: Record<string, unknown>,
  key: string,
  options: { max?: number; required?: boolean } = {},
) {
  const raw = args[key];
  if (raw === undefined || raw === null) {
    if (options.required) throw new Error(`${key} is required`);
    return undefined;
  }
  if (typeof raw !== 'string') throw new Error(`${key} must be a string`);
  const value = raw.trim();
  if (options.required && !value) throw new Error(`${key} is required`);
  if (options.max && value.length > options.max) throw new Error(`${key} is too long`);
  return value || undefined;
}

export function numberArg(
  args: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number; required?: boolean } = {},
) {
  const raw = args[key];
  if (raw === undefined || raw === null || raw === '') {
    if (options.required) throw new Error(`${key} is required`);
    return undefined;
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  if (options.min !== undefined && value < options.min) throw new Error(`${key} is below the allowed minimum`);
  if (options.max !== undefined && value > options.max) throw new Error(`${key} is above the allowed maximum`);
  return value;
}

export function integerArg(
  args: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number; required?: boolean } = {},
) {
  const value = numberArg(args, key, options);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
}

export function booleanArg(args: Record<string, unknown>, key: string, fallback = false) {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
  return value;
}

export function arrayArg(args: Record<string, unknown>, key: string, maxItems: number) {
  const value = args[key];
  if (value === undefined || value === null) return [] as unknown[];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  if (value.length > maxItems) throw new Error(`${key} contains too many items`);
  return value;
}

export function isoDate(value: string | undefined, fallback: string) {
  const result = value || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('Dates must use YYYY-MM-DD format');
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Date is invalid');
  return result;
}

export function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

export function currency(value: unknown, fallback = 'EUR') {
  const normalized = String(value || fallback).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}

export function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function compactText(value: unknown, max = 6000) {
  return String(value || '').replace(/\u0000/g, '').slice(0, max);
}

export function safeJson(value: unknown, fallback: Record<string, unknown> = {}) {
  if (!isRecord(value)) return fallback;
  return value;
}

export function parseJsonObject(value: unknown) {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseAIEnvelope(value: unknown): AIEnvelope {
  const parsed = parseJsonObject(value);
  if (!parsed) {
    return {
      message: compactText(value, 4000) || 'I could not format that response. Please try again.',
      cards: [],
      suggestedQuestions: [],
    };
  }

  const message = typeof parsed.message === 'string'
    ? compactText(parsed.message, 4000)
    : typeof parsed.answer === 'string'
      ? compactText(parsed.answer, 4000)
      : '';
  const rawCards = Array.isArray(parsed.cards) ? parsed.cards : [];
  const cards = rawCards.flatMap((card): AICard[] => {
    if (!isRecord(card) || typeof card.type !== 'string' || !isRecord(card.data)) return [];
    const allowed = new Set<AICard['type']>([
      'invoice', 'invoice_confirmation', 'customer', 'product', 'inventory_alert',
      'reminder', 'receipt', 'daily_briefing', 'confirmation', 'selection',
      'tool_result', 'error',
    ]);
    if (!allowed.has(card.type as AICard['type'])) return [];
    return [{
      id: typeof card.id === 'string' ? card.id.slice(0, 120) : undefined,
      type: card.type as AICard['type'],
      title: typeof card.title === 'string' ? compactText(card.title, 160) : undefined,
      data: card.data,
    }];
  });
  const suggestedQuestions = (Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => compactText(item, 160))
    .filter(Boolean)
    .slice(0, 4);

  return {
    message: message || 'I could not find a clear answer in the available OperiX data.',
    cards,
    suggestedQuestions,
  };
}

export function dedupeCards(cards: AICard[]) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${card.type}:${card.id || JSON.stringify(card.data).slice(0, 180)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

/** Remove document contents and free-form prompt text from the audit record. */
export function redactAuditArguments(args: Record<string, unknown>) {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (/message|prompt|content|base64|document|receipt|notes|body/i.test(key)) {
      if (typeof value === 'string') redacted[key] = `[redacted:${value.length}]`;
      else if (Array.isArray(value)) redacted[key] = `[redacted:${value.length} items]`;
      else redacted[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string') redacted[key] = value.slice(0, 180);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) redacted[key] = value;
    else if (Array.isArray(value)) redacted[key] = `[${value.length} items]`;
    else redacted[key] = '[object]';
  }
  return redacted;
}

export function auditSummary(execution: ToolExecution) {
  return {
    card_count: execution.cards?.length || 0,
    pending_action_count: execution.pendingActionIds?.length || 0,
    resource_count: execution.resourceIds?.length || 0,
  };
}
