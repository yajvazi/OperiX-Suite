"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Fades content in as it scrolls into view. Content stays visible without JavaScript or with reduced motion. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    node.dataset.reveal = "pending";
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { node.dataset.reveal = "shown"; observer.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`.trim()} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</div>;
}
