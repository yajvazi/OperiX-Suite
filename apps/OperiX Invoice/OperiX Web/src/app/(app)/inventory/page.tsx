import { redirect } from "next/navigation";

// Products and Inventory were the same page; keep old links working.
export default function InventoryPage() { redirect("/products"); }
