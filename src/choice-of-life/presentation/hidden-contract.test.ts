import { describe, expect, it } from "vitest";

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * `element.hidden = true` only hides an element while nothing in the author
 * stylesheet gives it an explicit `display`. A class rule such as
 * `.col-childhood-play-controls { display: flex }` has the same specificity as
 * the user-agent `[hidden]` rule and comes from the author sheet, so it wins --
 * and the element stays on screen while the code believes it is hidden.
 *
 * That defect shipped twice: the childhood play controls stayed visible behind
 * the choice tray, summary and completion panels, and the later-life ending
 * screen kept a second "Return to title" button. Both views simply lacked the
 * `[hidden]` catch-all that the runner and newborn views already had.
 */

const PRESENTATION_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHOICE_OF_LIFE_DIR = path.resolve(PRESENTATION_DIR, "..");

function allCss(): string {
  const files = [
    path.join(CHOICE_OF_LIFE_DIR, "style.css"),
    ...readdirSync(PRESENTATION_DIR)
      .filter((name) => name.endsWith(".css"))
      .map((name) => path.join(PRESENTATION_DIR, name)),
  ];
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}

/** View roots whose code toggles `hidden` on descendants. */
const VIEW_ROOTS = [
  "col-runner-view",
  "col-newborn-view",
  "col-childhood-view",
  "col-later-life-view",
];

/** Classes that carry an explicit `display` and are toggled through `hidden`. */
const DISPLAY_TOGGLED_CLASSES = [
  "col-childhood-play-controls",
  "col-later-life-footer",
  "col-childhood-echo",
  "col-childhood-summary",
];

function normalize(css: string): string {
  return css.replace(/\s+/g, " ");
}

describe("hidden attribute contract", () => {
  const css = normalize(allCss());

  it("gives every view root a [hidden] catch-all that beats author display rules", () => {
    for (const root of VIEW_ROOTS) {
      const rule = `.${root} [hidden] { display: none !important;`;
      expect(css.includes(rule), `.${root} is missing its [hidden] catch-all`)
        .toBe(true);
    }
  });

  it("covers every display-toggled class by a rule or a view-root catch-all", () => {
    for (const className of DISPLAY_TOGGLED_CLASSES) {
      const ownRule = css.includes(`.${className}[hidden]`);
      const covered = ownRule ||
        VIEW_ROOTS.some((root) => css.includes(`.${root} [hidden] { display: none !important;`));
      expect(covered, `.${className} can be resurrected by its display rule`)
        .toBe(true);
    }
  });
});
