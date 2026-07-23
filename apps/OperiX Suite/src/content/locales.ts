export const localeLabels = { en: "English", al: "Shqip" } as const;
export type Locale = keyof typeof localeLabels;

export const al = {
  nav: { overview: "Përmbledhje", products: "Produktet", features: "Veçoritë", pricing: "Çmimet", resources: "Burime", about: "Rreth nesh", contact: "Kontakt", start: "Fillo tani" },
  home: { eyebrow: "SUITA OPERIX", title: "Një suitë.\nKontroll i plotë.", description: "Faturim, menaxhim personeli, raporte dhe operacione të përditshme në një hapësirë të lidhur.", productsTitle: "Produkte të fuqishme.\nNjë përvojë e qartë.", productsDescription: "Zgjidhni hapësirën që i duhet biznesit tuaj sot.", benefitsTitle: "Gjithçka që ju nevojitet për biznesin.", cta: "Gati ta sillni operacionin tuaj në fokus?" },
  products: { invoice: "OperiX Invoice", hr: "OperiX HR Office", invoiceDescription: "Krijoni fatura, ndiqni pagesat, menaxhoni shpenzimet dhe kuptoni performancën financiare.", hrDescription: "Menaxhoni punonjësit, vijueshmërinë, lejet, pagat dhe ekipin në një sistem të besueshëm." },
  pages: { features: "Veçori për çdo ekip", pricing: "Çmime të qarta për çdo fazë", resources: "Burime për çdo hap", about: "Softuer biznesi me më shumë qartësi", contact: "Le të flasim", demo: "Shihni OperiX në punën tuaj", success: "Kërkesa u konfirmua" },
  actions: { learn: "Mësoni më shumë", demo: "Rezervoni një demo", contact: "Na kontaktoni", explore: "Eksploroni produktet", submit: "Dërgo kërkesën" },
  status: "Së shpejti",
} as const;

export function isLocale(value: string): value is Locale { return value === "en" || value === "al"; }
