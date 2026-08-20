"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, ClipboardList, Mail, Plus, UserPlus, Users } from "lucide-react";
import { createApplication, createCandidate, createJobOpening, convertCandidateToEmployee, listApplications, listCandidates, listEmployees, listJobOpenings, subscribeToHrChanges, updateApplicationStage, type HrApplication, type HrCandidate, type HrEmployee, type HrJobOpening } from "@invoice-monorepo/hr";
import { createClient } from "@/lib/supabase/client";
import { useHrWorkspace } from "@/lib/workspace";
import { Button, Card, EmptyState, ErrorState, FormMessage, LoadingBlock, Modal, PageHeader, Spinner, StatusBadge, StatCard } from "./ui";

const stages: Array<{ id: HrApplication["stage"]; label: string }> = [
  { id: "applied", label: "Applied" }, { id: "screening", label: "Screening" },
  { id: "interview", label: "Interview" }, { id: "final_interview", label: "Final interview" },
  { id: "offer", label: "Offer" }, { id: "hired", label: "Hired" }, { id: "rejected", label: "Rejected" },
];

export function RecruitmentView() {
  const { workspace } = useHrWorkspace();
  const [openings, setOpenings] = useState<HrJobOpening[]>([]);
  const [candidates, setCandidates] = useState<HrCandidate[]>([]);
  const [applications, setApplications] = useState<HrApplication[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"opening" | "candidate" | "application" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [openingForm, setOpeningForm] = useState({ title: "", department: "", employmentType: "full_time", workLocation: "", openings: "1", description: "" });
  const [candidateForm, setCandidateForm] = useState({ firstName: "", lastName: "", email: "", phone: "", source: "", notes: "" });
  const [applicationForm, setApplicationForm] = useState({ candidateId: "", jobOpeningId: "" });

  const refresh = useCallback(async () => {
    const client = createClient();
    if (!client || !workspace?.companyId) return;
    setLoading(true);
    try {
      const [openingRows, candidateRows, applicationRows, employeeRows] = await Promise.all([
        listJobOpenings(client, workspace.companyId), listCandidates(client, workspace.companyId),
        listApplications(client, workspace.companyId), listEmployees(client, [workspace.companyId]),
      ]);
      setOpenings(openingRows); setCandidates(candidateRows); setApplications(applicationRows); setEmployees(employeeRows); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load recruitment data."); }
    finally { setLoading(false); }
  }, [workspace?.companyId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const client = createClient();
    if (!client || !workspace?.companyId) return;
    return subscribeToHrChanges(client, workspace.companyId, () => { void refresh(); });
  }, [refresh, workspace?.companyId]);

  const openCount = openings.filter((opening) => opening.status === "open").length;
  const hiredCount = applications.filter((application) => application.stage === "hired").length;
  const pipeline = useMemo(() => Object.fromEntries(stages.map((stage) => [stage.id, applications.filter((application) => application.stage === stage.id)])) as Record<HrApplication["stage"], HrApplication[]>, [applications]);

  function open(kind: "opening" | "candidate" | "application") { setFormError(""); setMessage(""); setModal(kind); }
  function close() { if (!busy) setModal(null); }

  async function saveOpening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError("");
    const client = createClient();
    if (!client || !workspace?.companyId || !openingForm.title.trim()) { setFormError("A job title is required."); return; }
    setBusy(true);
    try { await createJobOpening(client, { companyId: workspace.companyId, title: openingForm.title, department: openingForm.department, employmentType: openingForm.employmentType, workLocation: openingForm.workLocation, openings: Number(openingForm.openings) || 1, description: openingForm.description, status: "open", openedOn: new Date().toISOString().slice(0, 10) }); setOpeningForm({ title: "", department: "", employmentType: "full_time", workLocation: "", openings: "1", description: "" }); setModal(null); setMessage("Job opening created."); await refresh(); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to create the opening."); }
    finally { setBusy(false); }
  }

  async function saveCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError("");
    const client = createClient();
    if (!client || !workspace?.companyId || !candidateForm.firstName.trim() || !candidateForm.lastName.trim()) { setFormError("First and last name are required."); return; }
    setBusy(true);
    try { await createCandidate(client, { companyId: workspace.companyId, ...candidateForm }); setCandidateForm({ firstName: "", lastName: "", email: "", phone: "", source: "", notes: "" }); setModal(null); setMessage("Candidate added."); await refresh(); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to add the candidate."); }
    finally { setBusy(false); }
  }

  async function saveApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError("");
    const client = createClient();
    if (!client || !workspace?.companyId || !applicationForm.candidateId || !applicationForm.jobOpeningId) { setFormError("Choose a candidate and opening."); return; }
    setBusy(true);
    try { await createApplication(client, { companyId: workspace.companyId, candidateId: applicationForm.candidateId, jobOpeningId: applicationForm.jobOpeningId }); setApplicationForm({ candidateId: "", jobOpeningId: "" }); setModal(null); setMessage("Application added to the pipeline."); await refresh(); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to create the application."); }
    finally { setBusy(false); }
  }

  async function moveApplication(application: HrApplication, stage: HrApplication["stage"]) {
    const client = createClient(); if (!client) return;
    try { await updateApplicationStage(client, application.id, stage); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the application."); }
  }

  async function hire(application: HrApplication) {
    const client = createClient(); if (!client) return;
    try { await convertCandidateToEmployee(client, application.id, application.job_opening?.title || undefined, application.job_opening?.department || undefined); setMessage("Candidate converted to an employee using the shared employee record."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to convert the candidate."); }
  }

  if (loading && !openings.length && !applications.length) return <><PageHeader title="Recruitment" description="Loading the hiring pipeline…" /><Card><LoadingBlock lines={8} /></Card></>;
  if (error && !openings.length && !applications.length) return <><PageHeader title="Recruitment" description="Openings, candidates, and applications." /><ErrorState message={error} onRetry={() => void refresh()} /></>;

  return <>
    <PageHeader title="Recruitment" description="Keep job openings, candidates, interviews, and hiring decisions in one workflow." action={<><Button variant="secondary" onClick={() => open("candidate")}><UserPlus size={15} />Candidate</Button><Button onClick={() => open("opening")}><Plus size={15} />New opening</Button></>} />
    {message ? <FormMessage message={message} tone="success" /> : null}{error ? <FormMessage message={error} /> : null}
    <div className="stat-grid"><StatCard label="Open positions" value={openCount} detail={`${openings.length} total openings`} icon={<BriefcaseBusiness size={16} />} tone="blue" /><StatCard label="Candidates" value={candidates.length} detail="In the talent pool" icon={<Users size={16} />} tone="purple" /><StatCard label="Applications" value={applications.length} detail="Across all openings" icon={<ClipboardList size={16} />} tone="amber" /><StatCard label="Hired" value={hiredCount} detail="Converted through workflow" icon={<CheckCircle2 size={16} />} tone="green" /><StatCard label="Employees" value={employees.length} detail="Current directory" icon={<Users size={16} />} tone="blue" /></div>
    <div className="dashboard-grid">
      <Card title="Application pipeline" action={<Button variant="ghost" onClick={() => open("application")}><Plus size={14} />Add application</Button>}><div className="pipeline-grid">{stages.slice(0, 6).map((stage) => <div className="pipeline-column" key={stage.id}><div className="pipeline-heading"><strong>{stage.label}</strong><span>{pipeline[stage.id].length}</span></div>{pipeline[stage.id].map((application) => { const candidate = application.candidate; return <article className="pipeline-card" key={application.id}><strong>{candidate ? `${candidate.first_name} ${candidate.last_name}` : "Candidate"}</strong><span>{candidate?.email || "No email"}</span><select className="select-control" value={application.stage} onChange={(event) => void moveApplication(application, event.target.value as HrApplication["stage"])} aria-label={`Move ${candidate?.first_name || "candidate"}`}><option value={application.stage}>{stage.label}</option>{stages.filter((other) => other.id !== application.stage).map((other) => <option value={other.id} key={other.id}>{other.label}</option>)}</select>{application.stage === "hired" && !application.hired_employee_id ? <button type="button" className="table-action" onClick={() => void hire(application)}>Convert to employee</button> : application.hired_employee_id ? <StatusBadge status="active" /> : null}</article>; })}{!pipeline[stage.id].length ? <span className="pipeline-empty">No applications</span> : null}</div>)}</div></Card>
      <div className="dashboard-column"><Card title="Openings"><div className="quick-list">{openings.filter((opening) => opening.status !== "closed").slice(0, 6).map((opening) => <div key={opening.id}><div><strong>{opening.title}</strong><span>{opening.department || "Organization-wide"} · {opening.openings} opening{opening.openings === 1 ? "" : "s"}</span></div><StatusBadge status={opening.status} /></div>)}{!openings.length ? <EmptyState icon={<BriefcaseBusiness size={18} />} title="No job openings" description="Create your first opening to start a pipeline." action={<Button onClick={() => open("opening")}><Plus size={14} />New opening</Button>} /> : null}</div></Card><Card title="Candidate directory"><div className="quick-list">{candidates.slice(0, 6).map((candidate) => <div key={candidate.id}><div><strong>{candidate.first_name} {candidate.last_name}</strong><span><Mail size={11} /> {candidate.email || "No email"}</span></div><span className="muted-inline">{candidate.source || "Direct"}</span></div>)}{!candidates.length ? <EmptyState icon={<Users size={18} />} title="No candidates yet" description="Add candidates as they enter your hiring process." action={<Button onClick={() => open("candidate")}><UserPlus size={14} />Add candidate</Button>} /> : null}</div></Card></div>
    </div>
    <Modal open={modal === "opening"} title="Create job opening" onClose={close} wide><form onSubmit={saveOpening}><div className="form-grid"><label className="form-field">Job title <span className="required">*</span><input value={openingForm.title} onChange={(event) => setOpeningForm({ ...openingForm, title: event.target.value })} required /></label><label className="form-field">Department<input value={openingForm.department} onChange={(event) => setOpeningForm({ ...openingForm, department: event.target.value })} /></label><label className="form-field">Employment type<select value={openingForm.employmentType} onChange={(event) => setOpeningForm({ ...openingForm, employmentType: event.target.value })}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></label><label className="form-field">Openings<input type="number" min="1" value={openingForm.openings} onChange={(event) => setOpeningForm({ ...openingForm, openings: event.target.value })} /></label><label className="form-field full">Work location<input value={openingForm.workLocation} onChange={(event) => setOpeningForm({ ...openingForm, workLocation: event.target.value })} placeholder="Pristina · Remote · Hybrid" /></label><label className="form-field full">Description<textarea value={openingForm.description} onChange={(event) => setOpeningForm({ ...openingForm, description: event.target.value })} /></label></div>{formError ? <FormMessage message={formError} /> : null}<div className="form-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}Create opening</Button></div></form></Modal>
    <Modal open={modal === "candidate"} title="Add candidate" onClose={close}><form onSubmit={saveCandidate}><div className="form-grid"><label className="form-field">First name <span className="required">*</span><input value={candidateForm.firstName} onChange={(event) => setCandidateForm({ ...candidateForm, firstName: event.target.value })} required /></label><label className="form-field">Last name <span className="required">*</span><input value={candidateForm.lastName} onChange={(event) => setCandidateForm({ ...candidateForm, lastName: event.target.value })} required /></label><label className="form-field">Email<input type="email" value={candidateForm.email} onChange={(event) => setCandidateForm({ ...candidateForm, email: event.target.value })} /></label><label className="form-field">Phone<input value={candidateForm.phone} onChange={(event) => setCandidateForm({ ...candidateForm, phone: event.target.value })} /></label><label className="form-field">Source<input value={candidateForm.source} onChange={(event) => setCandidateForm({ ...candidateForm, source: event.target.value })} placeholder="Referral, website, agency" /></label><label className="form-field full">Notes<textarea value={candidateForm.notes} onChange={(event) => setCandidateForm({ ...candidateForm, notes: event.target.value })} /></label></div>{formError ? <FormMessage message={formError} /> : null}<div className="form-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}Add candidate</Button></div></form></Modal>
    <Modal open={modal === "application"} title="Add application" onClose={close}><form onSubmit={saveApplication}><div className="form-grid"><label className="form-field full">Candidate<select value={applicationForm.candidateId} onChange={(event) => setApplicationForm({ ...applicationForm, candidateId: event.target.value })} required><option value="">Choose candidate</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.first_name} {candidate.last_name}</option>)}</select></label><label className="form-field full">Job opening<select value={applicationForm.jobOpeningId} onChange={(event) => setApplicationForm({ ...applicationForm, jobOpeningId: event.target.value })} required><option value="">Choose opening</option>{openings.filter((opening) => opening.status !== "closed").map((opening) => <option key={opening.id} value={opening.id}>{opening.title}</option>)}</select></label></div>{formError ? <FormMessage message={formError} /> : null}<div className="form-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}Add application</Button></div></form></Modal>
  </>;
}
