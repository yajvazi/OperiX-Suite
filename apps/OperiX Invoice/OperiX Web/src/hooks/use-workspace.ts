"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { resolveWorkspace } from "@invoice-monorepo/api/workspace";
import { createClient } from "@/lib/supabase/client";
import type { InvoiceTemplateConfig } from "@/lib/models";
import { getStorageMode } from "@/lib/local/storage-mode";
import { getLocalStore } from "@/lib/local/local-store";

export interface WorkspaceProfile {
  id: string;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  tax_id?: string;
  currency?: string;
  tax_rate?: number;
  tax_name?: string;
  bank_name?: string;
  bank_account?: string;
  bank_iban?: string;
  bank_swift?: string;
  invoice_language?: string;
  terms_conditions?: string;
  primary_color?: string;
  logo_url?: string;
  signature_url?: string;
  stamp_url?: string;
  role?: string;
  company_id?: string;
  active_company_id?: string;
  template_config?: InvoiceTemplateConfig;
}

export interface WorkspaceCompany {
  id: string;
  parent_company_id?: string | null;
  company_name?: string;
  name?: string;
  trade_name?: string;
  unique_business_number?: string;
  fiscal_number?: string;
  vat_number?: string;
  business_activity?: string;
  email?: string;
  phone?: string;
  address?: string;
  registered_address?: string;
  city?: string;
  municipality?: string;
  country?: string;
  country_code?: string;
  website?: string;
  tax_id?: string;
  vat_registration_status?: "not_registered" | "registered" | "deregistered";
  vat_registration_date?: string;
  fiscal_year_start_month?: number;
  fiscal_year_start_day?: number;
  accounting_period_frequency?: "monthly";
  default_language?: "sq" | "en" | "sr";
  currency?: string;
  tax_rate?: number;
  tax_name?: string;
  bank_name?: string;
  bank_account?: string;
  bank_iban?: string;
  bank_swift?: string;
  invoice_language?: string;
  terms_conditions?: string;
  primary_color?: string;
  logo_url?: string;
  signature_url?: string;
  stamp_url?: string;
  template_config?: InvoiceTemplateConfig;
}

type RoleCode = "super_administrator" | "company_administrator" | "manager" | "employee";
interface WorkspaceSnapshot {
  user: User | null;
  profile: WorkspaceProfile | null;
  company: WorkspaceCompany | null;
  companies: WorkspaceCompany[];
  companyIds: string[];
  companyId: string | null;
  roleCode: RoleCode;
  permissions: string[];
  scopes: Record<string, "OWN" | "ASSIGNED" | "ALL">;
  platformAdmin: boolean;
  storage: "local" | "cloud";
}

// Every page mounts its own useWorkspace(). Without a shared copy each navigation starts from "no permissions",
// which flashed "You do not have permission" until the workspace was fetched again.
let snapshot: WorkspaceSnapshot | null = null;

const SNAPSHOT_FRESH_MS = 30_000;
let snapshotAt = 0;
let inflight: Promise<WorkspaceSnapshot> | null = null;

/** One shared request: every component that asks while it is running gets the same answer. */
function loadWorkspace(): Promise<WorkspaceSnapshot> {
  if (!inflight) {
    inflight = fetchWorkspace().then((next) => { snapshot = next; snapshotAt = Date.now(); return next; }).finally(() => { inflight = null; });
  }
  return inflight;
}

async function fetchWorkspace(): Promise<WorkspaceSnapshot> {
  const supabase = createClient();
  if (!supabase) throw new Error("We couldn't connect to your organization workspace. Please try again or contact your administrator.");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) { snapshot = null; throw new Error("Your session has expired. Please sign in again."); }
  if (snapshot && snapshot.user?.id !== authData.user.id) snapshot = null;
  if (getStorageMode() === "local") {
    // Free tier: the business lives in this browser. The account only proves who is signed in.
    const store = await getLocalStore();
    const localCompany = (await store.getCompany()) as unknown as WorkspaceCompany;
    const profile = { ...(localCompany as WorkspaceProfile), id: authData.user.id, company_id: store.companyId, active_company_id: store.companyId };
    return { user: authData.user, profile, company: localCompany, companies: [localCompany], companyIds: [store.companyId], companyId: store.companyId, roleCode: "company_administrator", permissions: [], scopes: {}, platformAdmin: false, storage: "local" };
  }
  const resolved = await resolveWorkspace(supabase, authData.user.id, { membershipOnly: true });
  return { user: authData.user, profile: resolved.profile as WorkspaceProfile, company: resolved.company as WorkspaceCompany | null, companies: resolved.companies as WorkspaceCompany[], companyIds: resolved.companyIds, companyId: resolved.companyId, roleCode: resolved.roleCode, permissions: resolved.permissions, scopes: resolved.scopes, platformAdmin: resolved.platformAdmin, storage: "cloud" };
}

export function clearWorkspaceSnapshot() { snapshot = null; snapshotAt = 0; }

export function useWorkspace() {
  const [user, setUser] = useState<User | null>(snapshot?.user ?? null);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(snapshot?.profile ?? null);
  const [company, setCompany] = useState<WorkspaceCompany | null>(snapshot?.company ?? null);
  const [companies, setCompanies] = useState<WorkspaceCompany[]>(snapshot?.companies ?? []);
  const [companyIds, setCompanyIds] = useState<string[]>(snapshot?.companyIds ?? []);
  const [companyId, setCompanyId] = useState<string | null>(snapshot?.companyId ?? null);
  const [roleCode, setRoleCode] = useState<RoleCode>(snapshot?.roleCode ?? "employee");
  const [permissions, setPermissions] = useState<string[]>(snapshot?.permissions ?? []);
  const [scopes, setScopes] = useState<Record<string, "OWN" | "ASSIGNED" | "ALL">>(snapshot?.scopes ?? {});
  const [platformAdmin, setPlatformAdmin] = useState(snapshot?.platformAdmin ?? false);
  const [loading, setLoading] = useState(!snapshot);
  const [error, setError] = useState("");
  const [storage, setStorage] = useState<"local" | "cloud">(snapshot?.storage ?? "cloud");

  const apply = useCallback((next: WorkspaceSnapshot) => {
    setUser(next.user); setProfile(next.profile); setCompany(next.company); setCompanies(next.companies);
    setCompanyIds(next.companyIds); setCompanyId(next.companyId); setRoleCode(next.roleCode);
    setPermissions(next.permissions); setScopes(next.scopes); setPlatformAdmin(next.platformAdmin); setStorage(next.storage);
  }, []);

  const refresh = useCallback(async () => {
    // With a cached workspace the page renders straight away and this refresh runs quietly.
    if (!snapshot) setLoading(true);
    setError("");
    try {
      apply(await loadWorkspace());
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "We couldn't load your organization workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    // Pages with many workspace readers (menus, hubs) mount them together; a recent snapshot needs no new request.
    if (snapshot && Date.now() - snapshotAt < SNAPSHOT_FRESH_MS) return;
    queueMicrotask(() => void refresh());
  }, [refresh]);

  return {
    user,
    profile,
    company,
    companies,
    companyIds,
    companyId,
    roleCode,
    permissions,
    scopes,
    platformAdmin,
    storage,
    can: (permission: string) => storage === "local" || platformAdmin || permissions.includes(permission),
    scope: (resource: string) => (storage === "local" ? "ALL" : scopes[resource] || "OWN"),
    isGroup: companyIds.length > 1,
    loading,
    error,
    refresh,
  };
}
