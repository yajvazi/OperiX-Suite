import { AppShell } from "@/components/app-shell";
import { OnboardingGate } from "@/components/onboarding-gate";
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return <AppShell><OnboardingGate />{children}</AppShell>; }
