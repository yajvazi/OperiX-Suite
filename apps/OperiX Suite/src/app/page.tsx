"use client";

import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, LogIn, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

const copy = {
  en: {
    title: "A clearer way to run what comes next.",
    body: "We’re putting the finishing touches on OperiX Suite — connected tools for finance, people, bookings, workspace, and the teams behind them.",
    statusText: "Our connected suite is being prepared for launch.",
    ownerLogin: "Team Login",
    apps: "Explore the apps while we build",
    invoice: "OperiX Invoice",
    invoiceText: "Create invoices, manage payments, and keep your financial work moving.",
    hr: "OperiX HR Office",
    hrText: "Bring employee records, attendance, and payroll into one reliable workspace.",
    booking: "OperiX Booking",
    bookingText: "Manage appointments, availability, confirmations, and customer reservations.",
    desk: "OperiX Desk",
    deskText: "Reserve desks, meeting rooms, offices, and shared workspaces.",
    control: "OperiX Control",
    controlText: "Manage shared teams, settings, activity, and suite-wide insights from one place.",
    footer: "OperiX Suite is being built with care for growing businesses.",
  },
  al: {
    title: "Një mënyrë më e qartë për të drejtuar atë që vjen më pas.",
    body: "Po përfundojmë OperiX Suite — mjete të lidhura për financat, stafin, rezervimet, hapësirat dhe ekipet pas tyre.",
    statusText: "Suite jonë e lidhur po përgatitet për lançim.",
    ownerLogin: "Hyrja e ekipit",
    apps: "Eksploroni aplikacionet ndërsa ndërtojmë",
    invoice: "OperiX Invoice",
    invoiceText: "Krijoni fatura, menaxhoni pagesat dhe mbani financat në lëvizje.",
    hr: "OperiX HR Office",
    hrText: "Mbani stafin, vijueshmërinë dhe pagat në një hapësirë të besueshme.",
    booking: "OperiX Booking",
    bookingText: "Menaxhoni takimet, oraret, konfirmimet dhe rezervimet e klientëve.",
    desk: "OperiX Desk",
    deskText: "Rezervoni tavolina, salla takimesh, zyra dhe hapësira të përbashkëta.",
    control: "OperiX Control",
    controlText: "Menaxhoni ekipet, cilësimet, aktivitetin dhe pamjen e gjithë suite nga një vend.",
    footer: "OperiX Suite po ndërtohet me kujdes për bizneset në rritje.",
  },
} as const;

export default function HomePage() {
  const pathname = usePathname();
  const t = pathname.startsWith("/al") ? copy.al : copy.en;
  const prefix = pathname.startsWith("/al") ? "/al" : "/en";

  return (
    <section className="coming-soon-page" aria-labelledby="coming-soon-title">
      <div className="coming-soon-orb coming-soon-orb-one" />
      <div className="coming-soon-orb coming-soon-orb-two" />
      <div className="container coming-soon-container">
        <div className="coming-soon-content">
          <h1 id="coming-soon-title">{t.title}</h1>
          <p>{t.body}</p>
          <Link className="button coming-soon-owner-login" href={`/preview-login?next=${encodeURIComponent(`${prefix}/preview`)}`}>
            <LogIn aria-hidden="true" /> {t.ownerLogin}
          </Link>
        </div>

        <div className="coming-soon-apps" aria-label={t.apps}>
          <div className="coming-soon-apps-heading"><Sparkles aria-hidden="true" /><span>{t.apps}</span></div>
          <div className="coming-soon-app-grid">
            <article className="coming-soon-app-card">
              <div className="coming-soon-app-icon"><Image src="/brand/operix-xi-white.svg" width={38} height={38} alt="" aria-hidden="true" /></div>
              <div><h2>{t.invoice}</h2><p>{t.invoiceText}</p></div>
              <LockKeyhole aria-hidden="true" />
            </article>
            <article className="coming-soon-app-card">
              <div className="coming-soon-app-icon"><Image src="/brand/operix-xhr-white.svg" width={38} height={38} alt="" aria-hidden="true" /></div>
              <div><h2>{t.hr}</h2><p>{t.hrText}</p></div>
              <LockKeyhole aria-hidden="true" />
            </article>
            <article className="coming-soon-app-card">
              <div className="coming-soon-app-icon"><Image src="/brand/operix-xb-white.svg" width={38} height={38} alt="" aria-hidden="true" /></div>
              <div><h2>{t.booking}</h2><p>{t.bookingText}</p></div>
              <LockKeyhole aria-hidden="true" />
            </article>
            <article className="coming-soon-app-card">
              <div className="coming-soon-app-icon"><Image src="/brand/operix-xd-white.svg" width={38} height={38} alt="" aria-hidden="true" /></div>
              <div><h2>{t.desk}</h2><p>{t.deskText}</p></div>
              <LockKeyhole aria-hidden="true" />
            </article>
            <article className="coming-soon-app-card">
              <div className="coming-soon-app-icon"><Image src="/brand/operix-xc-white.svg" width={38} height={38} alt="" aria-hidden="true" /></div>
              <div><h2>{t.control}</h2><p>{t.controlText}</p></div>
              <LockKeyhole aria-hidden="true" />
            </article>
          </div>
        </div>

        <div className="coming-soon-footer"><span>{t.statusText}</span><span>{t.footer}</span></div>
      </div>
    </section>
  );
}
