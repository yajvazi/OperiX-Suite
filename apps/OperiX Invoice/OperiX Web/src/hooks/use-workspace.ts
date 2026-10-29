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

export function useWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [company, setCompany] = useState<WorkspaceCompany | null>(null);
  const [companies, setCompanies] = useState<WorkspaceCompany[]>([]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState<"super_administrator" | "company_administrator" | "manager" | "employee">("employee");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [scopes, setScopes] = useState<Record<string, "OWN" | "ASSIGNED" | "ALL">>({});
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storage, setStorage] = useState<"local" | "cloud">("cloud");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    if (!supabase) {
      setError("We couldn't connect to your organization workspace. Please try again or contact your administrator.");
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setError("Your session has expired. Please sign in again.");
      setLoading(false);
      return;
    }

    try {
      setUser(authData.user);
      if (getStorageMode() === "local") {
        // Free tier: the business lives in this browser. The account only proves who is signed in.
        const store = await getLocalStore();
        const localCompany = (await store.getCompany()) as unknown as WorkspaceCompany;
        setStorage("local");
        setProfile({ ...(localCompany as WorkspaceProfile), id: authData.user.id, company_id: store.companyId, active_company_id: store.companyId });
        setCompany(localCompany);
        setCompanies([localCompany]);
        setCompanyIds([store.companyId]);
        setCompanyId(store.companyId);
        setRoleCode("company_administrator");
        setPermissions([]);
        setScopes({});
        setPlatformAdmin(false);
        return;
      }
      setStorage("cloud");
      const resolved = await resolveWorkspace(supabase, authData.user.id, { membershipOnly: true });
      setProfile(resolved.profile as WorkspaceProfile);
      setCompany(resolved.company as WorkspaceCompany | null);
      setCompanies(resolved.companies as WorkspaceCompany[]);
      setCompanyIds(resolved.companyIds);
      setCompanyId(resolved.companyId);
      setRoleCode(resolved.roleCode);
      setPermissions(resolved.permissions);
      setScopes(resolved.scopes);
      setPlatformAdmin(resolved.platformAdmin);
    } catch {
      setError("We couldn't load your organization workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
