import type {
  AnalyticsDashboard,
  BookingLimits,
  DeskReservation,
  DeskResource,
  DeskColleagueLocation,
  DeskSearchResults,
  DeskUser,
  EmployeeSummary,
  FloorPlan,
  ReservationInput,
  TeamDeskRecommendation,
} from '@invoice-monorepo/desk-types';

export type DeskApiOptions = {
  baseUrl: string;
  getAccessToken: () => string | null | Promise<string | null>;
};

export class DeskApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'DeskApiError';
    this.status = status;
    this.body = body;
  }
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export function createDeskApi(options: DeskApiOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await options.getAccessToken();
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(joinUrl(options.baseUrl, path), { ...init, headers });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = typeof body === 'object' && body && 'detail' in body ? String((body as { detail: unknown }).detail) : `Desk API request failed (${response.status})`;
      throw new DeskApiError(message, response.status, body);
    }
    return body as T;
  }

  const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

  return {
    getMe: () => request<DeskUser>('/auth/me'),
    getEmployeeSummary: () => request<EmployeeSummary>('/analytics/employee-summary'),
    getMyReservations: (status?: string) => request<DeskReservation[]>(`/reservations/me${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    getBookingLimits: () => request<BookingLimits>('/reservations/limits'),
    getResources: (params: { date?: string; floor?: string; zone?: string; type?: string } = {}) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, value]) => Boolean(value)) as Array<[string, string]>).toString();
      return request<DeskResource[]>(`/resources${query ? `?${query}` : ''}`);
    },
    getTeamDeskRecommendations: (date?: string) => request<TeamDeskRecommendation>(`/resources/recommendations/team${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    getFloors: () => request<string[]>('/resources/floors'),
    getZones: (floor?: string) => request<string[]>(`/resources/zones${floor ? `?floor=${encodeURIComponent(floor)}` : ''}`),
    getFloorPlans: () => request<FloorPlan[]>('/floor-plans'),
    createReservation: (input: ReservationInput) => request<DeskReservation | DeskReservation[]>('/reservations', json(input)),
    cancelReservation: (id: number) => request<DeskReservation>(`/reservations/${id}`, { method: 'DELETE' }),
    getRecentActivity: () => request<string[]>('/analytics/recent-activity'),
    getWhoIsInToday: (params: { floor?: string; team?: string } = {}) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, value]) => Boolean(value)) as Array<[string, string]>).toString();
      return request<DeskColleagueLocation[]>(`/users/today${query ? `?${query}` : ''}`);
    },
    searchWorkspace: (query: string) => request<DeskSearchResults>(`/users/search?q=${encodeURIComponent(query)}`),
    getTeamMembers: () => request<DeskUser[]>('/users/team-members'),
    getAvailableForTeam: () => request<DeskUser[]>('/users/available-for-team'),
    getAnalyticsDashboard: (days = 30) => request<AnalyticsDashboard>(`/analytics/dashboard?days=${days}`),
    getAllReservations: (date?: string) => request<DeskReservation[]>(`/reservations${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    registerDevice: (input: { push_token: string; platform: string; device_name?: string | null }) => request<void>('/notifications/devices', json(input)),
    unregisterDevice: (pushToken: string) => request<void>(`/notifications/devices?push_token=${encodeURIComponent(pushToken)}`, { method: 'DELETE' }),
  };
}

export type DeskApi = ReturnType<typeof createDeskApi>;
