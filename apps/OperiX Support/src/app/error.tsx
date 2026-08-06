"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-6"><section className="card w-full max-w-md p-8 text-center"><h1 className="text-xl font-semibold">Support is temporarily unavailable</h1><p className="muted mt-2 text-sm">Try again, or contact an OperiX administrator if the problem continues.</p><button className="btn btn-primary mt-6" onClick={reset}>Try again</button></section></main>;
}
