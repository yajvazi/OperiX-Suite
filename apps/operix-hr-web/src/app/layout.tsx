import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: { default: "OperiX HR", template: "%s · OperiX HR" },
  description: "People operations for the OperiX Suite.",
  applicationName: "OperiX HR",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#004FFE" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
