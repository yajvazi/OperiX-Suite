import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HrApproval,
  HrAnnouncement,
  HrAttendanceRecord,
  HrDocument,
  HrEmployee,
  HrLeaveBalance,
  HrLeaveRequest,
  HrLeaveType,
  HrNotification,
  HrApplication,
  HrCandidate,
  HrInterview,
  HrJobOpening,
  HrOffboardingCase,
  HrOffboardingTask,
  HrOnboardingTask,
  HrOrgUnit,
  HrPerformanceCycle,
  HrPerformanceGoal,
  HrPerformanceReview,
} from './types';
import { calculateLeaveDays } from './business';

const employeeColumns = 'id,company_id,user_id,first_name,last_name,email,phone,job_title,department,avatar_url,role,status,hire_date,employment_start_date,employment_end_date,employee_number,currency,payroll_ready_status,created_at,updated_at';
const attendanceColumns = 'id,employee_id,company_id,date,check_in,check_out,total_hours,status,work_mode,location_lat,location_lng,created_at,employee:employees(id,first_name,last_name,job_title,department,avatar_url)';
const leaveColumns = 'id,employee_id,company_id,leave_type,start_date,end_date,requested_days,reason,status,approved_by,reviewer_note,reviewed_at,created_at,updated_at,employee:employees(id,first_name,last_name,job_title,department,avatar_url)';
const documentColumns = 'id,employee_id,company_id,name,document_type,file_url,expiry_date,uploaded_at,employee:employees(id,first_name,last_name,department)';
const orgUnitColumns = 'id,company_id,parent_id,manager_employee_id,unit_type,name,code,description,is_active,created_at,updated_at';
const openingColumns = 'id,company_id,title,department,description,employment_type,work_location,status,openings,hiring_manager_id,opened_on,closes_on,created_by,created_at,updated_at';
const candidateColumns = 'id,company_id,first_name,last_name,email,phone,source,resume_path,notes,created_by,created_at,updated_at';
const applicationColumns = 'id,company_id,candidate_id,job_opening_id,stage,assigned_to,notes,applied_at,updated_at,hired_employee_id,candidate:hr_candidates(id,first_name,last_name,email,phone),job_opening:hr_job_openings(id,title,department)';
const interviewColumns = 'id,company_id,application_id,interviewer_id,scheduled_at,location,status,feedback,created_at,updated_at';
const cycleColumns = 'id,company_id,name,starts_on,ends_on,status,created_by,created_at,updated_at';
const reviewColumns = 'id,company_id,cycle_id,employee_id,reviewer_id,status,rating,self_review,manager_feedback,completed_at,created_at,updated_at,employee:employees(id,first_name,last_name,job_title,department),cycle:hr_performance_cycles(id,name,starts_on,ends_on)';
const goalColumns = 'id,company_id,cycle_id,employee_id,title,description,status,progress,due_on,created_by,created_at,updated_at,employee:employees(id,first_name,last_name,job_title,department)';
const onboardingColumns = 'id,company_id,employee_id,title,description,assigned_to,status,due_on,completed_at,created_at,updated_at,employee:employees(id,first_name,last_name,job_title,department)';
const offboardingColumns = 'id,company_id,employee_id,reason,last_working_day,status,notes,created_by,created_at,updated_at,employee:employees(id,first_name,last_name,job_title,department)';
const offboardingTaskColumns = 'id,company_id,case_id,title,assigned_to,status,due_on,completed_at,created_at,updated_at';

function isMissingRelation(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

export async function listEmployees(client: SupabaseClient, companyIds: readonly string[], search = ''): Promise<HrEmployee[]> {
  let query = client.from('employees').select(employeeColumns).in('company_id', companyIds).order('first_name').order('last_name');
  if (search.trim()) query = query.or(`first_name.ilike.%${escapeFilter(search)}%,last_name.ilike.%${escapeFilter(search)}%,email.ilike.%${escapeFilter(search)}%,employee_number.ilike.%${escapeFilter(search)}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as HrEmployee[];
}

export async function getEmployeeForUser(client: SupabaseClient, userId: string, companyId: string): Promise<HrEmployee | null> {
  const { data, error } = await client.from('employees').select(employeeColumns).eq('user_id', userId).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  return (data as HrEmployee | null) ?? null;
}

export async function listAttendance(client: SupabaseClient, companyIds: readonly string[], startDate?: string, endDate?: string): Promise<HrAttendanceRecord[]> {
  let query = client.from('attendance_records').select(attendanceColumns).in('company_id', companyIds).order('date', { ascending: false }).order('check_in', { ascending: false });
  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);
  let result: any = await query;
  if (result.error?.code === '42703') {
    let fallbackQuery = client.from('attendance_records').select('id,employee_id,company_id,date,check_in,check_out,total_hours,status,created_at,employee:employees(id,first_name,last_name,job_title,department,avatar_url)').in('company_id', companyIds).order('date', { ascending: false }).order('check_in', { ascending: false });
    if (startDate) fallbackQuery = fallbackQuery.gte('date', startDate);
    if (endDate) fallbackQuery = fallbackQuery.lte('date', endDate);
    result = await fallbackQuery;
  }
  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as HrAttendanceRecord[];
}

export async function listLeaveRequests(client: SupabaseClient, companyIds: readonly string[], employeeId?: string): Promise<HrLeaveRequest[]> {
  let query = client.from('leave_requests').select(leaveColumns).in('company_id', companyIds).order('created_at', { ascending: false });
  if (employeeId) query = query.eq('employee_id', employeeId);
  let result: any = await query;
  if (result.error?.code === '42703') {
    let fallbackQuery = client.from('leave_requests').select('id,employee_id,company_id,leave_type,start_date,end_date,reason,status,approved_by,created_at,employee:employees(id,first_name,last_name,job_title,department,avatar_url)').in('company_id', companyIds).order('created_at', { ascending: false });
    if (employeeId) fallbackQuery = fallbackQuery.eq('employee_id', employeeId);
    result = await fallbackQuery;
  }
  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as HrLeaveRequest[];
}

export async function listLeaveTypes(client: SupabaseClient, companyId: string): Promise<HrLeaveType[]> {
  const { data, error } = await client.from('leave_types').select('id,company_id,code,name,annual_allowance,is_paid,is_active').eq('company_id', companyId).eq('is_active', true).order('name');
  if (isMissingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []) as HrLeaveType[];
}

export async function listEmployeeDocuments(client: SupabaseClient, companyIds: readonly string[], employeeId?: string): Promise<HrDocument[]> {
  let query = client.from('employee_documents').select(documentColumns).in('company_id', companyIds).order('uploaded_at', { ascending: false });
  if (employeeId) query = query.eq('employee_id', employeeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as HrDocument[];
}

export async function createEmployeeDocument(client: SupabaseClient, input: { companyId: string; employeeId: string; name: string; documentType: string; filePath: string }): Promise<Pick<HrDocument, 'id' | 'file_url'>> {
  const { data, error } = await client.from('employee_documents').insert({ company_id: input.companyId, employee_id: input.employeeId, name: input.name, document_type: input.documentType, file_url: input.filePath }).select('id,file_url').single();
  if (error) throw error;
  return data as Pick<HrDocument, 'id' | 'file_url'>;
}

export async function deleteEmployeeDocument(client: SupabaseClient, documentId: string): Promise<void> {
  const { error } = await client.from('employee_documents').delete().eq('id', documentId);
  if (error) throw error;
}

export async function listLeaveBalances(client: SupabaseClient, companyId: string, employeeId: string, year = new Date().getFullYear()): Promise<HrLeaveBalance[]> {
  const { data, error } = await client.from('leave_balances').select('id,company_id,employee_id,leave_type_id,year,allowance,carried_over,used,pending,remaining,leave_type:leave_types(code,name,is_paid)').eq('company_id', companyId).eq('employee_id', employeeId).eq('year', year).order('leave_type_id');
  if (isMissingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []) as unknown as HrLeaveBalance[];
}

export async function listAnnouncements(client: SupabaseClient, companyId: string): Promise<HrAnnouncement[]> {
  const now = new Date().toISOString();
  const { data, error } = await client.from('hr_announcements').select('id,company_id,title,body,published_at,expires_at,is_published,created_at').eq('company_id', companyId).eq('is_published', true).lte('published_at', now).or(`expires_at.is.null,expires_at.gte.${now}`).order('published_at', { ascending: false }).limit(6);
  if (isMissingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []) as HrAnnouncement[];
}

export async function listNotifications(client: SupabaseClient, userId: string, companyId: string): Promise<HrNotification[]> {
  const { data, error } = await client.from('hr_notifications').select('id,company_id,user_id,type,title,body,href,read_at,created_at').eq('company_id', companyId).eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as HrNotification[];
}

export async function listOrgUnits(client: SupabaseClient, companyId: string, unitType?: string): Promise<HrOrgUnit[]> {
  let query = client.from('hr_org_units').select(orgUnitColumns).eq('company_id', companyId).eq('is_active', true).order('unit_type').order('name');
  if (unitType) query = query.eq('unit_type', unitType);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as HrOrgUnit[];
}

export async function listJobOpenings(client: SupabaseClient, companyId: string): Promise<HrJobOpening[]> {
  const { data, error } = await client.from('hr_job_openings').select(openingColumns).eq('company_id', companyId).order('created_at', { ascending: false });
  if (isMissingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []) as HrJobOpening[];
}

export async function listCandidates(client: SupabaseClient, companyId: string): Promise<HrCandidate[]> {
  const { data, error } = await client.from('hr_candidates').select(candidateColumns).eq('company_id', companyId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as HrCandidate[];
}

export async function listApplications(client: SupabaseClient, companyId: string): Promise<HrApplication[]> {
  const { data, error } = await client.from('hr_applications').select(applicationColumns).eq('company_id', companyId).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as HrApplication[];
}

export async function listInterviews(client: SupabaseClient, companyId: string): Promise<HrInterview[]> {
  const { data, error } = await client.from('hr_interviews').select(interviewColumns).eq('company_id', companyId).order('scheduled_at');
  if (error) throw error;
  return (data ?? []) as HrInterview[];
}

export async function createJobOpening(client: SupabaseClient, input: { companyId: string; title: string; department?: string; description?: string; employmentType?: string; workLocation?: string; openings?: number; status?: string; openedOn?: string }): Promise<HrJobOpening> {
  const { data, error } = await client.from('hr_job_openings').insert({ company_id: input.companyId, title: input.title.trim(), department: input.department?.trim() || null, description: input.description?.trim() || null, employment_type: input.employmentType || 'full_time', work_location: input.workLocation?.trim() || null, openings: input.openings || 1, status: input.status || 'draft', opened_on: input.openedOn || null }).select(openingColumns).single();
  if (error) throw error;
  return data as HrJobOpening;
}

export async function createCandidate(client: SupabaseClient, input: { companyId: string; firstName: string; lastName: string; email?: string; phone?: string; source?: string; notes?: string }): Promise<HrCandidate> {
  const { data, error } = await client.from('hr_candidates').insert({ company_id: input.companyId, first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null, source: input.source?.trim() || null, notes: input.notes?.trim() || null }).select(candidateColumns).single();
  if (error) throw error;
  return data as HrCandidate;
}

export async function createApplication(client: SupabaseClient, input: { companyId: string; candidateId: string; jobOpeningId: string; stage?: string; notes?: string }): Promise<HrApplication> {
  const { data, error } = await client.from('hr_applications').insert({ company_id: input.companyId, candidate_id: input.candidateId, job_opening_id: input.jobOpeningId, stage: input.stage || 'applied', notes: input.notes?.trim() || null }).select(applicationColumns).single();
  if (error) throw error;
  return data as unknown as HrApplication;
}

export async function updateApplicationStage(client: SupabaseClient, applicationId: string, stage: HrApplication['stage'], notes?: string): Promise<HrApplication> {
  const { data, error } = await client.from('hr_applications').update({ stage, notes: notes?.trim() || null, updated_at: new Date().toISOString() }).eq('id', applicationId).select(applicationColumns).single();
  if (error) throw error;
  return data as unknown as HrApplication;
}

export async function convertCandidateToEmployee(client: SupabaseClient, applicationId: string, jobTitle?: string, department?: string, startDate?: string): Promise<string> {
  const { data, error } = await client.rpc('hr_convert_candidate_to_employee', { p_application_id: applicationId, p_job_title: jobTitle?.trim() || null, p_department: department?.trim() || null, p_start_date: startDate || new Date().toISOString().slice(0, 10) });
  if (error) throw error;
  return data as string;
}

export async function listPerformanceCycles(client: SupabaseClient, companyId: string): Promise<HrPerformanceCycle[]> {
  const { data, error } = await client.from('hr_performance_cycles').select(cycleColumns).eq('company_id', companyId).order('starts_on', { ascending: false });
  if (error) throw error;
  return (data ?? []) as HrPerformanceCycle[];
}

export async function listPerformanceReviews(client: SupabaseClient, companyId: string): Promise<HrPerformanceReview[]> {
  const { data, error } = await client.from('hr_performance_reviews').select(reviewColumns).eq('company_id', companyId).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as HrPerformanceReview[];
}

export async function listPerformanceGoals(client: SupabaseClient, companyId: string): Promise<HrPerformanceGoal[]> {
  const { data, error } = await client.from('hr_performance_goals').select(goalColumns).eq('company_id', companyId).order('due_on');
  if (error) throw error;
  return (data ?? []) as unknown as HrPerformanceGoal[];
}

export async function createPerformanceCycle(client: SupabaseClient, input: { companyId: string; name: string; startsOn: string; endsOn: string; status?: string }): Promise<HrPerformanceCycle> {
  const { data, error } = await client.from('hr_performance_cycles').insert({ company_id: input.companyId, name: input.name.trim(), starts_on: input.startsOn, ends_on: input.endsOn, status: input.status || 'draft' }).select(cycleColumns).single();
  if (error) throw error;
  return data as HrPerformanceCycle;
}

export async function createPerformanceReview(client: SupabaseClient, input: { companyId: string; cycleId: string; employeeId: string; reviewerId?: string }): Promise<HrPerformanceReview> {
  const { data, error } = await client.from('hr_performance_reviews').insert({ company_id: input.companyId, cycle_id: input.cycleId, employee_id: input.employeeId, reviewer_id: input.reviewerId || null }).select(reviewColumns).single();
  if (error) throw error;
  return data as unknown as HrPerformanceReview;
}

export async function updatePerformanceReview(client: SupabaseClient, reviewId: string, input: { status?: HrPerformanceReview['status']; rating?: number | null; managerFeedback?: string; completed?: boolean }): Promise<HrPerformanceReview> {
  const { data, error } = await client.from('hr_performance_reviews').update({ status: input.status, rating: input.rating, manager_feedback: input.managerFeedback?.trim() || null, completed_at: input.completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', reviewId).select(reviewColumns).single();
  if (error) throw error;
  return data as unknown as HrPerformanceReview;
}

export async function updateSelfReview(client: SupabaseClient, reviewId: string, selfReview: string): Promise<HrPerformanceReview> {
  const { data, error } = await client.rpc('hr_update_self_review', { p_review_id: reviewId, p_self_review: selfReview });
  if (error) throw error;
  return data as unknown as HrPerformanceReview;
}

export async function createPerformanceGoal(client: SupabaseClient, input: { companyId: string; employeeId: string; cycleId?: string; title: string; description?: string; dueOn?: string }): Promise<HrPerformanceGoal> {
  const { data, error } = await client.from('hr_performance_goals').insert({ company_id: input.companyId, employee_id: input.employeeId, cycle_id: input.cycleId || null, title: input.title.trim(), description: input.description?.trim() || null, due_on: input.dueOn || null }).select(goalColumns).single();
  if (error) throw error;
  return data as unknown as HrPerformanceGoal;
}

export async function updatePerformanceGoal(client: SupabaseClient, goalId: string, input: { status?: HrPerformanceGoal['status']; progress?: number }): Promise<HrPerformanceGoal> {
  const { data, error } = await client.from('hr_performance_goals').update({ status: input.status, progress: input.progress, updated_at: new Date().toISOString() }).eq('id', goalId).select(goalColumns).single();
  if (error) throw error;
  return data as unknown as HrPerformanceGoal;
}

export async function listOnboardingTasks(client: SupabaseClient, companyId: string): Promise<HrOnboardingTask[]> {
  const { data, error } = await client.from('hr_onboarding_tasks').select(onboardingColumns).eq('company_id', companyId).order('status').order('due_on');
  if (error) throw error;
  return (data ?? []) as unknown as HrOnboardingTask[];
}

export async function createOnboardingTask(client: SupabaseClient, input: { companyId: string; employeeId: string; title: string; description?: string; dueOn?: string }): Promise<HrOnboardingTask> {
  const { data, error } = await client.from('hr_onboarding_tasks').insert({ company_id: input.companyId, employee_id: input.employeeId, title: input.title.trim(), description: input.description?.trim() || null, due_on: input.dueOn || null }).select(onboardingColumns).single();
  if (error) throw error;
  return data as unknown as HrOnboardingTask;
}

export async function updateOnboardingTask(client: SupabaseClient, taskId: string, status: HrOnboardingTask['status']): Promise<HrOnboardingTask> {
  const { data, error } = await client.from('hr_onboarding_tasks').update({ status, completed_at: status === 'done' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', taskId).select(onboardingColumns).single();
  if (error) throw error;
  return data as unknown as HrOnboardingTask;
}

export async function listOffboardingCases(client: SupabaseClient, companyId: string): Promise<HrOffboardingCase[]> {
  const { data, error } = await client.from('hr_offboarding_cases').select(offboardingColumns).eq('company_id', companyId).order('last_working_day');
  if (error) throw error;
  return (data ?? []) as unknown as HrOffboardingCase[];
}

export async function createOffboardingCase(client: SupabaseClient, input: { companyId: string; employeeId: string; reason: HrOffboardingCase['reason']; lastWorkingDay: string; notes?: string }): Promise<HrOffboardingCase> {
  const { data, error } = await client.rpc('hr_start_offboarding', { p_company_id: input.companyId, p_employee_id: input.employeeId, p_reason: input.reason, p_last_working_day: input.lastWorkingDay, p_notes: input.notes?.trim() || null });
  if (error) throw error;
  return data as unknown as HrOffboardingCase;
}

export async function updateOffboardingCase(client: SupabaseClient, caseId: string, status: HrOffboardingCase['status']): Promise<HrOffboardingCase> {
  const { data, error } = await client.from('hr_offboarding_cases').update({ status, updated_at: new Date().toISOString() }).eq('id', caseId).select(offboardingColumns).single();
  if (error) throw error;
  return data as unknown as HrOffboardingCase;
}

export async function listOffboardingTasks(client: SupabaseClient, companyId: string): Promise<HrOffboardingTask[]> {
  const { data, error } = await client.from('hr_offboarding_tasks').select(offboardingTaskColumns).eq('company_id', companyId).order('status').order('due_on');
  if (error) throw error;
  return (data ?? []) as HrOffboardingTask[];
}

export async function updateOffboardingTask(client: SupabaseClient, taskId: string, status: HrOffboardingTask['status']): Promise<HrOffboardingTask> {
  const { data, error } = await client.from('hr_offboarding_tasks').update({ status, completed_at: status === 'done' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', taskId).select(offboardingTaskColumns).single();
  if (error) throw error;
  return data as unknown as HrOffboardingTask;
}

export async function listHrApprovals(client: SupabaseClient, companyId: string): Promise<HrApproval[]> {
  const { data, error } = await client.from('hr_approvals').select('id,company_id,resource_type,resource_id,requested_by,assigned_to,status,note,created_at,resolved_at,resolved_by').eq('company_id', companyId).order('created_at', { ascending: false });
  if (isMissingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []) as HrApproval[];
}

export async function resolveHrApproval(client: SupabaseClient, approvalId: string, status: 'approved' | 'rejected' | 'more_info', note?: string): Promise<HrApproval> {
  const { data, error } = await client.rpc('hr_resolve_approval', { p_approval_id: approvalId, p_status: status, p_note: note?.trim() || null });
  if (error) throw error;
  return data as HrApproval;
}

export async function clockIn(client: SupabaseClient, companyId: string, employeeId: string, workMode: 'office' | 'remote' = 'office'): Promise<HrAttendanceRecord> {
  const { data, error } = await client.rpc('hr_clock_in', { p_company_id: companyId, p_employee_id: employeeId, p_work_mode: workMode });
  if (error) throw error;
  return data as HrAttendanceRecord;
}

export async function clockOut(client: SupabaseClient, companyId: string, employeeId: string): Promise<HrAttendanceRecord> {
  const { data, error } = await client.rpc('hr_clock_out', { p_company_id: companyId, p_employee_id: employeeId });
  if (error) throw error;
  return data as HrAttendanceRecord;
}

export async function submitLeaveRequest(client: SupabaseClient, input: { companyId: string; employeeId: string; leaveType: string; startDate: string; endDate: string; reason?: string }): Promise<HrLeaveRequest> {
  const { data, error } = await client.rpc('hr_submit_leave_request', {
    p_company_id: input.companyId,
    p_employee_id: input.employeeId,
    p_leave_type: input.leaveType,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_reason: input.reason?.trim() || null,
    p_requested_days: calculateLeaveDays(input.startDate, input.endDate),
  });
  if (error) throw error;
  return data as HrLeaveRequest;
}

export async function reviewLeaveRequest(client: SupabaseClient, requestId: string, status: 'approved' | 'rejected', note?: string): Promise<HrLeaveRequest> {
  const { data, error } = await client.rpc('hr_review_leave_request', { p_leave_request_id: requestId, p_status: status, p_note: note?.trim() || null });
  if (error) throw error;
  return data as HrLeaveRequest;
}

export async function cancelLeaveRequest(client: SupabaseClient, requestId: string): Promise<HrLeaveRequest> {
  const { data, error } = await client.rpc('hr_cancel_leave_request', { p_leave_request_id: requestId });
  if (error) throw error;
  return data as HrLeaveRequest;
}

export function subscribeToHrChanges(client: SupabaseClient, companyId: string, onChange: () => void, userId?: string) {
  const channel = client
    .channel(`operix-hr:${companyId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employees', filter: `company_id=eq.${companyId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `company_id=eq.${companyId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests', filter: `company_id=eq.${companyId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_balances', filter: `company_id=eq.${companyId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_announcements', filter: `company_id=eq.${companyId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_approvals', filter: `company_id=eq.${companyId}` }, onChange);
  for (const table of ['hr_org_units', 'hr_job_openings', 'hr_candidates', 'hr_applications', 'hr_interviews', 'hr_performance_cycles', 'hr_performance_reviews', 'hr_performance_goals', 'hr_onboarding_tasks', 'hr_offboarding_cases', 'hr_offboarding_tasks']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `company_id=eq.${companyId}` }, onChange);
  }
  if (userId) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'hr_notifications', filter: `user_id=eq.${userId}` }, onChange);
  channel.subscribe();
  return () => { void client.removeChannel(channel); };
}

function escapeFilter(value: string): string {
  return value.replace(/[,%()]/g, ' ').trim();
}
