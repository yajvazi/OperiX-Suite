import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportContext } from "./auth";
import { ApiError } from "./errors";

type DbClient = SupabaseClient;

export type TicketListItem = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category_id: string | null;
  department_id: string | null;
  assigned_user_id: string | null;
  contact_id: string | null;
  source_application: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  contact?: { display_name: string; email: string | null };
  department?: { name: string; code: string };
  category?: { name: string; slug: string };
  assignee?: { company_name?: string | null; email?: string | null; role?: string | null; signature_url?: string | null };
};

export type TicketGraph = TicketListItem & {
  conversations: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  tags: Array<Record<string, unknown>>;
};

function fail(error: { message?: string } | null, code = "database_error"): never {
  throw new ApiError(500, code, error?.message ?? "The Support database request failed");
}

function rows<T extends Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function row<T extends Record<string, unknown>>(value: unknown): T | null {
  return value && typeof value === "object" ? value as T : null;
}

function safeSearch(value: string): string {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

async function addTicketRelations(client: DbClient, companyId: string, ticketRows: TicketListItem[]): Promise<TicketListItem[]> {
  if (ticketRows.length === 0) return [];
  const contactIds = [...new Set(ticketRows.map((ticket) => ticket.contact_id).filter((id): id is string => Boolean(id)))];
  const departmentIds = [...new Set(ticketRows.map((ticket) => ticket.department_id).filter((id): id is string => Boolean(id)))];
  const categoryIds = [...new Set(ticketRows.map((ticket) => ticket.category_id).filter((id): id is string => Boolean(id)))];
  const assigneeIds = [...new Set(ticketRows.map((ticket) => ticket.assigned_user_id).filter((id): id is string => Boolean(id)))];
  const [contactsResult, departmentsResult, categoriesResult, profilesResult] = await Promise.all([
    contactIds.length ? client.from("support_contacts").select("id,display_name,email").eq("company_id", companyId).in("id", contactIds) : Promise.resolve({ data: [], error: null }),
    departmentIds.length ? client.from("support_departments").select("id,name,code").eq("company_id", companyId).in("id", departmentIds) : Promise.resolve({ data: [], error: null }),
    categoryIds.length ? client.from("support_categories").select("id,name,slug").eq("company_id", companyId).in("id", categoryIds) : Promise.resolve({ data: [], error: null }),
    assigneeIds.length ? client.from("profiles").select("id,company_name,email,role,signature_url").in("id", assigneeIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const contactMap = new Map(rows<{ id: string; display_name: string; email: string | null }>(contactsResult.data).map((item) => [item.id, item]));
  const departmentMap = new Map(rows<{ id: string; name: string; code: string }>(departmentsResult.data).map((item) => [item.id, item]));
  const categoryMap = new Map(rows<{ id: string; name: string; slug: string }>(categoriesResult.data).map((item) => [item.id, item]));
  const profileMap = new Map(rows<{ id: string; company_name?: string | null; email?: string | null; role?: string | null; signature_url?: string | null }>(profilesResult.data).map((item) => [item.id, item]));
  return ticketRows.map((ticket) => ({ ...ticket, contact: ticket.contact_id ? contactMap.get(ticket.contact_id) : undefined, department: ticket.department_id ? departmentMap.get(ticket.department_id) : undefined, category: ticket.category_id ? categoryMap.get(ticket.category_id) : undefined, assignee: ticket.assigned_user_id ? profileMap.get(ticket.assigned_user_id) : undefined }));
}

async function searchRelatedTicketIds(client: DbClient, companyId: string, query: string): Promise<{ contactIds: string[]; categoryIds: string[]; ticketIdsByTag: string[] }> {
  const pattern = `%${safeSearch(query)}%`;
  const [contacts, categories, tagLinks] = await Promise.all([
    client.from("support_contacts").select("id").eq("company_id", companyId).or(`display_name.ilike.${pattern},email.ilike.${pattern}`).limit(100),
    client.from("support_categories").select("id").eq("company_id", companyId).or(`name.ilike.${pattern},slug.ilike.${pattern}`).limit(100),
    client.from("support_tags").select("id").eq("company_id", companyId).or(`name.ilike.${pattern},slug.ilike.${pattern}`).limit(100),
  ]);
  const tagIds = rows<{ id: string }>(tagLinks.data).map((tag) => tag.id);
  let ticketIdsByTag: string[] = [];
  if (tagIds.length) {
    const links = await client.from("support_ticket_tags").select("ticket_id").eq("company_id", companyId).in("tag_id", tagIds).limit(500);
    ticketIdsByTag = rows<{ ticket_id: string }>(links.data).map((link) => link.ticket_id);
  }
  return { contactIds: rows<{ id: string }>(contacts.data).map((contact) => contact.id), categoryIds: rows<{ id: string }>(categories.data).map((category) => category.id), ticketIdsByTag };
}

export async function listTickets(context: SupportContext, filters: { q?: string; status?: string; priority?: string; departmentId?: string; categoryId?: string; tag?: string; assignedToMe?: boolean; page?: number; pageSize?: number }): Promise<{ data: TicketListItem[]; count: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  let query = context.client.from("support_tickets").select("id,ticket_number,subject,status,priority,category_id,department_id,assigned_user_id,contact_id,source_application,created_at,updated_at,last_message_at", { count: "exact" }).eq("company_id", context.companyId).is("deleted_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.assignedToMe) query = query.eq("assigned_user_id", context.user.id);
  if (filters.tag) {
    const tagResult = await context.client.from("support_tags").select("id").eq("company_id", context.companyId).or(`name.ilike.%${safeSearch(filters.tag)}%,slug.ilike.%${safeSearch(filters.tag)}%`).limit(50);
    const tagIds = rows<{ id: string }>(tagResult.data).map((tag) => tag.id);
    if (!tagIds.length) return { data: [], count: 0 };
    const linkResult = await context.client.from("support_ticket_tags").select("ticket_id").eq("company_id", context.companyId).in("tag_id", tagIds).limit(2000);
    const ticketIds = rows<{ ticket_id: string }>(linkResult.data).map((link) => link.ticket_id);
    if (!ticketIds.length) return { data: [], count: 0 };
    query = query.in("id", ticketIds);
  }
  if (filters.q?.trim()) {
    const search = safeSearch(filters.q);
    const related = await searchRelatedTicketIds(context.client, context.companyId, search);
    const conditions = [`ticket_number.ilike.%${search}%`, `subject.ilike.%${search}%`];
    if (related.contactIds.length) conditions.push(`contact_id.in.(${related.contactIds.join(",")})`);
    if (related.categoryIds.length) conditions.push(`category_id.in.(${related.categoryIds.join(",")})`);
    if (related.ticketIdsByTag.length) conditions.push(`id.in.(${related.ticketIdsByTag.join(",")})`);
    query = query.or(conditions.join(","));
  }
  const from = (page - 1) * pageSize;
  const result = await query.order("updated_at", { ascending: false }).range(from, from + pageSize - 1);
  if (result.error) fail(result.error);
  return { data: await addTicketRelations(context.client, context.companyId, rows<TicketListItem>(result.data)), count: result.count ?? 0 };
}

export async function getTicket(context: SupportContext, ticketId: string): Promise<TicketGraph> {
  const ticketResult = await context.client.from("support_tickets").select("id,ticket_number,subject,status,priority,category_id,department_id,assigned_user_id,contact_id,source_application,created_at,updated_at,last_message_at").eq("company_id", context.companyId).eq("id", ticketId).is("deleted_at", null).maybeSingle();
  if (ticketResult.error) fail(ticketResult.error);
  const ticket = row<TicketListItem>(ticketResult.data);
  if (!ticket) throw new ApiError(404, "ticket_not_found", "Ticket not found");
  const conversationResult = await context.client.from("support_conversations").select("*").eq("company_id", context.companyId).eq("ticket_id", ticketId).order("created_at");
  if (conversationResult.error) fail(conversationResult.error);
  const conversationIds = rows<{ id: string }>(conversationResult.data).map((item) => item.id);
  const [messageResult, eventResult, attachmentResult, tagLinkResult] = await Promise.all([
    conversationIds.length ? context.client.from("support_messages").select("*").eq("company_id", context.companyId).in("conversation_id", conversationIds).order("created_at") : Promise.resolve({ data: [], error: null }),
    context.client.from("support_events").select("*").eq("company_id", context.companyId).eq("ticket_id", ticketId).order("created_at", { ascending: false }),
    context.client.from("support_attachments").select("*").eq("company_id", context.companyId).eq("ticket_id", ticketId).order("created_at", { ascending: false }),
    context.client.from("support_ticket_tags").select("tag_id").eq("company_id", context.companyId).eq("ticket_id", ticketId),
  ]);
  const tagIds = rows<{ tag_id: string }>(tagLinkResult.data).map((item) => item.tag_id);
  const tagsResult = tagIds.length ? await context.client.from("support_tags").select("*").eq("company_id", context.companyId).in("id", tagIds) : { data: [], error: null };
  for (const result of [conversationResult, messageResult, eventResult, attachmentResult, tagLinkResult, tagsResult]) if (result.error) fail(result.error);
  const [enriched] = await addTicketRelations(context.client, context.companyId, [ticket]);
  return { ...enriched, conversations: rows(conversationResult.data), messages: rows(messageResult.data), events: rows(eventResult.data), attachments: rows(attachmentResult.data), tags: rows(tagsResult.data) };
}

export async function getSupportLookups(context: SupportContext) {
  const [departments, categories, tags, savedReplies] = await Promise.all([
    context.client.from("support_departments").select("id,code,name,description,is_active").eq("company_id", context.companyId).is("deleted_at", null).order("name"),
    context.client.from("support_categories").select("id,parent_id,name,slug,color,sort_order,is_active").eq("company_id", context.companyId).is("deleted_at", null).order("sort_order").order("name"),
    context.client.from("support_tags").select("id,name,slug,color").eq("company_id", context.companyId).is("deleted_at", null).order("name"),
    context.client.from("support_saved_replies").select("id,name,body_text,body_html,category_id").eq("company_id", context.companyId).eq("is_active", true).is("deleted_at", null).order("name"),
  ]);
  for (const result of [departments, categories, tags, savedReplies]) if (result.error) fail(result.error);
  return { departments: rows(departments.data), categories: rows(categories.data), tags: rows(tags.data), savedReplies: rows(savedReplies.data) };
}

export async function getDashboard(context: SupportContext) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const [open, resolvedToday, activeRows, metricRows, recentEvents] = await Promise.all([
    context.client.from("support_tickets").select("id", { count: "exact", head: true }).eq("company_id", context.companyId).is("deleted_at", null).in("status", ["open", "waiting_on_customer", "waiting_on_agent", "in_progress"]),
    context.client.from("support_tickets").select("id", { count: "exact", head: true }).eq("company_id", context.companyId).is("deleted_at", null).in("status", ["resolved", "closed"]).gte("resolved_at", startOfToday.toISOString()),
    context.client.from("support_tickets").select("id,status,priority,department_id,updated_at,subject,ticket_number").eq("company_id", context.companyId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(500),
    context.client.from("support_tickets").select("created_at,first_response_at,resolved_at").eq("company_id", context.companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1000),
    context.client.from("support_events").select("id,ticket_id,event_name,payload,created_at,actor_user_id").eq("company_id", context.companyId).order("created_at", { ascending: false }).limit(8),
  ]);
  if (open.error || resolvedToday.error || activeRows.error || metricRows.error || recentEvents.error) fail(open.error ?? resolvedToday.error ?? activeRows.error ?? metricRows.error ?? recentEvents.error);
  const active = rows<{ id: string; status: string; priority: string; department_id: string | null; updated_at: string; subject: string; ticket_number: string }>(activeRows.data);
  const metrics = rows<{ created_at: string; first_response_at: string | null; resolved_at: string | null }>(metricRows.data);
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length / 60000) : 0;
  const responseMinutes = average(metrics.filter((item) => item.first_response_at).map((item) => new Date(item.first_response_at!).getTime() - new Date(item.created_at).getTime()).filter((value) => value >= 0));
  const resolutionMinutes = average(metrics.filter((item) => item.resolved_at).map((item) => new Date(item.resolved_at!).getTime() - new Date(item.created_at).getTime()).filter((value) => value >= 0));
  const departmentIds = [...new Set(active.map((item) => item.department_id).filter((id): id is string => Boolean(id)))];
  const departmentRows = departmentIds.length ? await context.client.from("support_departments").select("id,name").eq("company_id", context.companyId).in("id", departmentIds) : { data: [], error: null };
  const departmentMap = new Map(rows<{ id: string; name: string }>(departmentRows.data).map((item) => [item.id, item.name]));
  const byDepartment = new Map<string, number>();
  const byPriority = new Map<string, number>();
  active.forEach((ticket) => { const department = ticket.department_id ? departmentMap.get(ticket.department_id) ?? "Unassigned" : "Unassigned"; byDepartment.set(department, (byDepartment.get(department) ?? 0) + 1); byPriority.set(ticket.priority, (byPriority.get(ticket.priority) ?? 0) + 1); });
  return { open: open.count ?? 0, resolvedToday: resolvedToday.count ?? 0, averageResponseMinutes: responseMinutes, averageResolutionMinutes: resolutionMinutes, byDepartment: [...byDepartment.entries()].map(([label, value]) => ({ label, value })), byPriority: [...byPriority.entries()].map(([label, value]) => ({ label, value })), recentActivity: rows(recentEvents.data).map((event) => ({ ...event, ticket: active.find((ticket) => ticket.id === event.ticket_id) })) };
}
