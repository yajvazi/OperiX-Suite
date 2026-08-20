import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return <Suspense fallback={<div className="auth-loading">Loading sign in…</div>}><AuthForm /></Suspense>;
}
