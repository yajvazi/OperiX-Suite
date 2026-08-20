"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { resolveWorkspace } from "@invoice-monorepo/api/workspace";
import { createClient } from "@/lib/supabase/client";
import type { InvoiceTemplateConfig } from "@/lib/models";

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
  const [roleCode, setRoleCode] = useState<"super_administrator" | "company_administrator" | "manager" | "employee">("employee");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      const resolved = await resolveWorkspace(supabase, authData.user.id);
      setProfile(resolved.profile as WorkspaceProfile);
      setCompany(resolved.company as WorkspaceCompany | null);
      setCompanies(resolved.companies as WorkspaceCompany[]);
      setCompanyIds(resolved.companyIds);
      setRoleCode(resolved.roleCode);
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
    roleCode,
    isGroup: companyIds.length > 1,
    companyId: profile?.active_company_id || profile?.company_id || null,
    loading,
    error,
    refresh,
  };
}
