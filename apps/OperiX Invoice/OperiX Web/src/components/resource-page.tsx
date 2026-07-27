"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { useBusinessData } from "@/hooks/use-business-data";
import { createClient } from "@/lib/supabase/client";
import { resourceConfigs } from "@/lib/resource-config";
import { statusClass } from "@/lib/format";
import { useWorkspace } from "@/hooks/use-workspace";
import { PortalLinksView } from "@/components/portal-links-view";

export function ResourcePage({ resourceKey, title, description, embedded = false }: { resourceKey: string; title?: string; description?: string; embedded?: boolean }) {
  const baseConfig = resourceConfigs[resourceKey];
  const config = { ...baseConfig, title: title || baseConfig.title, description: description || baseConfig.description };
  const { data, loading, error, refresh, setData } = useBusinessData<Record<string,unknown> & {id:string}>(config.table, config.select);
  const workspace=useWorkspace();
  const [query,setQuery]=useState(""); const [modal,setModal]=useState(false); const [saving,setSaving]=useState(false); const [message,setMessage]=useState("");
  const [exporting,setExporting]=useState(false);
  const [editing,setEditing]=useState<(Record<string,unknown>&{id:string})|null>(null);
  const [relationOptions,setRelationOptions]=useState<Record<string,Array<{id:string;label:string}>>>({});
  useEffect(()=>{const supabase=createClient();if(!supabase)return;const relations=config.fields.filter(field=>field.relation);if(!relations.length)return;void Promise.all(relations.map(async field=>{const relation=field.relation!;const {data:options}=await supabase.from(relation.table).select(`id,${relation.label}`).order(relation.label);const rows=(options||[]) as unknown as Array<Record<string,unknown>>;return [field.key,rows.map(option=>({id:String(option.id),label:String(option[relation.label]||"—")}))] as const;})).then(entries=>setRelationOptions(Object.fromEntries(entries)));},[config.fields]);
  const rows = useMemo(()=>data.filter((row)=>{
    const matchesType = !config.fixed?.type || !row.type || row.type===config.fixed.type;
    return matchesType && JSON.stringify(row).toLowerCase().includes(query.toLowerCase());
  }),[data,query,config.fixed]);

  async function save(formData:FormData) {
    setSaving(true); setMessage(""); const payload:Record<string,unknown>={...config.fixed};
    config.fields.forEach((field)=>{const value=formData.get(field.key);payload[field.key]=field.type==="number"?Number(value||0):field.relation&&!value?null:String(value||"");});
    const supabase=createClient();
    if (!supabase) { setMessage("Supabase is not configured."); setSaving(false); return; }
    const {data:{user}}=await supabase.auth.getUser(); if(!user){setMessage("Your session has expired.");setSaving(false);return;}
    const {data:profile}=await supabase.from("profiles").select("active_company_id,company_id").eq("id",user.id).maybeSingle();
    payload.user_id=user.id; payload.company_id=profile?.active_company_id||profile?.company_id||null;
    const result=editing?await supabase.from(config.table).update(payload).eq("id",editing.id).select().single():await supabase.from(config.table).insert(payload).select().single();
    if(result.error){setMessage(result.error.message);setSaving(false);return;} await refresh(); setSaving(false); setModal(false);
    setEditing(null);
    if(["payments","expenses"].includes(config.table)) window.open(`/transactions/preview?type=${config.fixed?.type||config.table}&id=${result.data.id}`,"_blank");
  }
  async function remove(id:string){ if(!confirm(`Delete this ${config.singular.toLowerCase()}?`))return; const supabase=createClient(); if(supabase){const result=await supabase.from(config.table).delete().eq("id",id);if(result.error){setMessage(result.error.message);return;}} setData((current)=>current.filter((row)=>row.id!==id)); }
  function exportCsv(){const csv=[config.columns.map(column=>column.label),...rows.map(row=>config.columns.map(column=>String(readValue(row,column.key)??"")))];const blob=new Blob([csv.map(line=>line.map(cell=>`"${cell.replaceAll("\"","\"\"")}"`).join(",")).join("\n")],{type:"text/csv"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`operix-${resourceKey}-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);}
  async function exportPdf(){
    setExporting(true);setMessage("");
    try {
      const source=workspace.company||workspace.profile;
      const supabase=createClient();
      let exportRows:Array<Record<string,unknown>>=rows;
      if(config.pdfTemplate==="sales-ledger"&&supabase){
        let query=supabase.from("invoices").select("*, client:clients(*)").order("issue_date",{ascending:true});
        if(workspace.companyId)query=query.eq("company_id",workspace.companyId);
        const result=await query;
        if(result.error)throw result.error;
        exportRows=(result.data||[]) as Array<Record<string,unknown>>;
      }
      if(config.pdfTemplate==="vendor-ledger"&&supabase){
        let query=supabase.from("supplier_bills").select("*, vendor:vendors(*)").order("issue_date",{ascending:true});
        if(workspace.companyId)query=query.eq("company_id",workspace.companyId);
        const result=await query;
        if(result.error)throw result.error;
        exportRows=(result.data||[]) as Array<Record<string,unknown>>;
      }
      const company={
        name:source?.company_name||workspace.company?.name||"",
        email:source?.email||"",phone:source?.phone||"",address:source?.address||"",
        city:workspace.company?.city||"",country:workspace.company?.country||"",
        website:source?.website||"",taxId:source?.tax_id||"",
        bankName:source?.bank_name||"",bankAccount:source?.bank_account||"",
        iban:source?.bank_iban||"",swift:source?.bank_swift||"",logoUrl:source?.logo_url||"",
      };
      const response=await fetch("/api/transactions/pdf",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({template:config.pdfTemplate,title:config.title,company,rows:exportRows})});
      if(!response.ok){const detail=await response.json().catch(()=>null);throw new Error(detail?.error||"The PDF could not be generated.");}
      const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`operix-${resourceKey}-${new Date().toISOString().slice(0,10)}.pdf`;link.click();URL.revokeObjectURL(url);
    } catch(error) {
      setMessage(error instanceof Error?error.message:"The PDF could not be generated.");
    } finally {setExporting(false);}
  }

  function closeModal(){setModal(false);setEditing(null);setMessage("");}
  const pdfExport=Boolean(config.pdfTemplate);
  return <div className={embedded ? "mt-8 border-t border-[#e4e9f0] pt-8" : "p-4 lg:p-6 max-w-[1700px] mx-auto"}><header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h1 className="page-title">{config.title}</h1><p className="muted text-xs mt-1.5">{config.description}</p></div><button className="btn btn-primary w-full shrink-0 justify-center whitespace-nowrap sm:w-auto" onClick={()=>{setEditing(null);setModal(true)}}><Plus size={17}/>New {config.singular}</button></header>
    <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"><label className="relative w-full sm:max-w-[330px]"><Search size={18} className="absolute left-3 top-3 text-[#98a2b3]"/><input value={query} onChange={(e)=>setQuery(e.target.value)} className="input pl-10" placeholder={`Search ${config.title.toLowerCase()}`}/></label><button className="btn w-full shrink-0 justify-center whitespace-nowrap sm:ml-auto sm:w-auto" onClick={pdfExport?exportPdf:exportCsv} disabled={exporting}><Download size={17}/>{exporting?"Preparing…":pdfExport?"Export PDF":"Export"}</button></div>
    {message&&<p className="mt-3 p-3 rounded bg-[#fff3f2] text-[#d92d20] text-xs">{message}</p>}{error&&<p className="mt-3 p-3 rounded bg-[#fff3f2] text-[#d92d20] text-xs">{error}</p>}
    <section className="card mt-4 overflow-hidden"><div className="table-wrap"><table className="data-table"><thead><tr>{config.columns.map((column)=><th key={column.key}>{column.label}</th>)}<th className="actions-column">Actions</th></tr></thead><tbody>{loading?Array.from({length:6}).map((_,i)=><tr key={i}>{config.columns.map((column)=><td key={column.key}><div className="skeleton h-4 rounded"/></td>)}<td className="actions-column"><div className="skeleton h-8 w-24 rounded"/></td></tr>):rows.length?rows.map((row)=><tr key={row.id}>{config.columns.map((column)=><td key={column.key} className={column.key===config.primary?"font-medium":""}>{column.key==="status"?<span className={statusClass(row[column.key])}>{String(row[column.key]??"draft")}</span>:column.render?column.render(row):String(row[column.key]??"—")}</td>)}<td className="actions-column"><div className="flex items-center gap-1"><button onClick={()=>{setEditing(row);setModal(true)}} className="p-2 rounded hover:bg-[#f7f9fc] text-xs flex items-center gap-1" title="Edit"><Edit3 size={14}/><span>Edit</span></button><button onClick={()=>remove(row.id)} className="p-2 rounded hover:bg-[#fff3f2] text-xs text-[#d92d20] flex items-center gap-1" title="Delete"><Trash2 size={14}/><span>Delete</span></button></div></td></tr>):<tr><td colSpan={config.columns.length+1} className="py-16 text-center muted">No records found. Create the first {config.singular.toLowerCase()}.</td></tr>}</tbody></table></div><footer className="px-5 py-4 border-t border-[#e4e9f0] text-xs muted">Showing {rows.length} records</footer></section>
    {resourceKey === "customers" && <PortalLinksView embedded />}
    {modal&&<div className="fixed inset-0 z-50 bg-[#061a38]/50 p-4 grid place-items-center" onMouseDown={closeModal}><section className="card shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onMouseDown={(e)=>e.stopPropagation()}><header className="p-5 border-b flex items-center"><div><h2 className="text-lg font-semibold">{editing?"Edit":"New"} {config.singular}</h2><p className="text-xs muted mt-1">Complete the details below.</p></div><button className="icon-btn ml-auto" onClick={closeModal}><X size={18}/></button></header><form action={save}><div className="p-5 grid sm:grid-cols-2 gap-4">{config.fields.map((field)=>{const defaultValue=editing?.[field.key]??field.defaultValue??"";return <label className={`field ${field.type==="textarea"?"sm:col-span-2":""}`} key={field.key}><span>{field.label}{field.required&&" *"}</span>{field.relation?<select className="select" name={field.key} required={field.required} defaultValue={String(defaultValue)}><option value="">Select {field.label.toLowerCase()}</option>{relationOptions[field.key]?.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>:field.type==="select"?<select className="select" name={field.key} required={field.required} defaultValue={String(defaultValue)}>{field.options?.map((option)=><option key={option}>{option}</option>)}</select>:field.type==="textarea"?<textarea className="textarea" name={field.key} defaultValue={String(defaultValue)}/>:<input className="input" name={field.key} type={field.type||"text"} step={field.type==="number"?"0.01":undefined} required={field.required} defaultValue={String(defaultValue)}/>}</label>})}</div>{message&&<p className="mx-5 text-xs text-[#d92d20]">{message}</p>}<footer className="p-5 border-t flex justify-end gap-2"><button className="btn" type="button" onClick={closeModal}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving?"Saving…":`${editing?"Update":"Save"} ${config.singular}`}</button></footer></form></section></div>}
  </div>;
}

function readValue(row:Record<string,unknown>,key:string){return key.split(".").reduce<unknown>((current,part)=>current&&typeof current==="object"?(current as Record<string,unknown>)[part]:undefined,row);}
function relationName(row:Record<string,unknown>,key:string){const relation=row[key];return relation&&typeof relation==="object"?String((relation as Record<string,unknown>).name||""):"";}
