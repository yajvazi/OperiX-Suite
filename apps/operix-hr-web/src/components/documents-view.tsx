"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, LockKeyhole, Upload } from "lucide-react";
import { listEmployeeDocuments, type HrDocument } from "@invoice-monorepo/hr";
import { createClient } from "@/lib/supabase/client";
import { useHrSnapshot } from "@/lib/hr-hooks";
import { Card, EmptyState, ErrorState, FormMessage, LoadingBlock, PageHeader, StatusBadge, Spinner } from "./ui";

type DocumentRow = HrDocument;

export function DocumentsView() {
  const query = useHrSnapshot();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState("other");

  const load = useCallback(async () => {
    const client = createClient();
    if (!client || !query.workspace?.companyId) return;
    setLoading(true); setError("");
    try { setDocuments(await listEmployeeDocuments(client, query.workspace.companyIds)); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load documents."); }
    setLoading(false);
  }, [query.workspace?.companyId, query.workspace?.companyIds]);
  useEffect(() => { void load(); }, [load]);
  const employees = query.data?.employees || [];
  const selectedEmployeeId = employeeId || query.data?.currentEmployee?.id || employees[0]?.id || "";
  const grouped = useMemo(() => documents, [documents]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const client = createClient();
    if (!file || !client || !query.workspace?.companyId || !selectedEmployeeId) return;
    if (file.size > 10 * 1024 * 1024) { setError("Files must be smaller than 10 MB."); return; }
    setUploading(true); setError(""); setMessage("");
    const path = `${query.workspace.companyId}/${selectedEmployeeId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const uploadResult = await client.storage.from("employee-documents").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadResult.error) { setError(uploadResult.error.message); setUploading(false); return; }
    const row = await client.from("employee_documents").insert({ company_id: query.workspace.companyId, employee_id: selectedEmployeeId, name: file.name, document_type: type, file_url: path }).select("id").single();
    if (row.error) { await client.storage.from("employee-documents").remove([path]); setError(row.error.message); } else { setMessage("Private document uploaded."); await load(); }
    setUploading(false); event.target.value = "";
  }

  async function download(document: DocumentRow) {
    const client = createClient(); if (!client) return;
    const result = await client.storage.from("employee-documents").createSignedUrl(document.file_url, 60);
    if (result.error) { setError(result.error.message); return; }
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (query.loading && !query.data) return <><PageHeader title="Documents" description="Loading private HR documents…" /><Card><LoadingBlock lines={10} /></Card></>;
  if (query.error && !query.data) return <><PageHeader title="Documents" description="Secure employee and HR documents." /><ErrorState message={query.error} onRetry={() => void query.refresh()} /></>;
  return <><PageHeader title="Documents" description="Private storage with signed access links and tenant-aware RLS." />{error ? <FormMessage message={error} /> : null}{message ? <FormMessage message={message} tone="success" /> : null}<Card className="document-upload-card"><div><h2>Upload a private document</h2><p>Files are stored in the existing private employee-documents bucket. Access is checked again when a signed link is created.</p></div><div className="document-upload-controls"><select className="select-control" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} aria-label="Employee"><option value="">{query.data?.currentEmployee ? "My documents" : "Select employee"}</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select><select className="select-control" value={type} onChange={(event) => setType(event.target.value)} aria-label="Document type"><option value="contract">Employment contract</option><option value="identification">ID document</option><option value="certificate">Certificate</option><option value="tax">Tax document</option><option value="other">Other</option></select><label className="button button-secondary upload-button"><Upload size={15} />{uploading ? <Spinner /> : "Choose file"}<input type="file" onChange={(event) => void upload(event)} disabled={uploading || !selectedEmployeeId} /></label></div></Card><Card title="Document archive" action={<span className="muted-inline"><LockKeyhole size={14} />Private</span>}>{loading ? <LoadingBlock lines={8} /> : grouped.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Document</th><th>Employee</th><th>Category</th><th>Uploaded</th><th>Expiry</th><th /></tr></thead><tbody>{grouped.map((document) => <tr key={document.id}><td><div className="employee-cell"><span className="document-icon"><FileText size={16} /></span><div><strong>{document.name}</strong><span>Signed URL only</span></div></div></td><td>{document.employee ? `${document.employee.first_name} ${document.employee.last_name}` : "Employee"}</td><td>{document.document_type || "Other"}</td><td>{document.uploaded_at ? new Date(document.uploaded_at).toLocaleDateString() : "—"}</td><td>{document.expiry_date ? <StatusBadge status={document.expiry_date < new Date().toISOString().slice(0, 10) ? "warning" : "active"} /> : "—"}</td><td><button type="button" className="table-action" onClick={() => void download(document)} aria-label={`Download ${document.name}`}><Download size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={<FileText size={19} />} title="No documents yet" description="Private employment documents will appear here when uploaded by an authorized HR user." />}</Card></>;
}
