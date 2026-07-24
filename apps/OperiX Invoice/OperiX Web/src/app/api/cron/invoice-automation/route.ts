import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET; const authorization=request.headers.get("authorization"); if(!secret||authorization!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
  const supabase=await createClient(); if(!supabase)return NextResponse.json({error:"Supabase is not configured."},{status:503});
  const today=new Date().toISOString().slice(0,10); const {data:due,error}=await supabase.from("invoice_reminders").select("id").eq("status","scheduled").lte("scheduled_for",today); if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true,scheduledReminders:due?.length||0,message:"Reminder queue is ready for your email provider. Recurring generation and email delivery require a server-side worker."});
}
