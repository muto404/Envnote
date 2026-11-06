export interface VariableNote {
  note: string;
  url: string;
  sensitive: boolean;
}

export type VariableNotes = Record<string, VariableNote>;

export interface Project {
  id: string;
  name: string;
  directory: string;
  filePath: string;
  notes: VariableNotes;
}

export interface AppState {
  projects: Project[];
}

export interface EnvEntry {
  key: string;
  value: string;
}

export interface EnvDocument {
  path: string;
  revision: string;
  entries: EnvEntry[];
  missing: boolean;
  readOnlyReason?: string | null;
}

export interface GitStatus {
  tracked: boolean;
  ignored: boolean;
  available: boolean;
}

export interface WorkspaceApi {
  mode: "desktop" | "preview";
  loadState: () => Promise<AppState>;
  saveState: (state: AppState) => Promise<void>;
  inspectProject: (directory: string) => Promise<string[]>;
  readDocument: (path: string) => Promise<EnvDocument>;
  saveDocument: (path: string, revision: string, entries: EnvEntry[]) => Promise<EnvDocument>;
  gitStatus: (path: string) => Promise<GitStatus>;
  chooseDirectory: () => Promise<string | null>;
  chooseFile: (directory: string) => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  copyLink: (url: string) => Promise<void>;
}
