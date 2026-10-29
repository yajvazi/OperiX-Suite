// Turns the English interface text into Albanian after it is rendered. Exact phrases come from the dictionary;
// phrases with numbers or names inside use the patterns below. Anything unknown is left as it is.

type Rule = { pattern: RegExp; render: (match: RegExpMatchArray, t: (text: string) => string) => string };

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

const RULES: Rule[] = [
  { pattern: /^(\d+) line items?$/, render: (m) => `${m[1]} ${plural(Number(m[1]), "rresht", "rreshta")}` },
  { pattern: /^(\d+) days? remaining$/, render: (m) => `${m[1]} ${plural(Number(m[1]), "ditë", "ditë")} të mbetura` },
  { pattern: /^Showing (\d+) (?:of (\d+) )?(.+)$/, render: (m, t) => `Duke shfaqur ${m[1]}${m[2] ? ` nga ${m[2]}` : ""} ${t(m[3])}` },
  { pattern: /^(\d+) available$/, render: (m) => `${m[1]} të disponueshme` },
  { pattern: /^(\d+) rows? detected · (\d+) rows? missing required values\..*$/, render: (m) => `${m[1]} rreshta u zbuluan · ${m[2]} rreshta me vlera të detyrueshme që mungojnë. Titujt përshoqërohen në shqip dhe anglisht.` },
  { pattern: /^Import (\d+) rows$/, render: (m) => `Importo ${m[1]} rreshta` },
  { pattern: /^(\d+) created, (\d+) updated\.$/, render: (m) => `${m[1]} u krijuan, ${m[2]} u përditësuan.` },
  { pattern: /^(\d+) (.+) exported\.$/, render: (m, t) => `${m[1]} ${t(m[2])} u eksportuan.` },
  { pattern: /^Page (\d+) of (\d+)$/, render: (m) => `Faqja ${m[1]} nga ${m[2]}` },
  { pattern: /^Delete (.+)\?$/, render: (m, t) => `Të fshihet ${t(m[1]).toLowerCase()}?` },
  { pattern: /^Remove (.+)\?$/, render: (m) => `Të hiqet ${m[1]}?` },
  { pattern: /^New (.+)$/, render: (m, t) => { const next = t(m[1]); return next === m[1] ? m[0] : `${next} i ri`; } },
  { pattern: /^Edit (.+)$/, render: (m, t) => { const next = t(m[1]); return next === m[1] ? m[0] : `Ndrysho ${next.toLowerCase()}`; } },
  { pattern: /^Add (.+)$/, render: (m, t) => { const next = t(m[1]); return next === m[1] ? m[0] : `Shto ${next.toLowerCase()}`; } },
  { pattern: /^Save (.+)$/, render: (m, t) => { const next = t(m[1]); return next === m[1] ? m[0] : `Ruaj ${next.toLowerCase()}`; } },
  { pattern: /^Update (.+)$/, render: (m, t) => { const next = t(m[1]); return next === m[1] ? m[0] : `Përditëso ${next.toLowerCase()}`; } },
  { pattern: /^Ready to convert (.+)\. A new number will be assigned when saved\.$/, render: (m) => `Gati për konvertimin e ${m[1]}. Një numër i ri caktohet kur ruhet.` },
  { pattern: /^(.+) saved as draft \((.+)\)\.$/, render: (m, t) => `${t(m[1])} u ruajt si draft (${m[2]}).` },
  { pattern: /^Payroll for (.+) calculated for (\d+) employees?\. Review it, then finalise\.$/, render: (m) => `Pagat për ${m[1]} u llogaritën për ${m[2]} punonjës. Shqyrtojini dhe pastaj finalizojini.` },
  { pattern: /^The (.+) payroll is already (.+)\. It cannot be recalculated\.$/, render: (m) => `Pagat për ${m[1]} janë tashmë ${m[2]}. Nuk mund të rillogariten.` },
  { pattern: /^Imported: (\d+) new, (\d+) updated, (\d+) skipped\..*$/, render: (m) => `U importuan: ${m[1]} të reja, ${m[2]} të përditësuara, ${m[3]} të anashkaluara. Rifreskoni faqen për të parë të dhënat.` },
  { pattern: /^Copied (\d+) records \((\d+) customers, (\d+) products, (\d+) suppliers\)\. (\d+) already existed\.$/, render: (m) => `U kopjuan ${m[1]} regjistrime (${m[2]} klientë, ${m[3]} produkte, ${m[4]} furnitorë). ${m[5]} ekzistonin tashmë.` },
  { pattern: /^Payroll (\d{4}-\d{2})$/, render: (m) => `Pagat ${m[1]}` },
  { pattern: /^(.+) · (draft|finalised|paid)( · paid .+)?$/, render: (m) => `${m[1]} · ${({ draft: "draft", finalised: "finalizuar", paid: "paguar" } as Record<string, string>)[m[2]]}${m[3] ? m[3].replace("paid", "paguar më") : ""}` },
  { pattern: /^Permission required: (.+)$/, render: (m) => `Kërkohet leja: ${m[1]}` },
  { pattern: /^Ready to convert this document\.$/, render: () => "Gati për konvertimin e këtij dokumenti." },
  { pattern: /^(\d+) open invoices?$/, render: (m) => `${m[1]} ${plural(Number(m[1]), "faturë e hapur", "fatura të hapura")}` },
  { pattern: /^(\d+) invoices?$/, render: (m) => `${m[1]} ${plural(Number(m[1]), "faturë", "fatura")}` },
  { pattern: /^(\d+) products?$/, render: (m) => `${m[1]} ${plural(Number(m[1]), "produkt", "produkte")}` },
  { pattern: /^(\d+) items?$/, render: (m) => `${m[1]} ${plural(Number(m[1]), "artikull", "artikuj")}` },
  { pattern: /^Items \((\d+)\)$/, render: (m) => `Artikujt (${m[1]})` },
  { pattern: /^Invoice · (.+)$/, render: (m) => `Faturë · ${m[1]}` },
  { pattern: /^Quote · (.+)$/, render: (m) => `Ofertë · ${m[1]}` },
  { pattern: /^(.+) · Due (.+)$/, render: (m) => `${m[1]} · Afati ${m[2]}` },
  { pattern: /^Email: · Phone:$/, render: () => "Email: · Tel:" },
  { pattern: /^SKU: · Category: (.+)$/, render: (m) => `SKU: · Kategoria: ${m[1]}` },
  { pattern: /^(Increase|Decrease) discount for (.+)$/, render: (m) => `${m[1] === "Increase" ? "Rrit" : "Ul"} zbritjen për ${m[2]}` },
  { pattern: /^(Increase|Decrease) (.+)$/, render: (m) => `${m[1] === "Increase" ? "Rrit" : "Ul"} ${m[2]}` },
  { pattern: /^Quantity for (.+)$/, render: (m) => `Sasia për ${m[1]}` },
  { pattern: /^Remove (.+)$/, render: (m, t) => { const next = t(m[1]); return next === m[1] ? m[0] : `Hiq ${next.toLowerCase()}`; } },
  { pattern: /^Actions for (.+)$/, render: (m) => `Veprimet për ${m[1]}` },
  { pattern: /^Brand colou?r (#[0-9A-Fa-f]{6})$/, render: (m) => `Ngjyra e markës ${m[1]}` },
  { pattern: /^Create (.+)$/, render: (m, t) => { const next = t(m[1]); return next === m[1] ? m[0] : `Krijo ${next.toLowerCase()}`; } },
  { pattern: /^(Filter|Sort|Search) (.+)$/, render: (m, t) => { const next = t(m[2]); return next === m[2] ? m[0] : `${({ Filter: "Filtro", Sort: "Rendit", Search: "Kërko" } as Record<string, string>)[m[1]]} ${next.toLowerCase()}`; } },
  { pattern: /^Ctrl K$/, render: () => "Ctrl K" },
];

export interface Translator {
  /** The Albanian text for `text`, or null when there is nothing to change. */
  translate(text: string): string | null;
}

export function createTranslator(dictionary: Record<string, string>): Translator {
  const exact = new Map<string, string>(Object.entries(dictionary));
  const folded = new Map<string, string>();
  for (const [key, value] of exact) folded.set(key.toLowerCase(), value);

  const lookup = (core: string): string | null => {
    const direct = exact.get(core);
    if (direct !== undefined) return direct;
    const lower = folded.get(core.toLowerCase());
    if (lower === undefined) return null;
    if (core === core.toUpperCase() && /[A-Z]{2}/.test(core)) return lower.toUpperCase();
    return lower;
  };
  const phrase = (text: string): string => lookup(text) ?? text;

  return {
    translate(text) {
      const core = text.replace(/\s+/g, " ").trim();
      if (!core || !/[A-Za-z]{2}/.test(core)) return null;
      let result = lookup(core);
      if (result === null) {
        for (const rule of RULES) {
          const match = core.match(rule.pattern);
          if (match) { result = rule.render(match, phrase); break; }
        }
      }
      if (result === null || result === core) return null;
      const lead = text.match(/^\s*/)?.[0] ?? "";
      const trail = text.match(/\s*$/)?.[0] ?? "";
      return `${lead}${result}${trail}`;
    },
  };
}
