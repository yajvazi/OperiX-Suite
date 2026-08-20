import { HrLocaleProvider } from "@/lib/i18n";
export default function AuthLayout({ children }: { children: React.ReactNode }) { return <HrLocaleProvider>{children}</HrLocaleProvider>; }
