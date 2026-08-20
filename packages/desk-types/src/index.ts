export const DESK_PERMISSIONS = [
  'desk.reserve',
  'desk.cancel_own',
  'desk.view_floor',
  'reservation.read_all',
  'reservation.manage',
  'floor.read',
  'floor.manage',
  'resource.read',
  'resource.manage',
  'team.read',
  'team.manage',
  'analytics.read',
  'audit.read',
  'workspace.manage',
] as const;

export type DeskPermission = (typeof DESK_PERMISSIONS)[number];
export type DeskRole = 'owner' | 'desk_admin' | 'workspace_manager' | 'team_manager' | 'employee' | 'read_only';
export type ReservationStatus = 'active' | 'cancelled' | 'resource_removed';
export type ResourceType = 'desk' | 'room' | 'amenity';

export interface DeskUser {
  id: number;
  supabase_user_id?: string | null;
  organization_id?: string | null;
  email: string;
  full_name: string;
  role: string;
  desk_role?: DeskRole | string;
  permissions?: DeskPermission[];
  job_title?: string | null;
  team_name?: string | null;
  department?: string | null;
  specialization?: string | null;
  experience_level?: string | null;
  skills?: string[];
  availability?: number | null;
  profile_image_path?: string | null;
  team_leader_id?: number | null;
  organization_name?: string | null;
}

export interface DeskResource {
  id: number;
  name: string;
  type: ResourceType;
  building: string;
  floor: string;
  zone: string;
  floor_plan_x?: number | null;
  floor_plan_y?: number | null;
  capacity: number;
  amenities?: string | null;
  desk_type?: string | null;
  is_active: boolean;
  restricted_to_team_leaders?: boolean;
  is_available?: boolean | null;
  reserved_by?: string | null;
  is_mine?: boolean | null;
  is_favorite?: boolean | null;
}

export interface DeskReservation {
  id: number;
  user_id: number;
  resource_id: number;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  status: ReservationStatus;
  resource?: DeskResource | null;
  user_name?: string | null;
}

export interface FloorPlan {
  id: number;
  name?: string | null;
  building: string;
  floor: string;
  image_url: string;
  organization_id?: string | null;
}

export interface DeskColleagueLocation {
  id: number;
  full_name: string;
  team_name?: string | null;
  job_title?: string | null;
  floor: string;
  desk: string;
  zone?: string | null;
  resource_id: number;
}

export interface EmployeeSummary {
  occupancy: number;
  available_desks: number;
  available_rooms: number;
  my_reservations: number;
  trend: Array<{ date: string; booked: number }>;
  floor_overview: Array<{ floor: string; occupancy: number }>;
}

export interface BookingLimits {
  max_active_reservations: number;
  max_booking_days_ahead: number;
  active_reservations: number;
  remaining_slots: number;
}

export interface AnalyticsDashboard {
  total_desks: number;
  total_rooms: number;
  active_reservations: number;
  occupancy_rate: number;
  occupancy_trend: Array<{ date: string; occupancy: number; booked: number; total: number }>;
  busiest_days: Array<{ day: string; count: number }>;
  floor_utilization: Array<{ floor: string; utilization: number }>;
  most_used_desks: Array<{ name: string; bookings: number; utilization: number }>;
  least_used_desks: Array<{ name: string; bookings: number; utilization: number }>;
  recent_activity: string[];
}

export interface DeskSearchResults {
  resources: Array<Pick<DeskResource, 'id' | 'name' | 'type' | 'floor' | 'zone'>>;
  users: Array<Pick<DeskUser, 'id' | 'full_name' | 'email' | 'role' | 'job_title' | 'team_name'>>;
}

export interface TeamDeskRecommendation {
  team_name?: string | null;
  team_zone?: string | null;
  resources: DeskResource[];
}

export interface ReservationInput {
  resource_id: number;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  repeat_weeks?: number;
}
