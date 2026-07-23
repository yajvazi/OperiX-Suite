import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: { default: "OperiX Invoice", template: "%s · OperiX Invoice" },
  description: "Smart invoicing and business management for modern teams.",
  applicationName: "OperiX Invoice",
  appleWebApp: { capable: true, title: "OperiX Invoice", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#004FFE",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} antialiased`}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
