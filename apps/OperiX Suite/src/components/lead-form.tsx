"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { FormEvent, useState } from "react";

export function LeadForm({ kind }: { kind: "contact" | "demo" }) {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (kind === "demo") {
      router.push("/book-demo/success");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="form-card" role="status">
        <div className="success-icon"><CheckCircle2 /></div>
        <h2>Message prepared</h2>
        <p>This preview confirms the form experience. Connect the approved lead destination before publishing to receive submissions.</p>
        <button className="button button-secondary" type="button" onClick={() => setSubmitted(false)}>Send another message</button>
      </div>
    );
  }

  return (
    <form className="form-card" onSubmit={onSubmit}>
      <div className="form-grid">
        <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" required /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div className="field"><label htmlFor="company">Company</label><input id="company" name="company" autoComplete="organization" required /></div>
        {kind === "demo" && <div className="field"><label htmlFor="employees">Employees</label><select id="employees" name="employees" required defaultValue=""><option value="" disabled>Select team size</option><option>1–10</option><option>11–50</option><option>51–200</option><option>201+</option></select></div>}
        {kind === "demo" && <div className="field"><label htmlFor="country">Country</label><input id="country" name="country" autoComplete="country-name" required /></div>}
        <div className="field"><label htmlFor="interest">Product interest</label><select id="interest" name="interest" required defaultValue=""><option value="" disabled>Select a product</option><option>OperiX Suite</option><option>OperiX Invoice</option><option>OperiX HR Office</option></select></div>
        <div className="field field-full"><label htmlFor="message">Message</label><textarea id="message" name="message" required placeholder={kind === "demo" ? "What would you like to see in the demo?" : "How can we help?"} /></div>
      </div>
      <button className="button" type="submit">{kind === "demo" ? "Request Demo" : "Send Message"}</button>
      <p className="form-note">By submitting, you agree that OperiX may contact you about this request. This preview does not transmit data until an approved form destination is connected.</p>
    </form>
  );
}
