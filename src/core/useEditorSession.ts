import { useCallback, useEffect, useRef, useState } from "react";
import { errorText, matchingTemplate, parentPath } from "./files";
import { acceptFileWrite, createSession, getChanges, receiveDocument, type EditorSession } from "./session";
import type { EnvDocument, GitStatus, Project, VariableNotes, WorkspaceApi } from "./types";

interface EditorIssue {
  title: string;
  detail: string;
}

async function readTemplate(api: WorkspaceApi, directory: string, filePath: string) {
  const parent = parentPath(filePath);
  const nearby = matchingTemplate(await api.inspectProject(parent), filePath);
  const template = nearby ?? (parent !== directory
    ? matchingTemplate(await api.inspectProject(directory), filePath)
    : undefined);
  return template ? api.readDocument(template) : null;
}

export function useEditorSession(
  api: WorkspaceApi,
  { directory, filePath, notes }: Project,
  persistNotes: (notes: VariableNotes) => Promise<void>,
) {
  const initialNotes = useRef(notes);
  const operation = useRef<"refresh" | "save" | null>(null);
  const [busy, setBusy] = useState(operation.current);
  const [session, setSession] = useState<EditorSession | null>(null);
  const [issue, setIssue] = useState<EditorIssue | null>(null);
  const [template, setTemplate] = useState<EnvDocument | null>(null);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [refreshRequired, setRefreshRequired] = useState(false);

  const refresh = useCallback(async () => {
    if (operation.current) return;
    operation.current = "refresh";
    setBusy("refresh");
    setIssue(null);
    try {
      const document = await api.readDocument(filePath);
      setSession((current) => current ? receiveDocument(current, document) : createSession(document, initialNotes.current));
      setRefreshRequired(false);
      const [status, source] = await Promise.allSettled([
        api.gitStatus(filePath),
        readTemplate(api, directory, filePath),
      ]);
      setGit(status.status === "fulfilled" ? status.value : { tracked: false, ignored: false, available: false });
      setTemplate(source.status === "fulfilled" ? source.value : null);
    } catch (error) {
      setIssue({ title: "无法读取配置文件", detail: errorText(error) });
    } finally {
      operation.current = null;
      setBusy(null);
    }
  }, [api, directory, filePath]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const edit = (change: (current: EditorSession) => EditorSession) => {
    if (operation.current === "save") return;
    setSession((current) => current && change(current));
    setSavedMessage("");
  };

  const save = async () => {
    if (!session || operation.current || session.conflict || refreshRequired) return;
    const changes = getChanges(session);
    if (!changes.file && !changes.notes) return;
    if (changes.file && session.base.readOnlyReason) return;
    operation.current = "save";
    setBusy("save");
    setIssue(null);

    let next = session;
    let written = false;
    try {
      if (changes.file) {
        const saved = await api.saveDocument(filePath, session.base.revision, session.entries);
        next = acceptFileWrite(next, saved);
        setSession(next);
        written = true;
      }
      if (changes.notes) {
        await persistNotes(next.notes);
        next = { ...next, baseNotes: next.notes };
        setSession(next);
      }
      setSavedMessage(written ? "已写入配置文件" : "说明与链接已保存");
    } catch (error) {
      const detail = errorText(error);
      if (changes.file && !written && (detail.startsWith("文件已在外部修改") || detail.startsWith("File changed on disk"))) {
        try {
          const latest = await api.readDocument(filePath);
          setSession((current) => current && receiveDocument(current, latest));
        } catch {
          setRefreshRequired(true);
          setIssue({ title: "文件在磁盘上已更新", detail: "草稿已保留。请刷新以读取最新版本。" });
        }
      } else {
        setIssue({
          title: written ? "配置文件已写入，说明保存失败" : "保存失败，草稿已保留",
          detail,
        });
      }
    } finally {
      operation.current = null;
      setBusy(null);
    }
  };

  return { session, busy, issue, git, template, savedMessage, refreshRequired, refresh, edit, save };
}
