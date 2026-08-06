import { z } from "zod";

export const ticketStatusSchema = z.enum(["open", "waiting_on_customer", "waiting_on_agent", "in_progress", "resolved", "closed", "archived"]);
export const ticketPrioritySchema = z.enum(["low", "normal", "high", "urgent", "critical"]);
export const messageVisibilitySchema = z.enum(["public", "internal", "system"]);

export const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(100_000),
  priority: ticketPrioritySchema.default("normal"),
  categoryId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  sourceApplication: z.string().trim().min(1).max(80).default("operix"),
  mailboxId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).max(50).default([]),
});

export const updateTicketSchema = z.object({
  subject: z.string().trim().min(1).max(240).optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1).max(100_000),
  visibility: messageVisibilitySchema.default("public"),
  sendEmail: z.boolean().default(true),
  attachmentIds: z.array(z.string().uuid()).max(20).default([]),
});

export const assignmentSchema = z.object({
  agentId: z.string().uuid().nullable(),
  departmentId: z.string().uuid().nullable().optional(),
});

export const bulkAssignmentSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(200),
  agentId: z.string().uuid().nullable(),
  departmentId: z.string().uuid().nullable().optional(),
});

export const contactSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  email: z.string().email().max(320).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  organizationName: z.string().trim().max(200).nullable().optional(),
  contactKind: z.enum(["external_customer", "supplier", "lead", "organization", "internal", "other"]).default("external_customer"),
  notes: z.string().max(10_000).nullable().optional(),
  linkedEntityType: z.string().trim().max(80).nullable().optional(),
  linkedEntityId: z.string().uuid().nullable().optional(),
  linkedProfileId: z.string().uuid().nullable().optional(),
});

export const departmentSchema = z.object({
  code: z.string().trim().min(2).max(24).regex(/^[a-z0-9_-]+$/i),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#004FFE"),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const savedReplySchema = z.object({
  name: z.string().trim().min(1).max(160),
  bodyText: z.string().trim().min(1).max(100_000),
  bodyHtml: z.string().max(100_000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
});

export const tagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#004FFE"),
});

export const savedFilterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: z.record(z.string(), z.unknown()).default({}),
  isShared: z.boolean().default(false),
});

const mailTransportSchema = z.object({
  host: z.string().trim().max(255).nullable().optional(),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  username: z.string().trim().max(320).nullable().optional(),
  password: z.string().max(1000).nullable().optional(),
  tlsMode: z.enum(["implicit", "starttls", "none"]).default("implicit"),
});

export const mailboxSchema = z.object({
  address: z.string().email().transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(160).default("OperiX Support"),
  ticketPrefix: z.string().trim().regex(/^[A-Za-z0-9]{2,12}$/).transform((value) => value.toUpperCase()),
  sourceApplication: z.string().trim().min(1).max(80).default("operix"),
  departmentId: z.string().uuid().nullable().optional(),
  replyTo: z.string().email().nullable().optional(),
  defaultSignature: z.string().max(5000).nullable().optional(),
  syncMode: z.enum(["webhook", "idle", "poll"]).default("idle"),
  syncIntervalSeconds: z.coerce.number().int().min(30).max(86400).default(300),
  imap: mailTransportSchema.extend({ port: z.coerce.number().int().min(1).max(65535).default(993) }).optional(),
  smtp: mailTransportSchema.extend({ port: z.coerce.number().int().min(1).max(65535).default(587), tlsMode: z.enum(["implicit", "starttls", "none"]).default("starttls") }).optional(),
});

export const searchSchema = z.object({
  q: z.string().trim().max(160).default(""),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  departmentId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  tag: z.string().trim().max(80).optional(),
  assignedToMe: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
