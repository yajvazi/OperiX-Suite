import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processBookingInvoiceJobs } from "@/lib/booking-invoice-automation";

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET; const authorization=request.headers.get("authorization"); if(!secret||authorization!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
  const supabase=await createClient(); if(!supabase)return NextResponse.json({error:"Supabase is not configured."},{status:503});
  const today=new Date().toISOString().slice(0,10); const {data:due,error}=await supabase.from("invoice_reminders").select("id").eq("status","scheduled").lte("scheduled_for",today); if(error)return NextResponse.json({error:error.message},{status:500});
  let bookingInvoices = { claimed: 0, completed: 0, failed: 0 };
  try { bookingInvoices = await processBookingInvoiceJobs(25); } catch (workerError) { console.error("Booking invoice automation cron failed", workerError instanceof Error ? workerError.message : "unknown error"); }
  return NextResponse.json({ok:true,scheduledReminders:due?.length||0,bookingInvoices,message:"Reminder queue is ready for your email provider. Booking invoice automation is processed from the durable server-side queue."});
}
