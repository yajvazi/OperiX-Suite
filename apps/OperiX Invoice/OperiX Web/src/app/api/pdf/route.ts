import { NextResponse } from "next/server";
import { z } from "zod";
import puppeteer from "puppeteer-core";
import { invoiceHtml } from "@/lib/invoice-html";
import type { InvoiceDraft } from "@/lib/models";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getInvoice } from "@invoice-monorepo/api/repositories";
import { hasWorkspacePermission, resolveWorkspace } from "@invoice-monorepo/api/workspace";

export const runtime="nodejs";
const item=z.object({id:z.string(),product_id:z.string().optional(),description:z.string(),quantity:z.number(),unit_price:z.number(),tax_rate:z.number(),tax_included:z.boolean().optional(),discount:z.number(),unit:z.string(),sku:z.string().optional(),image_url:z.string().optional()});
const draft=z.object({client_id:z.string(),invoice_number:z.string(),issue_date:z.string(),due_date:z.string(),payment_method:z.enum(["cash","bank","card","online_payment","cheque","other","customer_credit"]),amount_received:z.number(),notes:z.string().optional(),status:z.string(),currency:z.string().optional(),commercial_document_type:z.string().optional(),source_document_type:z.string().nullable().optional(),source_document_id:z.string().nullable().optional(),delivery_method:z.string().nullable().optional(),pickup_branch_id:z.string().nullable().optional(),delivery_details:z.string().optional(),discount_percent:z.number().optional(),show_product_pictures:z.boolean().optional(),show_stamp:z.boolean().optional(),show_signature:z.boolean().optional(),agent_name:z.string().optional(),branch_name:z.string().optional(),change_amount:z.number().optional(),payment_status:z.string().optional(),paper_size:z.string().optional(),buyer_signature_url:z.string().nullable().optional(),customer_signature_requested:z.boolean().optional(),customer_signature_status:z.string().optional(),customer_signature_name:z.string().nullable().optional(),customer_signed_at:z.string().nullable().optional(),qrReference:z.string().regex(/^[A-Fa-f0-9]{32,}$/).optional(),items:z.array(item)});
// Records read from the database carry nulls for empty columns; treat them as "not provided".
const stripNulls=(value:unknown):unknown=>Array.isArray(value)?value.map(stripNulls):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).filter(([,entry])=>entry!==null).map(([key,entry])=>[key,stripNulls(entry)])):value;
const bodySchema=z.preprocess(stripNulls,z.object({invoice_id:z.string().uuid().optional(),draft,client:z.record(z.string(),z.unknown()).optional(),company:z.record(z.string(),z.unknown()).optional(),config:z.record(z.string(),z.unknown()).optional(),receipt:z.boolean().default(false),template:z.enum(["corporate","thermal"]).default("corporate")}));
export async function POST(request:Request){
  const supabase=await createServerSupabaseClient();
  if(!supabase)return NextResponse.json({error:"PDF service is not configured."},{status:503});
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return NextResponse.json({error:"Authentication is required to generate a PDF."},{status:401});
  let workspace;
  try { workspace = await resolveWorkspace(supabase, user.id, { membershipOnly: true }); }
  catch (workspaceError) { return NextResponse.json({ error: workspaceError instanceof Error ? workspaceError.message : "Workspace unavailable." }, { status: 403 }); }

  let browser:Awaited<ReturnType<typeof puppeteer.launch>>|null=null;
  try{
    const payload=bodySchema.parse(await request.json());
    if (payload.invoice_id) {
      if (!hasWorkspacePermission(workspace, "invoice.view") && !hasWorkspacePermission(workspace, "financial.export")) {
        return NextResponse.json({ error: "Invoice view permission is required." }, { status: 403 });
      }
      const stored = await getInvoice(supabase, payload.invoice_id, { userId: user.id, companyIds: workspace.companyIds });
      if (!stored || String((stored as Record<string, unknown>).invoice_number || "") !== payload.draft.invoice_number) {
        return NextResponse.json({ error: "The invoice is not available in this workspace." }, { status: 403 });
      }
    } else if (!hasWorkspacePermission(workspace, "invoice.create") && !hasWorkspacePermission(workspace, "financial.export")) {
      return NextResponse.json({ error: "Invoice creation permission is required for draft PDFs." }, { status: 403 });
    }
    if(payload.draft.qrReference){
      const {data:sourceInvoice,error:sourceError}=await supabase.from("invoices").select("invoice_number").eq("public_qr_token",payload.draft.qrReference).eq("invoice_number",payload.draft.invoice_number).maybeSingle();
      if(sourceError||!sourceInvoice||sourceInvoice.invoice_number!==payload.draft.invoice_number){
        return NextResponse.json({error:"The invoice is not available for this account."},{status:403});
      }
    }
    const isThermal=payload.receipt||payload.template==="thermal";
    const executablePath=process.env.CHROME_EXECUTABLE_PATH||"/usr/bin/chromium";
    browser=await puppeteer.launch({executablePath,args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-crash-reporter","--disable-breakpad"],headless:true});
    const page=await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request",(puppeteerRequest)=>{
      try{
        const url=new URL(puppeteerRequest.url());
        const allowed=url.protocol==="data:"||url.protocol==="about:"||url.hostname==="api.qrserver.com";
        if(allowed)puppeteerRequest.continue();else puppeteerRequest.abort();
      }catch{puppeteerRequest.abort();}
    });
    await page.setContent(invoiceHtml(payload.draft as unknown as InvoiceDraft,payload.client as never,isThermal,payload.company||{},payload.config as never),{waitUntil:"networkidle0"});
    const pdf=isThermal?await page.pdf({width:"50mm",height:`${Math.ceil(await page.evaluate(()=>document.documentElement.scrollHeight))}px`,printBackground:true,preferCSSPageSize:false}):await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true});
    const safeFilename=payload.draft.invoice_number.replace(/[^a-zA-Z0-9._-]/g,"_");
    return new NextResponse(Buffer.from(pdf),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${safeFilename}.pdf"`,"cache-control":"private, no-store"}});
  }catch(error){
    console.error("PDF generation failed",error instanceof Error?error.message:"unknown error");
    return NextResponse.json({error:"PDF generation failed."},{status:error instanceof z.ZodError?400:500});
  }finally{
    if(browser)await browser.close().catch(()=>undefined);
  }
}
