import { useState, useEffect, useRef } from "react";
import Giscus from "@giscus/react";

interface CommentsProps {
  slug: string;
}

export default function Comments({ slug }: CommentsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [theme, setTheme] = useState<string>("light");
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect initial theme
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark_dimmed" : "light");
  }, []);

  // Watch for theme changes via MutationObserver
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "data-theme"
        ) {
          const current = document.documentElement.getAttribute("data-theme");
          setTheme(current === "dark" ? "dark_dimmed" : "light");
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  // Lazy load: render Giscus only when scrolled into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "200px 0px",
        threshold: 0,
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ minHeight: "16rem" }}>
      {isVisible ? (
        <Giscus
          id={`giscus-${slug}`}
          repo="concrete-sangminlee/blog"
          repoId=""
          category="Announcements"
          categoryId=""
          mapping="pathname"
          reactionsEnabled="1"
          emitMetadata="0"
          inputPosition="top"
          theme={theme}
          lang="ko"
          loading="lazy"
        />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "10rem",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            fontFamily: "var(--font-heading)",
            fontStyle: "italic",
          }}
        >
          Loading comments...
        </div>
      )}
    </div>
  );
}
