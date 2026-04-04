import { useState, useEffect, useRef, useCallback } from "react";

interface SearchResult {
  id: string;
  url: string;
  meta?: { title?: string };
  excerpt?: string;
}

interface PagefindResult {
  id: string;
  data: () => Promise<{
    url: string;
    meta?: { title?: string };
    excerpt?: string;
  }>;
}

interface Pagefind {
  init: () => Promise<void>;
  search: (query: string) => Promise<{ results: PagefindResult[] }>;
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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const open = useCallback(() => {
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
        setError("Search is available after build.");
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
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        const loaded = await Promise.all(
          search.results.slice(0, 8).map(async (r) => {
            const data = await r.data();
            return {
              id: r.id,
              url: data.url,
              meta: data.meta,
              excerpt: data.excerpt,
            };
          }),
        );
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
      window.location.href = results[selectedIndex].url;
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
      aria-label="Search posts"
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
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts..."
            aria-label="Search posts"
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
              Searching...
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
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {!error &&
            results.map((result, i) => (
              <a
                key={result.id}
                href={result.url}
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
              >
                <div
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: "0.25rem",
                  }}
                >
                  {result.meta?.title || "Untitled"}
                </div>
                {result.excerpt && (
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
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
              <kbd style={{ fontWeight: 600 }}>&uarr;&darr;</kbd> navigate
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
      `}</style>
    </div>
  );
}
