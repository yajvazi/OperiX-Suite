"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={false}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Float({
  children,
  className,
  reverse = false,
}: {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      animate={reduced ? undefined : { y: reverse ? [0, 8, 0] : [0, -8, 0] }}
      transition={{ duration: reverse ? 6.5 : 5.5, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}
