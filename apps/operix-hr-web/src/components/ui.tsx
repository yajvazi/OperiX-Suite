"use client";

import { AlertCircle, CheckCircle2, Clock3, Info, Loader2, X } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Modal,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
} from "@invoice-monorepo/operix-ui";

export { Button, Card, EmptyState, ErrorState, LoadingSkeleton, Modal, PageHeader, SearchInput, StatCard, StatusBadge };

export function FormMessage({ message, tone = "error" }: { message: string; tone?: "error" | "success" | "info" }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return <div className={`operix-alert operix-alert-${tone}`} role={tone === "error" ? "alert" : "status"}><Icon size={17} />{message}</div>;
}

export function Spinner() { return <Loader2 className="operix-spin" size={17} aria-label="Loading" />; }

export function LoadingBlock({ lines = 3 }: { lines?: number }) {
  return <LoadingSkeleton rows={lines} />;
}

export function TimeStatus({ date }: { date?: string | null }) { return date ? <span className="operix-muted-inline"><Clock3 size={14} />{new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : <span className="operix-muted-inline">—</span>; }

export function CloseButton({ onClick }: { onClick: () => void }) { return <button type="button" className="operix-icon-button" aria-label="Close" onClick={onClick}><X size={18} /></button>; }
