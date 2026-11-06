import { describe, expect, it } from "vitest";
import { externalUrl } from "./files";

describe("external links", () => {
  it.each([
    ["example.com/keys", "https://example.com/keys"],
    ["  example.com:8443/console?tab=keys  ", "https://example.com:8443/console?tab=keys"],
    ["http://localhost:8080/console", "http://localhost:8080/console"],
  ])("opens %s as a usable web address", (input, href) => {
    expect(externalUrl(input)).toBe(href);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,example",
    "file:///private/tmp/file",
    "//example.com/keys",
    "https://username:password@example.com/console",
    "just a note",
  ])("rejects an unsupported address (%s)", (input) => {
    expect(externalUrl(input)).toBeUndefined();
  });
});
