import type { Metadata } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title:"Customer Portal" };
export default function PortalLinksPage(){ redirect("/customers#portal"); }
