"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

export function AnalyticsBoundary() {
  const pathname = usePathname();

  useEffect(() => {
    const productMatch = pathname.match(/^\/products\/(invoice|hr|booking|desk|control|suite)$/);
    const eventName = productMatch ? "product_viewed" : pathname === "/pricing" ? "pricing_viewed" : pathname === "/enterprise" ? "enterprise_viewed" : undefined;
    if (!eventName) return;
    const payload = { event: eventName, ...(productMatch ? { product: productMatch[1] } : {}) };
    const analyticsWindow = window as AnalyticsWindow;
    analyticsWindow.dataLayer?.push(payload);
    analyticsWindow.gtag?.("event", eventName, payload);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-analytics]") : null;
      const eventName = target?.dataset.analytics;
      if (!eventName) return;

      let extra: Record<string, unknown> = {};
      if (target.dataset.analyticsPayload) {
        try {
          extra = JSON.parse(target.dataset.analyticsPayload) as Record<string, unknown>;
        } catch {
          extra = {};
        }
      }
      const payload = { event: eventName, ...extra };
      const analyticsWindow = window as AnalyticsWindow;
      analyticsWindow.dataLayer?.push(payload);
      analyticsWindow.gtag?.("event", eventName, payload);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
