import { FileCode2, GitBranch, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { basename, externalUrl } from "../core/files";
import {
  addMissingKeys, appendVariable, changeValue, createSession, getChanges, getVariableNote,
  overlappingKeys, rebaseDraft, removeVariable, setVariableNote,
} from "../core/session";
import type { GitStatus, Project, VariableNotes, WorkspaceApi } from "../core/types";
import { useEditorSession } from "../core/useEditorSession";
import { EditorViewport } from "./EditorViewport";
import { FileMark } from "./Marks";
import { Confirmation } from "./Modal";
import { Notice } from "./Notice";
import { AddVariableDialog } from "./VariableDialogs";
import { VariableList } from "./VariableList";

export interface EditorActivity {
  dirty: boolean;
  saving: boolean;
}

interface EditorProps {
  api: WorkspaceApi;
  project: Project;
  disabled: boolean;
  onActivity: (activity: EditorActivity) => void;
  onRemove: () => void;
  persistNotes: (notes: VariableNotes) => Promise<void>;
}

type EditorDialog =
  | { kind: "add" | "create" | "discard" | "rebase" }
  | { kind: "delete"; key: string };

function gitLabel(git: GitStatus) {
  if (git.tracked) return {
    text: "Git 已跟踪",
    explanation: "即使设置了忽略规则，此文件仍可能随提交进入版本记录。",
  };
  if (!git.available) return {
    text: "Git 状态未知",
    explanation: "无法确认此文件是否被跟踪。保存密钥前请检查提交范围。",
  };
  if (git.ignored) return {
    text: "Git 已忽略",
    explanation: "此文件当前未被跟踪，并且匹配 Git 忽略规则。",
  };
  return {
    text: "Git 未忽略",
    explanation: "此文件当前未被跟踪，也没有匹配 Git 忽略规则。",
  };
}

function FileContext({ path, git }: { path: string; git: GitStatus | null }) {
  const status = git && gitLabel(git);
  return (
    <section className="file-context" aria-label="当前配置文件">
      <FileMark />
      <code className="file-path">{path}</code>
      {status && (
        <span className="git-chip" title={status.explanation}>
          <GitBranch size={14} />
          {status.text}
        </span>
      )}
    </section>
  );
}

export function ProjectEditor({ api, project, disabled, onActivity, onRemove, persistNotes }: EditorProps) {
  const { session, busy, issue, git, template, savedMessage, refreshRequired, refresh, edit, save } =
    useEditorSession(api, project, persistNotes);
  const [query, setQuery] = useState("");
  const [checkedLinks, setCheckedLinks] = useState(false);
  const [dialog, setDialog] = useState<EditorDialog | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [confirmDiscardForm, setConfirmDiscardForm] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const changes = session ? getChanges(session) : { file: false, notes: false };
  const dirty = changes.file || changes.notes;
  const saving = busy === "save";
  const locked = disabled || saving;
  const path = session?.base.path ?? project.filePath;
  const readOnly = Boolean(session?.base.readOnlyReason);
  const canSave = dirty && !busy && !disabled && !refreshRequired && !session?.conflict && !(changes.file && readOnly);
  const invalidLink = Boolean(session && Object.entries(session.notes).some(([key, { url }]) =>
    url.trim() && url !== getVariableNote(session.baseNotes, key)?.url && !externalUrl(url),
  ));
  const currentKeys = new Set(session?.entries.map(({ key }) => key));
  const missingCount = template?.entries.filter(({ key }) => !currentKeys.has(key)).length ?? 0;
  const overlap = session && dialog?.kind === "rebase" ? overlappingKeys(session) : [];

  useLayoutEffect(() => onActivity({ dirty: dirty || formDirty, saving }), [dirty, formDirty, saving, onActivity]);

  function requestSave() {
    if (!canSave) return;
    if (invalidLink) {
      setCheckedLinks(true);
      setQuery("");
      return;
    }
    setCheckedLinks(false);
    if (session?.base.missing && changes.file) setDialog({ kind: "create" });
    else void save();
  }

  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      if (!document.querySelector("dialog[open]")) requestSave();
    } else if (key === "f" && search.current && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      search.current.focus();
      search.current.select();
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => shortcut(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function closeDialog() {
    setFormDirty(false);
    setConfirmDiscardForm(false);
    setDialog(null);
  }

  function requestFormClose() {
    if (formDirty) setConfirmDiscardForm(true);
    else closeDialog();
  }

  function applyRebase() {
    edit(rebaseDraft);
    closeDialog();
  }

  const toolbar = session && (
    <div className="editor-width variables-toolbar">
      <div className="variables-heading">
        <h2 id="variables-title">环境变量</h2>
        <span className="variable-count">{session.entries.length}</span>
      </div>
      <div className="variables-actions">
        <div className="search-field">
          <Search size={16} />
          <input ref={search} type="search" aria-label="搜索变量" placeholder="搜索变量" value={query} onChange={(event) => setQuery(event.target.value)} />
          {query && <button type="button" className="icon-button clear-search" aria-label="清除搜索" onClick={() => { setQuery(""); search.current?.focus(); }}><X size={14} /></button>}
        </div>
        <button className="button secondary" disabled={readOnly || locked} onClick={() => setDialog({ kind: "add" })}><Plus size={16} />添加变量</button>
      </div>
    </div>
  );

  const footer = session && (
    <footer className="save-bar">
      <div className="editor-width save-bar-inner">
        <p className="save-status" aria-live="polite">
          {dirty && <span className="dirty-dot" aria-hidden="true" />}
          {saving ? "正在保存…" : checkedLinks && invalidLink ? "请修正链接后保存" : issue?.title
            || (session.conflict ? "文件在磁盘上已更新" : dirty ? "有未保存的更改" : savedMessage)}
        </p>
        <button className="button primary" type="button" disabled={!canSave} onClick={requestSave} title="保存 · ⌘S">
          {changes.notes && !changes.file ? "保存更改" : "保存到文件"}
        </button>
      </div>
    </footer>
  );

  return (
    <main className="editor" aria-labelledby="project-title">
      <div className="editor-width editor-header">
        <header className="project-header">
          <h1 id="project-title">{project.name}</h1>
          <div className="project-actions">
            <button className="button quiet" title="从磁盘刷新" onClick={() => void refresh()} disabled={Boolean(busy) || disabled}>
              <RefreshCw size={15} /> 刷新
            </button>
            <button className="icon-button remove-project" title="从列表移除项目" aria-label="从列表移除项目" disabled={locked} onClick={onRemove}>
              <Trash2 size={16} />
            </button>
          </div>
        </header>

        <FileContext path={path} git={git} />
      </div>

      <EditorViewport filter={query} toolbar={toolbar} footer={footer}>
        <div className="editor-notices">
          {issue && <Notice title={issue.title} tone="error">{issue.detail}</Notice>}
          {session?.conflict && (
            <Notice title="文件在磁盘上已更新" tone="warning" actions={
              <>
                <button className="button secondary compact" disabled={locked} onClick={() => setDialog({ kind: "discard" })}>重新载入</button>
                <button className="button secondary compact" disabled={locked || Boolean(session.conflict.readOnlyReason)}
                  onClick={() => overlappingKeys(session).length ? setDialog({ kind: "rebase" }) : applyRebase()}>
                  合并草稿
                </button>
              </>
            }>
              草稿已保留。可将草稿合并到磁盘的新版本，再保存。
            </Notice>
          )}
          {session?.base.readOnlyReason && <Notice title="配置文件只读" tone="warning">{session.base.readOnlyReason} 用途与链接仍可编辑。</Notice>}
          {session?.base.missing && <Notice title="配置文件尚未创建">首次保存时，会在上方路径创建文件。</Notice>}
        </div>

        {!session && !issue && <p className="editor-loading" role="status">正在读取配置文件…</p>}
        {session && (
          <section aria-labelledby="variables-title">
            {template && missingCount > 0 && (
              <div className="template-strip">
                <FileCode2 size={18} />
                <div>
                  <strong>模板还有 {missingCount} 项待添加</strong>
                  <p><code>{basename(template.path)}</code><span>只添加变量名，值留空</span></p>
                </div>
                <button className="button secondary compact" disabled={readOnly || locked} onClick={() => { edit((current) => addMissingKeys(current, template.entries)); setQuery(""); }}>
                  添加缺失项
                </button>
              </div>
            )}

            <VariableList
              entries={session.entries}
              notes={session.notes}
              query={query}
              readOnly={readOnly}
              disabled={locked}
              onChange={(key, value) => edit((current) => changeValue(current, key, value))}
              showLinkErrors={checkedLinks && invalidLink}
              onChangeDetail={(key, field, value) => edit((current) => {
                const metadata = getVariableNote(current.notes, key) ?? { note: "", url: "", sensitive: true };
                return setVariableNote(current, key, { ...metadata, [field]: value });
              })}
              onDelete={(key) => {
                if (session.base.entries.some((entry) => entry.key === key)) setDialog({ kind: "delete", key });
                else edit((current) => removeVariable(current, key));
              }}
              onOpenLink={api.openExternal}
              onCopyLink={api.copyLink}
            />
          </section>
        )}
      </EditorViewport>

      {dialog?.kind === "add" && session && <AddVariableDialog existing={Array.from(currentKeys)} onDraft={setFormDirty} onClose={requestFormClose} onAdd={(entry) => {
        edit((current) => appendVariable(current, entry));
        setQuery("");
        closeDialog();
      }} />}
      {confirmDiscardForm && (
        <Confirmation title="放弃当前输入？" description="这次输入还没有加入草稿。"
          confirmLabel="放弃输入" cancelLabel="继续填写" danger onClose={() => setConfirmDiscardForm(false)} onConfirm={closeDialog} />
      )}
      {dialog?.kind === "delete" && (
        <Confirmation title="删除此变量？" description={<>保存后，将从 <code>{basename(path)}</code> 删除 <code>{dialog.key}</code>，并移除它的用途说明与链接。</>}
          confirmLabel="标记删除" danger onClose={closeDialog} onConfirm={() => {
            edit((current) => removeVariable(current, dialog.key));
            closeDialog();
          }} />
      )}
      {dialog?.kind === "create" && (
        <Confirmation title="创建配置文件？" description={<><p>将变量写入以下新文件。</p><code className="confirmation-path">{path}</code></>}
          confirmLabel="创建并写入" onClose={closeDialog} onConfirm={() => { closeDialog(); void save(); }} />
      )}
      {dialog?.kind === "discard" && (
        <Confirmation title="重新载入配置文件？" description="将放弃草稿并载入磁盘上的新版本。"
          confirmLabel="放弃草稿并载入" danger onClose={closeDialog} onConfirm={() => {
            edit((current) => current.conflict ? createSession(current.conflict, current.baseNotes) : current);
            closeDialog();
          }} />
      )}
      {dialog?.kind === "rebase" && (
        <Confirmation title="合并草稿到新版本？"
          description={<><p>磁盘和草稿都修改了以下变量。合并时会保留这些变量的草稿值，并接收其他磁盘改动。</p><code className="confirmation-path">{overlap.join("、")}</code></>}
          confirmLabel="保留草稿值并合并" onClose={closeDialog} onConfirm={applyRebase} />
      )}
    </main>
  );
}
