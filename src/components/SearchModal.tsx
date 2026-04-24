import { useState, useEffect, useRef, useCallback } from "react";
import { navigate } from "astro:transitions/client";

interface SearchResult {
  id: string;
  url: string;
  meta?: {
    title?: string;
    description?: string;
  };
  excerpt?: string;
}

interface PagefindResult {
  id: string;
  data: () => Promise<{
    url: string;
    meta?: {
      title?: string;
      description?: string;
    };
    excerpt?: string;
  }>;
}

interface Pagefind {
  init: () => Promise<void>;
  search: (query: string) => Promise<{ results: PagefindResult[] }>;
}

function stripHtml(value = ""): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value = ""): string {
  return stripHtml(value).toLowerCase();
}

function scoreResult(result: SearchResult, query: string, rank: number): number {
  const normalizedQuery = normalize(query);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const title = normalize(result.meta?.title);
  const description = normalize(result.meta?.description);
  const excerpt = normalize(result.excerpt);
  let score = Math.max(0, 30 - rank);

  if (title === normalizedQuery) score += 120;
  if (title.startsWith(normalizedQuery)) score += 80;
  if (title.includes(normalizedQuery)) score += 65;
  if (description.includes(normalizedQuery)) score += 35;
  if (excerpt.includes(normalizedQuery)) score += 20;

  for (const token of tokens) {
    if (title.includes(token)) score += 18;
    if (description.includes(token)) score += 10;
    if (excerpt.includes(token)) score += 6;
  }

  return score;
}

function displayPath(url: string, basePath: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const normalizedBase = basePath.replace(/\/$/, "");
    const escapedBase = normalizedBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const path = parsed.pathname.replace(new RegExp(`^${escapedBase}`), "") || "/";
    return path;
  } catch {
    return url;
  }
}

// Pagefind records URLs relative to the --site directory (e.g. "/post/"),
// but the site is actually served at basePath (e.g. "/blog/"). Resolve each
// search result URL against basePath so navigation lands on the right page.
function resolveUrl(url: string, basePath: string): string {
  const normalizedBase = basePath.replace(/\/$/, "");
  if (!normalizedBase) return url;
  if (url.startsWith(`${normalizedBase}/`) || url === normalizedBase) return url;
  if (url.startsWith("/")) return `${normalizedBase}${url}`;
  return `${normalizedBase}/${url}`;
}

export default function SearchModal({ basePath = "/blog" }: { basePath?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pagefind, setPagefind] = useState<Pagefind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Remember which element opened the modal so focus can return there on close.
  const openerRef = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    openerRef.current = (document.activeElement as HTMLElement) ?? null;
    setIsOpen(true);
    setQuery("");
    setResults([]);
    setError(null);
    setSelectedIndex(-1);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setSelectedIndex(-1);
    // Return focus to whatever triggered the modal (⌘K shortcut leaves
    // the body as the opener, which we silently skip).
    const opener = openerRef.current;
    if (opener && opener !== document.body) {
      opener.focus();
    }
    openerRef.current = null;
  }, []);

  // Load Pagefind on first open
  useEffect(() => {
    if (!isOpen || pagefind) return;

    (async () => {
      try {
        const pf = (await import(
          /* @vite-ignore */ `${basePath}/pagefind/pagefind.js`
        )) as Pagefind;
        await pf.init();
        setPagefind(pf);
      } catch {
        setError("검색은 빌드된 사이트에서 사용할 수 있습니다.");
      }
    })();
  }, [isOpen, pagefind, basePath]);

  // Autofocus input when modal opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    function handleOpenSearch() {
      open();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("open-search", handleOpenSearch);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("open-search", handleOpenSearch);
    };
  }, [open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Search handler
  useEffect(() => {
    if (!pagefind || !query.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const search = await pagefind.search(query);
        const loadedWithRank = await Promise.all(
          search.results.slice(0, 24).map(async (r, rank) => {
            const data = await r.data();
            return {
              result: {
                id: r.id,
                url: data.url,
                meta: data.meta,
                excerpt: data.excerpt,
              },
              rank,
            };
          }),
        );
        const loaded = loadedWithRank
          .map(({ result, rank }) => ({
            ...result,
            score: scoreResult(result, query, rank),
            rank,
          }))
          .sort((a, b) => b.score - a.score || a.rank - b.rank)
          .slice(0, 8)
          .map(({ score: _score, rank: _rank, ...result }) => result);

        setResults(loaded);
        setSelectedIndex(-1);
      } catch {
        setResults([]);
      }
      setIsLoading(false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, pagefind]);

  // Keyboard navigation inside modal
  function handleModalKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
      return;
    }

    if (e.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      const url = resolveUrl(results[selectedIndex].url, basePath);
      close();
      // Go through the ClientRouter so Enter triggers the same view
      // transition as clicking the anchor result.
      navigate(url);
      return;
    }

    // Trap Tab inside the modal — without this, keyboard users could tab
    // onto elements behind the backdrop.
    if (e.key === "Tab" && overlayRef.current) {
      const focusables = overlayRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled])',
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Scroll selected result into view
  useEffect(() => {
    if (selectedIndex < 0 || !resultsRef.current) return;
    const item = resultsRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) close();
      }}
      onKeyDown={handleModalKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="글 검색"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "min(20vh, 10rem)",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        animation: "searchFadeIn 0.15s ease",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "36rem",
          margin: "0 1rem",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "0.75rem",
          boxShadow: "0 20px 60px var(--shadow-lg)",
          overflow: "hidden",
          animation: "searchScaleIn 0.15s ease",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="글 제목, 주제, 문장 검색..."
            aria-label="글 검색"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "1rem",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
            }}
          />

          <kbd
            style={{
              padding: "0.125rem 0.5rem",
              fontSize: "0.6875rem",
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "0.25rem",
              lineHeight: "1.5",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          role="region"
          aria-live="polite"
          aria-label="검색 결과"
          style={{
            maxHeight: "24rem",
            overflowY: "auto",
          }}
        >
          {error && (
            <div
              style={{
                padding: "2rem 1.25rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.875rem",
                fontFamily: "var(--font-heading)",
                fontStyle: "italic",
              }}
            >
              {error}
            </div>
          )}

          {!error && isLoading && (
            <div
              style={{
                padding: "2rem 1.25rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.875rem",
              }}
            >
              검색 중...
            </div>
          )}

          {!error && !isLoading && query.trim() && results.length === 0 && (
            <div
              style={{
                padding: "2rem 1.25rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.875rem",
                fontFamily: "var(--font-heading)",
                fontStyle: "italic",
              }}
            >
              &ldquo;{query}&rdquo; 검색 결과가 없습니다.
            </div>
          )}

          {!error &&
            results.map((result, i) => (
              <a
                key={result.id}
                href={resolveUrl(result.url, basePath)}
                style={{
                  display: "block",
                  padding: "0.875rem 1.25rem",
                  textDecoration: "none",
                  borderBottom: "1px solid var(--border)",
                  backgroundColor:
                    i === selectedIndex ? "var(--bg-surface-hover)" : "transparent",
                  transition: "background-color 0.1s ease",
                }}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={close}
              >
                <div
                  style={{
                    marginBottom: "0.2rem",
                    fontSize: "0.6875rem",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {displayPath(result.url, basePath)}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: "0.3rem",
                  }}
                >
                  {result.meta?.title || "Untitled"}
                </div>
                {result.meta?.description && (
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.45,
                      marginBottom: result.excerpt ? "0.25rem" : 0,
                    }}
                  >
                    {result.meta.description}
                  </div>
                )}
                {result.excerpt && (
                  <div
                    className="search-result-excerpt"
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      lineHeight: 1.5,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                    dangerouslySetInnerHTML={{ __html: result.excerpt }}
                  />
                )}
              </a>
            ))}
        </div>

        {/* Footer hint */}
        {!error && results.length > 0 && (
          <div
            style={{
              padding: "0.625rem 1.25rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: "1rem",
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>
              <kbd style={{ fontWeight: 600 }}>&uarr;&darr;</kbd> move
            </span>
            <span>
              <kbd style={{ fontWeight: 600 }}>&crarr;</kbd> open
            </span>
            <span>
              <kbd style={{ fontWeight: 600 }}>esc</kbd> close
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes searchFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes searchScaleIn {
          from { opacity: 0; transform: scale(0.96) translateY(-8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .search-result-excerpt mark {
          background: var(--accent-subtle);
          color: var(--accent);
          border-radius: 0.2rem;
          padding: 0.04rem 0.16rem;
        }
      `}</style>
    </div>
  );
}
