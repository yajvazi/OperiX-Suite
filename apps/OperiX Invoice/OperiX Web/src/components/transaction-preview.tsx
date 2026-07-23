"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Brand } from "./brand";
import { money, shortDate } from "@/lib/format";

export function TransactionPreview(){
  const search=useSearchParams();
  const type=search.get("type")||"payments";
  const id=search.get("id");
  const [row,setRow]=useState<Record<string,unknown>|null>(null);
  const [error,setError]=useState("");
  const workspace=useWorkspace();
  useEffect(()=>{if(!id)return;const supabase=createClient();if(!supabase){queueMicrotask(()=>setError("Supabase is not configured."));return;}const table=type==="payments"?"payments":"expenses";void supabase.from(table).select("*").eq("id",id).single().then(({data,error:queryError})=>{if(queryError)setError(queryError.message);else setRow(data);});},[id,type]);
  const visibleError=!id?"Transaction ID is missing.":error;
  if(visibleError)return <main className="p-10"><p className="p-4 bg-[#fff3f2] text-[#d92d20] rounded">{visibleError}</p></main>;
  if(!row)return <main className="p-10"><div className="skeleton h-[700px] max-w-[794px] mx-auto rounded"/></main>;
  const isExpense=type==="expense"||row.type==="expense";
  const company=workspace.company||workspace.profile;
  return <div className="min-h-screen bg-[#edf1f6] p-4 sm:p-8"><div className="no-print max-w-[794px] mx-auto mb-4 flex justify-end gap-2"><button className="btn" onClick={()=>window.print()}><Printer size={16}/>Print</button><button className="btn btn-primary" onClick={()=>window.print()}><Download size={16}/>Save PDF</button></div><article className="bg-white w-full max-w-[794px] min-h-[1123px] mx-auto shadow p-12 flex flex-col"><header className="flex justify-between border-b-2 border-[#1261b3] pb-7"><Brand dark/><div className="text-right"><h1 className="text-2xl font-semibold">{isExpense?"EXPENSE VOUCHER":"PAYMENT RECEIPT"}</h1><p className="text-xs muted mt-2">{String(row.payment_number||`TX-${String(row.id).slice(0,8)}`)}</p></div></header><section className="mt-12 grid grid-cols-2 gap-12"><div><small className="muted">Company</small><h2 className="font-semibold mt-2">{company?.company_name||workspace.company?.name||"—"}</h2><p className="text-sm mt-2 leading-6">{company?.address}<br/>{workspace.company?.city} {workspace.company?.country}<br/>VAT: {company?.tax_id||"—"}</p></div><div><small className="muted">Transaction details</small><dl className="mt-2 grid gap-2 text-sm"><div className="flex"><dt>Date</dt><dd className="ml-auto">{shortDate(row.payment_date||row.date)}</dd></div><div className="flex"><dt>Method</dt><dd className="ml-auto capitalize">{String(row.payment_method||"—")}</dd></div><div className="flex"><dt>Category</dt><dd className="ml-auto">{String(row.category||"Payment")}</dd></div></dl></div></section><section className="mt-16 border-y border-[#e4e9f0] py-8"><small className="muted">Description</small><p className="mt-2">{String(row.description||row.notes||"—")}</p></section><div className="mt-12 ml-auto w-72 border-t-2 border-[#111827] pt-4 flex items-center"><strong className="text-lg">Total</strong><strong className="ml-auto text-2xl text-[#004ffe]">{money(row.amount)}</strong></div><section className="mt-auto grid grid-cols-2 gap-20 items-end"><div><p className="text-xs muted mb-10">Generated securely by OperiX Invoice.</p><div className="border-t pt-2 text-xs text-center">Prepared by</div></div><div><div className="h-16 text-[#1261b3] italic text-2xl text-center">Authorized</div><div className="border-t pt-2 text-xs text-center">Authorized signature</div></div></section><footer className="border-t-2 border-[#1261b3] mt-10 pt-4 text-xs flex justify-between"><span>{company?.email}</span><span>{company?.website}</span></footer></article></div>;
}
