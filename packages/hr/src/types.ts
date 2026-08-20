export type HrEmployeeStatus = 'active' | 'onboarding' | 'on_leave' | 'terminated' | 'pending';
export type HrAttendanceStatus = 'present' | 'absent' | 'late' | 'remote' | 'sick' | 'on_leave' | 'half_day' | 'holiday';
export type HrLeaveStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface HrEmployee {
  id: string;
  company_id: string;
  user_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  department?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  status: HrEmployeeStatus;
  hire_date?: string | null;
  employment_start_date?: string | null;
  employment_end_date?: string | null;
  employee_number?: string | null;
  currency?: string | null;
  payroll_ready_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HrAttendanceRecord {
  id: string;
  employee_id: string;
  company_id: string;
  date: string;
  check_in?: string | null;
  check_out?: string | null;
  total_hours?: number | null;
  status: HrAttendanceStatus;
  work_mode?: 'office' | 'remote' | null;
  location_lat?: number | null;
  location_lng?: number | null;
  created_at?: string | null;
  employee?: Pick<HrEmployee, 'id' | 'first_name' | 'last_name' | 'job_title' | 'department' | 'avatar_url'> | null;
}

export interface HrLeaveType {
  id: string;
  company_id: string;
  code: string;
  name: string;
  annual_allowance: number;
  is_paid: boolean;
  is_active: boolean;
}

export interface HrLeaveRequest {
  id: string;
  employee_id: string;
  company_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  requested_days?: number | null;
  reason?: string | null;
  status: HrLeaveStatus;
  approved_by?: string | null;
  reviewer_note?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  employee?: Pick<HrEmployee, 'id' | 'first_name' | 'last_name' | 'job_title' | 'department' | 'avatar_url'> | null;
}

export interface HrLeaveBalance {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  allowance: number;
  carried_over: number;
  used: number;
  pending: number;
  remaining: number;
  leave_type?: Pick<HrLeaveType, 'code' | 'name' | 'is_paid'> | null;
}

export interface HrAnnouncement {
  id: string;
  company_id: string;
  title: string;
  body: string;
  published_at?: string | null;
  expires_at?: string | null;
  is_published: boolean;
  created_at?: string | null;
}

export interface HrNotification {
  id: string;
  company_id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  read_at?: string | null;
  created_at?: string | null;
}

export interface HrDocument {
  id: string;
  employee_id: string;
  company_id: string;
  name: string;
  document_type?: string | null;
  file_url: string;
  expiry_date?: string | null;
  uploaded_at?: string | null;
  employee?: Pick<HrEmployee, 'id' | 'first_name' | 'last_name' | 'department'> | null;
}

export interface HrApproval {
  id: string;
  company_id: string;
  resource_type: string;
  resource_id: string;
  requested_by: string;
  assigned_to?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'more_info';
  note?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

export type HrOrgUnitType = 'department' | 'team' | 'position';

export interface HrOrgUnit {
  id: string;
  company_id: string;
  parent_id?: string | null;
  manager_employee_id?: string | null;
  unit_type: HrOrgUnitType;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export type HrJobOpeningStatus = 'draft' | 'open' | 'on_hold' | 'closed';
export type HrApplicationStage = 'applied' | 'screening' | 'interview' | 'final_interview' | 'offer' | 'hired' | 'rejected';

export interface HrJobOpening {
  id: string;
  company_id: string;
  title: string;
  department?: string | null;
  description?: string | null;
  employment_type: string;
  work_location?: string | null;
  status: HrJobOpeningStatus;
  openings: number;
  hiring_manager_id?: string | null;
  opened_on?: string | null;
  closes_on?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HrCandidate {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  resume_path?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HrApplication {
  id: string;
  company_id: string;
  candidate_id: string;
  job_opening_id: string;
  stage: HrApplicationStage;
  assigned_to?: string | null;
  notes?: string | null;
  applied_at?: string | null;
  updated_at?: string | null;
  hired_employee_id?: string | null;
  candidate?: Pick<HrCandidate, 'id' | 'first_name' | 'last_name' | 'email' | 'phone'> | null;
  job_opening?: Pick<HrJobOpening, 'id' | 'title' | 'department'> | null;
}

export interface HrInterview {
  id: string;
  company_id: string;
  application_id: string;
  interviewer_id?: string | null;
  scheduled_at: string;
  location?: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  feedback?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type HrPerformanceStatus = 'self_review' | 'manager_review' | 'completed';

export interface HrPerformanceCycle {
  id: string;
  company_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: 'draft' | 'open' | 'closed';
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HrPerformanceReview {
  id: string;
  company_id: string;
  cycle_id: string;
  employee_id: string;
  reviewer_id?: string | null;
  status: HrPerformanceStatus;
  rating?: number | null;
  self_review?: string | null;
  manager_feedback?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  employee?: Pick<HrEmployee, 'id' | 'first_name' | 'last_name' | 'job_title' | 'department'> | null;
  cycle?: Pick<HrPerformanceCycle, 'id' | 'name' | 'starts_on' | 'ends_on'> | null;
}

export interface HrPerformanceGoal {
  id: string;
  company_id: string;
  cycle_id?: string | null;
  employee_id: string;
  title: string;
  description?: string | null;
  status: 'active' | 'completed' | 'cancelled';
  progress: number;
  due_on?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  employee?: Pick<HrEmployee, 'id' | 'first_name' | 'last_name' | 'job_title' | 'department'> | null;
}

export interface HrOnboardingTask {
  id: string;
  company_id: string;
  employee_id: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'skipped';
  due_on?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  employee?: Pick<HrEmployee, 'id' | 'first_name' | 'last_name' | 'job_title' | 'department'> | null;
}

export interface HrOffboardingCase {
  id: string;
  company_id: string;
  employee_id: string;
  reason: 'termination' | 'resignation' | 'contract_expiry' | 'retirement' | 'other';
  last_working_day: string;
  status: 'open' | 'completed' | 'cancelled';
  notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  employee?: Pick<HrEmployee, 'id' | 'first_name' | 'last_name' | 'job_title' | 'department'> | null;
}

export interface HrOffboardingTask {
  id: string;
  company_id: string;
  case_id: string;
  title: string;
  assigned_to?: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'skipped';
  due_on?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HrWorkspace {
  userId: string;
  companyId: string;
  companyIds: string[];
  profile: { first_name?: string | null; last_name?: string | null; email?: string | null; active_company_id?: string | null; company_id?: string | null };
  company: { id: string; company_name?: string | null; name?: string | null; currency?: string | null; default_language?: string | null } | null;
}

export interface HrDashboardSnapshot {
  employees: HrEmployee[];
  attendance: HrAttendanceRecord[];
  leaveRequests: HrLeaveRequest[];
  announcements: HrAnnouncement[];
  notifications: HrNotification[];
  balances: HrLeaveBalance[];
}
