import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAttendanceHours, calculateLeaveDays, employeeDisplayName } from './business.js';

test('calculates inclusive leave days centrally', () => {
  assert.equal(calculateLeaveDays('2026-08-13', '2026-08-13'), 1);
  assert.equal(calculateLeaveDays('2026-08-13', '2026-08-15'), 3);
  assert.equal(calculateLeaveDays('2026-08-15', '2026-08-13'), 0);
});

test('calculates attendance hours from timestamps', () => {
  assert.equal(calculateAttendanceHours({ check_in: '2026-08-13T08:00:00Z', check_out: '2026-08-13T16:30:00Z', total_hours: null }), 8.5);
});

test('formats employee names', () => {
  assert.equal(employeeDisplayName({ first_name: 'Arta', last_name: 'Krasniqi' }), 'Arta Krasniqi');
});
