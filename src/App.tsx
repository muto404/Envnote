import { FolderOpen } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { getWorkspaceApi } from "./core/desktop";
import { errorText } from "./core/files";
import type { AppState, Project, VariableNotes, WorkspaceApi } from "./core/types";
import { EmptyFileArt } from "./components/Marks";
import { Confirmation } from "./components/Modal";
import { Notice } from "./components/Notice";
import { ProjectEditor, type EditorActivity } from "./components/ProjectEditor";
import { ProjectPicker } from "./components/ProjectPicker";
import { Sidebar } from "./components/Sidebar";

function EmptyWorkspace({ title, description, action }: {
  title: string;
  description: string;
  action?: { label: string; run: () => void; disabled?: boolean };
}) {
  return (
    <main className="empty-workspace">
      <div className="empty-content">
        <EmptyFileArt />
        <h1>{title}</h1>
        <p>{description}</p>
        {action && <button className="button primary" disabled={action.disabled} onClick={action.run}><FolderOpen size={17} />{action.label}</button>}
      </div>
    </main>
  );
}

type Navigation = { kind: "select"; id: string } | { kind: "add" | "remove" | "close" };
const idle: EditorActivity = { dirty: false, saving: false };

function Workspace({ api, initial }: { api: WorkspaceApi; initial: AppState }) {
  const [projects, setProjects] = useState(initial.projects);
  const [activeId, setActiveId] = useState<string | undefined>(initial.projects[0]?.id);
  const [directory, setDirectory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState(idle);
  const [pending, setPending] = useState<Navigation | null>(null);
  const [error, setError] = useState("");
  const activityRef = useRef(idle);
  const busyRef = useRef(false);
  const allowClose = useRef(false);
  const active = projects.find((project) => project.id === activeId);

  const recordActivity = useCallback((next: EditorActivity) => {
    activityRef.current = next;
    setActivity(next);
  }, []);

  function setWorkspaceBusy(next: boolean) {
    busyRef.current = next;
    setBusy(next);
  }

  useEffect(() => {
    if (api.mode !== "desktop") return;
    let dispose = false;
    let stop: (() => void) | undefined;
    getCurrentWindow().onCloseRequested((event) => {
      if (allowClose.current) return;
      const { dirty, saving } = activityRef.current;
      if (saving || busyRef.current) {
        event.preventDefault();
      } else if (dirty) {
        event.preventDefault();
        setPending({ kind: "close" });
      }
    }).then((unlisten) => {
      if (dispose) unlisten();
      else stop = unlisten;
    }).catch((error: unknown) => setError(errorText(error)));
    return () => {
      dispose = true;
      stop?.();
    };
  }, [api.mode]);

  useEffect(() => {
    if (!activity.dirty || api.mode === "desktop") return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [activity.dirty, api.mode]);

  function select(id: string | undefined) {
    if (id === activeId) return;
    recordActivity(idle);
    setActiveId(id);
  }

  async function chooseProject() {
    setError("");
    setWorkspaceBusy(true);
    try {
      const selectedDirectory = await api.chooseDirectory();
      if (!selectedDirectory) return;
      const existing = projects.find((project) => project.directory === selectedDirectory);
      if (existing) select(existing.id);
      else setDirectory(selectedDirectory);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function addProject(project: Project) {
    if (projects.some((other) => other.filePath === project.filePath)) throw new Error("这个配置文件已关联到其他项目。");
    const next = [...projects, project];
    setWorkspaceBusy(true);
    try {
      await api.saveState({ projects: next });
      setProjects(next);
      select(project.id);
      setDirectory(null);
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function removeProject() {
    if (!active) return;
    const next = projects.filter(({ id }) => id !== active.id);
    setError("");
    setWorkspaceBusy(true);
    try {
      await api.saveState({ projects: next });
      setProjects(next);
      select(next[0]?.id);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function persistNotes(notes: VariableNotes) {
    const next = projects.map((project) => project.id === activeId ? { ...project, notes } : project);
    await api.saveState({ projects: next });
    setProjects(next);
  }

  function runNavigation(request: Navigation) {
    setPending(null);
    if (request.kind === "select") select(request.id);
    else if (request.kind === "add") void chooseProject();
    else if (request.kind === "remove") void removeProject();
    else if (request.kind === "close") {
      allowClose.current = true;
      getCurrentWindow().close().catch((error: unknown) => {
        allowClose.current = false;
        setError(errorText(error));
      });
    }
  }

  function navigate(request: Navigation) {
    if (busyRef.current || activityRef.current.saving) return;
    if (request.kind === "select" && request.id === activeId) return;
    if (request.kind === "remove" || activityRef.current.dirty) setPending(request);
    else runNavigation(request);
  }

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        selectedId={activeId}
        dirty={activity.dirty}
        disabled={busy || activity.saving}
        preview={api.mode === "preview"}
        canAdd
        onAdd={() => navigate({ kind: "add" })}
        onSelect={(project) => navigate({ kind: "select", id: project.id })}
      />
      <div className="workspace">
        {error && <div className="workspace-error"><Notice title="操作未完成" tone="error">{error}</Notice></div>}
        {active
          ? <ProjectEditor key={active.id} api={api} project={active} disabled={busy} onActivity={recordActivity} onRemove={() => navigate({ kind: "remove" })} persistNotes={persistNotes} />
          : <EmptyWorkspace title="添加第一个项目" description="选择项目文件夹，再指定要管理的 .env 文件。"
              action={{ label: "选择项目文件夹", run: () => navigate({ kind: "add" }), disabled: busy }} />}
      </div>

      {directory && <ProjectPicker api={api} directory={directory} onClose={() => setDirectory(null)} onAdd={addProject} />}
      {pending && (
        <Confirmation
          title={pending.kind === "remove" ? "从列表移除项目？" : "放弃未保存的更改？"}
          description={pending.kind === "remove"
            ? <>{active?.name} 将从 Envnote 的项目列表中移除。目录与配置文件会留在原处。{activity.dirty && "未保存的更改会丢失。"}</>
            : "当前项目还有未保存的更改。"}
          confirmLabel={pending.kind === "remove" ? "移除项目" : "放弃草稿"}
          cancelLabel={pending.kind === "remove" ? "取消" : "继续编辑"}
          danger
          onClose={() => setPending(null)}
          onConfirm={() => runNavigation(pending)}
        />
      )}
    </div>
  );
}

type Startup =
  | { status: "loading" | "browser" }
  | { status: "error"; error: string }
  | { status: "ready"; api: WorkspaceApi; state: AppState };

export function App({ api: injectedApi }: { api?: WorkspaceApi }) {
  const [startup, setStartup] = useState<Startup>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const api = injectedApi ?? await getWorkspaceApi();
        const state = api && await api.loadState();
        if (!active) return;
        setStartup(api && state ? { status: "ready", api, state } : { status: "browser" });
      } catch (error) {
        if (active) setStartup({ status: "error", error: errorText(error) });
      }
    }
    void initialize();
    return () => { active = false; };
  }, [injectedApi, attempt]);

  if (startup.status === "ready") return <Workspace api={startup.api} initial={startup.state} />;

  return (
    <div className="app-shell">
      <Sidebar projects={[]} selectedId={undefined} dirty={false} disabled preview={false} canAdd={false} onAdd={() => {}} onSelect={() => {}} />
      <div className="workspace">
        {startup.status === "loading" && <EmptyWorkspace title="正在打开工作区" description="正在读取本地项目…" />}
        {startup.status === "browser" && <EmptyWorkspace title="在桌面版中打开" description="Envnote 桌面版可直接读取和保存项目中的 .env 文件。" />}
        {startup.status === "error" && <EmptyWorkspace title="无法打开工作区" description={startup.error} action={{
          label: "重试",
          run: () => { setStartup({ status: "loading" }); setAttempt((value) => value + 1); },
        }} />}
      </div>
    </div>
  );
}
