import type { FaqItem, Locale } from "./types";

/** Category names stay in English in both languages: the FAQ page groups questions by these exact names. */
export const faqCategories = [
  "General",
  "Account",
  "Billing",
  "Invoice",
  "Booking",
  "Security",
  "Mobile Apps",
  "Troubleshooting",
];

interface FaqSource {
  id: string;
  category: (typeof faqCategories)[number];
  q: { en: string; sq: string };
  a: { en: string; sq: string };
}

const source: FaqSource[] = [
  {
    id: "what-is-operix", category: "General",
    q: { en: "What is OperiX?", sq: "Çfarë është OperiX?" },
    a: {
      en: "OperiX is a family of business apps. OperiX Invoice is available today on the web and on mobile. OperiX Booking and OperiX Suite are coming soon.",
      sq: "OperiX është një familje aplikacionesh biznesi. OperiX Invoice është në dispozicion sot në web dhe në celular. OperiX Booking dhe OperiX Suite vijnë së shpejti.",
    },
  },
  {
    id: "is-it-free", category: "General",
    q: { en: "Is OperiX Invoice free?", sq: "A është OperiX Invoice falas?" },
    a: {
      en: "Yes, you can use it for free when your data is stored On this device. OperiX Cloud, from €2.99 a month, adds storage on our servers, several devices, a team, customer links and the API.",
      sq: "Po, mund ta përdorni falas kur të dhënat ruhen Në këtë pajisje. OperiX Cloud, nga €2.99 në muaj, shton ruajtje në serverët tanë, disa pajisje, ekip, lidhje për klientët dhe API-n.",
    },
  },
  {
    id: "languages", category: "General",
    q: { en: "Which languages does OperiX support?", sq: "Cilat gjuhë mbështet OperiX?" },
    a: {
      en: "The web and mobile apps are available in English and Albanian (Shqip). Each invoice can be issued in English, Albanian or Serbian. Change the interface language in Settings → Appearance on the web, or Settings → App language on mobile.",
      sq: "Aplikacionet web dhe celular janë në anglisht dhe shqip. Çdo faturë mund të lëshohet në anglisht, shqip ose serbisht. Gjuhën e ndërfaqes e ndryshoni te Cilësimet → Pamja në web, ose Settings → App language në celular.",
    },
  },
  {
    id: "which-products", category: "General",
    q: { en: "What is OperiX Suite?", sq: "Çfarë është OperiX Suite?" },
    a: {
      en: "OperiX Suite will bundle OperiX Invoice and OperiX Booking under one subscription and one workspace. It is coming soon.",
      sq: "OperiX Suite do të bashkojë OperiX Invoice dhe OperiX Booking nën një abonim dhe një hapësirë pune. Vjen së shpejti.",
    },
  },
  {
    id: "reset-password", category: "Account",
    q: { en: "How do I reset my password?", sq: "Si ta rivendos fjalëkalimin?" },
    a: {
      en: "On the sign-in page choose Forgot password? and follow the link sent to your email. Choose a new password of at least 6 characters.",
      sq: "Në faqen e hyrjes zgjidhni Keni harruar fjalëkalimin? dhe ndiqni lidhjen e dërguar në emailin tuaj. Zgjidhni një fjalëkalim të ri me të paktën 6 shkronja.",
    },
  },
  {
    id: "same-account", category: "Account",
    q: { en: "Do I use the same account on web and mobile?", sq: "A e përdor të njëjtën llogari në web dhe celular?" },
    a: {
      en: "Yes. One OperiX account signs you in everywhere. Where your business data is stored is a separate choice in Settings → Data storage.",
      sq: "Po. Një llogari OperiX ju identifikon kudo. Ku ruhen të dhënat e biznesit është zgjedhje e veçantë te Cilësimet → Ruajtja e të dhënave.",
    },
  },
  {
    id: "add-team", category: "Account",
    q: { en: "Can I add colleagues?", sq: "A mund të shtoj kolegë?" },
    a: {
      en: "Yes, with OperiX Cloud. Invite them in Settings → Users & Access and give each person a role. Your plan includes one active user and each extra user costs €0.99 a month or €9.99 a year.",
      sq: "Po, me OperiX Cloud. Ftojini te Cilësimet → Përdoruesit dhe qasja dhe jepini secilit një rol. Plani juaj përfshin një përdorues aktiv dhe çdo përdorues shtesë kushton €0.99 në muaj ose €9.99 në vit.",
    },
  },
  {
    id: "plans-and-prices", category: "Billing",
    q: { en: "How much does OperiX Invoice cost?", sq: "Sa kushton OperiX Invoice?" },
    a: {
      en: "On this device is free. OperiX Invoice in the cloud is €2.99 a month or €29.99 a year, with one workspace and one active user included. Extra workspaces cost €1.99 a month or €19.99 a year, extra active users €0.99 a month or €9.99 a year, and the API add-on €4.99 a month.",
      sq: "Në këtë pajisje është falas. OperiX Invoice në cloud kushton €2.99 në muaj ose €29.99 në vit, me një hapësirë pune dhe një përdorues aktiv të përfshirë. Hapësirat shtesë kushtojnë €1.99 në muaj ose €19.99 në vit, përdoruesit aktivë shtesë €0.99 në muaj ose €9.99 në vit dhe shtesa API €4.99 në muaj.",
    },
  },
  {
    id: "how-to-subscribe", category: "Billing",
    q: { en: "How do I subscribe or cancel?", sq: "Si të abonohem ose të anuloj?" },
    a: {
      en: "Open Settings → Billing & Subscription on the web. Choose Subscribe to start, and Manage Subscription to change the plan, update your payment method or cancel. Only workspace administrators can manage billing.",
      sq: "Hapni Cilësimet → Faturimi dhe abonimi në web. Zgjidhni Abonohu për të filluar, dhe Menaxho abonimin për të ndryshuar planin, përditësuar metodën e pagesës ose anuluar. Vetëm administratorët e hapësirës së punës mund ta menaxhojnë faturimin.",
    },
  },
  {
    id: "trial", category: "Billing",
    q: { en: "Is there a free trial?", sq: "A ka provë falas?" },
    a: {
      en: "There is no timed trial. Instead OperiX Invoice is free to use On this device for as long as you like, and you move to OperiX Cloud when you need it.",
      sq: "Nuk ka provë me afat. Në vend të saj OperiX Invoice është falas për t’u përdorur Në këtë pajisje për sa kohë të doni dhe kaloni te OperiX Cloud kur ju duhet.",
    },
  },
  {
    id: "where-is-my-data", category: "Invoice",
    q: { en: "Where is my data stored?", sq: "Ku ruhen të dhënat e mia?" },
    a: {
      en: "You choose in Settings → Data storage. On this device keeps it in your browser or on your phone. OperiX Cloud keeps it on OperiX servers with automatic backup.",
      sq: "Zgjidhni te Cilësimet → Ruajtja e të dhënave. Në këtë pajisje i mban në shfletuesin ose në telefonin tuaj. OperiX Cloud i mban në serverët e OperiX me kopje automatike.",
    },
  },
  {
    id: "backup-my-data", category: "Invoice",
    q: { en: "How do I back up my data?", sq: "Si të bëj kopje rezervë të të dhënave?" },
    a: {
      en: "In On this device mode open Settings → Data storage and choose Export backup. Keep the file somewhere private and safe. You can import it in another browser or on your phone with Import backup.",
      sq: "Në mënyrën Në këtë pajisje hapni Cilësimet → Ruajtja e të dhënave dhe zgjidhni Eksporto kopjen rezervë. Mbajeni skedarin diku privat e të sigurt. Mund ta importoni në shfletues tjetër ose në telefon me Importo kopjen rezervë.",
    },
  },
  {
    id: "web-mobile-sync", category: "Invoice",
    q: { en: "Do web and mobile show the same data?", sq: "A shfaqin web dhe celulari të njëjtat të dhëna?" },
    a: {
      en: "With OperiX Cloud, yes. With On this device, each device has its own data; move it with a backup file.",
      sq: "Me OperiX Cloud, po. Me Në këtë pajisje, secila pajisje ka të dhënat e veta; zhvendosini me skedar kopjeje.",
    },
  },
  {
    id: "vat-and-payroll", category: "Invoice",
    q: { en: "Does OperiX support Kosovo VAT and payroll?", sq: "A mbështet OperiX TVSH-në dhe pagat e Kosovës?" },
    a: {
      en: "Yes. Documents use the Kosovo VAT rates (18% and 8%) and payroll uses Kosovo pension and income tax rules. These are a starting point: have your accountant review your setup.",
      sq: "Po. Dokumentet përdorin normat e TVSH-së së Kosovës (18% dhe 8%) dhe pagat përdorin rregullat e Kosovës për pensionin dhe tatimin mbi të ardhurat. Janë një pikënisje: kërkoni që kontabilisti juaj ta shqyrtojë konfigurimin.",
    },
  },
  {
    id: "sef", category: "Invoice",
    q: { en: "Is OperiX Invoice a certified fiscal software (SEF)?", sq: "A është OperiX Invoice softuer fiskal i certifikuar (SEF)?" },
    a: {
      en: "No. It does not issue fiscal receipts, register sales with the Tax Administration or submit declarations. Consumer sales in Kosovo must be registered through certified fiscal software.",
      sq: "Jo. Nuk lëshon kuponë fiskalë, nuk i regjistron shitjet te Administrata Tatimore dhe nuk dorëzon deklarata. Shitjet ndaj konsumatorëve në Kosovë duhet të regjistrohen përmes softuerit fiskal të certifikuar.",
    },
  },
  {
    id: "import-customers", category: "Invoice",
    q: { en: "Can I import my customers and products?", sq: "A mund t’i importoj klientët dhe produktet?" },
    a: {
      en: "Yes, from a CSV file in Settings → Data Import / Export. Customers, products, vendors and expenses are supported, and English or Albanian column names are recognised.",
      sq: "Po, nga një skedar CSV te Cilësimet → Importi / eksporti i të dhënave. Mbështeten klientët, produktet, furnitorët dhe shpenzimet, dhe njihen emra kolonash në anglisht ose shqip.",
    },
  },
  {
    id: "invoice-language-faq", category: "Invoice",
    q: { en: "Can I invoice in Albanian, English or Serbian?", sq: "A mund të faturoj në shqip, anglisht ose serbisht?" },
    a: {
      en: "Yes. Each invoice has its own language. Set the default in Settings → General → Invoice language.",
      sq: "Po. Çdo faturë ka gjuhën e vet. Caktoni parazgjedhjen te Cilësimet → E përgjithshme → Gjuha e faturës.",
    },
  },
  {
    id: "self-host", category: "Invoice",
    q: { en: "Can I run OperiX Invoice on my own server?", sq: "A mund ta ekzekutoj OperiX Invoice në serverin tim?" },
    a: {
      en: "Yes. The web app is open source (GNU AGPL-3.0) and free for as long as you host it yourself. The repository includes the database setup for a Supabase project, so you can store your data in your own cloud database or keep it in each browser. See the Self-Hosting guides for requirements and limits.",
      sq: "Po. Aplikacioni web është me kod të hapur (GNU AGPL-3.0) dhe falas për sa kohë që e hostoni në serverin tuaj. Depoja përfshin ngritjen e bazës së të dhënave për një projekt Supabase, ndaj mund t’i ruani të dhënat në bazën tuaj cloud ose t’i mbani në çdo shfletues. Shihni udhëzuesit e hostimit në serverin tuaj për kërkesat dhe kufizimet.",
    },
  },
  {
    id: "booking-available", category: "Booking",
    q: { en: "When is OperiX Booking available?", sq: "Kur vjen OperiX Booking?" },
    a: {
      en: "OperiX Booking is coming soon and cannot be purchased yet. Write to us from the Contact page on operixsuite.com to be told when it opens.",
      sq: "OperiX Booking vjen së shpejti dhe nuk mund të blihet ende. Na shkruani nga faqja Kontakti te operixsuite.com për t’ju njoftuar kur hapet.",
    },
  },
  {
    id: "booking-api", category: "Booking",
    q: { en: "Is there an API for OperiX Booking?", sq: "A ka API për OperiX Booking?" },
    a: {
      en: "The Booking API is coming soon, together with the product. The API documentation covers OperiX Invoice today.",
      sq: "API-ja e Booking vjen së shpejti, bashkë me produktin. Dokumentacioni API mbulon sot OperiX Invoice.",
    },
  },
  {
    id: "data-security", category: "Security",
    q: { en: "Is my data safe?", sq: "A janë të sigurta të dhënat e mia?" },
    a: {
      en: "With OperiX Cloud your data is stored on our servers and backed up automatically. On this device your data never leaves your browser or phone, so you are responsible for backups. Backup files are not encrypted, so keep them private.",
      sq: "Me OperiX Cloud të dhënat ruhen në serverët tanë me kopje automatike. Në këtë pajisje të dhënat nuk largohen kurrë nga shfletuesi ose telefoni juaj, ndaj ju jeni përgjegjës për kopjet rezervë. Skedarët e kopjes nuk janë të enkriptuar, ndaj mbajini privatë.",
    },
  },
  {
    id: "api-keys-safe", category: "Security",
    q: { en: "How do I keep API keys safe?", sq: "Si t’i mbaj çelësat API të sigurt?" },
    a: {
      en: "Keep keys on your server only, give each key just the permissions it needs, use test keys while you build, and revoke a key if you think it has leaked.",
      sq: "Mbajini çelësat vetëm në serverin tuaj, jepini secilit çelës vetëm lejet që i duhen, përdorni çelësa testi gjatë ndërtimit dhe revokojeni një çelës nëse mendoni se ka rrjedhur.",
    },
  },
  {
    id: "mobile-available", category: "Mobile Apps",
    q: { en: "What can the mobile app do?", sq: "Çfarë mund të bëjë aplikacioni celular?" },
    a: {
      en: "Create and share invoices, take payments, use the POS with barcode scanning, track expenses and stock, see reports, and get alerts for overdue invoices, bills and low stock.",
      sq: "Të krijojë e ndajë fatura, të marrë pagesa, të përdorë POS me skanim barkodi, të ndjekë shpenzimet dhe stokun, të shfaqë raporte dhe të japë njoftime për fatura me afat të kaluar, fatura furnitorësh dhe stok të ulët.",
    },
  },
  {
    id: "mobile-own-server", category: "Mobile Apps",
    q: { en: "Can the mobile app connect to my own server?", sq: "A mund të lidhet aplikacioni celular me serverin tim?" },
    a: {
      en: "Not today. The app is built for OperiX Cloud and has no setting for another server. You can use it On this device, or contact us about other needs.",
      sq: "Jo sot. Aplikacioni është ndërtuar për OperiX Cloud dhe nuk ka cilësim për server tjetër. Mund ta përdorni Në këtë pajisje, ose na kontaktoni për nevoja të tjera.",
    },
  },
  {
    id: "data-missing", category: "Troubleshooting",
    q: { en: "My lists are empty. Where is my data?", sq: "Listat e mia janë bosh. Ku janë të dhënat?" },
    a: {
      en: "Check your storage mode in Settings → Data storage, that you are in the same browser, profile and address as before, and the filters and period. Then import your latest backup if needed. See “My data is missing or different”.",
      sq: "Kontrolloni mënyrën e ruajtjes te Cilësimet → Ruajtja e të dhënave, që jeni në të njëjtin shfletues, profil dhe adresë si më parë, dhe filtrat e periudhën. Pastaj importoni kopjen e fundit nëse duhet. Shihni “Të dhënat e mia mungojnë ose janë të ndryshme”.",
    },
  },
  {
    id: "another-tab", category: "Troubleshooting",
    q: { en: "Why does it say OperiX is open in another tab?", sq: "Pse thotë që OperiX është i hapur në skedë tjetër?" },
    a: {
      en: "In On this device mode only one tab or window can use the database. Close other OperiX tabs and reload.",
      sq: "Në mënyrën Në këtë pajisje vetëm një skedë ose dritare mund ta përdorë bazën. Mbyllni skedat e tjera të OperiX dhe ringarkoni.",
    },
  },
  {
    id: "contact-support", category: "Troubleshooting",
    q: { en: "How do I contact OperiX?", sq: "Si të kontaktoj OperiX?" },
    a: {
      en: "Use the Contact page on operixsuite.com, or the support options on the Support page of this Help Center.",
      sq: "Përdorni faqen Kontakti te operixsuite.com, ose opsionet e mbështetjes te faqja Mbështetja e kësaj Qendre Ndihme.",
    },
  },
];

export const faqs: FaqItem[] = (["en", "sq"] as Locale[]).flatMap((locale) =>
  source.map((item, index) => ({
    id: locale === "en" ? item.id : `${item.id}-sq`,
    locale,
    category: item.category,
    question: item.q[locale],
    answer: item.a[locale],
    order: index + 1,
  })),
);

export function getFaqs(locale: Locale) {
  const localized = faqs.filter((faq) => faq.locale === locale);
  return localized.length ? localized : faqs.filter((faq) => faq.locale === "en");
}
