"use client";

import { Check, ChevronDown, ChevronRight, CircleAlert, Inbox, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { forwardRef, isValidElement, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ComponentType, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Tone = "blue" | "green" | "amber" | "red" | "slate";

function iconNode(icon: ReactNode | ComponentType<any>, size: number) {
  if (isValidElement(icon)) return icon;
  if (typeof icon === "function" || (typeof icon === "object" && icon !== null && "render" in icon)) {
    const IconComponent = icon as ComponentType<any>;
    return <IconComponent size={size} strokeWidth={2} />;
  }
  return icon;
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "ghost" | "danger" | "text";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", loading = false, disabled, children, className = "", ...props }, ref) {
  return <button ref={ref} className={`operix-button operix-button-${variant} operix-button-${size} ${className}`.trim()} disabled={disabled || loading} {...props}>{loading ? <Loader2 className="operix-spin" size={16} aria-hidden="true" /> : null}{children}</button>;
});

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" | "lg" };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, size = "md", className = "", children, ...props }, ref) {
  return <button ref={ref} type="button" aria-label={label} title={label} className={`operix-icon-button operix-icon-button-${size} ${className}`.trim()} {...props}>{children}</button>;
});

export function Card({ children, className = "", title, description, action, ...props }: HTMLAttributes<HTMLElement> & { title?: string; description?: string; action?: ReactNode }) {
  return <section className={`operix-card ${className}`.trim()} {...props}>{title || description || action ? <SectionHeader title={title || ""} description={description} action={action} /> : null}{children}</section>;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`operix-input ${className}`.trim()} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={`operix-textarea ${className}`.trim()} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = "", children, ...props }, ref) {
  return <span className="operix-select-wrap"><select ref={ref} className={`operix-select ${className}`.trim()} {...props}>{children}</select><ChevronDown size={15} aria-hidden="true" /></span>;
});

export function Checkbox({ label, description, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; description?: string }) {
  return <label className="operix-check-row"><input type="checkbox" {...props} /><span className="operix-check-control" aria-hidden="true"><Check size={13} /></span><span>{label ? <strong>{label}</strong> : null}{description ? <small>{description}</small> : null}</span></label>;
}

export function Radio({ label, description, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; description?: string }) {
  return <label className="operix-check-row"><input type="radio" {...props} /><span className="operix-radio-control" aria-hidden="true" /><span>{label ? <strong>{label}</strong> : null}{description ? <small>{description}</small> : null}</span></label>;
}

export function Switch({ checked, onChange, label, description, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label?: string; description?: string; disabled?: boolean }) {
  return <label className={`operix-switch-row ${disabled ? "is-disabled" : ""}`}><button type="button" role="switch" aria-checked={checked} disabled={disabled} className={`operix-switch ${checked ? "is-on" : ""}`} onClick={() => onChange(!checked)}><span /></button>{label ? <span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span> : null}</label>;
}

export function DatePicker(props: InputHTMLAttributes<HTMLInputElement>) { return <Input type="date" {...props} />; }

export function SearchInput({ value, onChange, placeholder = "Search", label, className = "" }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string; className?: string }) {
  return <label className={`operix-search-input ${className}`.trim()}><Search size={17} aria-hidden="true" /><span className="operix-sr-only">{label || placeholder}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />{value ? <IconButton label="Clear search" size="sm" onClick={() => onChange("")}><X size={14} /></IconButton> : null}</label>;
}

export function Badge({ children, tone = "slate", dot = true, className = "" }: { children: ReactNode; tone?: Tone | "purple"; dot?: boolean; className?: string }) {
  return <span className={`operix-badge operix-badge-${tone} ${className}`.trim()}>{dot ? <span className="operix-badge-dot" aria-hidden="true" /> : null}{children}</span>;
}

const statusTone: Record<string, Tone> = { paid: "green", active: "green", approved: "green", completed: "green", sent: "blue", pending: "amber", partial: "amber", overdue: "red", cancelled: "red", rejected: "red", failed: "red", draft: "slate", inactive: "slate", unpaid: "slate", terminated: "red", absent: "red", late: "amber", present: "green" };

export function StatusBadge({ status, label, payment }: { status?: string | null; label?: string; payment?: boolean }) {
  const normalized = String(status || "draft").toLowerCase();
  const text = label || normalized.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
  return <Badge tone={payment && normalized === "paid" ? "green" : statusTone[normalized] || "slate"}>{text}</Badge>;
}

export function Avatar({ initials, name, size = "md" }: { initials: string; name?: string; size?: "sm" | "md" | "lg" }) {
  return <span className={`operix-avatar operix-avatar-${size}`} aria-label={name} title={name}>{initials.slice(0, 2).toUpperCase()}</span>;
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) { return <span className="operix-tooltip" data-tooltip={label}>{children}</span>; }

export function Dropdown({ trigger, children, align = "start", open: controlledOpen, onOpenChange }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end"; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => { onOpenChange?.(value); if (controlledOpen === undefined) setInternalOpen(value); };
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => { if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown); document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  return <div ref={root} className="operix-dropdown"><button type="button" className="operix-dropdown-trigger" aria-expanded={open} onClick={() => setOpen(!open)}>{trigger}</button>{open ? <div className={`operix-dropdown-menu operix-dropdown-${align}`} role="menu">{children}</div> : null}</div>;
}

export function Tabs({ items, value, onChange }: { items: Array<{ value: string; label: string; disabled?: boolean }>; value: string; onChange: (value: string) => void }) {
  return <div className="operix-tabs" role="tablist">{items.map((item) => <button key={item.value} type="button" role="tab" aria-selected={item.value === value} disabled={item.disabled} className={item.value === value ? "is-active" : ""} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav className="operix-breadcrumbs" aria-label="Breadcrumb">{items.map((item, index) => <span key={`${item.label}-${index}`}>{index > 0 ? <ChevronRight size={13} aria-hidden="true" /> : null}{item.href ? <a href={item.href}>{item.label}</a> : <strong aria-current="page">{item.label}</strong>}</span>)}</nav>;
}

export function Divider({ className = "" }: { className?: string }) { return <hr className={`operix-divider ${className}`.trim()} />; }

export function Alert({ children, tone = "info", title }: { children: ReactNode; tone?: "info" | "success" | "warning" | "error"; title?: string }) {
  return <div className={`operix-alert operix-alert-${tone}`} role={tone === "error" ? "alert" : "status"}><CircleAlert size={18} aria-hidden="true" /><span>{title ? <strong>{title}</strong> : null}<span>{children}</span></span></div>;
}

export function Toast({ message, tone = "info", onClose }: { message: string; tone?: "info" | "success" | "warning" | "error"; onClose?: () => void }) {
  return <div className={`operix-toast operix-alert-${tone}`} role="status"><span>{message}</span>{onClose ? <IconButton label="Dismiss notification" size="sm" onClick={onClose}><X size={15} /></IconButton> : null}</div>;
}

export function Skeleton({ width = "100%", height = "14px", className = "" }: { width?: string | number; height?: string | number; className?: string }) { return <span className={`operix-skeleton ${className}`.trim()} style={{ width, height }} aria-hidden="true" />; }

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) { return <div className="operix-loading-skeleton" aria-label="Loading">{Array.from({ length: rows }, (_, index) => <Skeleton key={index} width={`${82 - index * 7}%`} />)}</div>; }

export function EmptyState({ title, description, action, actionLabel, actionHref, onAction, icon: Icon = Inbox, compact = false }: { title: string; description?: string; action?: ReactNode; actionLabel?: string; actionHref?: string; onAction?: () => void; icon?: ReactNode | ComponentType<{ size?: number }>; compact?: boolean }) {
  const iconContent = iconNode(Icon, 24);
  return <div className={`operix-state ${compact ? "is-compact" : ""}`}><span className="operix-state-icon">{iconContent}</span><h2>{title}</h2>{description ? <p>{description}</p> : null}{action || actionLabel ? <div className="operix-state-action">{action || (actionHref ? <a className="operix-button operix-button-primary operix-button-md" href={actionHref}>{actionLabel}</a> : <Button onClick={onAction}>{actionLabel}</Button>)}</div> : null}</div>;
}

export function ErrorState({ message, onRetry, title = "We couldn't load this yet" }: { message: string; onRetry?: () => void; title?: string }) { return <div className="operix-state operix-state-error"><span className="operix-state-icon"><CircleAlert size={24} /></span><h2>{title}</h2><p>{message}</p>{onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : null}</div>; }

export function Modal({ open, title, onClose, children, footer, labelledBy, wide = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; labelledBy?: string; wide?: boolean }) {
  const titleId = useId();
  useEffect(() => { if (!open) return undefined; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown); }, [open, onClose]);
  if (!open) return null;
  return <div className="operix-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`operix-modal ${wide ? "operix-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy || titleId}><header><h2 id={labelledBy || titleId}>{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></header><div className="operix-modal-body">{children}</div>{footer ? <footer>{footer}</footer> : null}</div></div>;
}

export function Drawer({ open, title, onClose, children, side = "right" }: { open: boolean; title: string; onClose: () => void; children: ReactNode; side?: "left" | "right" }) {
  if (!open) return null;
  return <div className="operix-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className={`operix-drawer operix-drawer-${side}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><IconButton label="Close drawer" onClick={onClose}><X size={18} /></IconButton></header><div className="operix-drawer-body">{children}</div></aside></div>;
}

export function ConfirmationDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel, loading = false }: { open: boolean; title: string; message: string; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void; loading?: boolean }) {
  return <Modal open={open} title={title} onClose={onCancel} footer={<><Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button><Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}><p className="operix-dialog-message">{message}</p></Modal>;
}

export function Pagination({ page, pages, onPrevious, onNext, label }: { page: number; pages: number; onPrevious: () => void; onNext: () => void; label?: string }) {
  return <nav className="operix-pagination" aria-label="Pagination"><span>{label || `Page ${page} of ${pages}`}</span><span><Button variant="secondary" size="sm" onClick={onPrevious} disabled={page <= 1}>Previous</Button><Button variant="secondary" size="sm" onClick={onNext} disabled={page >= pages}>Next</Button></span></nav>;
}

export function DataTable({ columns, rows, rowKey, empty }: { columns: Array<{ key: string; label: string; render?: (row: any) => ReactNode }>; rows: any[]; rowKey?: (row: any) => string; empty?: ReactNode }) {
  if (!rows.length && empty) return <div className="operix-table-empty">{empty}</div>;
  return <div className="operix-table-wrap"><table className="operix-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={rowKey?.(row) || row.id || index}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}

export function FilterBar({ children, search, actions }: { children?: ReactNode; search?: ReactNode; actions?: ReactNode }) { return <div className="operix-filter-bar"><div className="operix-filter-bar-main">{search}{children}</div>{actions ? <div className="operix-filter-bar-actions">{actions}</div> : null}</div>; }

export function OperixListPage({ title, description, eyebrow, actions, back, search, filters, children, pagination }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode; back?: ReactNode; search?: ReactNode; filters?: ReactNode; children: ReactNode; pagination?: ReactNode }) {
  return <div className="operix-page operix-list-page"><PageHeader title={title} description={description} eyebrow={eyebrow} actions={actions} back={back} /><FilterBar search={search} actions={filters} />{children}{pagination ? <div className="operix-list-page-pagination">{pagination}</div> : null}</div>;
}

export function OperixDetailPage({ title, description, eyebrow, actions, back, tabs, children }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode; back?: ReactNode; tabs?: ReactNode; children: ReactNode }) {
  return <div className="operix-page operix-detail-page"><PageHeader title={title} description={description} eyebrow={eyebrow} actions={actions} back={back} />{tabs ? <div className="operix-detail-page-tabs">{tabs}</div> : null}<div className="operix-detail-page-content">{children}</div></div>;
}

export function OperixFormPage({ title, description, eyebrow, actions, back, children }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode; back?: ReactNode; children: ReactNode }) {
  return <div className="operix-page operix-form-page"><PageHeader title={title} description={description} eyebrow={eyebrow} actions={actions} back={back} /><div className="operix-form-page-content">{children}</div></div>;
}

export function PageHeader({ title, description, subtitle, eyebrow, actions, action, back }: { title: string; description?: string; subtitle?: string; eyebrow?: string; actions?: ReactNode; action?: ReactNode; back?: ReactNode }) {
  const headerActions = actions || action;
  return <header className="operix-page-header">{back ? <div className="operix-page-header-back">{back}</div> : null}<div className="operix-page-header-copy">{eyebrow ? <span className="operix-eyebrow">{eyebrow}</span> : null}<h1>{title}</h1>{description || subtitle ? <p>{description || subtitle}</p> : null}</div>{headerActions ? <div className="operix-page-header-actions">{headerActions}</div> : null}</header>;
}

export function SectionHeader({ title, description, subtitle, action }: { title: string; description?: string; subtitle?: string; action?: ReactNode }) { return <div className="operix-section-header"><div><h2>{title}</h2>{description || subtitle ? <p>{description || subtitle}</p> : null}</div>{action ? <div className="operix-section-action">{action}</div> : null}</div>; }

export function StatCard({ label, value, detail, note, delta, trend, icon: Icon, tone = "blue", href }: { label: string; value: string | number; detail?: string; note?: string; delta?: string; trend?: "up" | "down"; icon?: ReactNode | ComponentType<{ size?: number; strokeWidth?: number }>; tone?: Tone | "purple"; href?: string }) {
  const iconContent = iconNode(Icon, 18);
  const content = <article className={`operix-stat-card operix-stat-${tone}`}>{iconContent ? <span className="operix-stat-icon">{iconContent}</span> : null}{delta ? <span className={`operix-stat-delta ${trend || ""}`}>{trend === "up" ? "↗" : trend === "down" ? "↘" : ""} {delta}</span> : null}<span className="operix-stat-label">{label}</span><strong>{value}</strong>{detail || note ? <small>{detail || note}</small> : null}</article>;
  return href ? <a href={href}>{content}</a> : content;
}

export function MetricCard(props: { label: string; value: string; note?: string; icon?: ReactNode | ComponentType<{ size?: number; strokeWidth?: number }>; tone?: Tone }) { return <StatCard {...props} />; }
export function SectionCard({ title, description, action, children, className = "" }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <Card title={title} description={description} action={action} className={className}>{children}</Card>; }
export function SearchField(props: { value: string; onChange: (value: string) => void; placeholder: string; label?: string }) { return <SearchInput {...props} />; }
export function FilterButton({ active = false, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) { return <Button variant={active ? "primary" : "secondary"} size="sm" onClick={onClick}><SlidersHorizontal size={16} aria-hidden="true" />{children}</Button>; }
export function MobileListCard({ href, icon: Icon, title, subtitle, meta, amount, status, children }: { href?: string; icon?: React.ComponentType<{ size?: number }>; title: string; subtitle?: string; meta?: string; amount?: string; status?: string; children?: ReactNode }) { const content = <><span className="operix-list-card-icon" aria-hidden="true">{Icon ? <Icon size={18} /> : <ChevronRight size={17} />}</span><span className="operix-list-card-main"><strong>{title}</strong>{subtitle ? <small>{subtitle}</small> : null}{meta ? <small>{meta}</small> : null}</span><span className="operix-list-card-side">{amount ? <strong>{amount}</strong> : null}{status ? <StatusBadge status={status} /> : null}{children}</span></>; return href ? <a className="operix-list-card" href={href}>{content}</a> : <article className="operix-list-card">{content}</article>; }
export function QuickAction({ label, icon: Icon, href, onClick }: { label: string; icon: ReactNode | ComponentType<{ size?: number }>; href?: string; onClick?: () => void }) { const iconContent = iconNode(Icon, 18); const content = <><span className="operix-quick-action-icon">{iconContent}</span><span>{label}</span><ChevronRight size={14} /></>; return href ? <a className="operix-quick-action" href={href}>{content}</a> : <button type="button" className="operix-quick-action" onClick={onClick}>{content}</button>; }
export function StickyMobileCTA({ children }: { children: ReactNode }) { return <div className="operix-sticky-mobile-cta">{children}</div>; }
export function Spinner() { return <Loader2 className="operix-spin" size={17} aria-label="Loading" />; }
