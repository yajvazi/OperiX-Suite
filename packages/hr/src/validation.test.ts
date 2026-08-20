import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceClockSchema, employeeSchema, leaveRequestSchema } from './validation.js';

test('shared employee validation rejects missing identity and accepts safe employee fields', () => {
  assert.equal(employeeSchema.safeParse({ first_name: '', last_name: '', status: 'active' }).success, false);
  const result = employeeSchema.safeParse({ first_name: 'Arta', last_name: 'Krasniqi', email: 'arta@example.com', status: 'active' });
  assert.equal(result.success, true);
});

test('shared leave validation rejects inverted dates', () => {
  const result = leaveRequestSchema.safeParse({ leave_type: 'annual', start_date: '2026-08-20', end_date: '2026-08-19' });
  assert.equal(result.success, false);
});

test('shared attendance validation only permits consented work modes', () => {
  assert.equal(attendanceClockSchema.safeParse({ employee_id: 'not-an-id', company_id: 'not-an-id' }).success, false);
  assert.equal(attendanceClockSchema.safeParse({ employee_id: '11111111-1111-4111-8111-111111111111', company_id: '22222222-2222-4222-8222-222222222222', work_mode: 'remote' }).success, true);
});
