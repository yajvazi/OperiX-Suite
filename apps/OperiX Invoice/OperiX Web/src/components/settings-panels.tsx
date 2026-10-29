"use client";

/* eslint-disable @next/next/no-img-element -- logos and stamps are data URLs supplied by the company */

import { useCallback, useEffect, useState } from "react";
import { Check, Monitor, Moon, Pencil, Plus, Sun, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listLocalResource, removeLocalResource, saveLocalResource } from "@/lib/local/resource";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTheme, type ThemePreference } from "./theme-provider";
import { deactivateCompanyBankAccount, listCompanyBankAccounts, saveCompanyBankAccount } from "@invoice-monorepo/api/repositories";

type Row = Record<string, unknown>;
const BRAND_COLORS = ["#004FFE", "#3388FF", "#8CC2FF", "#12B76A", "#06B6D4", "#F59E0B", "#EF4444", "#0D1B2A"];

function Heading({ title, text }: { title: string; text: string }) {
  return <div><h2 className="text-lg font-semibold">{title}</h2><p className="muted mt-1 text-xs">{text}</p></div>;
}

function Field({ label, value, onChange, type = "text", placeholder, disabled, wide }: { label: string; value: string | number | null | undefined; onChange: (value: string) => void; type?: string; placeholder?: string; disabled?: boolean; wide?: boolean }) {
  return <label className={`field ${wide ? "sm:col-span-2" : ""}`}><span>{label}</span><input className="input" type={type} value={value ?? ""} placeholder={placeholder} disabled={disabled} autoComplete="off" onChange={(event) => onChange(event.target.value)} /></label>;
}

function Notice({ message, ok }: { message: string; ok?: boolean }) {
  if (!message) return null;
  return <p className={`settings-notice mt-4 rounded-md p-3 text-xs ${ok ? "is-ok" : "is-error"}`} role="status">{message}</p>;
}

/** Theme (system / light / dark) and brand colour — mirrors the mobile "Appearance" section. */
export function AppearancePanel({ brandColor, onBrandColor }: { brandColor: string; onBrandColor: (value: string) => void }) {
  const { preference, setPreference } = useTheme();
  const modes: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
    { value: "system", label: "System", icon: Monitor }, { value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon },
  ];
  return <div>
    <Heading title="Appearance" text="Display mode and brand colour. The display mode is stored on this device." />
    <h3 className="mt-6 text-sm font-semibold">App theme</h3>
    <div className="settings-choice-row mt-3" role="radiogroup" aria-label="App theme">{modes.map(({ value, label, icon: Icon }) => <button type="button" role="radio" aria-checked={preference === value} key={value} className={`settings-choice ${preference === value ? "is-active" : ""}`} onClick={() => setPreference(value)}><Icon size={16} /> {label}</button>)}</div>
    <h3 className="mt-7 text-sm font-semibold">Brand colour</h3>
    <p className="muted mt-1 text-xs">Used on invoices and documents. Save to apply.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">{BRAND_COLORS.map((color) => <button type="button" key={color} aria-label={`Brand colour ${color}`} aria-pressed={brandColor.toLowerCase() === color.toLowerCase()} className={`settings-swatch ${brandColor.toLowerCase() === color.toLowerCase() ? "is-active" : ""}`} style={{ background: color }} onClick={() => onBrandColor(color)}>{brandColor.toLowerCase() === color.toLowerCase() ? <Check size={14} color="#fff" /> : null}</button>)}
      <input type="color" aria-label="Custom brand colour" className="h-9 w-12 rounded border p-1" value={/^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : "#004FFE"} onChange={(event) => onBrandColor(event.target.value)} /></div>
  </div>;
}

/** Company logo and stamp — same data-URL storage the mobile app uses. */
export function BrandingFields({ logo, stamp, onChange, disabled }: { logo: string; stamp: string; onChange: (key: "logo_url" | "stamp_url", value: string) => void; disabled?: boolean }) {
  function pick(key: "logo_url" | "stamp_url", file?: File) {
    if (!file) return;
    if (file.size > 1024 * 1024) { window.alert("Choose an image smaller than 1 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => onChange(key, String(reader.result || ""));
    reader.readAsDataURL(file);
  }
  const picker = (key: "logo_url" | "stamp_url", label: string, value: string, hint: string) => <div className="settings-asset">
    <span className="text-xs font-semibold">{label}</span>
    <div className="settings-asset-preview">{value ? <img src={value} alt={label} /> : <span className="muted text-xs">{hint}</span>}</div>
    <div className="flex gap-2"><label className={`btn ${disabled ? "opacity-50" : "cursor-pointer"}`}><Upload size={14} /> Upload<input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" disabled={disabled} onChange={(event) => pick(key, event.target.files?.[0])} /></label>{value ? <button type="button" className="btn" disabled={disabled} onClick={() => onChange(key, "")}><Trash2 size={14} /> Remove</button> : null}</div>
  </div>;
  return <div className="grid gap-5 sm:grid-cols-2">{picker("logo_url", "Company logo", logo, "PNG, JPG or SVG, up to 1 MB")}{picker("stamp_url", "Official stamp", stamp, "Printed over the signature line")}</div>;
}

/** First/last name, contact details and sign-in email/password. */
export function ProfileSecurityPanel() {
  const workspace = useWorkspace();
  const [profile, setProfile] = useState({ first_name: "", last_name: "", phone: "", address: "", website: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", ok: false });
  const [account, setAccount] = useState({ email: "", password: "", confirm: "" });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState({ text: "", ok: false });

  useEffect(() => {
    const source = (workspace.profile || {}) as Record<string, unknown>;
    queueMicrotask(() => {
      setProfile({ first_name: String(source.first_name || ""), last_name: String(source.last_name || ""), phone: String(source.phone || ""), address: String(source.address || ""), website: String(source.website || "") });
      setAccount((current) => ({ ...current, email: workspace.user?.email || current.email }));
    });
  }, [workspace.profile, workspace.user?.email]);

  async function saveProfile() {
    const supabase = createClient();
    if (!supabase || !workspace.user) return;
    setSaving(true); setMessage({ text: "", ok: false });
    const { error } = await supabase.from("profiles").update(profile).eq("id", workspace.user.id);
    if (error) setMessage({ text: error.message, ok: false });
    else { await workspace.refresh(); setMessage({ text: "Profile saved.", ok: true }); }
    setSaving(false);
  }

  async function saveAccount() {
    const supabase = createClient();
    if (!supabase || !workspace.user) return;
    const email = account.email.trim();
    const changes: { email?: string; password?: string } = {};
    if (email && email !== workspace.user.email) changes.email = email;
    if (account.password) {
      if (account.password.length < 8) { setAccountMessage({ text: "Use at least 8 characters for the password.", ok: false }); return; }
      if (account.password !== account.confirm) { setAccountMessage({ text: "The passwords do not match.", ok: false }); return; }
      changes.password = account.password;
    }
    if (!changes.email && !changes.password) { setAccountMessage({ text: "Nothing to change.", ok: false }); return; }
    setAccountSaving(true); setAccountMessage({ text: "", ok: false });
    const { error } = await supabase.auth.updateUser(changes);
    if (error) setAccountMessage({ text: error.message, ok: false });
    else { setAccount((current) => ({ ...current, password: "", confirm: "" })); setAccountMessage({ text: changes.email ? "Saved. Confirm the new email address from the message we sent to it." : "Password updated.", ok: true }); }
    setAccountSaving(false);
  }

  return <div>
    <Heading title="My profile & security" text="Your personal details and how you sign in. These are not company details." />
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Field label="First name" value={profile.first_name} onChange={(value) => setProfile({ ...profile, first_name: value })} />
      <Field label="Last name" value={profile.last_name} onChange={(value) => setProfile({ ...profile, last_name: value })} />
      <Field label="Phone" value={profile.phone} onChange={(value) => setProfile({ ...profile, phone: value })} type="tel" />
      <Field label="Website" value={profile.website} onChange={(value) => setProfile({ ...profile, website: value })} placeholder="www.example.com" />
      <Field label="Address" value={profile.address} onChange={(value) => setProfile({ ...profile, address: value })} wide />
    </div>
    <div className="mt-4 flex justify-end"><button type="button" className="btn btn-primary" disabled={saving || workspace.loading} onClick={() => void saveProfile()}>{saving ? "Saving…" : "Save profile"}</button></div>
    <Notice message={message.text} ok={message.ok} />
    <section className="settings-section mt-8 pt-6"><h3 className="text-sm font-semibold">Account security</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Sign-in email" type="email" value={account.email} onChange={(value) => setAccount({ ...account, email: value })} wide />
        <Field label="New password" type="password" value={account.password} onChange={(value) => setAccount({ ...account, password: value })} placeholder="Leave empty to keep the current one" />
        <Field label="Confirm password" type="password" value={account.confirm} onChange={(value) => setAccount({ ...account, confirm: value })} />
      </div>
      <div className="mt-4 flex justify-end"><button type="button" className="btn btn-primary" disabled={accountSaving} onClick={() => void saveAccount()}>{accountSaving ? "Saving…" : "Save account"}</button></div>
      <Notice message={accountMessage.text} ok={accountMessage.ok} />
    </section>
  </div>;
}

const emptyBranch = { code: "", name: "", registered_address: "", municipality: "" };
const emptyBank = { bank_name: "", account_name: "", account_number: "", iban: "", swift_bic: "", currency: "EUR", is_primary: false };

/** Branches and company bank accounts — the same records the mobile app manages. */
export function BranchesBanksPanel() {
  const workspace = useWorkspace();
  const canEdit = workspace.can("settings.company");
  const canEditBank = workspace.can("settings.bank");
  const companyId = workspace.companyId;
  const [branches, setBranches] = useState<Row[]>([]);
  const [banks, setBanks] = useState<Row[]>([]);
  const [branchForm, setBranchForm] = useState(emptyBranch);
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const [showBranch, setShowBranch] = useState(false);
  const [bankForm, setBankForm] = useState(emptyBank);
  const [editingBank, setEditingBank] = useState<string | null>(null);
  const [showBank, setShowBank] = useState(false);
  const [message, setMessage] = useState({ text: "", ok: false });

  const isLocal = workspace.storage === "local";
  const load = useCallback(async () => {
    if (isLocal) {
      setBranches((await listLocalResource("branches")).sort((a, b) => String(a.name).localeCompare(String(b.name))) as Row[]);
      setBanks((await listLocalResource("company_bank_accounts")) as Row[]);
      return;
    }
    const supabase = createClient();
    if (!supabase || !companyId) return;
    const [branchResult, bankRows] = await Promise.all([
      supabase.from("branches").select("id,code,name,registered_address,municipality,is_active,is_head_office").eq("company_id", companyId).order("name"),
      listCompanyBankAccounts(supabase, companyId).catch(() => [] as Row[]),
    ]);
    setBranches((branchResult.data || []) as Row[]);
    setBanks(bankRows);
  }, [companyId, isLocal]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function saveBranch() {
    if (isLocal) {
      if (!branchForm.code.trim() || !branchForm.name.trim()) { setMessage({ text: "Branch code and name are required.", ok: false }); return; }
      await saveLocalResource("branches", { code: branchForm.code.trim().toUpperCase(), name: branchForm.name.trim(), registered_address: branchForm.registered_address.trim() || null, municipality: branchForm.municipality.trim() || null, is_active: true }, editingBranch || undefined);
      setBranchForm(emptyBranch); setEditingBranch(null); setShowBranch(false); setMessage({ text: "Branch saved.", ok: true }); await load();
      return;
    }
    const supabase = createClient();
    if (!supabase || !companyId || !workspace.user) return;
    if (!canEdit) { setMessage({ text: "Company settings permission is required.", ok: false }); return; }
    if (!branchForm.code.trim() || !branchForm.name.trim()) { setMessage({ text: "Branch code and name are required.", ok: false }); return; }
    const payload = { company_id: companyId, code: branchForm.code.trim().toUpperCase(), name: branchForm.name.trim(), registered_address: branchForm.registered_address.trim() || null, municipality: branchForm.municipality.trim() || null, is_active: true };
    const { error } = editingBranch ? await supabase.from("branches").update(payload).eq("id", editingBranch) : await supabase.from("branches").insert({ ...payload, created_by: workspace.user.id });
    if (error) { setMessage({ text: error.message, ok: false }); return; }
    setBranchForm(emptyBranch); setEditingBranch(null); setShowBranch(false); setMessage({ text: "Branch saved.", ok: true }); await load();
  }

  async function toggleBranch(row: Row) {
    if (isLocal) { await saveLocalResource("branches", { is_active: row.is_active === false }, String(row.id)); await load(); return; }
    const supabase = createClient();
    if (!supabase || !canEdit) return;
    const { error } = await supabase.from("branches").update({ is_active: row.is_active === false }).eq("id", String(row.id));
    if (error) setMessage({ text: error.message, ok: false }); else await load();
  }

  async function saveBank() {
    if (isLocal) {
      if (!bankForm.bank_name.trim()) { setMessage({ text: "Bank name is required.", ok: false }); return; }
      const others = (await listLocalResource("company_bank_accounts")).filter((row) => row.id !== editingBank);
      if (bankForm.is_primary) for (const other of others) if (other.is_primary) await saveLocalResource("company_bank_accounts", { is_primary: false }, other.id);
      await saveLocalResource("company_bank_accounts", { ...bankForm, is_active: true, is_primary: bankForm.is_primary || !others.length }, editingBank || undefined);
      setBankForm(emptyBank); setEditingBank(null); setShowBank(false); setMessage({ text: "Bank account saved.", ok: true }); await load();
      return;
    }
    const supabase = createClient();
    if (!supabase || !companyId || !workspace.user) return;
    if (!canEditBank) { setMessage({ text: "Bank settings permission is required.", ok: false }); return; }
    if (!bankForm.bank_name.trim()) { setMessage({ text: "Bank name is required.", ok: false }); return; }
    try {
      await saveCompanyBankAccount(supabase, { company_id: companyId, ...bankForm, ...(editingBank ? { updated_by: workspace.user.id } : { created_by: workspace.user.id }) }, editingBank);
      setBankForm(emptyBank); setEditingBank(null); setShowBank(false); setMessage({ text: "Bank account saved.", ok: true }); await load();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "The bank account could not be saved.", ok: false }); }
  }

  async function removeBank(row: Row) {
    if (isLocal) { if (window.confirm(`Remove ${String(row.bank_name)}?`)) { await removeLocalResource("company_bank_accounts", String(row.id)); await load(); } return; }
    const supabase = createClient();
    if (!supabase || !companyId || !canEditBank || !window.confirm(`Remove ${String(row.bank_name)}?`)) return;
    try { await deactivateCompanyBankAccount(supabase, String(row.id), companyId); await load(); } catch (error) { setMessage({ text: error instanceof Error ? error.message : "The bank account could not be removed.", ok: false }); }
  }

  return <div>
    <Heading title="Branches & bank accounts" text="Locations used for stock, numbering and POS, and the accounts customers pay into." />
    <Notice message={message.text} ok={message.ok} />
    <section className="settings-section mt-6 pt-2">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Branches</h3>{canEdit ? <button type="button" className="btn" onClick={() => { setBranchForm(emptyBranch); setEditingBranch(null); setShowBranch(true); }}><Plus size={14} /> Add branch</button> : null}</div>
      {showBranch ? <div className="settings-subcard mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Code" value={branchForm.code} onChange={(value) => setBranchForm({ ...branchForm, code: value })} />
        <Field label="Name" value={branchForm.name} onChange={(value) => setBranchForm({ ...branchForm, name: value })} />
        <Field label="Address" value={branchForm.registered_address} onChange={(value) => setBranchForm({ ...branchForm, registered_address: value })} />
        <Field label="City / municipality" value={branchForm.municipality} onChange={(value) => setBranchForm({ ...branchForm, municipality: value })} />
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn" onClick={() => setShowBranch(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => void saveBranch()}>{editingBranch ? "Save branch" : "Add branch"}</button></div>
      </div> : null}
      <div className="settings-list mt-3">{branches.map((row) => <div className="settings-list-row" key={String(row.id)}><div className="min-w-0"><b className="text-sm">{String(row.name)}</b> <span className="muted text-xs">· {String(row.code)}{row.is_head_office ? " · Head office" : ""}{row.is_active === false ? " · Inactive" : ""}</span><p className="muted truncate text-xs">{[row.registered_address, row.municipality].filter(Boolean).map(String).join(", ") || "No address"}</p></div>{canEdit ? <div className="flex gap-2"><button type="button" className="btn" aria-label={`Edit ${String(row.name)}`} onClick={() => { setBranchForm({ code: String(row.code || ""), name: String(row.name || ""), registered_address: String(row.registered_address || ""), municipality: String(row.municipality || "") }); setEditingBranch(String(row.id)); setShowBranch(true); }}><Pencil size={14} /></button><button type="button" className="btn" onClick={() => void toggleBranch(row)}>{row.is_active === false ? "Activate" : "Deactivate"}</button></div> : null}</div>)}{!branches.length ? <p className="muted py-3 text-xs">No branches yet.</p> : null}</div>
    </section>
    <section className="settings-section mt-8 pt-6">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Bank accounts</h3>{canEditBank ? <button type="button" className="btn" onClick={() => { setBankForm(emptyBank); setEditingBank(null); setShowBank(true); }}><Plus size={14} /> Add bank account</button> : null}</div>
      {showBank ? <div className="settings-subcard mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Bank name *" value={bankForm.bank_name} onChange={(value) => setBankForm({ ...bankForm, bank_name: value })} />
        <Field label="Account name" value={bankForm.account_name} onChange={(value) => setBankForm({ ...bankForm, account_name: value })} />
        <Field label="Account number" value={bankForm.account_number} onChange={(value) => setBankForm({ ...bankForm, account_number: value })} />
        <Field label="IBAN" value={bankForm.iban} onChange={(value) => setBankForm({ ...bankForm, iban: value })} />
        <Field label="SWIFT / BIC" value={bankForm.swift_bic} onChange={(value) => setBankForm({ ...bankForm, swift_bic: value })} />
        <Field label="Currency" value={bankForm.currency} onChange={(value) => setBankForm({ ...bankForm, currency: value })} />
        <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={bankForm.is_primary} onChange={(event) => setBankForm({ ...bankForm, is_primary: event.target.checked })} /> Primary account (preselected on payments)</label>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn" onClick={() => setShowBank(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => void saveBank()}>{editingBank ? "Save account" : "Add account"}</button></div>
      </div> : null}
      <div className="settings-list mt-3">{banks.map((row) => { const owned = String(row.owner_company_id || row.company_id) === companyId && row.is_shared !== true; return <div className="settings-list-row" key={String(row.id)}><div className="min-w-0"><b className="text-sm">{String(row.bank_name)}</b> <span className="muted text-xs">· {String(row.currency || "EUR")}{row.is_primary ? " · Primary" : ""}{row.is_shared ? " · Shared with this company" : ""}</span><p className="muted truncate text-xs">{String(row.iban || row.account_number || "No account number")}</p></div>{canEditBank && owned ? <div className="flex gap-2"><button type="button" className="btn" aria-label={`Edit ${String(row.bank_name)}`} onClick={() => { setBankForm({ bank_name: String(row.bank_name || ""), account_name: String(row.account_name || ""), account_number: String(row.account_number || ""), iban: String(row.iban || ""), swift_bic: String(row.swift_bic || ""), currency: String(row.currency || "EUR"), is_primary: Boolean(row.is_primary) }); setEditingBank(String(row.id)); setShowBank(true); }}><Pencil size={14} /></button><button type="button" className="btn btn-danger" aria-label={`Remove ${String(row.bank_name)}`} onClick={() => void removeBank(row)}><Trash2 size={14} /></button></div> : null}</div>; })}{!banks.length ? <p className="muted py-3 text-xs">No bank accounts yet.</p> : null}</div>
    </section>
  </div>;
}

/** Company SMTP server used for sending documents by email. The password is write-only. */
export function EmailPanel() {
  const workspace = useWorkspace();
  const canEdit = workspace.can("settings.integrations");
  const [form, setForm] = useState({ smtp_host: "", smtp_port: "", smtp_user: "", smtp_from_email: "", smtp_secure: false, smtp_pass: "" });
  const [hasPassword, setHasPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", ok: false });

  useEffect(() => {
    const company = (workspace.company || {}) as unknown as Record<string, unknown>;
    queueMicrotask(() => {
      setForm((current) => ({ ...current, smtp_host: String(company.smtp_host || ""), smtp_port: company.smtp_port ? String(company.smtp_port) : "", smtp_user: String(company.smtp_user || ""), smtp_from_email: String(company.smtp_from_email || ""), smtp_secure: Boolean(company.smtp_secure), smtp_pass: "" }));
      setHasPassword(Boolean(company.smtp_pass));
    });
  }, [workspace.company]);

  async function save() {
    const supabase = createClient();
    if (!supabase || !workspace.companyId) return;
    if (!canEdit) { setMessage({ text: "Integration settings permission is required.", ok: false }); return; }
    const port = form.smtp_port.trim() ? Number(form.smtp_port) : null;
    if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) { setMessage({ text: "Enter a valid port number.", ok: false }); return; }
    const payload: Record<string, unknown> = { smtp_host: form.smtp_host.trim() || null, smtp_port: port, smtp_user: form.smtp_user.trim() || null, smtp_from_email: form.smtp_from_email.trim() || null, smtp_secure: form.smtp_secure };
    if (form.smtp_pass) payload.smtp_pass = form.smtp_pass;
    setSaving(true); setMessage({ text: "", ok: false });
    const { error } = await supabase.from("companies").update(payload).eq("id", workspace.companyId);
    if (error) setMessage({ text: error.message, ok: false });
    else { await workspace.refresh(); setMessage({ text: "Email settings saved.", ok: true }); }
    setSaving(false);
  }

  return <div>
    <Heading title="Email server (SMTP)" text="Used to send invoices and reminders from your own address. Leave empty to use your mail app." />
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Field label="SMTP host" value={form.smtp_host} disabled={!canEdit} placeholder="smtp.example.com" onChange={(value) => setForm({ ...form, smtp_host: value })} />
      <Field label="Port" value={form.smtp_port} disabled={!canEdit} placeholder="587" type="number" onChange={(value) => setForm({ ...form, smtp_port: value })} />
      <Field label="Username" value={form.smtp_user} disabled={!canEdit} onChange={(value) => setForm({ ...form, smtp_user: value })} />
      <Field label="Password" type="password" value={form.smtp_pass} disabled={!canEdit} placeholder={hasPassword ? "Saved — type to replace" : ""} onChange={(value) => setForm({ ...form, smtp_pass: value })} />
      <Field label="From email" type="email" value={form.smtp_from_email} disabled={!canEdit} onChange={(value) => setForm({ ...form, smtp_from_email: value })} />
      <label className="flex items-center gap-2 self-end pb-2 text-xs"><input type="checkbox" disabled={!canEdit} checked={form.smtp_secure} onChange={(event) => setForm({ ...form, smtp_secure: event.target.checked })} /> Use SSL/TLS (usually port 465)</label>
    </div>
    <div className="mt-5 flex justify-end"><button type="button" className="btn btn-primary" disabled={saving || !canEdit} onClick={() => void save()}>{saving ? "Saving…" : "Save email settings"}</button></div>
    <Notice message={message.text} ok={message.ok} />
  </div>;
}
