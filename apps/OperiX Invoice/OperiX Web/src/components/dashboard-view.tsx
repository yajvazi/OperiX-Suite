"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Banknote, CircleCheck, CircleDollarSign, Clock3, FileText } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, statusClass } from "@/lib/format";
import type { ExpenseRow, InvoiceRow } from "@/lib/models";
import { useBusinessData } from "@/hooks/use-business-data";

interface MonthPoint { key:string; month:string; revenue:number; expenses:number }

function monthPoints(invoices:InvoiceRow[], expenses:ExpenseRow[]):MonthPoint[] {
  const formatter=new Intl.DateTimeFormat("en",{month:"short"});
  const now=new Date();
  const points=Array.from({length:12},(_,index)=>{
    const date=new Date(now.getFullYear(),now.getMonth()-11+index,1);
    return {key:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`,month:formatter.format(date),revenue:0,expenses:0};
  });
  const byMonth=new Map(points.map(point=>[point.key,point]));
  invoices.filter(row=>row.type!=="offer"&&row.status!=="cancelled").forEach(row=>{
    const point=byMonth.get(String(row.issue_date).slice(0,7));
    if(point)point.revenue+=Number(row.total_amount||0);
  });
  expenses.filter(row=>row.type!=="income").forEach(row=>{
    const point=byMonth.get(String(row.date).slice(0,7));
    if(point)point.expenses+=Number(row.amount||0);
  });
  expenses.filter(row=>row.type==="income").forEach(row=>{
    const point=byMonth.get(String(row.date).slice(0,7));
    if(point)point.revenue+=Number(row.amount||0);
  });
  return points;
}

export function DashboardView() {
  const [period,setPeriod]=useState<Period>("all");
  const invoicesQuery=useBusinessData<InvoiceRow>("invoices","*, client:clients(name)");
  const expensesQuery=useBusinessData<ExpenseRow>("expenses");
  const invoices=useMemo(()=>invoicesQuery.data.filter(row=>row.type!=="offer"&&inPeriod(row.issue_date,period)),[invoicesQuery.data,period]);
  const expensesQueryData=useMemo(()=>expensesQuery.data.filter(row=>inPeriod(row.date,period)),[expensesQuery.data,period]);
  const expenses=expensesQueryData.filter(row=>row.type!=="income");
  const total=invoices.filter(row=>row.status!=="cancelled").reduce((sum,row)=>sum+Number(row.total_amount||0),0);
  const paid=invoices.filter(row=>row.status==="paid").reduce((sum,row)=>sum+Number(row.total_amount||0),0);
  const overdue=invoices.filter(row=>row.status==="overdue").reduce((sum,row)=>sum+Number(row.total_amount||0),0);
  const expenseTotal=expenses.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const outstanding=Math.max(0,total-paid);
  const monthly=monthPoints(invoices,expensesQueryData);
  const expenseGroups=Array.from(expenses.reduce((map,row)=>{
    const key=row.category||"Other";
    map.set(key,(map.get(key)||0)+Number(row.amount||0));
    return map;
  },new Map<string,number>())).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,5);
  const loading=invoicesQuery.loading||expensesQuery.loading;
  const error=invoicesQuery.error||expensesQuery.error;

  return <div className="p-4 lg:p-6 xl:p-7 max-w-[1700px] mx-auto">
    <header className="mb-4 flex flex-wrap items-end gap-4"><div className="min-w-[220px] flex-1"><h1 className="page-title">Dashboard</h1><p className="muted mt-1.5 text-xs">Live data from your OperiX workspace.</p></div><div className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:w-auto lg:flex-row lg:items-center lg:gap-3"><div className="card flex min-w-0 flex-1 flex-nowrap items-center justify-between gap-1 overflow-x-auto p-1.5 sm:justify-center lg:flex-none" aria-label="Dashboard date filter">{periodOptions.map(option=><button key={option.value} onClick={()=>setPeriod(option.value)} className={`h-8 whitespace-nowrap rounded-md px-2 text-[10px] lg:px-3 lg:text-[11px] ${period===option.value?"bg-[#edf4ff] font-medium text-[#004ffe]":"muted hover:bg-[#f7f9fc]"}`}>{option.label}</button>)}</div><Link href="/invoices/new" className="btn btn-primary w-full shrink-0 justify-center whitespace-nowrap sm:w-auto"><FileText size={17}/>New Invoice</Link></div></header>
    {error?<p className="mb-4 p-3 rounded bg-[#fff3f2] text-[#d92d20] text-xs">{error}</p>:null}
    <section className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
      <Metric label="Total Revenue" value={money(total)} icon={CircleDollarSign}/><Metric label="Total Expenses" value={money(expenseTotal)} icon={Banknote}/><Metric label="Paid Invoices" value={money(paid)} icon={CircleCheck}/><Metric label="Outstanding" value={money(outstanding)} note={`${invoices.filter(i=>!["paid","cancelled"].includes(i.status)).length} invoices`} icon={Clock3}/><Metric label="Overdue" value={money(overdue)} note={`${invoices.filter(i=>i.status==="overdue").length} invoices`} danger icon={ArrowUpRight}/>
    </section>
    <section className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(330px,.7fr)] gap-4 mb-4">
      <div className="card p-5"><PanelHead title="Revenue Overview" link="/reports"/><div className="h-[290px] mt-4"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly}><defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#004FFE" stopOpacity={.18}/><stop offset="95%" stopColor="#004FFE" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf0f4" vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{fontSize:11,fill:"#7b8494"}}/><YAxis tickLine={false} axisLine={false} tick={{fontSize:11,fill:"#7b8494"}} tickFormatter={(value)=>`€${Number(value)/1000}k`}/><Tooltip formatter={(value)=>money(Number(value))}/><Area isAnimationActive={false} type="monotone" dataKey="revenue" stroke="#004FFE" strokeWidth={2.5} fill="url(#rev)"/></AreaChart></ResponsiveContainer></div></div>
      <div className="card p-5"><PanelHead title="Recent Invoices" link="/invoices"/><div className="mt-3 divide-y divide-[#edf0f4]">{loading?Array.from({length:5},(_,index)=><div key={index} className="skeleton h-12 my-2 rounded"/>):invoices.slice(0,6).map(invoice=><Link href={`/invoices/preview/${encodeURIComponent(invoice.invoice_number)}`} key={invoice.id} className="py-3 flex items-center gap-3 hover:bg-[#fbfcff]"><span className="w-8 h-8 rounded-md bg-[#edf4ff] text-[#004ffe] grid place-items-center"><FileText size={15}/></span><span className="min-w-0"><strong className="block text-[12px] truncate">{invoice.invoice_number}</strong><small className="muted text-[10px]">{invoice.client?.name||"—"}</small></span><span className="ml-auto text-right"><strong className="block text-[12px]">{money(invoice.total_amount)}</strong><small className={statusClass(invoice.status)}>{invoice.status}</small></span></Link>)}{!loading&&!invoices.length?<p className="muted text-xs py-10 text-center">No invoices yet.</p>:null}</div></div>
    </section>
    <section className="grid lg:grid-cols-2 gap-4">
      <div className="card p-5"><PanelHead title="Top Expenses" link="/expenses"/><div className="h-[240px] mt-2 grid grid-cols-[1fr_1fr] items-center">{expenseGroups.length?<><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={expenseGroups} dataKey="value" innerRadius={58} outerRadius={88} paddingAngle={2}>{expenseGroups.map((_,index)=><Cell key={index} fill={["#004FFE","#6d5dfc","#06b6d4","#f59e0b","#8cc2ff"][index]}/>)}</Pie><Tooltip formatter={(value)=>money(Number(value))}/></PieChart></ResponsiveContainer><div className="grid gap-3">{expenseGroups.map((item,index)=><div key={item.name} className="flex items-center text-xs"><span className="w-2.5 h-2.5 rounded-full mr-2" style={{background:["#004FFE","#6d5dfc","#06b6d4","#f59e0b","#8cc2ff"][index]}}/>{item.name}<strong className="ml-auto">{money(item.value)}</strong></div>)}</div></>:<p className="muted text-xs col-span-2 text-center">No expenses yet.</p>}</div></div>
      <div className="card p-5"><PanelHead title="Cash Flow" link="/reports"/><div className="h-[240px] mt-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid stroke="#edf0f4" vertical={false}/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fontSize:11}}/><Tooltip formatter={(value)=>money(Number(value))}/><Bar isAnimationActive={false} dataKey="revenue" fill="#12b76a" radius={[3,3,0,0]} maxBarSize={12}/><Bar isAnimationActive={false} dataKey="expenses" fill="#ef4444" radius={[3,3,0,0]} maxBarSize={12}/></BarChart></ResponsiveContainer></div></div>
    </section>
  </div>;
}

function Metric({label,value,note,danger,icon:Icon}:{label:string;value:string;note?:string;danger?:boolean;icon:typeof FileText}){return <article className="card p-4 min-h-[116px]"><div className="flex items-start justify-between"><span className="text-[11px] muted">{label}</span><span className={`w-8 h-8 rounded-md grid place-items-center ${danger?"bg-[#fff0ef] text-[#ef4444]":"bg-[#edf4ff] text-[#004ffe]"}`}><Icon size={17}/></span></div><strong className="text-xl block tracking-[-.03em] mt-1">{value}</strong>{note?<div className={`mt-2 text-[10px] ${danger?"text-[#ef4444]":"muted"}`}>{note}</div>:null}</article>}
function PanelHead({title,link}:{title:string;link:string}){return <div className="flex items-center"><h2 className="font-semibold text-[14px]">{title}</h2><Link href={link} className="ml-auto text-[#004ffe] text-[11px]">View all</Link></div>}

type Period="all"|"today"|"7d"|"30d"|"90d";
const periodOptions:Array<{value:Period;label:string}>=[{value:"all",label:"All time"},{value:"today",label:"Today"},{value:"7d",label:"7 days"},{value:"30d",label:"30 days"},{value:"90d",label:"90 days"}];
function inPeriod(value:string,period:Period){if(period==="all")return true;const day=new Date(value);const now=new Date();day.setHours(0,0,0,0);now.setHours(0,0,0,0);if(period==="today")return day.getTime()===now.getTime();const days=period==="7d"?7:period==="30d"?30:90;const start=new Date(now);start.setDate(start.getDate()-(days-1));return day>=start&&day<=now;}
