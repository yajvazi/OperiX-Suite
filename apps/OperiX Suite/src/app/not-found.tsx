import Link from "next/link";

export default function NotFound() {
  return <section className="page-hero"><div className="container"><div className="success-card"><h1>Page not found.</h1><p>The page you’re looking for may have moved or is not available yet.</p><div className="button-row"><Link className="button" href="/">Back to overview</Link><Link className="button button-secondary" href="/contact">Contact us</Link></div></div></div></section>;
}
