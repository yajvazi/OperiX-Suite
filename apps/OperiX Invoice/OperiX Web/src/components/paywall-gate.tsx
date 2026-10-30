"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { decidePaywall } from "@invoice-monorepo/billing";
import { PAYWALL_ENABLED } from "@/lib/features";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { setStorageMode } from "@/lib/local/storage-mode";
import { InvoiceLogo } from "./product-logo";
import { PaywallPanel } from "./paywall-panel";

type GateState = "checking" | "open" | "paywall";

/**
 * Hosted service only: a cloud workspace without an active subscription sees the paywall instead of its pages.
 * Settings stays reachable so people can manage billing or switch to free browser storage.
 * If the subscription status cannot be read, the pages stay open (the database enforces limits on its own).
 */
export function PaywallGate({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("checking");
  const [canPay, setCanPay] = useState(true);
  const watching = PAYWALL_ENABLED && !workspace.loading && workspace.storage === "cloud" && Boolean(workspace.companyId) && !workspace.platformAdmin;

  useEffect(() => {
    if (!watching) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`/api/billing/summary?companyId=${encodeURIComponent(String(workspace.companyId))}`, { cache: "no-store" });
        if (!response.ok) { if (active) setState("open"); return; }
        const body = await response.json() as { summary?: Parameters<typeof decidePaywall>[0] };
        const decision = decidePaywall(body.summary);
        if (!active) return;
        setCanPay(decision.canPay);
        setState(decision.requiresPayment ? "paywall" : "open");
      } catch {
        if (active) setState("open");
      }
    };
    void check();
    // Coming back from Stripe or another tab: look again, the subscription may be active now.
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [watching, workspace.companyId, pathname]);

  if (!PAYWALL_ENABLED || !watching) return <>{children}</>;
  if (pathname.startsWith("/settings")) return <>{children}</>;
  if (state === "checking") return <div className="ux-page"><div className="skeleton h-10 rounded" /></div>;
  if (state === "open") return <>{children}</>;

  return <main className="ob-page" style={{ minHeight: "100%" }}>
    <header className="ob-top"><InvoiceLogo className="login-brand" /></header>
    <div className="ob-shell">
      <PaywallPanel
        title="Subscribe to keep using OperiX Cloud"
        lead="This workspace doesn't have an active OperiX Cloud subscription. Subscribe to keep your data in the cloud, synced with the mobile app and your team."
        canPay={canPay}
        onFree={() => { setStorageMode("local"); window.location.assign("/dashboard"); }}
        onSignOut={() => { void createClient()?.auth.signOut().then(() => window.location.assign("/login")); }}
      />
    </div>
  </main>;
}
