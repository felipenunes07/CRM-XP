import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("intelligence conversation feed layout", () => {
  it("keeps cards at a readable height instead of shrinking the whole page", () => {
    expect(cssRule(".wtl-feed-list")).toContain("display: block");
    expect(cssRule(".wtl-feed-item")).toContain("width: 100%");
    expect(cssRule(".wtl-feed-item")).toContain("min-height: 96px");
  });
});
