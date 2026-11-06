const templateSuffixes = ["example", "sample", "template", "dist"];

export function basename(path: string) {
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).at(-1) ?? path;
}

export function parentPath(path: string) {
  return path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) || 1);
}

export function inDirectory(directory: string, name: string) {
  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  return directory.replace(/[/\\]+$/, "") + separator + name;
}

export function relativeFile(directory: string, filePath: string) {
  const prefix = inDirectory(directory, "");
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

export function isEnvironmentFile(path: string) {
  return /^\.env(?:\..+)?$/i.test(basename(path));
}

export function isTemplate(path: string) {
  const name = basename(path).toLowerCase();
  return name.startsWith(".env.") && templateSuffixes.some((suffix) => name.endsWith("." + suffix));
}

export function matchingTemplate(candidates: string[], filePath: string) {
  const name = basename(filePath).toLowerCase();
  for (const stem of [name, ".env"]) {
    for (const suffix of templateSuffixes) {
      const template = candidates.find((path) => basename(path).toLowerCase() === stem + "." + suffix);
      if (template) return template;
    }
  }
}

const webProtocol = /^https?:\/\//i;
const bareAddress = /^(?:[^./:?#@\s]+(?:\.[^./:?#@\s]+)+|localhost|\[[\da-f:.]+\])(?::\d+)?(?:[/?#]|$)/i;

export function externalUrl(value: string) {
  const input = value.trim();
  const absolute = webProtocol.test(input);
  if ((!absolute && !bareAddress.test(input)) || /[\s\\]/.test(input)) return undefined;

  try {
    const url = new URL(absolute ? input : "https://" + input);
    if (!url.username && !url.password && (url.protocol === "https:" || url.protocol === "http:")) {
      return url.href;
    }
  } catch {
    // An invalid link can still be edited in the notes dialog.
  }
}

export function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "发生未知错误";
}
