import { AppShell } from "@/components/app-shell";
import { MobileWebGate } from "@/components/mobile-web-gate";
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return <MobileWebGate><AppShell>{children}</AppShell></MobileWebGate>; }
