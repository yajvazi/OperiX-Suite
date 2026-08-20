import { supabase } from '@invoice-monorepo/api';

export type AICardType =
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

export type AICard = {
    id?: string;
    type: AICardType;
    title?: string;
    data: Record<string, unknown>;
};

export type AIChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    cards: AICard[];
    createdAt?: string;
};

export type AIConversation = {
    id: string;
    title?: string | null;
    summary?: string | null;
    preferred_language?: string;
    created_at?: string;
    updated_at?: string;
};

export type AISettings = {
    ai_enabled: boolean;
    preferred_language: 'auto' | 'en' | 'sq';
    daily_briefing_enabled: boolean;
    history_enabled: boolean;
    intelligence_enabled?: boolean;
    invoice_alerts_enabled?: boolean;
    customer_insights_enabled?: boolean;
    inventory_alerts_enabled?: boolean;
    sales_insights_enabled?: boolean;
    payment_alerts_enabled?: boolean;
    push_notifications_enabled?: boolean;
    show_amounts_in_notifications?: boolean;
    id?: string;
    created_at?: string;
    updated_at?: string;
};

export type AIAttachment = {
    fileName: string;
    mimeType: string;
    base64: string;
};

export class OperixAIError extends Error {
    readonly code: 'offline' | 'unavailable' | 'request' | 'permission';

    constructor(message: string, code: OperixAIError['code'] = 'request') {
        super(message);
        this.name = 'OperixAIError';
        this.code = code;
    }
}

type FunctionResponse = {
    error?: string;
    [key: string]: unknown;
};

function errorCode(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/network|fetch|offline|internet|connection/i.test(message)) return 'offline' as const;
    if (/temporarily unavailable|busy|timeout|503/i.test(message)) return 'unavailable' as const;
    if (/permission|role|not available for your/i.test(message)) return 'permission' as const;
    return 'request' as const;
}

async function invoke(body: Record<string, unknown>) {
    try {
        const result = await supabase.functions.invoke<FunctionResponse>('operix-ai', { body });
        if (result.error) throw new OperixAIError(result.error.message || 'OperiX AI could not complete the request.', errorCode(result.error));
        if (result.data?.error) throw new OperixAIError(result.data.error, errorCode(result.data.error));
        return result.data || {};
    } catch (error) {
        if (error instanceof OperixAIError) throw error;
        throw new OperixAIError('OperiX AI could not reach the workspace.', errorCode(error));
    }
}

export async function sendAIMessage(input: { message: string; conversationId?: string; locale?: 'en' | 'sq'; attachment?: AIAttachment | null }) {
    return invoke({ operation: 'chat', ...input });
}

export async function confirmAIAction(actionId: string, locale?: 'en' | 'sq') {
    return invoke({ operation: 'confirm', actionId, locale });
}

export async function getAIHistory(conversationId?: string, locale?: 'en' | 'sq') {
    return invoke({ operation: 'history', ...(conversationId ? { conversationId } : {}), locale });
}

export async function getAISettings(locale?: 'en' | 'sq') {
    const data = await invoke({ operation: 'get_settings', locale });
    return data.settings as AISettings;
}

export async function saveAISettings(settings: Partial<AISettings>, locale?: 'en' | 'sq') {
    const data = await invoke({ operation: 'save_settings', settings, locale });
    return data.settings as AISettings;
}

export async function clearAIHistory(locale?: 'en' | 'sq') {
    return invoke({ operation: 'clear_history', locale });
}

export async function getAIDailyBriefing(locale?: 'en' | 'sq') {
    return invoke({ operation: 'briefing', locale });
}

export async function getAIIntelligenceCommentary(input: {
    locale: 'en' | 'sq';
    fingerprint: string;
    metrics: Record<string, unknown>;
}) {
    const data = await invoke({ operation: 'intelligence_commentary', ...input });
    return {
        commentary: typeof data.commentary === 'string' ? data.commentary : null,
        cached: data.cached === true,
        generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : undefined,
    };
}

export function messagesFromHistory(value: unknown): AIChatMessage[] {
    if (!value || typeof value !== 'object') return [];
    const record = value as { messages?: unknown[] };
    if (!Array.isArray(record.messages)) return [];
    return record.messages.flatMap((message): AIChatMessage[] => {
        if (!message || typeof message !== 'object') return [];
        const item = message as Record<string, unknown>;
        if (item.role !== 'user' && item.role !== 'assistant') return [];
        const structured = item.structured_content && typeof item.structured_content === 'object' ? item.structured_content as Record<string, unknown> : {};
        const cards = Array.isArray(structured.cards) ? structured.cards.filter((card): card is AICard => Boolean(card) && typeof card === 'object' && typeof (card as Record<string, unknown>).type === 'string' && typeof (card as Record<string, unknown>).data === 'object') : [];
        return [{ id: String(item.id || `${item.role}-${item.created_at || Math.random()}`), role: item.role, content: String(item.content || ''), cards, createdAt: typeof item.created_at === 'string' ? item.created_at : undefined }];
    });
}
