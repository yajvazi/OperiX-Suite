"use client";

import { usePathname } from "next/navigation";
import { Download, ExternalLink, Smartphone } from "lucide-react";
import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { InvoiceLogo } from "./product-logo";
import {
  buildInvoiceMobileLinksFromWebPath,
  detectMobileStorePlatform,
  getInvoiceMobileStoreUrl,
  trackInvoiceMobileGateEvent,
} from "@/lib/mobile-app-links";
import { isMobileWebRouteAllowed, isPhoneSizedWebDevice } from "@/lib/mobile-web-gate";

function subscribeToViewport(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  coarsePointer.addEventListener?.("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    coarsePointer.removeEventListener?.("change", onChange);
  };
}

function getViewportGateSnapshot() {
  return isPhoneSizedWebDevice({
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    userAgent: navigator.userAgent,
  });
}

const getServerViewportGateSnapshot = () => false;

export function MobileWebGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const viewportIsPhone = useSyncExternalStore(subscribeToViewport, getViewportGateSnapshot, getServerViewportGateSnapshot);
  const shouldBlock = viewportIsPhone && !isMobileWebRouteAllowed(pathname);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const links = useMemo(() => buildInvoiceMobileLinksFromWebPath(pathname), [pathname]);
  const storePlatform = useMemo(() => {
    if (typeof navigator === "undefined") return "other" as const;
    return detectMobileStorePlatform(navigator.userAgent, navigator.platform);
  }, []);
  const storeUrl = getInvoiceMobileStoreUrl(storePlatform);
  const downloadUrl = storeUrl || links.webUrl;

  useEffect(() => {
    const background = backgroundRef.current;
    if (!background) return;
    if (shouldBlock) {
      background.setAttribute("inert", "");
      background.setAttribute("aria-hidden", "true");
    } else {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    }
  }, [shouldBlock]);

  useEffect(() => {
    if (!shouldBlock) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [shouldBlock]);

  useEffect(() => {
    if (!shouldBlock) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
    getFocusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const focusable = getFocusable();
      if (!focusable.length) return;
      if (event.key === "Tab") {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [shouldBlock]);

  useEffect(() => {
    if (shouldBlock) trackInvoiceMobileGateEvent("invoice_mobile_gate_viewed", { pathname });
  }, [pathname, shouldBlock]);

  return <div className={`mobile-web-gate-shell${shouldBlock ? " is-blocked" : ""}`}>
    <div ref={backgroundRef} className="mobile-web-gate-background">
      {children}
    </div>
    {shouldBlock ? <div className="mobile-web-gate-overlay">
      <div ref={dialogRef} className="mobile-web-gate-card" role="dialog" aria-modal="true" aria-labelledby="invoice-mobile-gate-title" aria-describedby="invoice-mobile-gate-copy">
        <div className="mobile-web-gate-brand"><InvoiceLogo /></div>
        <div className="mobile-web-gate-icon" aria-hidden="true"><Smartphone size={25} strokeWidth={2.1} /></div>
        <h1 id="invoice-mobile-gate-title">Use the OperiX Invoice app</h1>
        <p id="invoice-mobile-gate-copy">OperiX Invoice works best in our mobile app. Your workspace and invoices are ready there.</p>
        <div className="mobile-web-gate-actions">
          <a className="btn btn-primary mobile-web-gate-action" data-mobile-gate-action="open" href={links.webUrl} onClick={() => trackInvoiceMobileGateEvent("invoice_mobile_open_clicked", { pathname, target: links.target })}>
            <ExternalLink size={16} aria-hidden="true" /> Open OperiX Invoice
          </a>
          <a className="btn mobile-web-gate-action" data-mobile-gate-action="download" href={downloadUrl} onClick={() => {
            trackInvoiceMobileGateEvent("invoice_mobile_download_clicked", { platform: storePlatform, configured: Boolean(storeUrl) });
            if (!storeUrl) trackInvoiceMobileGateEvent("invoice_mobile_fallback_triggered", { reason: "store_url_unconfigured", platform: storePlatform });
          }}>
            <Download size={16} aria-hidden="true" /> Download the app
          </a>
        </div>
        {!storeUrl ? <p className="mobile-web-gate-note">If the app is installed, Open OperiX Invoice will use it. Store availability is configured per platform.</p> : null}
      </div>
    </div> : null}
  </div>;
}
