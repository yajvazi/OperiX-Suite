import { describe, expect, it } from 'vitest';
import { demoBookings, demoCustomers, demoServices } from './demo-data';

describe('Booking demo workspace', () => {
  it('contains connected demo records for the core dashboard flows', () => {
    expect(demoBookings.length).toBeGreaterThan(0);
    expect(demoCustomers.length).toBeGreaterThan(0);
    expect(demoServices.length).toBeGreaterThan(0);
    expect(demoBookings.every((booking) => demoServices.some((service) => service.id === booking.service_id))).toBe(true);
  });
});
