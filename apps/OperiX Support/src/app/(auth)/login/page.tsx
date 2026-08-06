import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return <main className="grid min-h-screen place-items-center p-5"><section className="card w-full max-w-[420px] p-7 sm:p-9"><div className="mb-8"><div className="mb-4 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--blue)] text-lg font-bold text-white">O</span><div><strong className="block text-base">OperiX Support</strong><span className="muted text-xs">Central help desk</span></div></div><h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1><p className="muted mt-1 text-sm">Sign in with your OperiX account.</p></div><LoginForm /></section></main>;
}
