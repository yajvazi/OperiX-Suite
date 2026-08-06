import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins" });

export const metadata: Metadata = {
  title: { default: "OperiX Support", template: "%s · OperiX Support" },
  description: "Centralized support operations for the OperiX ecosystem.",
  applicationName: "OperiX Support",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#004FFE" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${poppins.variable} antialiased`}>{children}</body></html>;
}
