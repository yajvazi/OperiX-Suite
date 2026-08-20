import type { ContractBlock, ContractCondition, ContractTemplateField } from '@invoice-monorepo/types';

export const CONTRACT_CATEGORIES = [
    'service_agreement', 'employment', 'sales_agreement', 'rental_agreement', 'nda',
    'partnership', 'freelance', 'supplier', 'purchase', 'maintenance', 'custom',
] as const;

export const VARIABLE_GROUPS = {
    company: ['company.name', 'company.business_number', 'company.fiscal_number', 'company.vat_number', 'company.address', 'company.city', 'company.country', 'company.email', 'company.phone', 'company.representative', 'company.representative_position'],
    party: ['customer.name', 'customer.company_name', 'customer.email', 'customer.address', 'party.name', 'party.email'],
    contract: ['contract.number', 'contract.title', 'contract.start_date', 'contract.end_date'],
    financial: ['contract.value', 'contract.currency', 'contract.vat_percentage', 'contract.payment_due_days'],
    employee: ['employee.name', 'employee.employee_number', 'employee.position'],
    invoice: ['invoice.number', 'invoice.total'],
    dates: ['today'],
    custom: [],
} as const;

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function extractVariables(value: unknown): string[] {
    const source = typeof value === 'string' ? value : String(JSON.stringify(value || '') ?? '');
    const found = new Set<string>();
    for (const match of source.matchAll(VARIABLE_PATTERN)) found.add(match[1]);
    return [...found];
}

export function resolveVariables(value: string, variables: Record<string, unknown>) {
    const missing: string[] = [];
    const resolved = value.replace(VARIABLE_PATTERN, (_token, key: string) => {
        const result = variables[key];
        if (result === undefined || result === null || result === '') { missing.push(key); return `{{${key}}}`; }
        return String(result);
    });
    return { value: resolved, missing: [...new Set(missing)] };
}

export function evaluateCondition(condition: ContractCondition | undefined, values: Record<string, unknown>) {
    if (!condition) return true;
    const left = values[condition.field];
    const right = condition.value;
    switch (condition.operator) {
        case 'equals': return String(left ?? '') === String(right ?? '');
        case 'not_equals': return String(left ?? '') !== String(right ?? '');
        case 'contains': return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
        case 'greater_than': return Number(left) > Number(right);
        case 'less_than': return Number(left) < Number(right);
        case 'is_empty': return left === undefined || left === null || left === '';
        case 'is_not_empty': return !(left === undefined || left === null || left === '');
        default: return false;
    }
}

export function visibleField(field: ContractTemplateField, values: Record<string, unknown>) {
    return evaluateCondition(field.visibility, values);
}

export function renderBlocks(blocks: ContractBlock[], variables: Record<string, unknown>) {
    const missing: string[] = [];
    const escape = (text: string) => text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
    const safeBlocks = Array.isArray(blocks) ? blocks : [];
    const safeVariables = variables && typeof variables === 'object' ? variables : {};
    const content = [...safeBlocks].sort((a, b) => a.order - b.order).filter((block) => !block.condition || evaluateCondition(block.condition, safeVariables)).map((block) => {
        if (block.type === 'divider') return '<hr />';
        if (block.type === 'page_break') return '<div class="page-break"></div>';
        if (block.type === 'table') return `<table><tbody>${(Array.isArray(block.rows) ? block.rows : []).map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${escape(resolveVariables(String(cell ?? ''), safeVariables).value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        const text = block.type === 'variable' ? `{{${block.variable || ''}}}` : block.text || '';
        const result = resolveVariables(text, safeVariables);
        missing.push(...result.missing);
        const safe = escape(result.value).replace(/\n/g, '<br />');
        if (block.type === 'title') return `<h1>${safe}</h1>`;
        if (block.type === 'heading') return `<h2>${safe}</h2>`;
        if (block.type === 'numbered_clause') return `<p><strong>${safe}</strong></p>`;
        if (block.type === 'bullet_list') return `<ul><li>${safe}</li></ul>`;
        if (block.type === 'numbered_list') return `<ol><li>${safe}</li></ol>`;
        if (block.type === 'signature') return `<div class="signature-placeholder">${safe || 'Signature'}</div>`;
        return `<p>${safe}</p>`;
    }).join('');
    return { html: content, missing: [...new Set(missing)] };
}

export function validateTemplate(input: { name: string; fields: ContractTemplateField[]; blocks: ContractBlock[] }) {
    const errors: string[] = [];
    if (!input.name.trim()) errors.push('Template name is required');
    const fields = Array.isArray(input.fields) ? input.fields : [];
    const blocks = Array.isArray(input.blocks) ? input.blocks : [];
    if (!blocks.length) errors.push('Contract body is required');
    const keys = fields.map((field) => field.key || field.id);
    if (new Set(keys).size !== keys.length) errors.push('Field keys must be unique');
    const available = new Set(keys);
    fields.forEach((field) => { if (field.visibility && !available.has(field.visibility.field)) errors.push(`Condition references missing field: ${field.visibility.field}`); });
    return errors;
}

export function formatContractNumber(prefix = 'CTR', year = new Date().getFullYear(), sequence = 1, padding = 4) {
    return `${prefix}-${year}-${String(sequence).padStart(padding, '0')}`;
}
