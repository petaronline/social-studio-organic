/**
 * Hand-drawn squiggle "lines" — a playful placeholder for empty/ghost rows.
 * A different wavy line per row. Used as ghost rows under a task list and in
 * the empty states for Notes.
 */

// Different wavy paths so each row reads as its own hand-drawn line.
const SQUIGGLES = [
  'M3 12 q 16 -9 32 0 t 32 0 t 32 0 t 32 0 t 30 0',
  'M3 13 q 22 -11 44 0 t 44 0 t 44 0 t 34 0',
  'M3 12 q 11 8 22 0 t 22 0 t 22 0 t 22 0 t 22 0 t 16 0',
  'M3 14 q 18 -7 36 0 t 36 0 t 34 0',
  'M3 12 q 14 -8 28 0 t 28 0 t 28 0 t 28 0 t 24 0',
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
