const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function safeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const parsed = new URL(value, "https://control.operixsuite.com");
    if (parsed.origin !== "https://control.operixsuite.com") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function safeExternalAppUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.endsWith(".operixsuite.com") && hostname !== "operixsuite.com" && !localHosts.has(hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
