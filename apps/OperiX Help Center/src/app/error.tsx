"use client";

import Link from "next/link";
import { RefreshCcw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="not-found-page"><p className="eyebrow">OperiX Help Center</p><h1>Something went wrong.</h1><p>Try loading the Help Center again.</p><div className="not-found-actions"><button type="button" className="button-primary" onClick={() => reset()}><RefreshCcw size={16} />Try again</button><Link className="button-secondary" href="/en">Go home</Link></div></main>;
}
