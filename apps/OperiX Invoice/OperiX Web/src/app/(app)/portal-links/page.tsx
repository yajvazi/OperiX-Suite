import type { Metadata } from "next";
import { PortalLinksView } from "@/components/portal-links-view";
export const metadata: Metadata = { title:"Customer Portal" };
export default function PortalLinksPage(){ return <PortalLinksView/>; }
