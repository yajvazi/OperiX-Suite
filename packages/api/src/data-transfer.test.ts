import assert from 'node:assert/strict';
import test from 'node:test';
import { autoMapTransferColumns, normalizeTransferRow, parseTransferCsv, stringifyTransferCsv } from './data-transfer.ts';

test('parses quoted CSV and maps Albanian customer headers', () => {
  const parsed = parseTransferCsv('Emri,Emaili,"Qyteti"\n"Alfa, SH.P.K.",a@example.com,Prishtinë');
  const mapping = autoMapTransferColumns('clients', parsed.headers);
  const row = normalizeTransferRow('clients', Object.fromEntries(Object.entries(mapping).map(([source, target]) => [target, parsed.rows[0][source]])));
  assert.equal(row.name, 'Alfa, SH.P.K.');
  assert.equal(row.email, 'a@example.com');
  assert.equal(row.city, 'Prishtinë');
});

test('round-trips comma decimals and CSV quotes', () => {
  const csv = stringifyTransferCsv('products', [{ name: 'Valve, brass', unit_price: 12.5, tax_rate: 18 }]);
  const parsed = parseTransferCsv(csv);
  assert.equal(parsed.rows[0].Name, 'Valve, brass');
  const mapping = autoMapTransferColumns('products', parsed.headers);
  const row = normalizeTransferRow('products', Object.fromEntries(Object.entries(mapping).map(([source, target]) => [target, parsed.rows[0][source]])));
  assert.equal(row.unit_price, 12.5);
});
