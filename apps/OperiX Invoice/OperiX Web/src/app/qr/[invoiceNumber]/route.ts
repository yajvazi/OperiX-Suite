import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request:Request,{params}:{params:Promise<{invoiceNumber:string}>}){
  const {invoiceNumber}=await params; const supabase=await createClient();
  if(!supabase)return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/qr/${invoiceNumber}`)}`,request.url));
  const {data,error}=await supabase.rpc("resolve_invoice_qr",{invoice_number_input:decodeURIComponent(invoiceNumber)});
  if(error||!data?.url)return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/qr/${invoiceNumber}`)}`,request.url));
  return NextResponse.redirect(new URL(data.url,request.url));
}
