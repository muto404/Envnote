import type { EnvDocument, EnvEntry, VariableNote, VariableNotes } from "./types";

export interface EditorSession {
  base: EnvDocument;
  baseNotes: VariableNotes;
  entries: EnvEntry[];
  notes: VariableNotes;
  conflict?: EnvDocument;
}

export function getVariableNote(notes: VariableNotes, key: string): VariableNote | undefined {
  return Object.hasOwn(notes, key) ? notes[key] : undefined;
}

export function createSession(base: EnvDocument, notes: VariableNotes): EditorSession {
  return { base, baseNotes: notes, entries: base.entries, notes };
}

export function getChanges(session: EditorSession) {
  const { base, baseNotes, entries, notes } = session;
  const file = base.entries.length !== entries.length || entries.some(({ key, value }, index) => {
    const original = base.entries[index];
    return original.key !== key || original.value !== value;
  });
  const keys = Object.keys(notes);
  const metadata = keys.length !== Object.keys(baseNotes).length || keys.some((key) => {
    const before = getVariableNote(baseNotes, key);
    const after = notes[key];
    return before?.note !== after.note || before?.url !== after.url || before?.sensitive !== after.sensitive;
  });
  return { file, notes: metadata };
}

export function changeValue(session: EditorSession, key: string, value: string): EditorSession {
  return {
    ...session,
    entries: session.entries.map((entry) => entry.key === key ? { key, value } : entry),
  };
}

export function appendVariable(session: EditorSession, entry: EnvEntry): EditorSession {
  return { ...session, entries: [...session.entries, entry] };
}

export function removeVariable(session: EditorSession, key: string): EditorSession {
  const notes = { ...session.notes };
  delete notes[key];
  return { ...session, entries: session.entries.filter((entry) => entry.key !== key), notes };
}

export function setVariableNote(session: EditorSession, key: string, note: VariableNote): EditorSession {
  const notes = { ...session.notes };
  if (note.note || note.url || !note.sensitive) {
    return { ...session, notes: { ...notes, [key]: note } };
  } else {
    delete notes[key];
  }
  return { ...session, notes };
}

export function addMissingKeys(session: EditorSession, template: EnvEntry[]): EditorSession {
  const existing = new Set(session.entries.map(({ key }) => key));
  const additions: EnvEntry[] = [];
  for (const { key } of template) {
    if (existing.has(key)) continue;
    existing.add(key);
    additions.push({ key, value: "" });
  }
  return { ...session, entries: [...session.entries, ...additions] };
}

export function receiveDocument(session: EditorSession, document: EnvDocument): EditorSession {
  if (document.revision === session.base.revision) return { ...session, base: document, conflict: undefined };
  const changes = getChanges(session);
  return changes.file || changes.notes
    ? { ...session, conflict: document }
    : createSession(document, session.baseNotes);
}

export function acceptFileWrite(session: EditorSession, document: EnvDocument): EditorSession {
  return { ...session, base: document, entries: document.entries, conflict: undefined };
}

const valuesByKey = (entries: EnvEntry[]) => new Map(entries.map(({ key, value }) => [key, value]));

function localEdits(session: EditorSession) {
  const original = valuesByKey(session.base.entries);
  const draft = valuesByKey(session.entries);
  const keys = new Set([...original.keys(), ...draft.keys()]);
  const edits = new Map<string, string | undefined>();
  for (const key of keys) {
    const value = draft.get(key);
    if (value !== original.get(key)) edits.set(key, value);
  }
  return edits;
}

export function overlappingKeys(session: EditorSession): string[] {
  if (!session.conflict) return [];
  const original = valuesByKey(session.base.entries);
  const external = valuesByKey(session.conflict.entries);
  return [...localEdits(session)].filter(([key, local]) => {
    const disk = external.get(key);
    return disk !== original.get(key) && disk !== local;
  }).map(([key]) => key);
}

export function rebaseDraft(session: EditorSession): EditorSession {
  if (!session.conflict) return session;
  const combined = valuesByKey(session.conflict.entries);
  for (const [key, value] of localEdits(session)) {
    if (value === undefined) combined.delete(key);
    else combined.set(key, value);
  }
  return {
    ...session,
    base: session.conflict,
    entries: [...combined].map(([key, value]) => ({ key, value })),
    conflict: undefined,
  };
}
