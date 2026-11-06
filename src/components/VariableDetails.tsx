import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { externalUrl } from "../core/files";
import type { VariableNote } from "../core/types";

export type DetailField = "note" | "url";

interface DetailsProps {
  variable: string;
  metadata?: VariableNote;
  disabled: boolean;
  showLinkErrors: boolean;
  onChange: (field: DetailField, value: string) => void;
  onOpenLink: (url: string) => Promise<void>;
  onCopyLink: (url: string) => Promise<void>;
}

interface LinkActionsProps {
  variable: string;
  href: string;
  disabled: boolean;
  onOpen: (url: string) => Promise<void>;
  onCopy: (url: string) => Promise<void>;
}

function LinkActions({ variable, href, disabled, onOpen, onCopy }: LinkActionsProps) {
  const [copying, setCopying] = useState(false);
  const [feedback, setFeedback] = useState("");
  const copied = feedback === "已复制链接";

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function open() {
    try {
      await onOpen(href);
    } catch {
      setFeedback("无法打开链接");
    }
  }

  async function copy() {
    setCopying(true);
    setFeedback("");
    try {
      await onCopy(href);
      setFeedback("已复制链接");
    } catch {
      setFeedback("复制失败，请重试");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="link-actions">
      <button className="icon-button link-action" type="button" title="打开链接" aria-label={`打开 ${variable} 的链接`} disabled={disabled} onClick={() => void open()}>
        <ArrowUpRight size={15} />
      </button>
      <button className="icon-button link-action" type="button" title="复制完整链接" aria-label={`复制 ${variable} 的链接`} disabled={disabled || copying} onClick={() => void copy()}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <span className="link-feedback" role="status">{feedback}</span>
    </div>
  );
}

function handleFieldKeys(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  cancel: () => void,
  submitOnEnter = false,
) {
  if (event.nativeEvent.isComposing) return;
  if (event.key === "Escape") cancel();
  else if (!submitOnEnter || event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

export function VariableDetails({ variable, metadata, disabled, showLinkErrors, onChange, onOpenLink, onCopyLink }: DetailsProps) {
  const note = metadata?.note ?? "";
  const address = metadata?.url ?? "";
  const href = externalUrl(address);
  const [linkFocused, setLinkFocused] = useState(false);
  const previousNote = useRef(note);
  const previousLink = useRef(address);
  const linkErrorId = useId();
  const invalid = Boolean(address.trim() && !href);
  const showError = invalid && (showLinkErrors || !linkFocused);

  return (
    <div className="variable-details">
      <textarea
        className="detail-field detail-note"
        aria-label={`${variable} 的用途说明`}
        placeholder="添加用途"
        rows={2}
        value={note}
        title={note || undefined}
        disabled={disabled}
        onFocus={() => { previousNote.current = note; }}
        onBlur={(event) => { event.currentTarget.scrollTop = 0; }}
        onChange={(event) => onChange("note", event.target.value)}
        onKeyDown={(event) => handleFieldKeys(event, () => onChange("note", previousNote.current))}
      />
      <div className="variable-link-line">
        <input
          className="detail-field detail-link"
          aria-label={`${variable} 的相关链接`}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? linkErrorId : undefined}
          placeholder="添加链接"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={address}
          disabled={disabled}
          onFocus={() => { previousLink.current = address; setLinkFocused(true); }}
          onBlur={() => setLinkFocused(false)}
          onChange={(event) => onChange("url", event.target.value)}
          onKeyDown={(event) => handleFieldKeys(event, () => onChange("url", previousLink.current), true)}
        />
        {href && <LinkActions key={href} variable={variable} href={href} disabled={disabled} onOpen={onOpenLink} onCopy={onCopyLink} />}
      </div>
      {showError && <p id={linkErrorId} className="link-error">请输入有效的网址</p>}
    </div>
  );
}
