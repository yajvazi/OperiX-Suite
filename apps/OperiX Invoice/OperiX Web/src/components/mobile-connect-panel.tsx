"use client";

import { useEffect, useMemo, useState } from "react";
import { buildConnectLink } from "@invoice-monorepo/api";
import { qrSvg } from "@/lib/qr";

/** Settings → Mobile app: a QR code the OperiX mobile app scans to connect to this server. */
export function MobileConnectPanel() {
  const [origin, setOrigin] = useState("");
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { queueMicrotask(() => setOrigin(window.location.origin)); }, []);
  const address = (custom.trim() || origin).replace(/\/+$/, "");
  const link = address ? buildConnectLink(address) : "";
  const svg = useMemo(() => { try { return link ? qrSvg(link, 220) : ""; } catch { return ""; } }, [link]);
  const local = /^(https?:\/\/)(localhost|127\.|10\.|192\.168\.)/.test(address);

  return <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
    <div className="rounded-xl border border-[#e6ebf3] bg-white p-4 text-center">
      {svg ? <div className="mx-auto w-[220px]" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="muted text-xs">The QR code is not available for this address.</p>}
      <p className="muted mt-3 break-all text-xs">{address}</p>
    </div>
    <div className="space-y-4 text-sm">
      <ol className="list-decimal space-y-2 pl-5">
        <li>Install <b>OperiX Invoice</b> from the App Store or Google Play.</li>
        <li>On the sign-in screen tap <b>Connect to your own server</b> and choose <b>Scan QR code</b>. You can also scan it with the phone camera.</li>
        <li>Check the server name the app shows, then sign in with your account from this web app.</li>
      </ol>
      <label className="field"><span>Public web address of this server</span>
        <input className="input" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder={origin || "https://invoices.yourcompany.com"} />
      </label>
      <p className="muted text-xs">Use the address people reach this app on from outside your network. The QR code contains only this address. It never contains a password or key.</p>
      {local ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">This looks like a local address. A phone can only reach it on the same Wi-Fi. For use anywhere, put the server behind HTTPS on a public domain.</p> : null}
      {address && !address.startsWith("https://") && !local ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">The mobile app only connects over HTTPS (or a local network address).</p> : null}
      <button type="button" className="btn" disabled={!link} onClick={() => { void navigator.clipboard.writeText(link).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }); }}>{copied ? "Copied" : "Copy connection link"}</button>
    </div>
  </div>;
}
