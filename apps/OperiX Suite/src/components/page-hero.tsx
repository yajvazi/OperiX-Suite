import type { ReactNode } from "react";
import { Reveal } from "./motion";

export function PageHero({
  title,
  description,
  children,
  centered = true,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  centered?: boolean;
}) {
  return (
    <section className={`page-hero ${centered ? "centered" : ""}`}>
      <div className="page-hero-glow" />
      <div className="container">
        <Reveal>
          <h1>{title}</h1>
          <p>{description}</p>
          {children}
        </Reveal>
      </div>
    </section>
  );
}
