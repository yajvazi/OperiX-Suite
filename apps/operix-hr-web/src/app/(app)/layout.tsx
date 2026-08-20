import { HrShell } from "@/components/hr-shell";
import { HrLocaleProvider } from "@/lib/i18n";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <HrLocaleProvider><HrShell>{children}</HrShell></HrLocaleProvider>;
}
