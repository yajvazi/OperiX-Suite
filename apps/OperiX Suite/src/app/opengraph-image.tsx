import { ImageResponse } from "next/og";

export const alt = "OperiX Invoice — invoicing and business finance. OperiX Booking coming soon.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg,#ffffff 0%,#edf4ff 55%,#cfe0ff 100%)", color: "#061a38", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", color: "#004FFE", fontSize: 40, fontWeight: 700 }}>OperiX</div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 82, lineHeight: 1.03, letterSpacing: -3, fontWeight: 700 }}><span>Invoicing that runs</span><span style={{ color: "#004FFE" }}>your whole business.</span></div>
      <div style={{ display: "flex", gap: 16, fontSize: 28, color: "#475467" }}><span>OperiX Invoice · Web & Mobile</span><span>·</span><span>OperiX Booking · Coming soon</span></div>
    </div>,
    size,
  );
}
