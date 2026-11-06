import { CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";

interface NoticeProps {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: "warning" | "error" | "info";
}

export function Notice({ title, children, actions, tone = "info" }: NoticeProps) {
  const Icon = tone === "info" ? Info : CircleAlert;
  return (
    <section className={"notice " + tone} role={tone === "info" ? "status" : "alert"}>
      <Icon size={18} />
      <div className="notice-copy">
        <strong>{title}</strong>
        {children && <div className="notice-detail">{children}</div>}
      </div>
      {actions && <div className="notice-actions">{actions}</div>}
    </section>
  );
}
