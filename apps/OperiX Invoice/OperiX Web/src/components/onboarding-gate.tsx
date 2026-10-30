"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/hooks/use-workspace";

/** Sends a signed-in account that has no company yet to the company setup page. */
export function OnboardingGate() {
  const workspace = useWorkspace();
  useEffect(() => {
    if (!workspace.loading && workspace.storage === "cloud" && workspace.error.includes("No active company workspace is configured")) window.location.replace("/onboarding");
  }, [workspace.loading, workspace.storage, workspace.error]);
  return null;
}
