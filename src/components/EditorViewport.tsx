import { useLayoutEffect, type ReactNode } from "react";
import { useScrollEdges } from "./useScrollEdges";

interface EditorViewportProps {
  filter: string;
  toolbar: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

export function EditorViewport({ filter, toolbar, footer, children }: EditorViewportProps) {
  const { viewport, content } = useScrollEdges<HTMLDivElement>();

  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [filter]);

  return (
    <div className="editor-viewport" ref={viewport} tabIndex={0} role="region" aria-label="变量与文件状态">
      <div className="editor-scroll-content" ref={content}>
        {toolbar && <div className="editor-toolbar">{toolbar}</div>}
        <div className="editor-width viewport-content">{children}</div>
        {footer}
      </div>
    </div>
  );
}
