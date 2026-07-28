"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setError(authError?.message || "Your session has expired.");
      setLoading(false);
      return;
    }

    setUser(authData.user);
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .single();

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const nextProfile = profileData as WorkspaceProfile;
    setProfile(nextProfile);
    const companyId = nextProfile.active_company_id || nextProfile.company_id;
    if (companyId) {
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .maybeSingle();
      if (companyError) setError(companyError.message);
      setCompany((companyData as WorkspaceCompany | null) || null);
    } else {
      setCompany(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  return {
    user,
    profile,
    company,
    companyId: profile?.active_company_id || profile?.company_id || null,
    loading,
    error,
    refresh,
  };
}
