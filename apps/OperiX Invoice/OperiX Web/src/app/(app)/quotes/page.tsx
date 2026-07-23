import type { Metadata } from "next";
import { InvoiceList } from "@/components/invoice-list";
export const metadata: Metadata = { title:"Quotes" };
export default function QuotesPage() { return <InvoiceList type="offer"/>; }
