import { FileCode2, FilePlus2, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { basename, errorText, inDirectory, isEnvironmentFile, isTemplate, relativeFile } from "../core/files";
import type { Project, WorkspaceApi } from "../core/types";
import { Modal } from "./Modal";

interface ProjectPickerProps {
  api: WorkspaceApi;
  directory: string;
  onClose: () => void;
  onAdd: (project: Project) => Promise<void>;
}

export function ProjectPicker({ api, directory, onClose, onAdd }: ProjectPickerProps) {
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [selection, setSelection] = useState<string>();
  const [customFile, setCustomFile] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.inspectProject(directory).then(
      (paths) => { if (active) setCandidates(paths); },
      (error: unknown) => {
        if (!active) return;
        setCandidates([]);
        setError(errorText(error));
      },
    );
    return () => { active = false; };
  }, [api, directory]);

  const realFiles = (candidates ?? []).filter((path) => isEnvironmentFile(path) && !isTemplate(path));
  if (customFile && !realFiles.includes(customFile)) realFiles.push(customFile);
  const templates = (candidates ?? []).filter(isTemplate);
  const newFile = candidates && !realFiles.some((path) => path === inDirectory(directory, basename(path)) && basename(path).toLowerCase() === ".env")
    ? inDirectory(directory, ".env")
    : null;

  async function pickAnother() {
    setError("");
    setBusy(true);
    try {
      const path = await api.chooseFile(directory);
      if (!path) return;
      if (!isEnvironmentFile(path) || isTemplate(path)) {
        setError("请选择实际使用的 .env 文件，例如 .env 或 .env.local。模板只能用于补齐变量名。");
        return;
      }
      setCustomFile(path);
      setSelection(path);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!selection || busy) return;
    setError("");
    setBusy(true);
    try {
      const document = await api.readDocument(selection);
      if (document.missing && selection !== newFile) {
        setError("文件已移动或删除。请重新选择配置文件。");
        return;
      }
      await onAdd({
        id: crypto.randomUUID(),
        directory,
        name: basename(directory) || directory,
        filePath: document.path,
        notes: {},
      });
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function choice(path: string, create = false) {
    const Icon = create ? FilePlus2 : FileCode2;
    return (
      <label className="file-choice" key={path} title={path}>
        <input className="sr-only" type="radio" name="file-target" checked={selection === path} disabled={busy} onChange={() => setSelection(path)} />
        <Icon size={18} />
        <span>
          <code>{create ? basename(path) : relativeFile(directory, path)}</code>
          {create && <small>新文件，首次保存时创建</small>}
        </span>
      </label>
    );
  }

  return (
    <Modal
      title="选择配置文件"
      description="选定后，这个项目的变量会保存到该文件。"
      onClose={onClose}
      locked={busy}
      actions={
        <>
          <button className="button secondary" disabled={busy} onClick={onClose}>取消</button>
          <button className="button primary" disabled={!selection || busy} onClick={() => void confirm()}>添加项目</button>
        </>
      }
    >
      <div className="picker-directory" title={directory}><FolderOpen size={16} /><code>{directory}</code></div>
      <fieldset className="file-choices" disabled={busy}>
        <legend className="field-label">写入目标</legend>
        {candidates === null && <p className="muted" role="status">正在查找配置文件…</p>}
        {realFiles.map((path) => choice(path))}
        {newFile && choice(newFile, true)}
      </fieldset>
      <button className="text-button picker-other" onClick={() => void pickAnother()} disabled={busy}>
        <FolderOpen size={15} /> 选择其他文件…
      </button>
      {templates.length > 0 && (
        <p className="picker-template">
          <FileCode2 size={15} />
          <span>发现模板 <code>{templates.map(basename).join("、")}</code>，可用来补齐变量名。</span>
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  );
}
