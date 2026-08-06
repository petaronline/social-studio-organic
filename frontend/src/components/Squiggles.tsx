/**
 * Hand-drawn squiggle "lines" — a playful placeholder for empty/ghost rows.
 * A different wavy line per row. Used as ghost rows under a task list and in
 * the empty states for Notes.
 */

// Distinctly different wavy paths so no two adjacent lines look alike:
// long slow waves, tiny tight waves, a loop-then-wave, a short bounce…
const SQUIGGLES = [
  'M3 12 q 26 -11 52 0 t 52 0 t 52 0 t 40 0', // long, slow
  'M3 12 q 9 7 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 12 0', // tiny, tight
  'M6 14 c 3 -8 9 -8 10 -2 c 1 6 -7 7 -8 2 c -1 -7 8 -9 16 -5 c 12 6 24 -5 42 0 c 20 5 38 -4 56 1', // loop then wave
  'M3 13 q 15 -9 30 0 t 30 0 t 30 0 t 30 0 t 22 0', // medium
  'M3 14 q 12 9 24 0 t 24 0 t 24 0 t 18 0', // short bounce
];

export function Squiggles({
  rows = 3,
  withCheckbox = false,
  className = '',
  onRowClick,
}: {
  rows?: number;
  /** Draw an empty round checkbox before each line (task look). */
  withCheckbox?: boolean;
  className?: string;
  /** When set, each row is clickable (e.g. to start a new task / note). */
  onRowClick?: () => void;
}) {
  return (
    <ul className={`flex flex-col gap-1 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => {
        const inner = (
          <>
            {withCheckbox && (
              <span className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-line" />
            )}
            <svg viewBox="0 0 220 24" className="h-5 w-52" fill="none" aria-hidden>
              <path
                d={SQUIGGLES[i % SQUIGGLES.length]}
                stroke="#D3CFE2"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </svg>
          </>
        );
        return (
          <li key={i}>
            {onRowClick ? (
              <button
                onClick={onRowClick}
                className="flex w-full cursor-text items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-alt"
                title="Add"
              >
                {inner}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-2 py-1.5" aria-hidden>
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
