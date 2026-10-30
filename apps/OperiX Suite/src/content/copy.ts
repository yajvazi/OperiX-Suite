export type Lang = "en" | "sq";

export const urls = {
  signup: process.env.NEXT_PUBLIC_OPERIX_GET_STARTED_URL ?? "https://invoice.operixsuite.com/signup",
  signIn: process.env.NEXT_PUBLIC_OPERIX_SIGN_IN_URL ?? "https://invoice.operixsuite.com/login",
  app: process.env.NEXT_PUBLIC_OPERIX_INVOICE_URL ?? "https://invoice.operixsuite.com",
  help: "https://helpdesk.operixsuite.com",
  email: "support@operixinvoice.com",
};

/** Links to the app and the Help Center open in the language the visitor chose here. */
export function localUrl(url: string, lang: Lang): string {
  if (lang !== "sq") return url;
  if (url.startsWith(urls.help)) return `${url.replace(/\/$/, "")}/sq`;
  return `${url}${url.includes("?") ? "&" : "?"}lang=sq`;
}

export type IconName =
  | "file" | "cart" | "users" | "wallet" | "chart" | "coins" | "upload" | "globe" | "shield" | "phone" | "wifi"
  | "cloud" | "device" | "calendar" | "bell" | "scissors" | "credit" | "layers" | "clock" | "link" | "code" | "lock" | "scan" | "box";

type Feature = { icon: IconName; title: string; text: string };
type Faq = { q: string; a: string };

export type Copy = {
  meta: { title: string; description: string };
  nav: { invoice: string; booking: string; pricing: string; contact: string; signIn: string; start: string; menu: string; language: string };
  home: {
    hero: { eyebrow: string; title: string; accent: string; sub: string; primary: string; secondary: string; note: string[] };
    products: {
      label: string; title: string; sub: string;
      invoice: { name: string; badge: string; text: string; bullets: string[]; primary: string; secondary: string };
      booking: { name: string; badge: string; text: string; bullets: string[]; primary: string };
    };
    features: { label: string; title: string; sub: string; items: Feature[] };
    data: {
      label: string; title: string; sub: string;
      device: { title: string; badge: string; text: string; items: string[] };
      cloud: { title: string; badge: string; text: string; items: string[] };
    };
    platforms: { label: string; title: string; sub: string; web: { title: string; text: string; items: string[] }; mobile: { title: string; text: string; items: string[] } };
    selfhost: { label: string; title: string; sub: string; points: { icon: IconName; title: string; text: string }[]; cta: string; note: string; subject: string };
    steps: { label: string; title: string; items: { title: string; text: string }[] };
    pricing: { label: string; title: string; sub: string; cta: string };
    faq: { label: string; title: string; items: Faq[] };
    cta: { title: string; sub: string; primary: string; secondary: string };
  };
  invoice: {
    hero: { eyebrow: string; title: string; sub: string; primary: string; secondary: string };
    groups: { title: string; text: string; items: string[]; icon: IconName }[];
    kosovo: { label: string; title: string; text: string; items: string[] };
    languages: { title: string; text: string };
  };
  booking: {
    badge: string;
    hero: { title: string; sub: string; primary: string };
    features: Feature[];
    why: { label: string; title: string; text: string };
    waitlist: { title: string; text: string; cta: string; note: string; subject: string; body: string };
    suite: { title: string; text: string; cta: string };
  };
  pricing: {
    hero: { title: string; sub: string };
    monthly: string; annual: string; saveBadge: string; per: { month: string; year: string };
    plans: {
      free: { name: string; tagline: string; cta: string; items: string[] };
      invoice: { name: string; tagline: string; cta: string; items: string[]; popular: string };
      suite: { name: string; tagline: string; cta: string; items: string[]; badge: string };
      booking: { name: string; tagline: string; cta: string; items: string[]; badge: string };
    };
    freePrice: string; included: string; selfhost: { title: string; text: string; cta: string };
    addons: { title: string; sub: string; items: { name: string; text: string; monthly: string; annual: string }[]; api: { name: string; text: string; price: string } };
    compare: { title: string; sub: string; head: [string, string, string]; rows: { label: string; free: string | boolean; paid: string | boolean }[] };
    faq: { title: string; items: Faq[] };
    vat: string;
  };
  contact: {
    hero: { title: string; sub: string };
    cards: { title: string; text: string; cta: string; href: string }[];
    form: { name: string; email: string; topic: string; topics: string[]; message: string; send: string; note: string; subject: string };
  };
  footer: { tagline: string; product: string; company: string; legal: string; links: { invoice: string; booking: string; pricing: string; help: string; contact: string; privacy: string; terms: string; signIn: string }; rights: string; made: string };
  legal: { updated: string; privacy: { title: string; sections: { h: string; p: string[] }[] }; terms: { title: string; sections: { h: string; p: string[] }[] }; review: string };
  notFound: { title: string; text: string; cta: string };
  suiteLine: string;
  comingSoon: string;
};

const en: Copy = {
  meta: {
    title: "OperiX — Invoicing and business finance for growing businesses",
    description: "OperiX Invoice handles invoices, point of sale, expenses, VAT registers, reports and payroll on the web and on your phone. Start free. OperiX Booking is coming soon.",
  },
  nav: { invoice: "OperiX Invoice", booking: "OperiX Booking", pricing: "Pricing", contact: "Contact", signIn: "Sign in", start: "Start free", menu: "Menu", language: "Language" },
  home: {
    hero: {
      eyebrow: "OperiX Invoice · Web & Mobile",
      title: "Invoicing that runs",
      accent: "your whole business.",
      sub: "Create invoices, sell at the counter, track expenses and keep VAT and reports in order — in the browser or on your phone. Start free, with your data stored on your own device.",
      primary: "Start free",
      secondary: "See pricing",
      note: ["No credit card", "Your data stays on your device", "English & Shqip", "Euro & Kosovo VAT"],
    },
    products: {
      label: "Products",
      title: "One platform. Two products.",
      sub: "OperiX Invoice is ready today. OperiX Booking joins it soon, and both will run together in OperiX Suite.",
      invoice: {
        name: "OperiX Invoice",
        badge: "Available now",
        text: "Everything a small business needs to bill customers, get paid and know where the money went.",
        bullets: ["Invoices, quotes, proformas, orders and delivery notes", "Point of sale, stock and barcode scanning", "Expenses, bills, bank accounts and payroll", "VAT registers, profit & loss and ledger reports"],
        primary: "Start free",
        secondary: "Explore Invoice",
      },
      booking: {
        name: "OperiX Booking",
        badge: "Coming soon",
        text: "Appointments, services, staff and customers in one calendar — with online booking and reminders.",
        bullets: ["Calendar and online booking page", "Services, staff and resources", "Customer records and reminders", "Payments that connect to Invoice"],
        primary: "Get notified",
      },
    },
    features: {
      label: "OperiX Invoice",
      title: "From first quote to final report.",
      sub: "The everyday work of a business, in one tidy place.",
      items: [
        { icon: "file", title: "Invoices & documents", text: "Invoices, quotes, proformas, orders, delivery notes and recurring invoices with automatic numbering and PDF output." },
        { icon: "cart", title: "Point of sale", text: "Ring up sales at the counter, hold and resume orders, manage registers and print receipts." },
        { icon: "box", title: "Products & stock", text: "Prices, SKUs, low-stock alerts, import cost calculations and stock per branch." },
        { icon: "users", title: "Customers & vendors", text: "Customer ledgers, balances, supplier bills and vendor payments always at hand." },
        { icon: "wallet", title: "Expenses & cash", text: "Record expenses by category, track bank accounts and see exactly what is paid and what is owed." },
        { icon: "chart", title: "VAT & reports", text: "Sales and purchase registers with Kosovo VAT columns, profit and loss, trial balance and general ledger." },
        { icon: "coins", title: "Payroll", text: "Monthly payroll runs using Kosovo contribution and tax rules, posted straight to your ledger." },
        { icon: "upload", title: "Import & export", text: "Bring customers, products and expenses in from CSV and take your data out whenever you like." },
      ],
    },
    data: {
      label: "Your data, your choice",
      title: "Start on your device. Move to the cloud when you grow.",
      sub: "OperiX Invoice works two ways. Switch at any time and copy your basic data across.",
      device: {
        title: "On this device",
        badge: "Free",
        text: "Your business lives in your browser or phone. Nothing leaves your device unless you export it.",
        items: ["Invoices, POS, expenses, reports and payroll", "Private: nothing leaves your device", "Backup and restore with a file", "No monthly cost"],
      },
      cloud: {
        title: "OperiX Cloud",
        badge: "From €2.99/month",
        text: "Store your data securely online and share it with your team, on web and mobile.",
        items: ["Automatic cloud backup", "Same data on web and mobile", "Team users with roles and permissions", "Customer portal, payment links and API"],
      },
    },
    platforms: {
      label: "Web & Mobile",
      title: "At your desk or on the move.",
      sub: "Use OperiX in any modern browser, and take it with you on the mobile app.",
      web: { title: "Web app", text: "A full workspace for the office: documents, reports, payroll and settings on a large screen.", items: ["Works on desktop, tablet and phone browsers", "Install it as an app on your computer or phone", "English and Albanian interface"] },
      mobile: { title: "Mobile app", text: "Invoice a customer, take a sale or check stock wherever you are.", items: ["Create and share invoices on the spot", "POS with barcode scanning", "Low-stock alerts and on-device data"] },
    },
    selfhost: {
      label: "Open source",
      title: "Open source. Run it on your own server.",
      sub: "The OperiX Invoice web app is open source. Host it yourself, keep full control of your data, and connect the mobile app to your own server.",
      points: [
        { icon: "code", title: "Open-source web app", text: "Read the code, change it, and run the OperiX Invoice web app on your own infrastructure." },
        { icon: "phone", title: "Mobile app on your server", text: "Sign in to the OperiX mobile app with the account on your own server." },
        { icon: "cloud", title: "Your own cloud", text: "Run your own cloud subscription for your team, with storage, backups and user accounts under your control." },
      ],
      cta: "Ask about self-hosting",
      note: "Prefer not to manage servers? OperiX Cloud runs it for you.",
      subject: "Self-hosting OperiX Invoice",
    },
    steps: {
      label: "Get started",
      title: "Up and running in minutes.",
      items: [
        { title: "Create your account", text: "Sign up and choose to keep your data on this device or in the cloud." },
        { title: "Add your business", text: "Enter your company details, logo, bank account and VAT settings once." },
        { title: "Send your first invoice", text: "Add a customer, pick products, and share a professional PDF." },
      ],
    },
    pricing: { label: "Pricing", title: "Simple, honest pricing.", sub: "Free on your device. From €2.99 a month for the cloud. Add people and workspaces only when you need them. OperiX Suite is coming soon.", cta: "See all plans" },
    faq: {
      label: "FAQ",
      title: "Questions, answered.",
      items: [
        { q: "Is OperiX Invoice really free?", a: "Yes. The on-device plan is free and includes invoicing, POS, expenses, reports and payroll. Your data stays in your browser or phone. Paid plans add cloud storage, syncing between devices, team access and online features." },
        { q: "What is OperiX Booking?", a: "OperiX Booking is our scheduling and reservations product for appointment-based businesses. It is coming soon. You can ask to be notified when it launches." },
        { q: "What is OperiX Suite?", a: "OperiX Suite is the upcoming bundle that brings Invoice and Booking together under one subscription and one workspace. It is coming soon, together with OperiX Booking." },
        { q: "Can I run OperiX on my own server?", a: "Yes. The OperiX Invoice web app is open source, so you can host it yourself. You can also use the mobile app with the account on your own server and run your own cloud subscription. Contact us if you would like help getting set up." },
        { q: "Is my data safe if I keep it on my device?", a: "Your data is stored only on the device you use, so please download a backup regularly. OperiX reminds you, and you can restore a backup in another browser or on the mobile app." },
        { q: "Does it support Kosovo VAT and payroll?", a: "Yes. Documents carry the Kosovo VAT rates and register columns, and payroll uses Kosovo contribution and tax rules. We recommend your accountant reviews your setup." },
        { q: "Does OperiX connect to the Tax Administration electronically?", a: "Not at the moment. OperiX prepares your sales and purchase registers and reports, but it does not submit declarations or fiscal data electronically." },
        { q: "Which languages are supported?", a: "The web app and this website are available in English and Albanian (Shqip). Each invoice can be issued in English, Albanian or Serbian." },
      ],
    },
    cta: { title: "Ready to put your invoicing in order?", sub: "Start free in a few minutes. Upgrade to the cloud only when you need it.", primary: "Start free", secondary: "See pricing" },
  },
  invoice: {
    hero: {
      eyebrow: "OperiX Invoice",
      title: "Everything you need to bill, sell and keep your books.",
      sub: "A complete invoicing and business finance workspace for the web and your phone — built for small and growing businesses.",
      primary: "Start free",
      secondary: "See pricing",
    },
    groups: [
      { icon: "file", title: "Sales documents", text: "Look professional and stay organised.", items: ["Invoices, quotes, proformas, sales orders and delivery notes", "Convert a quote into an invoice in one click", "Recurring invoices and payment reminders", "Automatic numbering, status tracking and PDF output", "Customer-facing templates with your logo, stamp and signature"] },
      { icon: "cart", title: "Point of sale", text: "Sell at the counter without a separate system.", items: ["Fast checkout with barcode scanning on mobile", "Hold and resume orders", "Registers and branches", "Receipts and receipt-size printing", "Stock updates as you sell"] },
      { icon: "box", title: "Products & stock", text: "Know what you have and what it costs.", items: ["Products and services with prices and VAT rates", "Low-stock alerts", "Import cost calculation with landed unit cost", "Stock per branch", "CSV import and export"] },
      { icon: "wallet", title: "Money in and out", text: "See cash, bank and what is owed.", items: ["Customer payments, including payments on account", "Expenses by category with supporting documents", "Supplier bills and vendor payments", "Cash and bank account balances", "Other income recording"] },
      { icon: "chart", title: "Reports & accounting", text: "Numbers your accountant will like.", items: ["Sales and purchase registers with Kosovo VAT columns", "Profit and loss and sales summary", "Trial balance and general ledger", "Customer statements", "Export to CSV and PDF"] },
      { icon: "coins", title: "Payroll", text: "Run monthly payroll in minutes.", items: ["Employee records", "Monthly payroll runs with Kosovo contribution and tax rules", "Draft, recalculate and finalise", "Posted to the ledger automatically"] },
    ],
    kosovo: {
      label: "Made for Kosovo",
      title: "Built around the way Kosovo businesses work.",
      text: "OperiX speaks your language and follows local conventions, so there is less to set up and less to explain to your accountant.",
      items: ["Kosovo VAT rates of 18% and 8% with the matching register columns", "Business numbers (NUI), fiscal and VAT numbers on every document", "Albanian and English interface, with invoices in Albanian, English or Serbian", "Euro by default", "Payroll rules for Kosovo contributions and income tax"],
    },
    languages: { title: "Invoices in your customer's language", text: "Switch the interface between English and Albanian at any time. Each invoice keeps the language you choose for it." },
  },
  booking: {
    badge: "Coming soon",
    hero: { title: "Bookings that run themselves.", sub: "OperiX Booking brings your calendar, services, staff and customers together, so clients can book online and you can focus on the work.", primary: "Notify me at launch" },
    features: [
      { icon: "calendar", title: "Calendar & availability", text: "One calendar for the whole team, with working hours and time off." },
      { icon: "link", title: "Online booking page", text: "A shareable page where customers pick a service and a time." },
      { icon: "scissors", title: "Services & staff", text: "Set up services, durations, prices and who performs them." },
      { icon: "users", title: "Customer records", text: "Keep contact details and booking history together." },
      { icon: "bell", title: "Reminders", text: "Notify customers about upcoming bookings to cut no-shows." },
      { icon: "credit", title: "Payments & invoices", text: "Take payment for a booking and turn it into an OperiX Invoice." },
      { icon: "chart", title: "Reports", text: "See busy times, popular services and how your business is growing." },
      { icon: "phone", title: "Web & mobile", text: "Manage the day from your desk or your phone." },
    ],
    why: { label: "Coming soon", title: "Built to work with OperiX Invoice.", text: "Bookings, customers and payments flow into the same workspace as your invoices, so you never copy details from one tool to another." },
    waitlist: { title: "Be first to know.", text: "Tell us you are interested and we will email you when OperiX Booking opens.", cta: "Email us to join the waitlist", note: "We will only use your email to tell you about OperiX Booking.", subject: "OperiX Booking waitlist", body: "Hello, please let me know when OperiX Booking launches.\n\nName:\nBusiness:\nType of business:" },
    suite: { title: "OperiX Suite is coming soon", text: "OperiX Suite will bundle Invoice and Booking under one subscription. Start with Invoice today and join the Booking waitlist to hear about the Suite launch.", cta: "See pricing" },
  },
  pricing: {
    hero: { title: "Simple pricing that grows with you.", sub: "Start free on your own device. Move to the cloud when you want backup, sync and a team." },
    monthly: "Monthly", annual: "Yearly", saveBadge: "Save about 16%", per: { month: "/month", year: "/year" },
    plans: {
      free: { name: "On this device", tagline: "For one person getting started.", cta: "Start free", items: ["Invoices, quotes and documents", "Point of sale and stock", "Customers, vendors and expenses", "VAT registers and reports", "Payroll", "Private: data stays on your device", "Backup and restore with a file"] },
      invoice: { name: "OperiX Invoice", tagline: "Cloud storage for your business.", cta: "Choose Invoice", popular: "Most popular", items: ["Everything in On this device", "Cloud storage and automatic backup", "Same data on web and mobile", "1 workspace and 1 active user included", "Team roles and permissions", "Customer portal and payment links"] },
      suite: { name: "OperiX Suite", tagline: "Invoice and Booking together.", cta: "Get notified", badge: "Coming soon", items: ["Everything in OperiX Invoice", "OperiX Booking included", "One shared workspace and active-user allowance", "One subscription for both products"] },
      booking: { name: "OperiX Booking", tagline: "Appointments and reservations.", cta: "Get notified", badge: "Coming soon", items: ["Calendar and online booking page", "Services, staff and customers", "Reminders", "Web and mobile"] },
    },
    freePrice: "€0", included: "What's included",
    selfhost: { title: "Prefer to host it yourself?", text: "The OperiX Invoice web app is open source. Run it on your own server, use the mobile app with your own account, and run your own cloud subscription.", cta: "Ask about self-hosting" },
    addons: {
      title: "Add what you need",
      sub: "Each paid plan includes one workspace and one active user. Add more at any time.",
      items: [
        { name: "Additional workspace", text: "Another company or branch with its own data.", monthly: "€1.99", annual: "€19.99" },
        { name: "Additional active user", text: "A teammate with their own login and permissions.", monthly: "€0.99", annual: "€9.99" },
      ],
      api: { name: "API access", text: "For developers: integrate OperiX with your own systems. Includes 5,000 requests a month.", price: "€4.99/month" },
    },
    compare: {
      title: "Compare plans", sub: "Both plans include the full set of business tools. The difference is where your data lives and who can use it.",
      head: ["Feature", "On this device", "OperiX Invoice"],
      rows: [
        { label: "Invoices, quotes and documents", free: true, paid: true },
        { label: "Point of sale and stock", free: true, paid: true },
        { label: "Expenses, bills and vendor payments", free: true, paid: true },
        { label: "VAT registers and financial reports", free: true, paid: true },
        { label: "Payroll", free: true, paid: true },
        { label: "Where your data is stored", free: "This device", paid: "OperiX Cloud" },
        { label: "Automatic backup", free: "Manual file", paid: true },
        { label: "Same data on web and mobile", free: false, paid: true },
        { label: "Team users, roles and permissions", free: false, paid: true },
        { label: "Customer portal and payment links", free: false, paid: true },
        { label: "API access", free: false, paid: "Add-on" },
      ],
    },
    faq: {
      title: "Pricing questions",
      items: [
        { q: "Can I switch between the free plan and the cloud?", a: "Yes. You can copy your customers, products and suppliers between your device and the cloud, and export or import a full backup file." },
        { q: "What counts as an active user?", a: "Anyone who signs in and works in your workspace. Every paid plan includes one active user, and you can add more for a small monthly fee." },
        { q: "Can I pay yearly?", a: "Yes. Yearly billing saves about 16% compared with paying monthly." },
        { q: "When will OperiX Booking and OperiX Suite be available?", a: "Both are coming soon. Join the waitlist and we will email you when they open. In the meantime you can start with OperiX Invoice." },
        { q: "Can I cancel any time?", a: "Yes. You can cancel your subscription whenever you like and export your data." },
      ],
    },
    vat: "Prices are in euros. Applicable taxes may be added at checkout.",
  },
  contact: {
    hero: { title: "Talk to us.", sub: "Questions about OperiX Invoice, pricing or OperiX Booking? We are happy to help." },
    cards: [
      { title: "Help Center", text: "Guides and answers for getting set up and using OperiX.", cta: "Open the Help Center", href: urls.help },
      { title: "Email us", text: "Write to us about pricing, setup or anything else.", cta: urls.email, href: `mailto:${urls.email}` },
    ],
    form: { name: "Your name", email: "Your email", topic: "Topic", topics: ["OperiX Invoice", "Pricing", "OperiX Booking", "Something else"], message: "How can we help?", send: "Send by email", note: "This opens your email app with your message ready to send.", subject: "OperiX enquiry" },
  },
  footer: {
    tagline: "Invoicing and business finance for growing businesses.",
    product: "Product", company: "Company", legal: "Legal",
    links: { invoice: "OperiX Invoice", booking: "OperiX Booking", pricing: "Pricing", help: "Help Center", contact: "Contact", privacy: "Privacy", terms: "Terms", signIn: "Sign in" },
    rights: "All rights reserved.", made: "Made in Kosovo",
  },
  legal: {
    updated: "Last updated: October 2026",
    review: "This summary explains how OperiX works in plain language. It is not a substitute for a reviewed legal agreement.",
    privacy: {
      title: "Privacy",
      sections: [
        { h: "Who we are", p: ["OperiX provides OperiX Invoice and, soon, OperiX Booking. This page explains what information we handle and why."] },
        { h: "Data stored on your device", p: ["When you use OperiX Invoice in on-device mode, your business data is stored only in your browser or on your phone. We do not receive it. Please keep your own backups."] },
        { h: "Data stored in OperiX Cloud", p: ["If you choose cloud storage, your business data is stored on our servers so that you can use it on several devices and share it with your team. We use it only to provide the service."] },
        { h: "Account information", p: ["We keep the details needed to run your account, such as your name, email address and subscription status."] },
        { h: "Payments", p: ["Subscriptions are processed by our payment provider. We do not store full card numbers."] },
        { h: "Messages you send us", p: ["If you email us or join the Booking waitlist, we use your details only to reply to you or to tell you about OperiX Booking."] },
        { h: "Your choices", p: ["You can export your data and ask us to delete your account. Contact us at " + urls.email + "."] },
      ],
    },
    terms: {
      title: "Terms",
      sections: [
        { h: "Using OperiX", p: ["You may use OperiX for your own business. You are responsible for the accuracy of the documents you create and for the activity under your account."] },
        { h: "Accounting and tax", p: ["OperiX helps you prepare documents and reports. It does not replace professional advice. Please have your accountant review your VAT, payroll and tax setup."] },
        { h: "Your data", p: ["Your business data belongs to you. You can export it at any time. In on-device mode you are responsible for keeping backups."] },
        { h: "Subscriptions", p: ["Paid plans renew each month or year until cancelled. You can cancel at any time and your plan stays active until the end of the billing period."] },
        { h: "Availability", p: ["We work hard to keep OperiX available but cannot promise it will always be uninterrupted. OperiX Booking is not yet available."] },
        { h: "Contact", p: ["Questions about these terms: " + urls.email + "."] },
      ],
    },
  },
  notFound: { title: "This page could not be found.", text: "The page may have moved. Head back to the home page.", cta: "Go to the home page" },
  suiteLine: "OperiX Suite = Invoice + Booking",
  comingSoon: "Coming soon",
};

const sq: Copy = {
  meta: {
    title: "OperiX — Faturim dhe financa për biznese në rritje",
    description: "OperiX Invoice menaxhon faturat, pikën e shitjes, shpenzimet, librat e TVSH-së, raportet dhe pagat në web dhe në telefon. Filloni falas. OperiX Booking vjen së shpejti.",
  },
  nav: { invoice: "OperiX Invoice", booking: "OperiX Booking", pricing: "Çmimet", contact: "Kontakti", signIn: "Hyni", start: "Filloni falas", menu: "Menuja", language: "Gjuha" },
  home: {
    hero: {
      eyebrow: "OperiX Invoice · Web dhe celular",
      title: "Faturimi që drejton",
      accent: "gjithë biznesin tuaj.",
      sub: "Krijoni fatura, shitni në banak, ndiqni shpenzimet dhe mbani TVSH-në e raportet në rregull — në shfletues ose në telefon. Filloni falas, me të dhënat e ruajtura në pajisjen tuaj.",
      primary: "Filloni falas",
      secondary: "Shihni çmimet",
      note: ["Pa kartë krediti", "Të dhënat mbeten në pajisje", "Shqip dhe anglisht", "Euro dhe TVSH e Kosovës"],
    },
    products: {
      label: "Produktet",
      title: "Një platformë. Dy produkte.",
      sub: "OperiX Invoice është gati sot. OperiX Booking i bashkohet së shpejti dhe të dyja do të punojnë së bashku në OperiX Suite.",
      invoice: {
        name: "OperiX Invoice",
        badge: "Në dispozicion",
        text: "Gjithçka që i duhet një biznesi të vogël për të faturuar klientët, për t'u paguar dhe për të ditur ku shkojnë paratë.",
        bullets: ["Fatura, oferta, proformë, porosi dhe fletëdërgesa", "Pika e shitjes, stoku dhe skanimi i barkodit", "Shpenzime, fatura furnitorësh, llogari bankare dhe paga", "Libra të TVSH-së, fitim e humbje dhe raporte kontabël"],
        primary: "Filloni falas",
        secondary: "Eksploroni Invoice",
      },
      booking: {
        name: "OperiX Booking",
        badge: "Së shpejti",
        text: "Takime, shërbime, staf dhe klientë në një kalendar — me rezervim online dhe kujtesa.",
        bullets: ["Kalendar dhe faqe rezervimi online", "Shërbime, staf dhe burime", "Regjistra klientësh dhe kujtesa", "Pagesa që lidhen me Invoice"],
        primary: "Njoftomë",
      },
    },
    features: {
      label: "OperiX Invoice",
      title: "Nga oferta e parë deri te raporti i fundit.",
      sub: "Puna e përditshme e një biznesi, në një vend të rregullt.",
      items: [
        { icon: "file", title: "Fatura dhe dokumente", text: "Fatura, oferta, proformë, porosi, fletëdërgesa dhe fatura periodike me numërim automatik dhe PDF." },
        { icon: "cart", title: "Pika e shitjes", text: "Shitni në banak, mbani dhe vazhdoni porositë, menaxhoni arkat dhe printoni kupona." },
        { icon: "box", title: "Produkte dhe stok", text: "Çmime, SKU, njoftime për stok të ulët, kalkulim i kostos së importit dhe stok për degë." },
        { icon: "users", title: "Klientë dhe furnitorë", text: "Kartela klientësh, saldo, fatura furnitorësh dhe pagesa gjithmonë pranë jush." },
        { icon: "wallet", title: "Shpenzime dhe para", text: "Regjistroni shpenzimet sipas kategorisë, ndiqni llogaritë bankare dhe shihni çfarë është paguar e çfarë mbetet." },
        { icon: "chart", title: "TVSH dhe raporte", text: "Libra shitjesh dhe blerjesh me kolonat e TVSH-së së Kosovës, fitim e humbje, bilanc provë dhe libër i përgjithshëm." },
        { icon: "coins", title: "Paga", text: "Llogaritje mujore e pagave sipas rregullave të Kosovës, e regjistruar drejtpërdrejt në libër." },
        { icon: "upload", title: "Import dhe eksport", text: "Importoni klientë, produkte dhe shpenzime nga CSV dhe nxirrni të dhënat tuaja kur të doni." },
      ],
    },
    data: {
      label: "Të dhënat tuaja, zgjedhja juaj",
      title: "Filloni në pajisjen tuaj. Kaloni në cloud kur të rriteni.",
      sub: "OperiX Invoice punon në dy mënyra. Ndërroni kur të doni dhe kopjoni të dhënat bazë.",
      device: {
        title: "Në këtë pajisje",
        badge: "Falas",
        text: "Biznesi juaj ruhet në shfletues ose në telefon. Asgjë nuk largohet nga pajisja nëse nuk e eksportoni.",
        items: ["Fatura, POS, shpenzime, raporte dhe paga", "Privat: asgjë nuk largohet nga pajisja", "Kopje rezervë dhe rikthim me skedar", "Pa pagesë mujore"],
      },
      cloud: {
        title: "OperiX Cloud",
        badge: "Nga €2.99/muaj",
        text: "Ruani të dhënat në mënyrë të sigurt online dhe ndajini me ekipin, në web dhe në celular.",
        items: ["Kopje rezervë automatike në cloud", "Të njëjtat të dhëna në web dhe celular", "Përdorues të ekipit me role dhe leje", "Portal për klientët, lidhje pagese dhe API"],
      },
    },
    platforms: {
      label: "Web dhe celular",
      title: "Në zyrë ose në lëvizje.",
      sub: "Përdorni OperiX në çdo shfletues modern dhe merreni me vete në aplikacionin celular.",
      web: { title: "Aplikacioni web", text: "Hapësirë e plotë pune për zyrën: dokumente, raporte, paga dhe cilësime në ekran të madh.", items: ["Punon në shfletues kompjuteri, tableti dhe telefoni", "Instalojeni si aplikacion në kompjuter ose telefon", "Ndërfaqe në shqip dhe anglisht"] },
      mobile: { title: "Aplikacioni celular", text: "Faturoni një klient, kryeni një shitje ose kontrolloni stokun kudo që jeni.", items: ["Krijoni dhe ndani fatura në vend", "POS me skanim barkodi", "Njoftime për stok të ulët dhe të dhëna në pajisje"] },
    },
    selfhost: {
      label: "Kod i hapur",
      title: "Kod i hapur. Ekzekutojeni në serverin tuaj.",
      sub: "Aplikacioni web i OperiX Invoice është me kod të hapur. Strehojeni vetë, mbani kontrollin e plotë të të dhënave dhe lidheni aplikacionin celular me serverin tuaj.",
      points: [
        { icon: "code", title: "Aplikacion web me kod të hapur", text: "Lexoni kodin, ndryshojeni dhe ekzekutojeni aplikacionin web të OperiX Invoice në infrastrukturën tuaj." },
        { icon: "phone", title: "Aplikacioni celular në serverin tuaj", text: "Hyni në aplikacionin celular të OperiX me llogarinë në serverin tuaj." },
        { icon: "cloud", title: "Cloud-i juaj", text: "Ekzekutoni abonimin tuaj cloud për ekipin, me ruajtjen, kopjet rezervë dhe llogaritë e përdoruesve nën kontrollin tuaj." },
      ],
      cta: "Pyesni për vetë-strehim",
      note: "Nuk doni të menaxhoni servera? OperiX Cloud e ekzekuton për ju.",
      subject: "Vetë-strehimi i OperiX Invoice",
    },
    steps: {
      label: "Si të filloni",
      title: "Gati për disa minuta.",
      items: [
        { title: "Krijoni llogarinë", text: "Regjistrohuni dhe zgjidhni t'i mbani të dhënat në këtë pajisje ose në cloud." },
        { title: "Shtoni biznesin", text: "Vendosni një herë të dhënat e kompanisë, logon, llogarinë bankare dhe cilësimet e TVSH-së." },
        { title: "Dërgoni faturën e parë", text: "Shtoni një klient, zgjidhni produktet dhe ndani një PDF profesionale." },
      ],
    },
    pricing: { label: "Çmimet", title: "Çmime të thjeshta dhe të ndershme.", sub: "Falas në pajisjen tuaj. Nga €2.99 në muaj për cloud. Shtoni persona dhe hapësira pune vetëm kur ju duhen. OperiX Suite vjen së shpejti.", cta: "Shihni të gjitha planet" },
    faq: {
      label: "Pyetje",
      title: "Pyetjet tuaja, të përgjigjura.",
      items: [
        { q: "A është OperiX Invoice vërtet falas?", a: "Po. Plani në pajisje është falas dhe përfshin faturim, POS, shpenzime, raporte dhe paga. Të dhënat mbeten në shfletuesin ose telefonin tuaj. Planet me pagesë shtojnë ruajtje në cloud, sinkronizim mes pajisjeve, qasje për ekipin dhe veçori online." },
        { q: "Çfarë është OperiX Booking?", a: "OperiX Booking është produkti ynë për planifikim dhe rezervime për biznese me takime. Vjen së shpejti. Mund të kërkoni të njoftoheni kur të hapet." },
        { q: "Çfarë është OperiX Suite?", a: "OperiX Suite është paketa e ardhshme që bashkon Invoice dhe Booking nën një abonim dhe një hapësirë pune. Vjen së shpejti, bashkë me OperiX Booking." },
        { q: "A mund ta ekzekutoj OperiX në serverin tim?", a: "Po. Aplikacioni web i OperiX Invoice është me kod të hapur, ndaj mund ta strehoni vetë. Mund ta përdorni edhe aplikacionin celular me llogarinë në serverin tuaj dhe të ekzekutoni abonimin tuaj cloud. Na kontaktoni nëse dëshironi ndihmë për konfigurimin." },
        { q: "A janë të sigurta të dhënat nëse i mbaj në pajisje?", a: "Të dhënat ruhen vetëm në pajisjen që përdorni, ndaj shkarkoni rregullisht një kopje rezervë. OperiX ju kujton, dhe kopjen mund ta riktheni në një shfletues tjetër ose në aplikacionin celular." },
        { q: "A mbështet TVSH-në dhe pagat e Kosovës?", a: "Po. Dokumentet mbajnë normat e TVSH-së së Kosovës dhe kolonat e librave, ndërsa pagat ndjekin rregullat e kontributeve dhe tatimit të Kosovës. Rekomandojmë që kontabilisti juaj ta shqyrtojë konfigurimin." },
        { q: "A lidhet OperiX elektronikisht me Administratën Tatimore?", a: "Aktualisht jo. OperiX përgatit librat e shitjeve e blerjeve dhe raportet, por nuk dorëzon deklarata ose të dhëna fiskale në mënyrë elektronike." },
        { q: "Cilat gjuhë mbështeten?", a: "Aplikacioni web dhe kjo faqe janë në shqip dhe anglisht. Çdo faturë mund të lëshohet në shqip, anglisht ose serbisht." },
      ],
    },
    cta: { title: "Gati ta rregulloni faturimin?", sub: "Filloni falas për disa minuta. Kaloni në cloud vetëm kur ju duhet.", primary: "Filloni falas", secondary: "Shihni çmimet" },
  },
  invoice: {
    hero: {
      eyebrow: "OperiX Invoice",
      title: "Gjithçka që ju duhet për të faturuar, shitur dhe mbajtur librat.",
      sub: "Hapësirë e plotë pune për faturim dhe financa të biznesit, për web dhe telefon — e krijuar për biznese të vogla dhe në rritje.",
      primary: "Filloni falas",
      secondary: "Shihni çmimet",
    },
    groups: [
      { icon: "file", title: "Dokumente shitjeje", text: "Dukuni profesionalë dhe qëndroni të organizuar.", items: ["Fatura, oferta, proformë, porosi shitjeje dhe fletëdërgesa", "Shndërroni një ofertë në faturë me një klik", "Fatura periodike dhe kujtesa pagese", "Numërim automatik, ndjekje statusi dhe PDF", "Shabllone me logon, vulën dhe nënshkrimin tuaj"] },
      { icon: "cart", title: "Pika e shitjes", text: "Shitni në banak pa sistem të veçantë.", items: ["Arkëtim i shpejtë me skanim barkodi në celular", "Mbani dhe vazhdoni porositë", "Arka dhe degë", "Kupona dhe printim në format kuponi", "Stoku përditësohet gjatë shitjes"] },
      { icon: "box", title: "Produkte dhe stok", text: "Dijeni çfarë keni dhe sa kushton.", items: ["Produkte dhe shërbime me çmime dhe norma TVSH-je", "Njoftime për stok të ulët", "Kalkulim i kostos së importit me koston për njësi", "Stok për degë", "Import dhe eksport CSV"] },
      { icon: "wallet", title: "Paratë që hyjnë e dalin", text: "Shihni arkën, bankën dhe çfarë ju detyrohet.", items: ["Pagesa nga klientët, përfshirë pagesa në llogari", "Shpenzime sipas kategorisë me dokumente mbështetëse", "Fatura furnitorësh dhe pagesa", "Salda të arkës dhe llogarive bankare", "Regjistrim i të ardhurave të tjera"] },
      { icon: "chart", title: "Raporte dhe kontabilitet", text: "Numra që do t'i pëlqejnë kontabilistit.", items: ["Libra shitjesh e blerjesh me kolonat e TVSH-së së Kosovës", "Fitim e humbje dhe përmbledhje shitjesh", "Bilanc provë dhe libër i përgjithshëm", "Kartela klientësh", "Eksport në CSV dhe PDF"] },
      { icon: "coins", title: "Paga", text: "Llogaritni pagat mujore në pak minuta.", items: ["Të dhëna punonjësish", "Llogaritje mujore sipas rregullave të Kosovës", "Draft, rillogaritje dhe finalizim", "Regjistrohet automatikisht në libër"] },
    ],
    kosovo: {
      label: "Krijuar për Kosovën",
      title: "Ndërtuar sipas mënyrës se si punojnë bizneset në Kosovë.",
      text: "OperiX flet gjuhën tuaj dhe ndjek praktikat vendase, ndaj ka më pak për t'u konfiguruar dhe më pak për t'i shpjeguar kontabilistit.",
      items: ["Normat e TVSH-së 18% dhe 8% me kolonat përkatëse të librave", "NUI, numri fiskal dhe i TVSH-së në çdo dokument", "Ndërfaqe në shqip dhe anglisht, me fatura në shqip, anglisht ose serbisht", "Euro si monedhë bazë", "Rregulla pagash për kontributet dhe tatimin e Kosovës"],
    },
    languages: { title: "Fatura në gjuhën e klientit tuaj", text: "Ndërroni ndërfaqen mes shqipes dhe anglishtes kur të doni. Çdo faturë e mban gjuhën që zgjidhni për të." },
  },
  booking: {
    badge: "Së shpejti",
    hero: { title: "Rezervime që ecin vetë.", sub: "OperiX Booking bashkon kalendarin, shërbimet, stafin dhe klientët, që klientët të rezervojnë online dhe ju të përqendroheni te puna.", primary: "Njoftomë në nisje" },
    features: [
      { icon: "calendar", title: "Kalendar dhe disponueshmëri", text: "Një kalendar për gjithë ekipin, me orare pune dhe pushime." },
      { icon: "link", title: "Faqe rezervimi online", text: "Një faqe për t'u ndarë ku klientët zgjedhin shërbimin dhe kohën." },
      { icon: "scissors", title: "Shërbime dhe staf", text: "Caktoni shërbime, kohëzgjatje, çmime dhe kush i kryen ato." },
      { icon: "users", title: "Regjistra klientësh", text: "Mbani së bashku kontaktet dhe historikun e rezervimeve." },
      { icon: "bell", title: "Kujtesa", text: "Njoftoni klientët për rezervimet e ardhshme për të ulur mungesat." },
      { icon: "credit", title: "Pagesa dhe fatura", text: "Merrni pagesë për një rezervim dhe shndërrojeni në faturë OperiX Invoice." },
      { icon: "chart", title: "Raporte", text: "Shihni orët me më shumë punë, shërbimet e kërkuara dhe rritjen e biznesit." },
      { icon: "phone", title: "Web dhe celular", text: "Menaxhoni ditën nga zyra ose nga telefoni." },
    ],
    why: { label: "Së shpejti", title: "Krijuar të punojë me OperiX Invoice.", text: "Rezervimet, klientët dhe pagesat rrjedhin në të njëjtën hapësirë pune me faturat tuaja, ndaj nuk kopjoni kurrë të dhëna nga një mjet në tjetrin." },
    waitlist: { title: "Mësojeni i pari.", text: "Na tregoni që jeni të interesuar dhe do t'ju shkruajmë kur të hapet OperiX Booking.", cta: "Na shkruani për listën e pritjes", note: "Email-in tuaj do ta përdorim vetëm për t'ju njoftuar për OperiX Booking.", subject: "Lista e pritjes OperiX Booking", body: "Përshëndetje, ju lutem më njoftoni kur të hapet OperiX Booking.\n\nEmri:\nBiznesi:\nLloji i biznesit:" },
    suite: { title: "OperiX Suite vjen së shpejti", text: "OperiX Suite do të bashkojë Invoice dhe Booking nën një abonim. Filloni sot me Invoice dhe regjistrohuni në listën e pritjes së Booking për të mësuar për nisjen e Suite.", cta: "Shihni çmimet" },
  },
  pricing: {
    hero: { title: "Çmime të thjeshta që rriten me ju.", sub: "Filloni falas në pajisjen tuaj. Kaloni në cloud kur doni kopje rezervë, sinkronizim dhe ekip." },
    monthly: "Mujore", annual: "Vjetore", saveBadge: "Kurseni rreth 16%", per: { month: "/muaj", year: "/vit" },
    plans: {
      free: { name: "Në këtë pajisje", tagline: "Për një person që po fillon.", cta: "Filloni falas", items: ["Fatura, oferta dhe dokumente", "Pika e shitjes dhe stoku", "Klientë, furnitorë dhe shpenzime", "Libra të TVSH-së dhe raporte", "Paga", "Privat: të dhënat mbeten në pajisje", "Kopje rezervë dhe rikthim me skedar"] },
      invoice: { name: "OperiX Invoice", tagline: "Ruajtje në cloud për biznesin.", cta: "Zgjidhni Invoice", popular: "Më e zgjedhura", items: ["Gjithçka që përfshin plani Në këtë pajisje", "Ruajtje në cloud dhe kopje rezervë automatike", "Të njëjtat të dhëna në web dhe celular", "1 hapësirë pune dhe 1 përdorues aktiv të përfshirë", "Role dhe leje për ekipin", "Portal për klientët dhe lidhje pagese"] },
      suite: { name: "OperiX Suite", tagline: "Invoice dhe Booking së bashku.", cta: "Njoftomë", badge: "Së shpejti", items: ["Gjithçka nga OperiX Invoice", "OperiX Booking i përfshirë", "Një hapësirë pune dhe kuotë përdoruesish e përbashkët", "Një abonim për të dy produktet"] },
      booking: { name: "OperiX Booking", tagline: "Takime dhe rezervime.", cta: "Njoftomë", badge: "Së shpejti", items: ["Kalendar dhe faqe rezervimi online", "Shërbime, staf dhe klientë", "Kujtesa", "Web dhe celular"] },
    },
    freePrice: "€0", included: "Çfarë përfshihet",
    selfhost: { title: "Preferoni ta strehoni vetë?", text: "Aplikacioni web i OperiX Invoice është me kod të hapur. Ekzekutojeni në serverin tuaj, përdorni aplikacionin celular me llogarinë tuaj dhe ekzekutoni abonimin tuaj cloud.", cta: "Pyesni për vetë-strehim" },
    addons: {
      title: "Shtoni çfarë ju duhet",
      sub: "Çdo plan me pagesë përfshin një hapësirë pune dhe një përdorues aktiv. Shtoni më shumë kur të doni.",
      items: [
        { name: "Hapësirë pune shtesë", text: "Një kompani ose degë tjetër me të dhënat e veta.", monthly: "€1.99", annual: "€19.99" },
        { name: "Përdorues aktiv shtesë", text: "Një koleg me hyrjen dhe lejet e veta.", monthly: "€0.99", annual: "€9.99" },
      ],
      api: { name: "Qasje në API", text: "Për zhvillues: integroni OperiX me sistemet tuaja. Përfshin 5,000 kërkesa në muaj.", price: "€4.99/muaj" },
    },
    compare: {
      title: "Krahasoni planet", sub: "Të dy planet përfshijnë të gjitha mjetet e biznesit. Dallimi është ku ruhen të dhënat dhe kush mund t'i përdorë.",
      head: ["Veçoria", "Në këtë pajisje", "OperiX Invoice"],
      rows: [
        { label: "Fatura, oferta dhe dokumente", free: true, paid: true },
        { label: "Pika e shitjes dhe stoku", free: true, paid: true },
        { label: "Shpenzime, fatura furnitorësh dhe pagesa", free: true, paid: true },
        { label: "Libra të TVSH-së dhe raporte financiare", free: true, paid: true },
        { label: "Paga", free: true, paid: true },
        { label: "Ku ruhen të dhënat", free: "Kjo pajisje", paid: "OperiX Cloud" },
        { label: "Kopje rezervë automatike", free: "Skedar manual", paid: true },
        { label: "Të njëjtat të dhëna në web dhe celular", free: false, paid: true },
        { label: "Përdorues ekipi, role dhe leje", free: false, paid: true },
        { label: "Portal klientësh dhe lidhje pagese", free: false, paid: true },
        { label: "Qasje në API", free: false, paid: "Shtesë" },
      ],
    },
    faq: {
      title: "Pyetje për çmimet",
      items: [
        { q: "A mund të ndërroj mes planit falas dhe cloud?", a: "Po. Mund të kopjoni klientët, produktet dhe furnitorët mes pajisjes dhe cloud, dhe të eksportoni ose importoni një skedar të plotë rezervë." },
        { q: "Çfarë llogaritet si përdorues aktiv?", a: "Kushdo që hyn dhe punon në hapësirën tuaj të punës. Çdo plan me pagesë përfshin një përdorues aktiv dhe mund të shtoni më shumë me një pagesë të vogël mujore." },
        { q: "A mund të paguaj çdo vit?", a: "Po. Pagesa vjetore kursen rreth 16% krahasuar me pagesën mujore." },
        { q: "Kur do të hapen OperiX Booking dhe OperiX Suite?", a: "Të dyja vijnë së shpejti. Regjistrohuni në listën e pritjes dhe do t'ju shkruajmë kur të hapen. Ndërkohë mund të filloni me OperiX Invoice." },
        { q: "A mund ta anuloj kurdo?", a: "Po. Abonimin mund ta anuloni kur të doni dhe t'i eksportoni të dhënat." },
      ],
    },
    vat: "Çmimet janë në euro. Tatimet e aplikueshme mund të shtohen gjatë pagesës.",
  },
  contact: {
    hero: { title: "Flisni me ne.", sub: "Pyetje për OperiX Invoice, çmimet ose OperiX Booking? Jemi të gatshëm t'ju ndihmojmë." },
    cards: [
      { title: "Qendra e ndihmës", text: "Udhëzime dhe përgjigje për konfigurimin dhe përdorimin e OperiX.", cta: "Hapni qendrën e ndihmës", href: urls.help },
      { title: "Shkruani në email", text: "Na shkruani për çmimet, konfigurimin ose çdo gjë tjetër.", cta: urls.email, href: `mailto:${urls.email}` },
    ],
    form: { name: "Emri juaj", email: "Email-i juaj", topic: "Tema", topics: ["OperiX Invoice", "Çmimet", "OperiX Booking", "Diçka tjetër"], message: "Si mund t'ju ndihmojmë?", send: "Dërgo me email", note: "Kjo hap aplikacionin tuaj të email-it me mesazhin gati për dërgim.", subject: "Pyetje për OperiX" },
  },
  footer: {
    tagline: "Faturim dhe financa për biznese në rritje.",
    product: "Produkti", company: "Kompania", legal: "Ligjore",
    links: { invoice: "OperiX Invoice", booking: "OperiX Booking", pricing: "Çmimet", help: "Qendra e ndihmës", contact: "Kontakti", privacy: "Privatësia", terms: "Kushtet", signIn: "Hyni" },
    rights: "Të gjitha të drejtat e rezervuara.", made: "Bërë në Kosovë",
  },
  legal: {
    updated: "Përditësuar së fundi: tetor 2026",
    review: "Ky përmbledhje shpjegon në gjuhë të thjeshtë se si funksionon OperiX. Nuk zëvendëson një marrëveshje ligjore të shqyrtuar.",
    privacy: {
      title: "Privatësia",
      sections: [
        { h: "Kush jemi", p: ["OperiX ofron OperiX Invoice dhe, së shpejti, OperiX Booking. Kjo faqe shpjegon çfarë informacioni përpunojmë dhe pse."] },
        { h: "Të dhënat në pajisjen tuaj", p: ["Kur përdorni OperiX Invoice në mënyrën në pajisje, të dhënat e biznesit ruhen vetëm në shfletuesin ose telefonin tuaj. Ne nuk i marrim. Ju lutem mbani kopje rezervë."] },
        { h: "Të dhënat në OperiX Cloud", p: ["Nëse zgjidhni ruajtjen në cloud, të dhënat e biznesit ruhen në serverët tanë që t'i përdorni në disa pajisje dhe t'i ndani me ekipin. I përdorim vetëm për ofrimin e shërbimit."] },
        { h: "Informacioni i llogarisë", p: ["Mbajmë të dhënat e nevojshme për llogarinë tuaj, si emrin, email-in dhe statusin e abonimit."] },
        { h: "Pagesat", p: ["Abonimet përpunohen nga ofruesi ynë i pagesave. Ne nuk ruajmë numra të plotë kartash."] },
        { h: "Mesazhet që na dërgoni", p: ["Nëse na shkruani ose regjistroheni në listën e pritjes së Booking, i përdorim të dhënat vetëm për t'ju përgjigjur ose për t'ju njoftuar për OperiX Booking."] },
        { h: "Zgjedhjet tuaja", p: ["Mund t'i eksportoni të dhënat dhe të kërkoni fshirjen e llogarisë. Na kontaktoni në " + urls.email + "."] },
      ],
    },
    terms: {
      title: "Kushtet",
      sections: [
        { h: "Përdorimi i OperiX", p: ["Mund ta përdorni OperiX për biznesin tuaj. Ju jeni përgjegjës për saktësinë e dokumenteve që krijoni dhe për veprimtarinë nën llogarinë tuaj."] },
        { h: "Kontabiliteti dhe tatimet", p: ["OperiX ju ndihmon të përgatitni dokumente dhe raporte. Nuk zëvendëson këshillën profesionale. Ju lutem kërkoni që kontabilisti juaj ta shqyrtojë konfigurimin e TVSH-së, pagave dhe tatimeve."] },
        { h: "Të dhënat tuaja", p: ["Të dhënat e biznesit janë tuajat. Mund t'i eksportoni kurdo. Në mënyrën në pajisje jeni përgjegjës për kopjet rezervë."] },
        { h: "Abonimet", p: ["Planet me pagesë rinovohen çdo muaj ose vit derisa të anulohen. Mund të anuloni kurdo dhe plani mbetet aktiv deri në fund të periudhës së faturimit."] },
        { h: "Disponueshmëria", p: ["Përpiqemi ta mbajmë OperiX në dispozicion, por nuk mund të premtojmë se do të jetë gjithmonë pa ndërprerje. OperiX Booking nuk është ende në dispozicion."] },
        { h: "Kontakti", p: ["Pyetje për këto kushte: " + urls.email + "."] },
      ],
    },
  },
  notFound: { title: "Kjo faqe nuk u gjet.", text: "Faqja mund të jetë zhvendosur. Kthehuni te ballina.", cta: "Shkoni te ballina" },
  suiteLine: "OperiX Suite = Invoice + Booking",
  comingSoon: "Së shpejti",
};

export const copy: Record<Lang, Copy> = { en, sq };
export const getCopy = (lang: Lang) => copy[lang];

/** Prefixes a path with the language segment. English lives at the root. */
export const href = (lang: Lang, path: string) => (lang === "sq" ? `/sq${path === "/" ? "" : path}` : path);
