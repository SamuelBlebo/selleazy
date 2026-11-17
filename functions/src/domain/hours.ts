/** A merchant's opening hours, stored on organizations/{id}.bot.hours. */
export interface DayHours { open: string; close: string } // "HH:MM", 24-hour; close <= open runs past midnight
export interface OpeningHours {
  enabled: boolean;
  timezone: string; // IANA, e.g. "Africa/Accra"
  days: Array<DayHours | null>; // index 0 = Sunday … 6 = Saturday; null = closed all day
  ordersWhenClosed: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Day of week and minutes since midnight in the merchant's timezone. */
function localClock(tz: string, now: Date): { day: number; min: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return { day: WEEKDAY[get('weekday')] ?? 0, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Open right now? With hours off or not set, always open. */
export function isOpen(hours: OpeningHours | null | undefined, now = new Date()): boolean {
  if (!hours?.enabled || hours.days?.length !== 7) return true;
  const { day, min } = localClock(hours.timezone, now);
  const today = hours.days[day];
  if (today) {
    const o = toMin(today.open), c = toMin(today.close);
    if (c > o ? min >= o && min < c : min >= o) return true;
  }
  const yesterday = hours.days[(day + 6) % 7];
  if (yesterday) {
    const o = toMin(yesterday.open), c = toMin(yesterday.close);
    if (c <= o && min < c) return true; // still inside last night's late shift
  }
  return false;
}

export function clockLabel(hhmm: string): string {
  const total = toMin(hhmm);
  const h = Math.floor(total / 60), m = total % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

/** "today at 4pm", "tomorrow at 8am", "on Monday at 9:30am"; null when no day is open. */
export function nextOpening(hours: OpeningHours, now = new Date()): string | null {
  const { day, min } = localClock(hours.timezone, now);
  for (let ahead = 0; ahead < 7; ahead++) {
    const d = hours.days[(day + ahead) % 7];
    if (!d || (ahead === 0 && toMin(d.open) <= min)) continue;
    const when = ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : `on ${DAY_NAMES[(day + ahead) % 7]}`;
    return `${when} at ${clockLabel(d.open)}`;
  }
  return null;
}

/** One line per day, Monday first: "Monday: 8am – 6pm". */
export function hoursText(hours: OpeningHours): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((i) => `${DAY_NAMES[i]}: ${hours.days[i] ? `${clockLabel(hours.days[i]!.open)} – ${clockLabel(hours.days[i]!.close)}` : 'closed'}`).join('\n');
}

/** What the bot says while closed. */
export function closedNotice(hours: OpeningHours, now = new Date()): string {
  const next = nextOpening(hours, now);
  const back = next ? `We open again ${next}.` : 'We will be back soon.';
  return hours.ordersWhenClosed
    ? `We're closed right now. ${back} You can still order, and we'll get to it as soon as we open.`
    : `We're closed right now. ${back} You can look around, and order once we're open.`;
}
