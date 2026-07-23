"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useBusinessData<T extends Record<string, unknown>>(table: string, select = "*") {
  const [data, setData] = useState<T[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured."); setData([]); setLoading(false); return; }
    const result = await supabase.from(table).select(select).order("created_at", { ascending:false }).limit(250);
    if (result.error) { setError(result.error.message); setData([]); } else setData((result.data || []) as unknown as T[]);
    setLoading(false);
  }, [select, table]);
  useEffect(() => { const timer=window.setTimeout(()=>void refresh(),0); return()=>window.clearTimeout(timer); }, [refresh]);
  return { data, loading, error, refresh, setData };
}
