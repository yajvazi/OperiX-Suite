import { z } from 'zod';

const optionalText = z.string().trim().max(200).optional().or(z.literal(''));

export const employeeSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(80),
  last_name: z.string().trim().min(1, 'Last name is required').max(80),
  email: z.string().trim().email('Enter a valid email').max(255).optional().or(z.literal('')),
  phone: optionalText,
  job_title: optionalText,
  department: optionalText,
  status: z.enum(['active', 'onboarding', 'on_leave', 'terminated', 'pending']),
  hire_date: z.string().optional().or(z.literal('')),
  employee_number: z.string().trim().max(80).optional().or(z.literal('')),
});

export const leaveRequestSchema = z.object({
  leave_type: z.string().trim().min(1, 'Leave type is required').max(80),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  reason: z.string().trim().max(2_000).optional().or(z.literal('')),
}).superRefine((value, context) => {
  if (value.end_date < value.start_date) context.addIssue({ code: 'custom', path: ['end_date'], message: 'End date must be after start date' });
});

export const attendanceClockSchema = z.object({
  employee_id: z.string().uuid(),
  company_id: z.string().uuid(),
  work_mode: z.enum(['office', 'remote']).default('office'),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
