import { ImageResponse } from "next/og";

export const alt = "OperiX Suite — One Suite. Complete Control.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#ffffff 0%,#edf4ff 55%,#d7e7ff 100%)", color: "#061a38", fontFamily: "sans-serif" }}>
      <div style={{ width: 1020, display: "flex", flexDirection: "column", padding: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#004FFE", fontSize: 34, fontWeight: 700 }}>OperiX <span style={{ color: "#667085", fontSize: 25, fontWeight: 500 }}>Suite</span></div>
        <div style={{ marginTop: 95, maxWidth: 900, display: "flex", flexDirection: "column", fontSize: 84, lineHeight: 1.02, letterSpacing: -4, fontWeight: 700 }}><span>One Suite.</span><span>Complete Control.</span></div>
        <div style={{ marginTop: 34, maxWidth: 760, color: "#667085", fontSize: 28, lineHeight: 1.45 }}>Financial and people operations in one connected product family.</div>
      </div>
    </div>,
    size,
  );
}
