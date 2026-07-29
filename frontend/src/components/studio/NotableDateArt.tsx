'use client';

/**
 * NotableDateArt — flat two-tone illustration per notable date.
 *
 * Editorial / screenprint register (the Morland reference): bold filled
 * shapes, two FIXED colours — cherry-coral + a deep blue — with negative
 * space and no thin outlines. The pair is constant, never the category tint,
 * so the art reads as one illustrated family the way the reference always
 * pairs coral and blue. The category colour lives on the label and the date
 * chip AROUND the art, never inside it.
 *
 * 32 motifs cover 41 dates; a few natural symbols are shared (paw for pets
 * and animals, bag for every shopping moment), and a category fallback
 * catches anything the list grows to include. Each motif was drawn on a
 * 100x100 grid and inspected rendered before shipping — hand SVG path data
 * is where subtle mistakes hide.
 *
 * Motifs are stored as raw SVG markup and injected with
 * dangerouslySetInnerHTML, so attribute names stay in SVG/HTML kebab-case
 * (stroke-width, not strokeWidth). The markup is a hardcoded constant here —
 * no user input reaches it — so there is nothing to inject.
 */

import type { NotableCategory } from '@/lib/notable-dates';

const MOTIFS: Record<string, string> = {
  fireworks: `<circle cx="50" cy="46" r="6" fill="#FF3B54"/><g stroke="#294B8F" stroke-width="4" stroke-linecap="round"><path d="M50 24v10M50 58v10M24 46h10M66 46h10M32 28l7 7M68 64l-7-7M68 28l-7 7M32 64l7-7"/></g><g stroke="#FF3B54" stroke-width="3" stroke-linecap="round" opacity=".8"><path d="M22 84l6-12M50 88l0-12M78 84l-6-12"/></g>`,
  ribbon: `<path d="M50 46 L34 82 L44 80 L50 66 L56 80 L66 82Z" fill="#294B8F"/><path d="M50 20 C34 20 34 40 50 52 C66 40 66 20 50 20Z M50 20 C58 30 58 42 50 52 C42 42 42 30 50 20Z" fill="#FF3B54"/>`,
  heart: `<path d="M50 84 C22 64 16 50 16 38 A17 17 0 0 1 50 32 A17 17 0 0 1 84 38 C84 50 78 64 50 84Z" fill="#FF3B54"/><path d="M50 32 A17 17 0 0 1 84 38 C84 47 80 56 72 66Z" fill="#294B8F"/>`,
  paw: `<circle cx="34" cy="40" r="8" fill="#294B8F"/><circle cx="50" cy="32" r="8" fill="#FF3B54"/><circle cx="66" cy="40" r="8" fill="#294B8F"/><path d="M50 46 C38 46 30 56 32 66 C34 76 66 76 68 66 C70 56 62 46 50 46Z" fill="#FF3B54"/>`,
  venus: `<circle cx="50" cy="38" r="18" fill="none" stroke="#FF3B54" stroke-width="8"/><path d="M50 56v26M38 70h24" stroke="#294B8F" stroke-width="8" stroke-linecap="round"/>`,
  clover: `<g fill="#FF3B54"><g transform="translate(50,48) rotate(0)"><path d="M0 0 C-14 -10 -14 -26 -4 -26 C0 -26 0 -22 0 -18 C0 -22 0 -26 4 -26 C14 -26 14 -10 0 0Z"/></g><g transform="translate(50,48) rotate(120)"><path d="M0 0 C-14 -10 -14 -26 -4 -26 C0 -26 0 -22 0 -18 C0 -22 0 -26 4 -26 C14 -26 14 -10 0 0Z"/></g><g transform="translate(50,48) rotate(240)"><path d="M0 0 C-14 -10 -14 -26 -4 -26 C0 -26 0 -22 0 -18 C0 -22 0 -26 4 -26 C14 -26 14 -10 0 0Z"/></g></g><circle cx="50" cy="48" r="4" fill="#294B8F"/><path d="M50 52 C52 64 50 74 42 80" stroke="#294B8F" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  smiley: `<circle cx="50" cy="50" r="30" fill="#FF3B54"/><circle cx="40" cy="44" r="4" fill="#fff"/><circle cx="60" cy="44" r="4" fill="#fff"/><path d="M38 58 C44 68 56 68 62 58" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
  party: `<path d="M30 78 L46 34 L70 58Z" fill="#FF3B54"/><path d="M30 78 L46 34 L58 46Z" fill="#294B8F"/><circle cx="70" cy="30" r="4" fill="#FF3B54"/><circle cx="30" cy="34" r="3" fill="#294B8F"/><circle cx="78" cy="52" r="3" fill="#294B8F"/>`,
  globe: `<circle cx="50" cy="50" r="30" fill="#294B8F"/><path d="M32 40 C42 44 52 38 62 42 C70 45 72 40 70 36" fill="none" stroke="#FF3B54" stroke-width="5" stroke-linecap="round"/><path d="M28 56 C40 52 48 60 60 58 C68 57 72 60 72 62" fill="none" stroke="#FF3B54" stroke-width="5" stroke-linecap="round"/>`,
  star: `<path d="M50 18 L59 40 L83 42 L64 57 L70 80 L50 67 L30 80 L36 57 L17 42 L41 40Z" fill="#FF3B54"/>`,
  medcross: `<rect x="42" y="24" width="16" height="52" rx="4" fill="#FF3B54"/><rect x="24" y="42" width="52" height="16" rx="4" fill="#294B8F"/>`,
  rainbow: `<path d="M20 72 A30 30 0 0 1 80 72" fill="none" stroke="#FF3B54" stroke-width="8"/><path d="M30 72 A20 20 0 0 1 70 72" fill="none" stroke="#294B8F" stroke-width="8"/><circle cx="24" cy="76" r="6" fill="#fff" stroke="#FF3B54" stroke-width="3"/>`,
  leaf: `<path d="M28 76 C28 44 56 26 78 26 C78 58 52 76 28 76Z" fill="#FF3B54"/><path d="M28 76 C44 60 60 46 76 32" stroke="#294B8F" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  lotus: `<path d="M50 30 C58 44 58 58 50 70 C42 58 42 44 50 30Z" fill="#FF3B54"/><path d="M50 70 C40 62 30 58 26 50 C40 46 48 56 50 70Z" fill="#294B8F"/><path d="M50 70 C60 62 70 58 74 50 C60 46 52 56 50 70Z" fill="#294B8F"/>`,
  twohearts: `<path d="M40 74 C22 60 18 50 18 42 A12 12 0 0 1 40 36 A12 12 0 0 1 62 42 C62 50 58 60 40 74Z" fill="#294B8F"/><path d="M64 60 C50 48 47 40 47 34 A10 10 0 0 1 64 30 A10 10 0 0 1 81 34 C81 40 78 48 64 60Z" fill="#FF3B54"/>`,
  cat: `<path d="M28 30 L30 52 L44 40Z M72 30 L70 52 L56 40Z" fill="#FF3B54"/><ellipse cx="50" cy="54" rx="26" ry="22" fill="#FF3B54"/><circle cx="41" cy="52" r="3.5" fill="#fff"/><circle cx="59" cy="52" r="3.5" fill="#fff"/><path d="M50 60 l-3 3 l3 2 l3 -2Z" fill="#294B8F"/><path d="M32 58 h10 M32 64 h10 M58 58 h10 M58 64 h10" stroke="#294B8F" stroke-width="2.5" stroke-linecap="round"/>`,
  camera: `<rect x="20" y="36" width="60" height="42" rx="6" fill="#FF3B54"/><path d="M36 36 l5 -8 h18 l5 8" fill="#294B8F"/><circle cx="50" cy="57" r="12" fill="#294B8F"/><circle cx="50" cy="57" r="5" fill="#fff"/>`,
  peace: `<circle cx="50" cy="50" r="28" fill="#294B8F"/><path d="M50 24v52M50 50l-18 18M50 50l18 18" stroke="#fff" stroke-width="5"/>`,
  heartbeat: `<path d="M50 80 C24 60 18 48 18 38 A16 16 0 0 1 50 33 A16 16 0 0 1 82 38 C82 48 76 60 50 80Z" fill="#FF3B54"/><path d="M26 46 h12 l5 -10 l7 22 l6 -14 l4 6 h10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  coffee: `<path d="M24 40 h44 v14 a18 18 0 0 1 -18 18 h-8 a18 18 0 0 1 -18 -18Z" fill="#FF3B54"/><path d="M68 44 h6 a8 8 0 0 1 0 16 h-6" fill="none" stroke="#FF3B54" stroke-width="5"/><path d="M36 24 c-3 4 3 6 0 10 M50 24 c-3 4 3 6 0 10" stroke="#294B8F" stroke-width="4" stroke-linecap="round" fill="none"/>`,
  brain: `<path d="M46 26 C30 26 26 40 32 46 C24 52 30 66 40 64 C42 74 58 74 58 64 C70 68 76 52 68 46 C74 38 66 26 54 28 C52 24 48 24 46 26Z" fill="#FF3B54"/><path d="M50 30 v36 M42 42 c6 0 6 6 0 6 M58 50 c-6 0 -6 6 0 6" stroke="#294B8F" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  pumpkin: `<path d="M50 30 c4 -8 12 -8 14 -2" stroke="#294B8F" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M50 32v40" stroke="#294B8F" stroke-width="3"/><ellipse cx="50" cy="54" rx="30" ry="24" fill="#FF3B54"/><path d="M36 48 l8 6 l-8 0Z M64 48 l-8 6 l8 0Z" fill="#294B8F"/><path d="M38 64 c6 6 18 6 24 0" stroke="#294B8F" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  bag: `<path d="M28 40 h44 l4 38 h-52Z" fill="#FF3B54"/><path d="M38 40 v-6 a12 12 0 0 1 24 0 v6" fill="none" stroke="#294B8F" stroke-width="5"/>`,
  handheart: `<path d="M22 60 h40 a6 6 0 0 1 0 12 h-30 l-10 -6Z" fill="#294B8F"/><path d="M56 52 C44 42 42 36 42 32 A9 9 0 0 1 58 28 A9 9 0 0 1 74 32 C74 38 70 44 56 52Z" fill="#FF3B54"/>`,
  mars: `<circle cx="44" cy="56" r="16" fill="none" stroke="#FF3B54" stroke-width="8"/><path d="M56 44 L76 24 M62 24 h14 v14" stroke="#294B8F" stroke-width="8" stroke-linecap="round" fill="none"/>`,
  tree: `<path d="M50 20 L68 46 H32Z M50 38 L72 68 H28Z" fill="#FF3B54"/><rect x="45" y="68" width="10" height="12" fill="#294B8F"/><circle cx="50" cy="22" r="4" fill="#294B8F"/><circle cx="42" cy="52" r="3" fill="#294B8F"/><circle cx="60" cy="58" r="3" fill="#294B8F"/>`,
  gift: `<rect x="26" y="46" width="48" height="34" rx="3" fill="#FF3B54"/><rect x="22" y="36" width="56" height="14" rx="3" fill="#294B8F"/><rect x="44" y="36" width="12" height="44" fill="#294B8F"/><path d="M50 36 C40 20 24 26 36 36 M50 36 C60 20 76 26 64 36" stroke="#294B8F" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  champagne: `<path d="M40 24 h20 l-2 20 a8 8 0 0 1 -16 0Z" fill="#FF3B54"/><path d="M50 52 v20 M40 76 h20" stroke="#294B8F" stroke-width="5" stroke-linecap="round"/><circle cx="66" cy="30" r="3" fill="#294B8F"/><circle cx="70" cy="42" r="2.5" fill="#294B8F"/>`,
  autumn: `<path d="M50 78 L50 40" stroke="#294B8F" stroke-width="4" stroke-linecap="round"/><path d="M50 44 C36 44 26 34 24 24 C40 22 52 30 50 44Z" fill="#FF3B54"/><path d="M50 44 C64 44 74 34 76 24 C60 22 48 30 50 44Z" fill="#294B8F"/><path d="M50 60 C40 60 32 52 30 44 C42 43 52 50 50 60Z" fill="#FF3B54"/><path d="M50 60 C60 60 68 52 70 44 C58 43 48 50 50 60Z" fill="#294B8F"/>`,
  egg: `<path d="M50 22 C63 22 72 46 72 58 A22 22 0 0 1 28 58 C28 46 37 22 50 22Z" fill="#FF3B54"/><path d="M30 54 c6 4 8 -4 12 0 s6 4 12 0 6 -4 12 0 4 4 6 2 M30 64 c6 4 8 -4 12 0 s6 4 12 0 6 -4 12 0" stroke="#294B8F" stroke-width="3.5" fill="none"/>`,
  flag: `<path d="M32 22 v56" stroke="#294B8F" stroke-width="5" stroke-linecap="round"/><path d="M34 26 h34 l-6 10 l6 10 h-34Z" fill="#FF3B54"/><circle cx="44" cy="32" r="2" fill="#fff"/><circle cx="54" cy="40" r="2" fill="#fff"/>`,
  thistle: `<path d="M50 78 v-24" stroke="#294B8F" stroke-width="4" stroke-linecap="round"/><path d="M50 54 C42 54 38 48 40 42 C46 46 46 40 50 36 C54 40 54 46 60 42 C62 48 58 54 50 54Z" fill="#294B8F"/><path d="M44 40 l-4 -10 M50 36 v-12 M56 40 l4 -10" stroke="#FF3B54" stroke-width="4" stroke-linecap="round"/>`,
};

const CATEGORY_FALLBACK: Record<NotableCategory, string> = {
  shopping: 'bag',
  awareness: 'ribbon',
  cultural: 'star',
  seasonal: 'leaf',
  internet: 'smiley',
  sport: 'star',
};

/** Title -> motif. First match wins; specific patterns before generic ones. */
function motifFor(title: string, category: NotableCategory): string {
  const t = title.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/new year.s eve/, 'champagne'],
    [/new year/, 'fireworks'],
    [/burns/, 'thistle'],
    [/cancer/, 'ribbon'],
    [/valentine/, 'heart'],
    [/pet/, 'paw'],
    [/women/, 'venus'],
    [/patrick/, 'clover'],
    [/happiness/, 'smiley'],
    [/april fool/, 'party'],
    [/earth/, 'globe'],
    [/star wars/, 'star'],
    [/nurses/, 'medcross'],
    [/pride/, 'rainbow'],
    [/environment/, 'leaf'],
    [/yoga/, 'lotus'],
    [/emoji/, 'smiley'],
    [/friendship/, 'twohearts'],
    [/\bcat\b/, 'cat'],
    [/photograph/, 'camera'],
    [/peace/, 'peace'],
    [/heart/, 'heartbeat'],
    [/coffee/, 'coffee'],
    [/animal/, 'paw'],
    [/mental health/, 'brain'],
    [/halloween/, 'pumpkin'],
    [/singles|black friday|cyber monday/, 'bag'],
    [/kindness/, 'handheart'],
    [/men.s day/, 'mars'],
    [/christmas/, 'tree'],
    [/boxing day/, 'gift'],
    [/thanksgiving/, 'autumn'],
    [/mother|father/, 'gift'],
    [/easter|good friday/, 'egg'],
    [/memorial/, 'flag'],
    [/labor|labour/, 'star'],
  ];
  for (const [re, slug] of rules) if (re.test(t)) return slug;
  return CATEGORY_FALLBACK[category];
}

export function NotableDateArt({
  title,
  category,
  size = 96,
  className,
}: {
  title: string;
  category: NotableCategory;
  size?: number;
  className?: string;
}) {
  const slug = motifFor(title, category);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MOTIFS[slug] ?? MOTIFS.star }}
    />
  );
}
