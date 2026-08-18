import { describe, expect, it } from "vitest";

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Readable-text floor for every shipped stylesheet.
 *
 * The stage views had drifted to text as small as 8.8px, with the three core
 * score values - the numbers the whole game is about - at 10.88px in both the
 * newborn and runner HUDs. 48 declarations across five stylesheets sat below a
 * readable size. This test keeps the floor from slipping back.
 *
 * 0.75rem is 12px at the default root size. Raise a value if a design needs it;
 * never lower one below the floor.
 */

const PRESENTATION_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHOICE_OF_LIFE_DIR = path.resolve(PRESENTATION_DIR, "..");
const FLOOR_REM = 0.75;

function stylesheets(): readonly { file: string; css: string }[] {
  const files = [
    path.join(CHOICE_OF_LIFE_DIR, "style.css"),
    ...readdirSync(PRESENTATION_DIR)
      .filter((name) => name.endsWith(".css"))
      .map((name) => path.join(PRESENTATION_DIR, name)),
  ];
  return files.map((file) => ({
    file: path.basename(file),
    css: readFileSync(file, "utf8"),
  }));
}

describe("readable text floor", () => {
  it("keeps every rem-based font-size at or above 12px", () => {
    const offenders: string[] = [];
    for (const { file, css } of stylesheets()) {
      for (const match of css.matchAll(/font-size:\s*([0-9.]+)rem/g)) {
        const rem = Number.parseFloat(match[1]!);
        if (rem < FLOOR_REM) {
          const line = css.slice(0, match.index).split("\n").length;
          offenders.push(file + ":" + line + " " + rem + "rem");
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the core score values prominent in both play HUDs", () => {
    const css = stylesheets().map((sheet) => sheet.css).join("\n");
    for (const selector of [
      ".col-newborn-stage .col-newborn-score-value",
      ".col-runner-visual-frame .col-runner-score-value",
    ]) {
      const index = css.indexOf(selector + " {");
      expect(index, selector + " rule is missing").toBeGreaterThan(-1);
      const block = css.slice(index, css.indexOf("}", index));
      const size = /font-size:\s*([0-9.]+)rem/.exec(block);
      expect(size, selector + " has no font-size").not.toBeNull();
      expect(Number.parseFloat(size![1]!), selector).toBeGreaterThanOrEqual(1);
    }
  });
});
