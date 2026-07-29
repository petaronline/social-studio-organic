/**
 * Notable dates — a hand-picked calendar of moments a social team actually
 * posts around.
 *
 * NOT a public-holidays feed. Bank holidays are mostly irrelevant to content
 * and the genuinely useful ones (Christmas, New Year) are obvious. What earns
 * a place here is a date brands *make content for*: awareness days, shopping
 * moments, cultural events, the small internet holidays that reliably drive
 * engagement.
 *
 * Scope is deliberately curated over exhaustive. A list of 400 obscure
 * "national ___ day" entries is noise; the value is in a short, trustworthy
 * set you can actually plan against. Add to it as the team finds gaps.
 *
 * Dates are fixed month/day. Moveable feasts (Easter, Thanksgiving, Ramadan,
 * Black Friday) are computed — see movableDatesForYear — because hardcoding
 * them per year rots. Everything is timezone-naive: a "date" here is a
 * calendar day, resolved to local midnight when it becomes a schedule time.
 */

export type NotableCategory =
  | 'shopping'
  | 'awareness'
  | 'cultural'
  | 'seasonal'
  | 'internet'
  | 'sport';

export interface NotableDate {
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  title: string;
  category: NotableCategory;
  /** One line: why a brand would post, or what to say. */
  note?: string;
}

/** Fixed-date entries. Ordered by month/day for readability, not required. */
const FIXED: NotableDate[] = [
  // January
  { month: 1, day: 1, title: 'New Year’s Day', category: 'seasonal', note: 'Fresh-start messaging, year-ahead teasers.' },
  { month: 1, day: 25, title: 'Burns Night', category: 'cultural' },
  // February
  { month: 2, day: 4, title: 'World Cancer Day', category: 'awareness' },
  { month: 2, day: 14, title: 'Valentine’s Day', category: 'shopping', note: 'Gifting, couples, self-love angles.' },
  { month: 2, day: 20, title: 'Love Your Pet Day', category: 'internet' },
  // March
  { month: 3, day: 8, title: 'International Women’s Day', category: 'awareness', note: 'Plan the message early — tone matters more than reach.' },
  { month: 3, day: 17, title: 'St Patrick’s Day', category: 'cultural' },
  { month: 3, day: 20, title: 'International Day of Happiness', category: 'internet' },
  // April
  { month: 4, day: 1, title: 'April Fools’ Day', category: 'internet', note: 'High-risk, high-reward. Get it approved.' },
  { month: 4, day: 22, title: 'Earth Day', category: 'awareness' },
  // May
  { month: 5, day: 4, title: 'Star Wars Day', category: 'internet', note: '"May the 4th" — fun if it fits the brand voice.' },
  { month: 5, day: 12, title: 'International Nurses Day', category: 'awareness' },
  // June
  { month: 6, day: 1, title: 'Start of Pride Month', category: 'cultural', note: 'A month-long commitment, not a one-day post.' },
  { month: 6, day: 5, title: 'World Environment Day', category: 'awareness' },
  { month: 6, day: 21, title: 'International Yoga Day', category: 'awareness' },
  // July
  { month: 7, day: 17, title: 'World Emoji Day', category: 'internet' },
  { month: 7, day: 30, title: 'International Friendship Day', category: 'internet' },
  // August
  { month: 8, day: 8, title: 'International Cat Day', category: 'internet' },
  { month: 8, day: 19, title: 'World Photography Day', category: 'cultural' },
  // September
  { month: 9, day: 21, title: 'International Day of Peace', category: 'awareness' },
  { month: 9, day: 29, title: 'World Heart Day', category: 'awareness' },
  // October
  { month: 10, day: 1, title: 'International Coffee Day', category: 'internet' },
  { month: 10, day: 4, title: 'World Animal Day', category: 'awareness' },
  { month: 10, day: 10, title: 'World Mental Health Day', category: 'awareness' },
  { month: 10, day: 31, title: 'Halloween', category: 'seasonal', note: 'Costumes, spooky angles, UGC prompts.' },
  // November
  { month: 11, day: 11, title: 'Singles’ Day', category: 'shopping', note: 'Huge in APAC e-commerce; the retail run-up to Black Friday.' },
  { month: 11, day: 13, title: 'World Kindness Day', category: 'internet' },
  { month: 11, day: 19, title: 'International Men’s Day', category: 'awareness' },
  // December
  { month: 12, day: 24, title: 'Christmas Eve', category: 'seasonal' },
  { month: 12, day: 25, title: 'Christmas Day', category: 'seasonal', note: 'Schedule ahead — nobody wants to publish on the day.' },
  { month: 12, day: 26, title: 'Boxing Day', category: 'shopping' },
  { month: 12, day: 31, title: 'New Year’s Eve', category: 'seasonal' },
];

/** nth given weekday of a month (weekday: 0=Sun..6=Sat). */
function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  const first = new Date(year, month0, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month0, 1 + offset + (n - 1) * 7);
}

/** Last given weekday of a month. */
function lastWeekday(year: number, month0: number, weekday: number): Date {
  const last = new Date(year, month0 + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month0, last.getDate() - offset);
}

/** Anonymous Gregorian algorithm — Easter Sunday for a year. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * The moveable dates for a specific year, as concrete month/day entries.
 * Recomputed per year so nothing rots.
 */
function movableDatesForYear(year: number): NotableDate[] {
  const out: NotableDate[] = [];
  const push = (d: Date, title: string, category: NotableCategory, note?: string) =>
    out.push({ month: d.getMonth() + 1, day: d.getDate(), title, category, note });

  // US Thanksgiving — 4th Thursday of November — and the shopping run after.
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  push(thanksgiving, 'Thanksgiving (US)', 'cultural');
  const blackFriday = new Date(thanksgiving);
  blackFriday.setDate(blackFriday.getDate() + 1);
  push(blackFriday, 'Black Friday', 'shopping', 'The biggest retail day of the year — plan weeks out.');
  const cyberMonday = new Date(thanksgiving);
  cyberMonday.setDate(cyberMonday.getDate() + 4);
  push(cyberMonday, 'Cyber Monday', 'shopping');

  // Mother's Day differs by region; use the US/CA/AU date (2nd Sun of May).
  push(nthWeekday(year, 4, 0, 2), 'Mother’s Day (US/AU)', 'shopping', 'UK Mother’s Day is in March — check your market.');
  // Father's Day — 3rd Sun of June (US/UK/CA).
  push(nthWeekday(year, 5, 0, 3), 'Father’s Day', 'shopping');

  // Easter weekend.
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(goodFriday.getDate() - 2);
  push(goodFriday, 'Good Friday', 'seasonal');
  push(easter, 'Easter Sunday', 'seasonal');

  // US Memorial Day / Labor Day — retail sale moments.
  push(lastWeekday(year, 4, 1), 'Memorial Day (US)', 'shopping');
  push(nthWeekday(year, 8, 1, 1), 'Labor Day (US)', 'shopping');

  return out;
}

export interface NotableDateInstance extends NotableDate {
  /** Concrete date, local midnight. */
  date: Date;
}

/**
 * Every notable date falling in a given month of a given year, as concrete
 * instances, ordered by day. Combines the fixed list with the moveable
 * feasts computed for that year.
 */
export function notableDatesForMonth(year: number, month1: number): NotableDateInstance[] {
  const all = [...FIXED, ...movableDatesForYear(year)];
  return all
    .filter((d) => d.month === month1)
    .map((d) => ({ ...d, date: new Date(year, month1 - 1, d.day) }))
    .sort((a, b) => a.day - b.day);
}

/** Visual treatment per category — quiet tints, never the cherry accent. */
export const CATEGORY_STYLE: Record<NotableCategory, { bg: string; ink: string; label: string }> = {
  shopping:  { bg: '#FFE1EC', ink: '#B4245C', label: 'Shopping' },
  awareness: { bg: '#DDE8FF', ink: '#2547A8', label: 'Awareness' },
  cultural:  { bg: '#ECE2FF', ink: '#5B2FB0', label: 'Cultural' },
  seasonal:  { bg: '#D3F3E9', ink: '#0B6B52', label: 'Seasonal' },
  internet:  { bg: '#FFF0D6', ink: '#8A5A00', label: 'Internet' },
  sport:     { bg: '#E2E3FF', ink: '#3A3BA8', label: 'Sport' },
};
