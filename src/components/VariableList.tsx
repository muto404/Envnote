import { Eye, EyeOff, FileCode2, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getVariableNote } from "../core/session";
import type { EnvEntry, VariableNotes } from "../core/types";
import { VariableDetails, type DetailField } from "./VariableDetails";

interface SecretInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  id?: string;
}

export function SecretInput({ label, value, onChange, readOnly, disabled, id }: SecretInputProps) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const hide = () => setRevealed(false);
    window.addEventListener("blur", hide);
    return () => window.removeEventListener("blur", hide);
  }, [revealed]);

  return (
    <div className="secret-input">
      <input
        id={id}
        type={revealed ? "text" : "password"}
        aria-label={label}
        value={value}
        placeholder="未填写"
        readOnly={readOnly}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="icon-button secret-toggle"
        type="button"
        aria-label={(revealed ? "隐藏 " : "显示 ") + label}
        title={revealed ? "隐藏变量值" : "显示变量值"}
        aria-pressed={revealed}
        disabled={!value || disabled}
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

interface VariableListProps {
  entries: EnvEntry[];
  notes: VariableNotes;
  query: string;
  readOnly: boolean;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
  showLinkErrors: boolean;
  onChangeDetail: (key: string, field: DetailField, value: string) => void;
  onDelete: (key: string) => void;
  onOpenLink: (url: string) => Promise<void>;
  onCopyLink: (url: string) => Promise<void>;
}

export function VariableList({
  entries, notes, query, readOnly, disabled, showLinkErrors, onChange, onChangeDetail, onDelete, onOpenLink, onCopyLink,
}: VariableListProps) {
  const [focusedRow, setFocusedRow] = useState<string | null>(null);
  const term = query.trim().toLowerCase();
  const visible = entries.filter(({ key }) =>
    key === focusedRow || key.toLowerCase().includes(term) || getVariableNote(notes, key)?.note.toLowerCase().includes(term),
  );

  if (visible.length === 0) {
    const EmptyIcon = term ? Search : FileCode2;
    return (
      <div className="variables-empty">
        <EmptyIcon size={23} strokeWidth={1.5} />
        <strong>{term ? "没有匹配的变量" : "文件里还没有变量"}</strong>
        <p>{term ? "试试其他变量名或用途说明。" : "可以添加变量，或从模板补齐变量名。"}</p>
      </div>
    );
  }

  return (
    <table className="variable-table" aria-label="环境变量">
      <thead>
        <tr><th scope="col">变量名</th><th scope="col">变量值</th><th scope="col">用途与链接</th><th scope="col"><span className="sr-only">操作</span></th></tr>
      </thead>
      <tbody>
        {visible.map(({ key, value }) => {
          return (
            <tr key={key} onFocus={() => setFocusedRow(key)}
              onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusedRow(null); }}>
              <th scope="row"><code className="variable-key">{key}</code></th>
              <td>
                <SecretInput label={key + " 的值"} value={value} readOnly={readOnly} disabled={disabled} onChange={(next) => onChange(key, next)} />
              </td>
              <td>
                <VariableDetails
                  variable={key}
                  metadata={getVariableNote(notes, key)}
                  disabled={disabled}
                  showLinkErrors={showLinkErrors}
                  onChange={(field, next) => onChangeDetail(key, field, next)}
                  onOpenLink={onOpenLink}
                  onCopyLink={onCopyLink}
                />
              </td>
              <td>
                {!readOnly && (
                  <button className="icon-button delete-variable" type="button" aria-label={"删除 " + key} title="删除变量" disabled={disabled} onClick={() => onDelete(key)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
