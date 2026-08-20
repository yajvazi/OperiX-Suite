"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveWorkspace, type WorkspaceScope } from "@invoice-monorepo/api/workspace";
import { createClient } from "./supabase/client";

export function useHrWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const client = createClient();
    if (!client) {
      setLoading(false);
      setError("We couldn't connect to your organization workspace. Please try again or contact your administrator.");
      return;
    }
    setLoading(true);
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    try {
      const resolved = await resolveWorkspace(client, user.id);
      setWorkspace({ ...resolved, user });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the OperiX workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { workspace, loading, error, refresh };
}
