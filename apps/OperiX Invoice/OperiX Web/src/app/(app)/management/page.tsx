"use client";

import Link from "next/link";
import { Building2, FileSignature, PackageOpen, ReceiptText, Store, Users } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";

const modules=[
  {href:"/customers",label:"Customers",text:"Customer records and ledgers",icon:Users,permission:"customer.view"},
  {href:"/vendors",label:"Vendors",text:"Suppliers and outgoing activity",icon:Store,permission:"expense.view_own"},
  {href:"/supplier-bills",label:"Supplier Bills",text:"Incoming bills and due dates",icon:ReceiptText,permission:"expense.view_own"},
  {href:"/vendor-payments",label:"Vendor Payments",text:"Payments to suppliers",icon:Building2,permission:"expense.view_own"},
  {href:"/contracts",label:"Contracts",text:"Agreements and signatures",icon:FileSignature,permission:"contracts.manage"},
  {href:"/inventory",label:"Inventory",text:"Products, services and stock",icon:PackageOpen,permission:"inventory.view"},
];

export default function ManagementPage(){
  const workspace = useWorkspace();
  const visibleModules = modules.filter((item) => workspace.can(item.permission));
  return <div className="p-4 lg:p-6 max-w-[1400px] mx-auto"><h1 className="page-title">Management</h1><p className="muted text-xs mt-1.5">Customers, suppliers, contracts and inventory.</p><div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{visibleModules.map(item=>{const Icon=item.icon;return <Link key={item.href} href={item.href} className="card p-5 hover:border-[#8cc2ff] hover:shadow-md transition"><span className="w-10 h-10 rounded-md bg-[#edf4ff] text-[#004ffe] grid place-items-center"><Icon size={20}/></span><h2 className="font-semibold mt-5">{item.label}</h2><p className="muted text-xs mt-1">{item.text}</p></Link>})}</div></div>;
}
