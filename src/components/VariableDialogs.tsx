import { useId, useLayoutEffect, useState, type FormEvent } from "react";
import type { EnvEntry } from "../core/types";
import { Modal } from "./Modal";
import { SecretInput } from "./VariableList";

interface AddProps {
  existing: string[];
  onAdd: (entry: EnvEntry) => void;
  onDraft: (dirty: boolean) => void;
  onClose: () => void;
}

export function AddVariableDialog({ existing, onAdd, onClose, onDraft }: AddProps) {
  const formId = useId();
  const nameId = useId();
  const valueId = useId();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const dirty = Boolean(key || value);
  useLayoutEffect(() => onDraft(dirty), [dirty, onDraft]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = key.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      setError("变量名须以字母或下划线开头，只能包含英文字母、数字和下划线。");
      return;
    }
    if (existing.includes(name)) {
      setError("这个变量名已存在。");
      return;
    }
    onAdd({ key: name, value });
  }

  return (
    <Modal title="添加变量" description="添加到草稿，保存后写入配置文件。" onClose={onClose} actions={
      <>
        <button className="button secondary" onClick={onClose}>取消</button>
        <button className="button primary" type="submit" form={formId} disabled={!key.trim()}>添加变量</button>
      </>
    }>
      <form className="field-stack" id={formId} onSubmit={submit}>
        <label className="field-label" htmlFor={nameId}>变量名</label>
        <input className="field mono" id={nameId} autoFocus value={key} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="API_KEY" onChange={(event) => { setKey(event.target.value); setError(""); }} />
        <label className="field-label" htmlFor={valueId}>变量值</label>
        <SecretInput id={valueId} label="变量值" value={value} onChange={setValue} />
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
