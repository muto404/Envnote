import { externalUrl, isTemplate } from "./files";
import type { AppState, EnvDocument, WorkspaceApi } from "./types";

export function createPreview(empty = false): WorkspaceApi {
  const voice = "/Demo/语音示例";
  const objects = "/Demo/笔记示例";
  const player = "/Demo/播放器示例";
  const voiceFile = voice + "/.env.local";
  const objectFile = objects + "/.env";
  const playerTemplate = player + "/.env.example";
  const voiceTemplate = voice + "/.env.example";
  const projectEntries = [
    { key: "DASHSCOPE_API_KEY", value: "demo-voice-key" },
    { key: "OPENAI_API_KEY", value: "demo-feedback-key" },
    { key: "TTS_MODEL", value: "demo-voice-model" },
    { key: "ASR_LANGUAGE", value: "en-US" },
    { key: "RELAY_PORT", value: "8400" },
  ];
  const files = new Map<string, EnvDocument>([
    [voiceFile, { path: voiceFile, revision: "1", missing: false, entries: projectEntries }],
    [voiceTemplate, { path: voiceTemplate, revision: "1", missing: false, entries: [...projectEntries, { key: "REALTIME_MODEL", value: "" }] }],
    [objectFile, { path: objectFile, revision: "1", missing: false, entries: [{ key: "OPENAI_API_KEY", value: "demo-object-key" }, { key: "CARD_LOCALE", value: "zh-CN" }] }],
    [playerTemplate, { path: playerTemplate, revision: "1", missing: false, entries: [{ key: "TRANSCRIPT_URL", value: "" }, { key: "PLAYER_LANGUAGE", value: "en" }] }],
  ]);
  const testProjects = Array.from({ length: 16 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const name = `滚动测试项目 ${number}`;
    const directory = `/Demo/${name}`;
    const filePath = `${directory}/.env.local`;
    files.set(filePath, {
      path: filePath, revision: "1", missing: false,
      entries: [{ key: "PROJECT_NAME", value: `sidebar-test-${number}` }],
    });
    return { id: `sidebar-test-${number}`, name, directory, filePath, notes: {} };
  });
  let state: AppState = {
    projects: empty ? [] : [
      {
        id: "voice", name: "语音示例", directory: voice, filePath: voiceFile,
        notes: {
          DASHSCOPE_API_KEY: { note: "实时语音和语音合成", url: "https://example.com/voice", sensitive: true },
          OPENAI_API_KEY: { note: "练习反馈", url: "https://example.com/feedback", sensitive: true },
          TTS_MODEL: { note: "语音合成模型", url: "", sensitive: true },
          RELAY_PORT: { note: "本地服务端口", url: "", sensitive: false },
        },
      },
      { id: "objects", name: "笔记示例", directory: objects, filePath: objectFile, notes: {} },
      ...testProjects,
    ],
  };
  const read = (path: string): EnvDocument =>
    structuredClone(files.get(path) ?? { path, revision: "missing", missing: true, entries: [] });

  return {
    mode: "preview",
    loadState: async () => structuredClone(state),
    saveState: async (next) => { state = structuredClone(next); },
    inspectProject: async (directory) => [...files.keys()].filter((path) => path.startsWith(directory + "/")),
    readDocument: async (path) => read(path),
    saveDocument: async (path, revision, entries) => {
      if (isTemplate(path)) throw new Error("模板不可写入。");
      if (read(path).revision !== revision) throw new Error("File changed on disk");
      const next = { path, revision: crypto.randomUUID(), missing: false, entries: structuredClone(entries) };
      files.set(path, next);
      return read(path);
    },
    gitStatus: async (path) => ({ available: true, tracked: path === objectFile, ignored: true }),
    chooseDirectory: async () => empty && !state.projects.length ? voice : player,
    chooseFile: async () => null,
    copyLink: async (url) => navigator.clipboard.writeText(url),
    openExternal: async (value) => {
      const url = externalUrl(value);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
  };
}
