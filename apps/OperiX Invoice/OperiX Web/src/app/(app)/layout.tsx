import { AppShell } from "@/components/app-shell";
import { OnboardingGate } from "@/components/onboarding-gate";
import { PaywallGate } from "@/components/paywall-gate";
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return <AppShell><OnboardingGate /><PaywallGate>{children}</PaywallGate></AppShell>; }
