import { describe, expect, it } from "vitest";

// @ts-expect-error The Vitest process provides Node built-ins; the production TS project intentionally omits Node types.
import { readFileSync } from "node:fs";

const style = readFileSync(new URL("./style.css", import.meta.url), "utf8") as string;

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = style.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  if (!match?.[1]) {
    throw new Error(`Missing CSS rule: ${selector}`);
  }
  return match[1];
}

describe("Phase 1 accessibility style contract", () => {
  it("keeps visible focus and 44px minimum interactive target containers", () => {
    expect(rule(".choice-life-root :focus-visible")).toMatch(/outline:\s*3px\s+solid/);
    for (const selector of [".col-button", ".col-option-card", ".col-field select", ".col-check-row"]) {
      expect(rule(selector), selector).toMatch(/min-block-size:\s*44px/);
    }
  });

  it("retains the 320px reflow rules and normal document scrolling", () => {
    expect(style).toMatch(/@media\s*\(max-width:\s*20rem\)/);
    expect(style).toMatch(/@media\s*\(max-width:\s*34rem\)[\s\S]*?\.col-score-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
    expect(style).toMatch(/@media\s*\(max-width:\s*34rem\)[\s\S]*?\.col-actions[\s\S]*?flex-direction:\s*column/);
    expect(rule(".choice-life-root")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(".col-dialog")).toMatch(/overflow:\s*auto/);
    expect(style).not.toMatch(/overflow:\s*hidden/);
  });

  it("keeps explicit high-contrast and reduced-motion behavior", () => {
    expect(style).toContain('.choice-life-root[data-contrast="high"]');
    expect(style).toContain('.choice-life-root[data-reduced-motion="true"] *');
    expect(style).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(style).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
    expect(style).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it("keeps the fallback dialog fixed above a blocking backdrop", () => {
    expect(rule('.col-dialog[data-dialog-mode="fallback"]')).toMatch(/position:\s*fixed/);
    expect(rule('.col-dialog[data-dialog-mode="fallback"]')).toMatch(/z-index:\s*1001/);
    expect(rule(".col-dialog-fallback-backdrop")).toMatch(/position:\s*fixed/);
    expect(rule(".col-dialog-fallback-backdrop")).toMatch(/inset:\s*0/);
  });
});
