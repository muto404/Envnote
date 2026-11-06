import { describe, expect, it } from "vitest";
import {
  acceptFileWrite, addMissingKeys, changeValue, createSession, getChanges,
  receiveDocument, rebaseDraft, removeVariable, setVariableNote,
} from "./session";
import type { EnvDocument } from "./types";

const base: EnvDocument = {
  path: "/fixture/.env.local",
  revision: "r1",
  entries: [{ key: "TOKEN", value: "base" }, { key: "PORT", value: "4000" }],
  missing: false,
};

const newer: EnvDocument = {
  ...base,
  revision: "r2",
  entries: [
    { key: "TOKEN", value: "external" },
    { key: "PORT", value: "5000" },
    { key: "LOG_LEVEL", value: "debug" },
  ],
};

describe("editing session", () => {
  it("recognizes a value edit and clears dirty state when it is reverted", () => {
    const edited = changeValue(createSession(base, {}), "TOKEN", "draft");
    expect(getChanges(edited)).toEqual({ file: true, notes: false });
    expect(getChanges(changeValue(edited, "TOKEN", "base"))).toEqual({ file: false, notes: false });
  });

  it("loads a newer revision when there is no draft", () => {
    const next = receiveDocument(createSession(base, {}), newer);
    expect(next.base.revision).toBe("r2");
    expect(next.entries.map(({ key }) => key)).toEqual(["TOKEN", "PORT", "LOG_LEVEL"]);
  });

  it("keeps a draft and the original revision when the file changes", () => {
    const draft = changeValue(createSession(base, {}), "TOKEN", "draft");
    const next = receiveDocument(draft, newer);
    expect(next.base.revision).toBe("r1");
    expect(next.entries[0].value).toBe("draft");
    expect(next.conflict?.revision).toBe("r2");
  });

  it("rebases only local changes and preserves independent disk edits", () => {
    const draft = changeValue(createSession(base, {}), "TOKEN", "draft");
    const next = rebaseDraft(receiveDocument(draft, newer));
    expect(next.base.revision).toBe("r2");
    expect(next.conflict).toBeUndefined();
    expect(next.entries).toEqual([
      { key: "TOKEN", value: "draft" },
      { key: "PORT", value: "5000" },
      { key: "LOG_LEVEL", value: "debug" },
    ]);
    expect(getChanges(next)).toEqual({ file: true, notes: false });
  });

  it("adds only missing template keys with empty values", () => {
    const draft = addMissingKeys(createSession(base, {}), [
      { key: "TOKEN", value: "example" },
      { key: "NEW_KEY", value: "ignored" },
    ]);
    expect(draft.entries).toEqual([
      { key: "TOKEN", value: "base" },
      { key: "PORT", value: "4000" },
      { key: "NEW_KEY", value: "" },
    ]);
  });

  it("keeps unsaved metadata dirty after the file write succeeds", () => {
    const draft = setVariableNote(
      changeValue(createSession(base, {}), "TOKEN", "draft"),
      "TOKEN",
      { note: "Uses the service console", url: "https://example.com", sensitive: true },
    );
    const savedFile = { ...base, revision: "r2", entries: draft.entries };
    expect(getChanges(acceptFileWrite(draft, savedFile))).toEqual({ file: false, notes: true });
  });

  it("removes only the intended key and its note", () => {
    const note = { note: "Service", url: "", sensitive: true };
    const draft = removeVariable(createSession(base, { TOKEN: note, PORT: note }), "TOKEN");
    expect(draft.entries).toEqual([{ key: "PORT", value: "4000" }]);
    expect(draft.notes).toEqual({ PORT: note });
    expect(getChanges(draft)).toEqual({ file: true, notes: true });
  });
});
