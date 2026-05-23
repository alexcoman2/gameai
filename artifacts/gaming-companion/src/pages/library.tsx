import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

type SupportedGame = {
  id: string;
  displayName: string;
  genre: string;
  tagline: string;
  wikiDomains: string[];
};

type LibraryResponse = {
  count: number;
  games: SupportedGame[];
};

export function LibraryPage() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/games/library")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<LibraryResponse>;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    if (!data) return [] as Array<[string, SupportedGame[]]>;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.games.filter(
          (g) =>
            g.displayName.toLowerCase().includes(q) ||
            g.genre.toLowerCase().includes(q) ||
            g.tagline.toLowerCase().includes(q),
        )
      : data.games;
    const byGenre = new Map<string, SupportedGame[]>();
    for (const g of filtered) {
      const arr = byGenre.get(g.genre) ?? [];
      arr.push(g);
      byGenre.set(g.genre, arr);
    }
    return Array.from(byGenre.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data, query]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-12 max-w-5xl mx-auto w-full">
      <Link
        href="/about"
        className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-primary"
      >
        ← Back to Unstuck
      </Link>
      <h1 className="mt-4 text-3xl font-bold font-mono tracking-wider text-primary">
        Game Library
      </h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
        Games Unstuck has specialist proficiency for — canonical terminology,
        boss / build / meta knowledge, and curated wiki sources for grounded
        web answers. Unstuck still works on any other game; this list shows
        where the answers are sharpest.
      </p>

      <div className="mt-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, genre, or keyword…"
          className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {error && (
        <p className="mt-8 text-sm text-destructive font-mono">
          Failed to load library: {error}
        </p>
      )}

      {!data && !error && (
        <p className="mt-8 text-sm text-muted-foreground font-mono">Loading…</p>
      )}

      {data && (
        <p className="mt-4 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          {data.count} specialist profiles
        </p>
      )}

      <div className="mt-8 space-y-10">
        {grouped.map(([genre, games]) => (
          <section key={genre}>
            <h2 className="text-xs font-mono uppercase tracking-wider text-primary border-b border-border pb-2">
              {genre}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {games.map((g) => (
                <article
                  key={g.id}
                  className="rounded-md border border-border bg-card/50 p-4 hover:border-primary/60 transition-colors"
                >
                  <h3 className="text-sm font-semibold text-foreground">
                    {g.displayName}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {g.tagline}
                  </p>
                  {g.wikiDomains.length > 0 && (
                    <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                      sources: {g.wikiDomains.slice(0, 3).join(" · ")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {data && grouped.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground font-mono">
          No games match "{query}".
        </p>
      )}
    </div>
  );
}
