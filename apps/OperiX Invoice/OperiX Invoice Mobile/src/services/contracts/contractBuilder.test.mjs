import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCondition, extractVariables, formatContractNumber, renderBlocks, validateTemplate } from './contractBuilder.ts';

test('extracts and resolves variables while retaining missing tokens', () => {
  assert.deepEqual(extractVariables('Hello {{company.name}} {{customer.name}} {{company.name}}'), ['company.name', 'customer.name']);
  const result = renderBlocks([{ id: '1', type: 'paragraph', text: 'Hello {{customer.name}} {{contract.number}}', order: 0 }], { 'customer.name': 'Ada' });
  assert.match(result.html, /Ada/);
  assert.deepEqual(result.missing, ['contract.number']);
});

test('evaluates the supported simple conditions', () => {
  assert.equal(evaluateCondition({ field: 'automatic_renewal', operator: 'equals', value: 'yes' }, { automatic_renewal: 'yes' }), true);
  assert.equal(evaluateCondition({ field: 'value', operator: 'greater_than', value: 10 }, { value: 12 }), true);
  assert.equal(evaluateCondition({ field: 'note', operator: 'is_empty' }, { note: '' }), true);
});

test('validates template basics and formats contract numbers', () => {
  assert.deepEqual(validateTemplate({ name: '', fields: [], blocks: [] }), ['Template name is required', 'Contract body is required']);
  assert.equal(formatContractNumber('CTR', 2026, 1, 4), 'CTR-2026-0001');
});

test('keeps malformed legacy document data from crashing rendering', () => {
  assert.deepEqual(extractVariables(undefined), []);
  assert.deepEqual(renderBlocks(null, null), { html: '', missing: [] });
});
