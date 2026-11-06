import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { externalUrl } from "./files";
import type { WorkspaceApi } from "./types";

const desktop: WorkspaceApi = {
  mode: "desktop",
  loadState: () => invoke("load_state"),
  saveState: (state) => invoke("save_state", { state }),
  inspectProject: (directory) => invoke("inspect_project", { directory }),
  readDocument: (path) => invoke("read_document", { path }),
  saveDocument: (path, expectedRevision, entries) =>
    invoke("save_document", { path, expectedRevision, entries }),
  gitStatus: (path) => invoke("git_status", { path }),
  chooseDirectory: () => open({ title: "选择项目文件夹", directory: true, multiple: false }),
  chooseFile: (directory) => open({ title: "选择 .env 配置文件", defaultPath: directory, multiple: false }),
  copyLink: (url) => writeText(url),
  openExternal: (value) => {
    const url = externalUrl(value);
    return url ? openUrl(url) : Promise.reject(new Error("请输入有效的 http 或 https 链接"));
  },
};

export async function getWorkspaceApi(): Promise<WorkspaceApi | undefined> {
  if (isTauri()) return desktop;
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo")) {
    const { createPreview } = await import("./preview");
    return createPreview(new URLSearchParams(window.location.search).get("demo") === "empty");
  }
}
