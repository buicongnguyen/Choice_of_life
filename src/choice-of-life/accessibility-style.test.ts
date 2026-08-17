import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

const style = readFileSync(new URL("./style.css", import.meta.url), "utf8") as string;

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Anchor to the start of a line so a longer, more specific selector cannot
  // satisfy a lookup for the base rule. Without this, `.col-field select`
  // silently matched `.col-shell[data-screen="setup"] .col-field select`, and
  // `.col-button--primary` matched the screen-scoped override — so these
  // contract assertions were reading rules they were never meant to check.
  const match = style.match(
    new RegExp(`^\\s*${escaped}\\s*\\{([^}]+)\\}`, "m"),
  );
  if (!match?.[1]) {
    throw new Error(`Missing CSS rule: ${selector}`);
  }
  return match[1];
}

/** Every declaration block whose selector list mentions `selector`. */
function allRulesMentioning(selector: string): readonly string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = style.matchAll(
    new RegExp(`(^|[},])([^{}]*${escaped})\\s*\\{([^}]+)\\}`, "gm"),
  );
  return [...matches].map((match) => match[3] ?? "");
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Phase 1 accessibility style contract", () => {
  it("keeps visible focus and 44px minimum interactive target containers", () => {
    expect(rule(".choice-life-root :focus-visible")).toMatch(/outline:\s*3px\s+solid/);
    expect(rule(".choice-life-root :focus-visible")).toMatch(/outline-offset:\s*3px/);
    for (const selector of [".col-button", ".col-option-card", ".col-field select", ".col-check-row"]) {
      expect(rule(selector), selector).toMatch(/min-block-size:\s*44px/);
    }
    expect(rule(".col-runner-interruptions")).toMatch(/padding:\s*7px/);
    expect(rule(".col-runner-interruptions .col-button")).toMatch(
      /scroll-margin:\s*7px/,
    );
  });

  it("retains the 320px reflow rules and normal document scrolling", () => {
    expect(style).toMatch(/@media\s*\(max-width:\s*20rem\)/);
    expect(style).toMatch(/@media\s*\(max-width:\s*34rem\)[\s\S]*?\.col-score-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
    expect(style).toMatch(/@media\s*\(max-width:\s*34rem\)[\s\S]*?\.col-actions[\s\S]*?flex-direction:\s*column/);
    expect(rule(".choice-life-root")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(".col-dialog")).toMatch(/overflow:\s*auto/);
    expect(rule(".choice-life-root")).not.toMatch(/overflow:\s*hidden/);
    expect(style.match(/html,\s*\nbody\s*\{[^}]+\}/)?.[0]).not.toMatch(/overflow:\s*hidden/);
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

  it("keeps runner navigation summaries visible and lane geometry perceivable", () => {
    expect(rule(".col-runner-nonlive-status")).toMatch(/border:\s*2px\s+solid/);
    expect(rule(".col-runner-nonlive-status")).toMatch(/background:\s*var\(--col-paper\)/);
    expect(rule(".col-runner-play-surface")).toMatch(
      /block-size:\s*clamp\(28rem,\s*50vw,\s*30rem\)/,
    );
    expect(rule(".col-runner-lane")).toMatch(
      /border-block-end:\s*4px\s+solid\s+var\(--col-runner-halo-outer\)/,
    );
    expect(rule(".col-runner-lane::after")).toMatch(
      /var\(--col-runner-halo-inner\)[\s\S]*var\(--col-runner-halo-outer\)/,
    );
    expect(rule(".col-runner-lane::after")).not.toMatch(/transparent|rgb\([^)]*\//);
    expect(style).toMatch(
      /\.col-runner-view\[data-text-scale="2"\]\s+\.col-runner-play-surface\s*\{[^}]*block-size:\s*52rem/s,
    );
    expect(style).toMatch(
      /data-contrast="high"[^,{]*\.col-runner-nonlive-status/,
    );
    expect(style).toMatch(
      /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.col-runner-nonlive-status/,
    );
  });

  it("keeps opaque warnings in a dedicated band outside moving entities", () => {
    const zIndex = (selector: string): number => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let value: string | undefined;
      for (const match of style.matchAll(
        new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g"),
      )) {
        value = match[1]?.match(/z-index:\s*(\d+)/)?.[1] ?? value;
      }
      if (!value) {
        throw new Error(`Missing numeric z-index: ${selector}`);
      }
      return Number(value);
    };

    expect(zIndex(".col-runner-entity-field")).toBeLessThan(zIndex(".col-runner-player"));

    const warningLayer = rule(".col-runner-warning-layer");
    expect(warningLayer).toMatch(/display:\s*grid/);
    expect(warningLayer).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(warningLayer).not.toMatch(/position:\s*absolute|z-index/);
    expect(style).toMatch(
      /@media\s*\(max-width:\s*30rem\)[\s\S]*?\.col-runner-warning-layer\s*\{[^}]*grid-template-columns:\s*1fr/,
    );

    const warning = rule(".col-runner-warning-lane");
    expect(warning).toMatch(/background:\s*#fff2cc/);
    expect(warning).not.toMatch(/background:[^;]*(?:transparent|\/\s*\d+%)/i);
    expect(style).toMatch(
      /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.col-runner-warning-lane,[\s\S]*?\{[\s\S]*?background:\s*Canvas;[\s\S]*?forced-color-adjust:\s*auto/,
    );
  });

  it("preserves redundant entity silhouettes in standard and forced colors", () => {
    expect(rule(".col-runner-entity--benefit")).toMatch(/border-radius:\s*50%/);
    expect(rule(".col-runner-entity--hazard")).toMatch(
      /transform:[^;]*rotate\(45deg\)/,
    );
    expect(rule(".col-runner-entity--opportunity")).toMatch(
      /transform:[^;]*rotate\(45deg\)/,
    );
    expect(style).toMatch(
      /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.col-runner-entity--hazard\s*\{[^}]*border-style:\s*double;[^}]*border-radius:\s*0/,
    );
  });

  it("locks measurable button and two-tone runner contrast above 3 to 1", () => {
    expect(rule(".choice-life-root")).toMatch(
      /--col-primary-button-border:\s*#000908/,
    );
    expect(rule(".col-button--primary")).toMatch(
      /border-color:\s*var\(--col-primary-button-border\)/,
    );
    expect(rule(".col-button--primary:hover:not(:disabled)")).toMatch(
      /border-color:\s*var\(--col-primary-button-border\)/,
    );
    expect(rule(".col-button--primary:focus-visible")).toMatch(
      /outline-color:\s*var\(--col-focus\)/,
    );
    // The title/setup/ready screens override the primary button with a literal
    // gradient, so the base rule above is not what most players actually see.
    // Lock the shipped colors too, or the contrast guarantee only covers a rule
    // that is overridden before it ever renders.
    for (const block of allRulesMentioning(".col-button--primary")) {
      const border = /border-color:\s*(#[0-9a-f]{6})/i.exec(block)?.[1];
      const text = /(?:^|;)\s*color:\s*(#[0-9a-f]{6})/i.exec(block)?.[1];
      const fill = /background:[^;]*?(#[0-9a-f]{6})\s*\)?\s*;/i.exec(block)?.[1];
      if (text && fill) {
        expect(contrastRatio(text, fill), `${text} on ${fill}`)
          .toBeGreaterThanOrEqual(3);
      }
      if (border && fill) {
        expect(contrastRatio(border, fill), `${border} edge on ${fill}`)
          .toBeGreaterThanOrEqual(3);
      }
    }
    expect(rule('.col-runner-control-area [data-runner-user-pause]')).toMatch(
      /border-color:\s*#64727a/,
    );
    expect(contrastRatio("#000908", "#156b65")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#64727a", "#fffdf8")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#1469d3", "#fffdf8")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#003cff", "#ffeded")).toBeGreaterThanOrEqual(3);

    const runner = rule(".col-runner-view");
    expect(runner).toMatch(/--col-runner-halo-inner:\s*#fffdf8/);
    expect(runner).toMatch(/--col-runner-halo-outer:\s*#101820/);
    for (const selector of [".col-runner-entity", ".col-runner-player"]) {
      expect(rule(selector), selector).toMatch(
        /0 0 0 2px var\(--col-runner-halo-inner\)[\s\S]*0 0 0 5px var\(--col-runner-halo-outer\)/,
      );
    }
    expect(rule(".col-runner-player")).toMatch(
      /background-color:\s*var\(--col-runner-halo-inner\)/,
    );
    expect(contrastRatio("#fffdf8", "#101820")).toBeGreaterThanOrEqual(3);
    for (const background of ["#b8e1e8", "#9ac98e", "#6fa66f", "#4c8557"]) {
      expect(contrastRatio("#101820", background), background)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it("styles progress track and value explicitly in standard and forced colors", () => {
    const progress = rule(".col-runner-progress progress");
    expect(progress).toMatch(/appearance:\s*none/);
    expect(progress).toMatch(/border:\s*2px\s+solid\s+var\(--col-runner-halo-outer\)/);
    expect(progress).toMatch(/background:\s*var\(--col-runner-halo-inner\)/);
    expect(rule(".col-runner-progress progress::-webkit-progress-bar")).toMatch(
      /background:\s*var\(--col-runner-halo-inner\)/,
    );
    expect(rule(".col-runner-progress progress::-webkit-progress-value")).toMatch(
      /background:\s*var\(--col-primary\)/,
    );
    expect(rule(".col-runner-progress progress::-moz-progress-bar")).toMatch(
      /background:\s*var\(--col-primary\)/,
    );
    expect(contrastRatio("#156b65", "#fffdf8")).toBeGreaterThanOrEqual(3);
    expect(style).toMatch(
      /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.col-runner-progress progress\s*\{[\s\S]*?border-color:\s*CanvasText;[\s\S]*?background:\s*Canvas;[\s\S]*?accent-color:\s*Highlight;[\s\S]*?forced-color-adjust:\s*none/,
    );
    expect(style).toMatch(
      /@media\s*\(forced-colors:\s*active\)[\s\S]*?::-webkit-progress-value,[\s\S]*?::-moz-progress-bar\s*\{[\s\S]*?background:\s*Highlight;[\s\S]*?forced-color-adjust:\s*none/,
    );
  });
});
