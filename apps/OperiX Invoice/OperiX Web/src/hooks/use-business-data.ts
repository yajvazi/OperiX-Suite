"use client";

import { useCallback, useEffect, useState } from "react";
import { listScopedResource } from "@invoice-monorepo/api/repositories";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";

export function useBusinessData<T extends Record<string, unknown>>(table: string, select = "*") {
  const [data, setData] = useState<T[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const workspace = useWorkspace();
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    const supabase = createClient();
    if (!supabase) { setError("We couldn't connect to your organization workspace. Please try again or contact your administrator."); setData([]); setLoading(false); return; }
    if (workspace.loading) return;
    if (!workspace.user || !workspace.companyIds.length) { setData([]); setLoading(false); return; }
    try {
      const rows = await listScopedResource<T>(supabase, table, { userId: workspace.user.id, companyIds: workspace.companyIds }, select);
      setData(rows);
    } catch {
      setError("We couldn't load this data. Please try again.");
      setData([]);
    }
    setLoading(false);
  }, [select, table, workspace.companyIds, workspace.loading, workspace.user]);
  useEffect(() => { const timer=window.setTimeout(()=>void refresh(),0); return()=>window.clearTimeout(timer); }, [refresh]);
  return { data, loading, error, refresh, setData };
}
