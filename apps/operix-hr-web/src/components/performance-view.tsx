"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Award, Flag, Plus, Star, Target, Users } from "lucide-react";
import { createPerformanceCycle, createPerformanceGoal, createPerformanceReview, listEmployees, listPerformanceCycles, listPerformanceGoals, listPerformanceReviews, subscribeToHrChanges, updatePerformanceGoal, updatePerformanceReview, updateSelfReview, type HrEmployee, type HrPerformanceCycle, type HrPerformanceGoal, type HrPerformanceReview } from "@invoice-monorepo/hr";
import { createClient } from "@/lib/supabase/client";
import { useHrWorkspace } from "@/lib/workspace";
import { Button, Card, EmptyState, ErrorState, FormMessage, LoadingBlock, Modal, PageHeader, Spinner, StatCard, StatusBadge } from "./ui";

type Tab = "cycles" | "reviews" | "goals";

export function PerformanceView() {
  const { workspace } = useHrWorkspace();
  const [tab, setTab] = useState<Tab>("reviews");
  const [cycles, setCycles] = useState<HrPerformanceCycle[]>([]);
  const [reviews, setReviews] = useState<HrPerformanceReview[]>([]);
  const [goals, setGoals] = useState<HrPerformanceGoal[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"cycle" | "review" | "goal" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [cycleForm, setCycleForm] = useState({ name: "", startsOn: new Date().toISOString().slice(0, 10), endsOn: "" });
  const [reviewForm, setReviewForm] = useState({ cycleId: "", employeeId: "" });
  const [goalForm, setGoalForm] = useState({ employeeId: "", cycleId: "", title: "", dueOn: "", description: "" });
  const [drafts, setDrafts] = useState<Record<string, { status: HrPerformanceReview["status"]; rating: string; feedback: string; selfReview: string }>>({});

  const refresh = useCallback(async () => {
    const client = createClient();
    if (!client || !workspace?.companyId) return;
    setLoading(true);
    try { const [cycleRows, reviewRows, goalRows, employeeRows] = await Promise.all([listPerformanceCycles(client, workspace.companyId), listPerformanceReviews(client, workspace.companyId), listPerformanceGoals(client, workspace.companyId), listEmployees(client, [workspace.companyId])]); setCycles(cycleRows); setReviews(reviewRows); setGoals(goalRows); setEmployees(employeeRows); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load performance data."); }
    finally { setLoading(false); }
  }, [workspace?.companyId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const client = createClient(); if (!client || !workspace?.companyId) return; return subscribeToHrChanges(client, workspace.companyId, () => { void refresh(); }); }, [refresh, workspace?.companyId]);

  const openCycles = cycles.filter((cycle) => cycle.status === "open").length;
  const completeReviews = reviews.filter((review) => review.status === "completed").length;
  const activeGoals = goals.filter((goal) => goal.status === "active").length;

  function open(kind: "cycle" | "review" | "goal") { setFormError(""); setMessage(""); setModal(kind); }
  function close() { if (!busy) setModal(null); }
  function draft(review: HrPerformanceReview) { return drafts[review.id] || { status: review.status, rating: review.rating?.toString() || "", feedback: review.manager_feedback || "", selfReview: review.self_review || "" }; }
  function setDraft(review: HrPerformanceReview, patch: Partial<ReturnType<typeof draft>>) { setDrafts((current) => ({ ...current, [review.id]: { ...draft(review), ...patch } })); }

  async function saveCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(""); const client = createClient();
    if (!client || !workspace?.companyId || !cycleForm.name.trim() || !cycleForm.endsOn) { setFormError("Name and dates are required."); return; }
    setBusy(true); try { await createPerformanceCycle(client, { companyId: workspace.companyId, name: cycleForm.name, startsOn: cycleForm.startsOn, endsOn: cycleForm.endsOn, status: "open" }); setModal(null); setMessage("Review cycle created."); await refresh(); } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to create the cycle."); } finally { setBusy(false); }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(""); const client = createClient();
    if (!client || !workspace?.companyId || !reviewForm.cycleId || !reviewForm.employeeId) { setFormError("Choose a cycle and employee."); return; }
    setBusy(true); try { await createPerformanceReview(client, { companyId: workspace.companyId, cycleId: reviewForm.cycleId, employeeId: reviewForm.employeeId, reviewerId: workspace.user?.id }); setModal(null); setMessage("Performance review created."); await refresh(); } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to create the review."); } finally { setBusy(false); }
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(""); const client = createClient();
    if (!client || !workspace?.companyId || !goalForm.employeeId || !goalForm.title.trim()) { setFormError("Employee and goal title are required."); return; }
    setBusy(true); try { await createPerformanceGoal(client, { companyId: workspace.companyId, employeeId: goalForm.employeeId, cycleId: goalForm.cycleId || undefined, title: goalForm.title, dueOn: goalForm.dueOn || undefined, description: goalForm.description }); setModal(null); setMessage("Goal created."); await refresh(); } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to create the goal."); } finally { setBusy(false); }
  }

  async function saveReviewDraft(review: HrPerformanceReview) {
    const client = createClient(); if (!client) return; const current = draft(review); setBusy(true);
    try { if (current.selfReview && review.employee?.id && employees.find((employee) => employee.id === review.employee?.id)?.user_id === workspace?.user?.id) await updateSelfReview(client, review.id, current.selfReview); else await updatePerformanceReview(client, review.id, { status: current.status, rating: current.rating ? Number(current.rating) : null, managerFeedback: current.feedback, completed: current.status === "completed" }); await refresh(); setMessage("Review saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the review."); }
    finally { setBusy(false); }
  }

  async function saveGoalStatus(goal: HrPerformanceGoal, status: HrPerformanceGoal["status"], progress: number) { const client = createClient(); if (!client) return; try { await updatePerformanceGoal(client, goal.id, { status, progress }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the goal."); } }

  const employeeName = (employeeId: string) => { const employee = employees.find((candidate) => candidate.id === employeeId); return employee ? `${employee.first_name} ${employee.last_name}` : "Employee"; };

  if (loading && !cycles.length && !reviews.length && !goals.length) return <><PageHeader title="Performance" description="Loading review cycles and goals…" /><Card><LoadingBlock lines={8} /></Card></>;
  if (error && !cycles.length && !reviews.length && !goals.length) return <><PageHeader title="Performance" description="Reviews, goals, and manager feedback." /><ErrorState message={error} onRetry={() => void refresh()} /></>;

  return <>
    <PageHeader title="Performance" description="Run review cycles, capture feedback, and track measurable goals." action={<><Button variant="secondary" onClick={() => open("goal")}><Target size={15} />New goal</Button><Button onClick={() => open("cycle")}><Plus size={15} />New cycle</Button></>} />
    {message ? <FormMessage message={message} tone="success" /> : null}{error ? <FormMessage message={error} /> : null}
    <div className="stat-grid"><StatCard label="Open cycles" value={openCycles} detail={`${cycles.length} total cycles`} icon={<Award size={16} />} tone="blue" /><StatCard label="Reviews" value={reviews.length} detail={`${completeReviews} completed`} icon={<Users size={16} />} tone="purple" /><StatCard label="Active goals" value={activeGoals} detail={`${goals.filter((goal) => goal.progress >= 75).length} near completion`} icon={<Target size={16} />} tone="green" /><StatCard label="Employees" value={employees.length} detail="Eligible for reviews" icon={<Star size={16} />} tone="amber" /><StatCard label="Average progress" value={goals.length ? `${Math.round(goals.reduce((sum, goal) => sum + goal.progress, 0) / goals.length)}%` : "—"} detail="Across active goals" icon={<Flag size={16} />} tone="blue" /></div>
    <Card><div className="filter-tabs"><button className={tab === "reviews" ? "filter-tab-active" : ""} onClick={() => setTab("reviews")} type="button">Reviews</button><button className={tab === "goals" ? "filter-tab-active" : ""} onClick={() => setTab("goals")} type="button">Goals</button><button className={tab === "cycles" ? "filter-tab-active" : ""} onClick={() => setTab("cycles")} type="button">Cycles</button></div></Card>
    {tab === "reviews" ? <Card title="Performance reviews" action={<Button variant="ghost" onClick={() => open("review")}><Plus size={14} />Add review</Button>}><div className="workflow-list">{reviews.map((review) => { const current = draft(review); const isSelf = review.employee?.id && employees.find((employee) => employee.id === review.employee?.id)?.user_id === workspace?.user?.id; return <article className="workflow-row" key={review.id}><div className="workflow-row-main"><strong>{review.employee ? `${review.employee.first_name} ${review.employee.last_name}` : "Employee"}</strong><span>{review.cycle?.name || "Review cycle"} · {review.employee?.job_title || "Role not set"}</span></div><div className="workflow-row-controls"><StatusBadge status={review.status} /><select className="select-control compact-control" value={current.status} onChange={(event) => setDraft(review, { status: event.target.value as HrPerformanceReview["status"] })} aria-label="Review status"><option value="self_review">Self review</option><option value="manager_review">Manager review</option><option value="completed">Completed</option></select><select className="select-control compact-control" value={current.rating} onChange={(event) => setDraft(review, { rating: event.target.value })} aria-label="Rating"><option value="">Rating</option><option value="1">1 · Needs improvement</option><option value="2">2 · Developing</option><option value="3">3 · Meets expectations</option><option value="4">4 · Exceeds expectations</option><option value="5">5 · Outstanding</option></select><button type="button" className="table-action" onClick={() => void saveReviewDraft(review)} disabled={busy}>Save</button></div>{isSelf ? <textarea className="workflow-textarea" value={current.selfReview} onChange={(event) => setDraft(review, { selfReview: event.target.value })} placeholder="Write your self-review…" /> : <textarea className="workflow-textarea" value={current.feedback} onChange={(event) => setDraft(review, { feedback: event.target.value })} placeholder="Manager feedback…" />}</article>; })}{!reviews.length ? <EmptyState icon={<Award size={18} />} title="No performance reviews" description="Create a review cycle and assign the first review." action={<Button onClick={() => open("review")}><Plus size={14} />Add review</Button>} /> : null}</div></Card> : null}
    {tab === "goals" ? <Card title="Goals" action={<Button variant="ghost" onClick={() => open("goal")}><Plus size={14} />New goal</Button>}><div className="workflow-list">{goals.map((goal) => <article className="workflow-row" key={goal.id}><div className="workflow-row-main"><strong>{goal.title}</strong><span>{employeeName(goal.employee_id)}{goal.due_on ? ` · Due ${goal.due_on}` : ""}</span>{goal.description ? <p>{goal.description}</p> : null}</div><div className="workflow-row-controls"><StatusBadge status={goal.status} /><label className="progress-control"><input type="range" min="0" max="100" value={goal.progress} onChange={(event) => void saveGoalStatus(goal, goal.status, Number(event.target.value))} /><span>{goal.progress}%</span></label><select className="select-control compact-control" value={goal.status} onChange={(event) => void saveGoalStatus(goal, event.target.value as HrPerformanceGoal["status"], goal.progress)} aria-label="Goal status"><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div></article>)}{!goals.length ? <EmptyState icon={<Target size={18} />} title="No goals yet" description="Add measurable goals to make progress visible." action={<Button onClick={() => open("goal")}><Plus size={14} />New goal</Button>} /> : null}</div></Card> : null}
    {tab === "cycles" ? <Card title="Review cycles" action={<Button variant="ghost" onClick={() => open("cycle")}><Plus size={14} />New cycle</Button>}><div className="workflow-list">{cycles.map((cycle) => <article className="workflow-row" key={cycle.id}><div className="workflow-row-main"><strong>{cycle.name}</strong><span>{cycle.starts_on} → {cycle.ends_on}</span></div><StatusBadge status={cycle.status} /></article>)}{!cycles.length ? <EmptyState icon={<Award size={18} />} title="No review cycles" description="Create a cycle for your next review period." action={<Button onClick={() => open("cycle")}><Plus size={14} />New cycle</Button>} /> : null}</div></Card> : null}
    <Modal open={modal === "cycle"} title="Create review cycle" onClose={close}><form onSubmit={saveCycle}><div className="form-grid"><label className="form-field full">Name <span className="required">*</span><input value={cycleForm.name} onChange={(event) => setCycleForm({ ...cycleForm, name: event.target.value })} placeholder="2026 mid-year review" required /></label><label className="form-field">Starts on<input type="date" value={cycleForm.startsOn} onChange={(event) => setCycleForm({ ...cycleForm, startsOn: event.target.value })} required /></label><label className="form-field">Ends on<input type="date" value={cycleForm.endsOn} onChange={(event) => setCycleForm({ ...cycleForm, endsOn: event.target.value })} required /></label></div>{formError ? <FormMessage message={formError} /> : null}<div className="form-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}Create cycle</Button></div></form></Modal>
    <Modal open={modal === "review"} title="Assign performance review" onClose={close}><form onSubmit={saveReview}><div className="form-grid"><label className="form-field full">Review cycle<select value={reviewForm.cycleId} onChange={(event) => setReviewForm({ ...reviewForm, cycleId: event.target.value })} required><option value="">Choose cycle</option>{cycles.filter((cycle) => cycle.status !== "closed").map((cycle) => <option value={cycle.id} key={cycle.id}>{cycle.name}</option>)}</select></label><label className="form-field full">Employee<select value={reviewForm.employeeId} onChange={(event) => setReviewForm({ ...reviewForm, employeeId: event.target.value })} required><option value="">Choose employee</option>{employees.filter((employee) => employee.status !== "terminated").map((employee) => <option value={employee.id} key={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select></label></div>{formError ? <FormMessage message={formError} /> : null}<div className="form-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}Assign review</Button></div></form></Modal>
    <Modal open={modal === "goal"} title="Create goal" onClose={close}><form onSubmit={saveGoal}><div className="form-grid"><label className="form-field full">Employee<select value={goalForm.employeeId} onChange={(event) => setGoalForm({ ...goalForm, employeeId: event.target.value })} required><option value="">Choose employee</option>{employees.filter((employee) => employee.status !== "terminated").map((employee) => <option value={employee.id} key={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select></label><label className="form-field full">Goal title <span className="required">*</span><input value={goalForm.title} onChange={(event) => setGoalForm({ ...goalForm, title: event.target.value })} required /></label><label className="form-field">Cycle<select value={goalForm.cycleId} onChange={(event) => setGoalForm({ ...goalForm, cycleId: event.target.value })}><option value="">No cycle</option>{cycles.map((cycle) => <option value={cycle.id} key={cycle.id}>{cycle.name}</option>)}</select></label><label className="form-field">Due on<input type="date" value={goalForm.dueOn} onChange={(event) => setGoalForm({ ...goalForm, dueOn: event.target.value })} /></label><label className="form-field full">Description<textarea value={goalForm.description} onChange={(event) => setGoalForm({ ...goalForm, description: event.target.value })} /></label></div>{formError ? <FormMessage message={formError} /> : null}<div className="form-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}Create goal</Button></div></form></Modal>
  </>;
}
