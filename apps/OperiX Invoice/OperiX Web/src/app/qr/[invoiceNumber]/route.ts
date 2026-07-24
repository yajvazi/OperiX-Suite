import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request:Request,{params}:{params:Promise<{invoiceNumber:string}>}){
  const {invoiceNumber}=await params; const supabase=await createClient(); const forwardedHost=request.headers.get("x-forwarded-host")||request.headers.get("host")||"invoice.operixsuite.com"; const forwardedProto=request.headers.get("x-forwarded-proto")||"https"; const origin=`${forwardedProto}://${forwardedHost}`;
  if(!supabase)return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/qr/${invoiceNumber}`)}`,origin));
  const {data,error}=await supabase.rpc("resolve_invoice_qr",{invoice_number_input:decodeURIComponent(invoiceNumber)});
  if(error||!data?.url)return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/qr/${invoiceNumber}`)}`,origin));
  return NextResponse.redirect(new URL(data.url,origin));
}
