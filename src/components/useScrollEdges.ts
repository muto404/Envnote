import { useLayoutEffect, useRef } from "react";

export function useScrollEdges<T extends HTMLElement>() {
  const viewport = useRef<T>(null);
  const content = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const pane = viewport.current;
    const body = content.current;
    if (!pane || !body) return;

    const measure = () => {
      const { scrollTop, scrollHeight, clientHeight } = pane;
      pane.toggleAttribute("data-more-above", scrollTop > 1);
      pane.toggleAttribute("data-more-below", scrollTop + clientHeight < scrollHeight - 1);
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(pane);
    observer?.observe(body);
    pane.addEventListener("scroll", measure, { passive: true });
    measure();

    return () => {
      observer?.disconnect();
      pane.removeEventListener("scroll", measure);
    };
  }, []);

  return { viewport, content };
}
