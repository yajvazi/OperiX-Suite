import Image from "next/image";
import Link from "next/link";

const groups = [
  {
    title: "Products",
    links: [
      ["OperiX Invoice", "/products/invoice"],
      ["OperiX HR Office", "/products/hr"],
      ["Features", "/features"],
      ["Pricing", "/pricing"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Book a demo", "/book-demo"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Documentation", "/resources"],
      ["Help Center", "/resources"],
      ["Guides", "/resources"],
      ["API", "/resources"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Link href="/" className="brand brand-light" aria-label="OperiX Suite home">
            <Image className="brand-wordmark brand-wordmark-light" src="/brand/operix-wordmark-blue.svg" width={92} height={31} alt="OperiX" />
            <span>Suite</span>
          </Link>
          <p>One connected suite for clearer financial and people operations.</p>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={`${group.title} links`}>
            <h2>{group.title}</h2>
            {group.links.map(([label, href]) => (
              <Link key={label} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
        <nav aria-label="Legal links">
          <h2>Legal</h2>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
      <div className="container footer-bottom">
        <p>© {new Date().getFullYear()} OperiX. All rights reserved.</p>
        <p>Built for businesses that value clarity.</p>
      </div>
    </footer>
  );
}
