import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "OperiX Suite - Business Management Platform",
  description: "Invoicing, HR, Scanning, and Time Tracking in one powerful platform. Streamline your business operations with OperiX.",
  keywords: ["invoicing", "HR management", "time tracking", "document scanning", "business software"],
  openGraph: {
    title: "OperiX Suite - Business Management Platform",
    description: "Invoicing, HR, Scanning, and Time Tracking in one powerful platform.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}





