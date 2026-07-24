import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request:Request){
  const supabase=await createClient(); if(!supabase)return NextResponse.json({error:"Supabase is not configured."},{status:503});
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const body=await request.json().catch(()=>({})); const invoiceId=String(body.invoiceId||""); if(!invoiceId)return NextResponse.json({error:"Invoice is required."},{status:400});
  const stripeKey=process.env.STRIPE_SECRET_KEY; if(!stripeKey)return NextResponse.json({error:"Online payments are not configured yet. Add STRIPE_SECRET_KEY to enable Stripe checkout."},{status:503});
  const {data:invoice,error}=await supabase.from("invoices").select("id,invoice_number,total_amount,client:clients(name,email)").eq("id",invoiceId).single(); if(error||!invoice)return NextResponse.json({error:error?.message||"Invoice not found."},{status:404});
  const amount=Math.round(Number(invoice.total_amount||0)*100); if(amount<=0)return NextResponse.json({error:"Invoice total must be greater than zero."},{status:400});
  const params=new URLSearchParams(); params.set("line_items[0][price_data][currency]","eur"); params.set("line_items[0][price_data][unit_amount]",String(amount)); params.set("line_items[0][price_data][product_data][name]",`OperiX Invoice ${invoice.invoice_number}`); params.set("line_items[0][quantity]","1"); params.set("after_completion[type]","redirect"); params.set("after_completion[redirect][url]",`${request.headers.get("origin")||"https://invoice.operixsuite.com"}/invoices/preview/${encodeURIComponent(invoice.invoice_number)}?paid=1`); params.set("metadata[invoice_id]",invoice.id); params.set("metadata[invoice_number]",invoice.invoice_number);
  const stripeResponse=await fetch("https://api.stripe.com/v1/payment_links",{method:"POST",headers:{Authorization:`Bearer ${stripeKey}`,"Content-Type":"application/x-www-form-urlencoded"},body:params}); const stripe=await stripeResponse.json(); if(!stripeResponse.ok)return NextResponse.json({error:stripe?.error?.message||"Stripe could not create the payment link."},{status:502});
  await supabase.from("payment_links").insert({user_id:user.id,invoice_id:invoice.id,provider:"stripe",external_id:stripe.id,url:stripe.url,amount:Number(invoice.total_amount),currency:"eur",status:"pending"});
  return NextResponse.json({url:stripe.url,id:stripe.id});
}
