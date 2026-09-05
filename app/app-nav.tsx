import Link from "next/link";

export function AppNav({ active }: { active?: "sets" | "morning" }) {
  return (
    <nav className="app-nav" aria-label="Trackers">
      <Link href="/track" aria-current={active === "sets" ? "page" : undefined}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M6 8v8m12-8v8M3 10v4m18-4v4M6 12h12" strokeLinecap="round" />
        </svg>
        <span>Workouts</span>
      </Link>
      <Link
        href="/morning"
        aria-current={active === "morning" ? "page" : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"
            strokeLinecap="round"
          />
        </svg>
        <span>AM routine</span>
      </Link>
    </nav>
  );
}
