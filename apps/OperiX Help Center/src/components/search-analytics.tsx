"use client";

import { useEffect } from "react";
import { trackDocsEvent } from "../lib/analytics";

export function SearchAnalytics({ queryLength, resultCount }: { queryLength: number; resultCount: number }) {
  useEffect(() => {
    if (!queryLength) return;
    trackDocsEvent({ type: "search", queryLength, resultCount });
  }, [queryLength, resultCount]);
  return null;
}
