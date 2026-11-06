// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import type { AppState, EnvDocument, Project, WorkspaceApi } from "./core/types";

const first = { id: "one", name: "口语项目", directory: "/one", filePath: "/one/.env.local", notes: {} };
const second = { id: "two", name: "笔记示例", directory: "/two", filePath: "/two/.env", notes: {} };

function fixture(projects: Project[] = []) {
  let state: AppState = { projects };
  let writes = 0;
  const openedLinks: string[] = [];
  const copiedLinks: string[] = [];
  const document = (path: string, value: string): EnvDocument => ({
    path, revision: "initial", missing: false, entries: [{ key: "API_TOKEN", value }],
  });
  const files = new Map([
    [first.filePath, document(first.filePath, "fixture-one")],
    [second.filePath, document(second.filePath, "fixture-two")],
    ["/one/.env.example", document("/one/.env.example", "")],
  ]);
  const api: WorkspaceApi = {
    mode: "preview",
    loadState: async () => structuredClone(state),
    saveState: async (next) => { state = structuredClone(next); },
    inspectProject: async (directory) => [...files.keys()].filter((path) => path.startsWith(directory + "/")),
    readDocument: async (path) => structuredClone(files.get(path)!),
    saveDocument: async (path, revision, entries) => {
      writes++;
      const next = { path, revision: revision + "saved", entries, missing: false };
      files.set(path, next);
      return structuredClone(next);
    },
    gitStatus: async () => ({ tracked: true, ignored: true, available: true }),
    chooseDirectory: async () => first.directory,
    chooseFile: async () => null,
    openExternal: async (url) => { openedLinks.push(url); },
    copyLink: async (url) => { copiedLinks.push(url); },
  };
  return { api, currentState: () => state, fileWrites: () => writes, openedLinks, copiedLinks };
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function () { this.removeAttribute("open"); };
});

afterEach(cleanup);

describe("workspace", () => {
  it("requires an explicit target and masks values by default", async () => {
    const user = userEvent.setup();
    const { api, currentState } = fixture();
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "选择项目文件夹" }, { timeout: 450 }));
    const picker = await screen.findByRole("dialog", { name: "选择配置文件" });
    const add = within(picker).getByRole("button", { name: "添加项目" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(within(picker).queryByRole("radio", { name: /\.env\.example/ })).toBeNull();
    await user.click(await within(picker).findByRole("radio", { name: /\.env\.local/ }));
    await user.click(add);
    const value = await screen.findByLabelText<HTMLInputElement>("API_TOKEN 的值");
    expect(value.type).toBe("password");
    expect(currentState().projects[0].filePath).toBe("/one/.env.local");
    await user.click(screen.getByRole("button", { name: "显示 API_TOKEN 的值" }));
    expect(value.type).toBe("text");
    expect(value.value).toBe("fixture-one");
  });

  it("guards a dirty project switch and keeps each project's value separate", async () => {
    const user = userEvent.setup();
    render(<App api={fixture([first, second]).api} />);
    const value = await screen.findByLabelText<HTMLInputElement>("API_TOKEN 的值", {}, { timeout: 450 });
    await user.type(value, "-edited");
    const other = screen.getByRole("button", { name: /笔记示例/ });
    await user.click(other);
    const guard = await screen.findByRole("dialog", { name: "放弃未保存的更改？" });
    await user.click(within(guard).getByRole("button", { name: "继续编辑" }));
    expect(value.value).toBe("fixture-one-edited");
    await user.click(other);
    await user.click(screen.getByRole("button", { name: "放弃草稿" }));
    expect((await screen.findByLabelText<HTMLInputElement>("API_TOKEN 的值")).value).toBe("fixture-two");
  });

  it("guards input still inside the add variable form", async () => {
    const user = userEvent.setup();
    render(<App api={fixture([first]).api} />);
    await user.click(await screen.findByRole("button", { name: "添加变量" }));
    const form = screen.getByRole("dialog", { name: "添加变量" });
    const key = within(form).getByLabelText<HTMLInputElement>("变量名");
    await user.type(key, "DRAFT_TOKEN");
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    await user.click(within(form).getByRole("button", { name: "取消" }));
    const guard = screen.getByRole("dialog", { name: "放弃当前输入？" });
    await user.click(within(guard).getByRole("button", { name: "继续填写" }));
    expect(key.value).toBe("DRAFT_TOKEN");
  });

  it("saves metadata separately and labels tracked Git files", async () => {
    const user = userEvent.setup();
    const { api, currentState, fileWrites } = fixture([first]);
    render(<App api={api} />);
    const git = await screen.findByText("Git 已跟踪", {}, { timeout: 450 });
    expect(git.title).toContain("即使");
    expect(screen.queryByText("此文件已被 Git 跟踪")).toBeNull();
    expect(screen.queryByText("没有待保存的更改")).toBeNull();
    expect(screen.getAllByText(first.filePath, { exact: true })).toHaveLength(1);
    const note = await screen.findByLabelText("API_TOKEN 的用途说明", {}, { timeout: 450 });
    const link = screen.getByLabelText("API_TOKEN 的相关链接");
    await user.type(note, "测试平台{Enter}开发环境");
    await user.type(link, "example.com/keys");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(currentState().projects[0].notes).toEqual({});
    await user.click(screen.getByRole("button", { name: "保存更改" }));
    await screen.findByText("说明与链接已保存");
    expect(fileWrites()).toBe(0);
    expect(currentState().projects[0].notes.API_TOKEN).toEqual({
      note: "测试平台\n开发环境", url: "example.com/keys", sensitive: true,
    });
  });
  it("opens and copies a link without a note or typed protocol", async () => {
    const user = userEvent.setup();
    const { api, openedLinks, copiedLinks } = fixture([{
      ...first,
      notes: { API_TOKEN: { note: "", url: "example.com/console", sensitive: true } },
    }]);
    render(<App api={api} />);
    const link = await screen.findByLabelText<HTMLInputElement>("API_TOKEN 的相关链接", {}, { timeout: 450 });
    expect(link.value).toBe("example.com/console");
    await user.click(link);
    expect(openedLinks).toEqual([]);
    await user.click(screen.getByRole("button", { name: "打开 API_TOKEN 的链接" }));
    expect(openedLinks).toEqual(["https://example.com/console"]);
    await user.click(screen.getByRole("button", { name: "复制 API_TOKEN 的链接" }));
    await screen.findByText("已复制链接");
    expect(copiedLinks).toEqual(["https://example.com/console"]);
  });

  it("keeps an invalid inline URL in the draft and can clear it", async () => {
    const user = userEvent.setup();
    const { api, currentState } = fixture([{
      ...first,
      notes: { API_TOKEN: { note: "", url: "example.com/console", sensitive: true } },
    }]);
    render(<App api={api} />);
    const link = await screen.findByLabelText<HTMLInputElement>("API_TOKEN 的相关链接", {}, { timeout: 450 });
    await user.clear(link);
    await user.type(link, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "保存更改" }));
    await screen.findByText("请输入有效的网址");
    expect(link.value).toBe("javascript:alert(1)");
    expect(currentState().projects[0].notes.API_TOKEN.url).toBe("example.com/console");

    await user.clear(link);
    await user.click(screen.getByRole("button", { name: "保存更改" }));
    await screen.findByText("说明与链接已保存");
    expect(currentState().projects[0].notes).toEqual({});
  });

  it("keeps a matching row focused while its use is edited and cancels that field with Escape", async () => {
    const user = userEvent.setup();
    render(<App api={fixture([{
      ...first,
      notes: { API_TOKEN: { note: "可搜索的用途", url: "", sensitive: true } },
    }]).api} />);
    const search = await screen.findByRole("searchbox", { name: "搜索变量" });
    await user.type(search, "可搜索的用途");
    const note = await screen.findByLabelText<HTMLTextAreaElement>("API_TOKEN 的用途说明", {}, { timeout: 450 });
    await user.clear(note);
    await user.type(note, "新用途");
    expect(note.value).toBe("新用途");
    await user.keyboard("{Escape}");
    expect(note.value).toBe("可搜索的用途");
    expect(screen.queryByText("有未保存的更改")).toBeNull();
  });

});
