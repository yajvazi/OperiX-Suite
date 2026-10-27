export type IcsBusyPeriod = {
  external_event_id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

type IcsProperty = { name: string; params: Record<string, string>; value: string };
type IcsEvent = { uid: string; start: IcsProperty; end?: IcsProperty; duration?: IcsProperty; rule?: IcsProperty; excluded: IcsProperty[]; dates: IcsProperty[] };
type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const MAX_OCCURRENCES = 5000;

function unfold(text: string) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/).map((line) => line.trimEnd());
}

function property(line: string): IcsProperty | null {
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  const left = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const item of left.slice(1)) {
    const equals = item.indexOf('=');
    if (equals > 0) params[item.slice(0, equals).toUpperCase()] = item.slice(equals + 1).replace(/^"|"$/g, '');
  }
  return { name: left[0].toUpperCase(), params, value: line.slice(colon + 1).trim() };
}

function decodeText(value: string) {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function utcParts(date: Date, timezone: string): Parts {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(formatted.filter((item) => item.type !== 'literal').map((item) => [item.type, Number(item.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

function timezoneOffsetMs(date: Date, timezone: string) {
  const parts = utcParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function localToUtc(parts: Parts, timezone: string) {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = timezoneOffsetMs(new Date(guess), timezone);
    const next = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function parseParts(value: string): { parts: Parts; utc: boolean; dateOnly: boolean } | null {
  const clean = value.trim();
  const dateOnly = /^\d{8}$/.test(clean);
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/i);
  if (!match) return null;
  return { parts: { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4] || 0), minute: Number(match[5] || 0), second: Number(match[6] || 0) }, utc: Boolean(match[7]), dateOnly };
}

function parseDate(value: string, timezone: string, dateOnlyEnd = false) {
  const parsed = parseParts(value);
  if (!parsed) return null;
  if (parsed.dateOnly && dateOnlyEnd) {
    const next = new Date(Date.UTC(parsed.parts.year, parsed.parts.month - 1, parsed.parts.day) + 86400000);
    const nextParts = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0, second: 0 };
    return localToUtc(nextParts, timezone);
  }
  return parsed.utc ? new Date(Date.UTC(parsed.parts.year, parsed.parts.month - 1, parsed.parts.day, parsed.parts.hour, parsed.parts.minute, parsed.parts.second)) : localToUtc(parsed.parts, timezone);
}

/** Convert a provider-local ISO date-time (for example Microsoft Graph's
 * `dateTime` value) without exposing event titles or provider-specific data. */
export function calendarDateTimeToUtc(value: string, timezone = 'UTC') {
  const clean = value.trim();
  const direct = new Date(clean);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(clean)) return Number.isNaN(direct.getTime()) ? null : direct;
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) return Number.isNaN(direct.getTime()) ? null : direct;
  const local = localToUtc({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0) }, timezone);
  const milliseconds = Number((match[7] || '').padEnd(3, '0') || 0);
  return new Date(local.getTime() + milliseconds);
}

function durationMs(value: string) {
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  return ((Number(match[1] || 0) * 86400) + (Number(match[2] || 0) * 3600) + (Number(match[3] || 0) * 60) + Number(match[4] || 0)) * 1000;
}

function ruleValues(value: string) {
  return Object.fromEntries(value.split(';').map((item) => { const [key, ...rest] = item.split('='); return [key.toUpperCase(), rest.join('=')]; }).filter(([key, value]) => key && value));
}

function dayKey(date: Date, timezone: string) {
  const parts = utcParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
}

function addCalendarDays(date: Date, days: number, timezone: string) {
  const parts = utcParts(date, timezone);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second));
  return localToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: next.getUTCHours(), minute: next.getUTCMinutes(), second: next.getUTCSeconds() }, timezone);
}

function monthDifference(from: Parts, to: Parts) {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

function matchesRule(candidate: Date, start: Date, rule: Record<string, string>, timezone: string) {
  const startParts = utcParts(start, timezone);
  const candidateParts = utcParts(candidate, timezone);
  const interval = Math.max(1, Number(rule.INTERVAL || 1));
  const weekday = new Date(Date.UTC(candidateParts.year, candidateParts.month - 1, candidateParts.day)).getUTCDay();
  const byDay = rule.BYDAY ? rule.BYDAY.split(',').map((item) => WEEKDAYS[item.replace(/[+-]\d+/, '')]).filter((item) => item !== undefined) : [];
  const byMonthDay = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : [];
  if (rule.BYMONTH && !rule.BYMONTH.split(',').map(Number).includes(candidateParts.month)) return false;
  if (byDay.length && !byDay.includes(weekday)) return false;
  if (byMonthDay.length && !byMonthDay.includes(candidateParts.day)) return false;
  if (rule.FREQ === 'DAILY') return Math.round((candidate.getTime() - start.getTime()) / 86400000) % interval === 0;
  if (rule.FREQ === 'WEEKLY') {
    const startMonday = addCalendarDays(start, -((start.getUTCDay() + 6) % 7), timezone);
    const candidateMonday = addCalendarDays(candidate, -((candidate.getUTCDay() + 6) % 7), timezone);
    const weeks = Math.round((candidateMonday.getTime() - startMonday.getTime()) / (7 * 86400000));
    return weeks >= 0 && weeks % interval === 0 && (byDay.length ? byDay.includes(weekday) : weekday === startPartsToWeekday(start, timezone));
  }
  if (rule.FREQ === 'MONTHLY') {
    const months = monthDifference(startParts, candidateParts);
    return months >= 0 && months % interval === 0 && (byMonthDay.length ? byMonthDay.includes(candidateParts.day) : (byDay.length ? byDay.includes(weekday) : candidateParts.day === startParts.day));
  }
  if (rule.FREQ === 'YEARLY') {
    const years = candidateParts.year - startParts.year;
    return years >= 0 && years % interval === 0 && candidateParts.month === startParts.month && candidateParts.day === startParts.day && (!byDay.length || byDay.includes(weekday));
  }
  return false;
}

function startPartsToWeekday(date: Date, timezone: string) {
  const parts = utcParts(date, timezone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function parseEvent(lines: string[]) {
  let inside = false;
  let uid = '';
  let start: IcsProperty | undefined;
  let end: IcsProperty | undefined;
  let duration: IcsProperty | undefined;
  let rule: IcsProperty | undefined;
  const excluded: IcsProperty[] = [];
  const dates: IcsProperty[] = [];
  const events: IcsEvent[] = [];
  for (const line of lines) {
    const item = property(line);
    if (!item) continue;
    if (item.name === 'BEGIN' && item.value.toUpperCase() === 'VEVENT') { inside = true; continue; }
    if (item.name === 'END' && item.value.toUpperCase() === 'VEVENT') {
      if (uid && start) events.push({ uid, start, end, duration, rule, excluded, dates });
      inside = false; uid = ''; start = undefined; end = undefined; duration = undefined; rule = undefined; excluded.length = 0; dates.length = 0;
      continue;
    }
    if (!inside) continue;
    if (item.name === 'UID') uid = decodeText(item.value);
    else if (item.name === 'DTSTART') start = item;
    else if (item.name === 'DTEND') end = item;
    else if (item.name === 'DURATION') duration = item;
    else if (item.name === 'RRULE') rule = item;
    else if (item.name === 'EXDATE') excluded.push(item);
    else if (item.name === 'RDATE') dates.push(item);
  }
  return events;
}

function occurrences(event: IcsEvent, from: Date, to: Date) {
  const timezone = event.start.params.TZID || 'UTC';
  const start = parseDate(event.start.value, timezone);
  if (!start) return [];
  const parsedEnd = event.end ? parseDate(event.end.value, timezone, event.end.params.VALUE === 'DATE') : null;
  const eventEnd = parsedEnd ?? (event.duration
    ? new Date(start.getTime() + (durationMs(event.duration.value) || 0))
    : new Date(start.getTime() + (event.start.params.VALUE === 'DATE' ? 86400000 : 3600000)));
  const duration = Math.max(1, eventEnd.getTime() - start.getTime());
  const rule = event.rule ? ruleValues(event.rule.value) : null;
  const until = rule?.UNTIL ? parseDate(rule.UNTIL, timezone) : null;
  const count = rule?.COUNT ? Math.min(MAX_OCCURRENCES, Math.max(1, Number(rule.COUNT))) : MAX_OCCURRENCES;
  const excluded = new Set(event.excluded.flatMap((item) => item.value.split(',').map((value) => parseDate(value, item.params.TZID || timezone)).filter((value): value is Date => Boolean(value))).map((value) => dayKey(value, timezone)));
  const starts = [start, ...event.dates.flatMap((item) => item.value.split(',').map((value) => parseDate(value, item.params.TZID || timezone)).filter((value): value is Date => Boolean(value)))];
  if (rule) {
    const scanStart = addCalendarDays(start, -2, timezone);
    const scanEnd = new Date(to.getTime() + 366 * 86400000);
    for (let cursor = scanStart, guard = 0; cursor < scanEnd && guard < 3700 && starts.length < MAX_OCCURRENCES; cursor = addCalendarDays(cursor, 1, timezone), guard += 1) {
      if (!matchesRule(cursor, start, rule, timezone) || (until && cursor > until) || excluded.has(dayKey(cursor, timezone))) continue;
      const occurrenceIndex = starts.length;
      if (occurrenceIndex >= count) break;
      if (!starts.some((value) => value.getTime() === cursor.getTime())) starts.push(cursor);
    }
  }
  return starts.slice(0, count).filter((value) => !excluded.has(dayKey(value, timezone))).map((value, index) => ({ start: value, end: new Date(value.getTime() + duration), index })).filter((value) => value.end > from && value.start < to);
}

export function parseIcsFeed(text: string, range: { from: Date; to: Date }): IcsBusyPeriod[] {
  const result: IcsBusyPeriod[] = [];
  for (const event of parseEvent(unfold(text))) {
    for (const occurrence of occurrences(event, range.from, range.to)) {
      result.push({ external_event_id: event.rule ? `${event.uid}#${occurrence.index}` : event.uid, starts_at: occurrence.start.toISOString(), ends_at: occurrence.end.toISOString(), all_day: event.start.params.VALUE === 'DATE' });
    }
  }
  return result;
}
