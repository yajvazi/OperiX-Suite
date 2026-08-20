import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  generator: "OperiX Help Center",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={poppins.variable}><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
