import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  auditChoiceBoundaries,
  collectCssReferences,
  collectHtmlReferences,
  collectModuleSpecifiers,
} from "./choice-boundaries.mjs";

const temporaryRoots = [];

function write(root, relative, contents = "") {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, contents, "utf8");
}

function tryCreateFileSymlink(root, targetRelative, linkRelative) {
  const target = path.join(root, targetRelative);
  const link = path.join(root, linkRelative);
  fs.mkdirSync(path.dirname(link), { recursive: true });
  try {
    fs.symlinkSync(target, link, "file");
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error?.code)) return false;
    throw error;
  }
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "choice-boundaries-"));
  temporaryRoots.push(root);
  write(
    root,
    "index.html",
    '<link rel="icon" href="./favicon.svg"><script type="module" src="/src/main.ts"></script>'
  );
  write(root, "public/favicon.svg", "<svg></svg>");
  write(root, "public/release.json", "{}");
  write(root, "src/main.ts", 'import "./choice-of-life/style.css"; import "./choice-of-life/app";');
  write(root, "src/choice-of-life/style.css", ":root { color: black; }");
  write(root, "src/choice-of-life/app.ts", "export const app = true;");
  write(root, "tsconfig.json", JSON.stringify({ compilerOptions: {} }));
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Choice of Life dependency extraction", () => {
  it("finds imports, re-exports, dynamic imports, glob calls, and asset URLs", () => {
    const source = `
      import "./side-effect";
      export { x } from "./re-export";
      const lazy = import("./lazy");
      const files = import.meta.glob("./legacy/*.ts");
      const art = new URL("./sprite.png", import.meta.url);
    `;
    expect(collectModuleSpecifiers(source).references).toEqual([
      { specifier: "./side-effect", kind: "import" },
      { specifier: "./re-export", kind: "re-export" },
      { specifier: "./lazy", kind: "dynamic-import" },
      { specifier: "./legacy/*.ts", kind: "import-meta-glob" },
      { specifier: "./sprite.png", kind: "new-url" },
    ]);
  });

  it("normalizes wrappers around import.meta glob receivers and URL bases", () => {
    const source = `
      const files = (((import.meta) as ImportMeta)["glob"])(("./legacy/*.ts"));
      const art = new (URL)(("./sprite.png"), (((import.meta) as ImportMeta)["url"]));
    `;
    expect(collectModuleSpecifiers(source).references).toEqual([
      { specifier: "./legacy/*.ts", kind: "import-meta-glob" },
      { specifier: "./sprite.png", kind: "new-url" },
    ]);
  });

  it("excludes erased type-only imports and re-exports from the runtime graph", () => {
    const source = `
      import type { Contract } from "../legacy-contract";
      import { type Other } from "../other-contract";
      export type { Result } from "../legacy-result";
    `;
    expect(collectModuleSpecifiers(source).references).toEqual([]);
  });

  it("extracts import-type, import-equals, and triple-slash source edges", () => {
    const source = `
      /// <reference path="./referenced.ts" />
      import Legacy = require("./legacy");
      export type View = import("./view").View;
      export const legacy = Legacy;
    `;
    const result = collectModuleSpecifiers(source);
    expect(result.references).toEqual([
      { specifier: "./legacy", kind: "import-equals" },
    ]);
    expect(result.allReferences).toEqual([
      { specifier: "./referenced.ts", kind: "triple-slash-path" },
      { specifier: "./legacy", kind: "import-equals" },
      { specifier: "./view", kind: "import-type-expression" },
    ]);
  });

  it("tracks direct wrapped require calls but rejects unbound require as a capability", () => {
    const direct = collectModuleSpecifiers('const value = (require)(("./local"));', "fixture.cjs");
    expect(direct.references).toEqual([{ specifier: "./local", kind: "require" }]);
    expect(direct.capabilities).toEqual([]);

    const aliased = collectModuleSpecifiers("const load = require;", "fixture.cjs");
    expect(aliased.capabilities).toContain("require");

    const injected = collectModuleSpecifiers("const use = (require) => require('./local');", "fixture.cjs");
    expect(injected.capabilities).toEqual([]);
  });

  it("finds stylesheet import and URL escapes", () => {
    expect(
      collectCssReferences('@import "./legacy.css"; .x{background:url(../old.png)}')
    ).toEqual([
      { specifier: "./legacy.css", kind: "css-import" },
      { specifier: "../old.png", kind: "css-url" },
    ]);
  });

  it("finds HTML script, link, and image dependencies", () => {
    const refs = collectHtmlReferences(`
      <script type="module" src="/src/main.ts"></script>
      <script src="legacy.js"></script>
      <link rel="stylesheet" href="legacy.css">
      <img src="legacy.png">
    `);
    expect(refs).toEqual([
      { specifier: "/src/main.ts", kind: "html-module" },
      { specifier: "legacy.js", kind: "html-script" },
      { specifier: "legacy.css", kind: "html-link" },
      { specifier: "legacy.png", kind: "html-image" },
    ]);
  });

  it("detects forbidden time, random, storage, and browser identifiers", () => {
    const result = collectModuleSpecifiers(`
      Math.random();
      crypto.randomUUID();
      localStorage.getItem("x");
      requestAnimationFrame(() => {});
      document.body;
      Date.now();
    `);
    expect(new Set(result.identifiers)).toEqual(
      new Set([
        "Math.random",
        "crypto.randomUUID",
        "crypto",
        "localStorage",
        "requestAnimationFrame",
        "document",
        "Date",
      ])
    );
  });

  it("detects qualified, computed, destructured, and aliased global escapes", () => {
    const result = collectModuleSpecifiers(`
      globalThis["localStorage"].getItem("x");
      window["document"].body;
      self.crypto.randomUUID();
      const mathAlias = Math;
      mathAlias["random"]();
      const { random: sample } = Math;
      sample();
    `);
    const identifiers = new Set(result.identifiers);
    expect(identifiers).toContain("globalThis");
    expect(identifiers).toContain("window");
    expect(identifiers).toContain("self");
    expect(identifiers).toContain("Math.random");
    expect(identifiers).toContain("crypto.randomUUID");
  });

  it("does not confuse local or injected bindings with browser globals", () => {
    const result = collectModuleSpecifiers(`
      export function useInjected(document, window, localStorage, Date, crypto, Math) {
        const { random } = Math;
        const { document: dom, Math: arithmetic } = { document, Math };
        return [document.body, window.location, localStorage.getItem("x"), Date.now(),
          crypto.randomUUID(), random(), dom.body, arithmetic.floor(1.5)];
      }
    `);
    const identifiers = new Set(result.identifiers);
    for (const identifier of [
      "document",
      "window",
      "localStorage",
      "Date",
      "crypto",
      "crypto.randomUUID",
      "Math.random",
    ]) {
      expect(identifiers, identifier).not.toContain(identifier);
    }
  });

  it("accepts only the isolated production graph and recursive public allowlist", () => {
    const root = makeFixture();
    expect(auditChoiceBoundaries(root)).toEqual({
      errors: [],
      productionFiles: [
        "src/choice-of-life/app.ts",
        "src/choice-of-life/style.css",
        "src/main.ts",
      ],
    });

    write(root, "public/smuggled/legacy.png", "not really a PNG");
    expect(auditChoiceBoundaries(root).errors).toContain(
      "Unexpected public files: smuggled/legacy.png"
    );
  });

  it.each([
    ['import "./engine";', "Legacy/out-of-bound production dependency: src/engine.ts"],
    ['export { legacy } from "./engine";', "Legacy/out-of-bound production dependency: src/engine.ts"],
    ['void import("./engine");', "Legacy/out-of-bound production dependency: src/engine.ts"],
    ['void import(target);', "Non-literal production dependency (dynamic-import)"],
    ['void import.meta.glob("./choice-of-life/*.ts");', "Glob dependency is forbidden"],
    ['void import.meta.glob(["./choice-of-life/*.ts"]);', "Glob dependency is forbidden"],
    ['void import.meta.glob(pattern);', "Non-literal production dependency (import-meta-glob)"],
    ['void (((import.meta) as ImportMeta)["glob"])(("./choice-of-life/*.ts"));', "Glob dependency is forbidden"],
    ['void new URL("./legacy.png", import.meta.url);', "Legacy/out-of-bound production dependency: src/legacy.png"],
    ['void new (URL)(("./legacy.png"), (((import.meta) as ImportMeta)["url"]));', "Legacy/out-of-bound production dependency: src/legacy.png"],
    ['void new URL(asset, import.meta.url);', "Non-literal production dependency (new-url)"],
  ])("rejects a production escape through %s", (source, expected) => {
    const root = makeFixture();
    write(root, "src/main.ts", source);
    write(root, "src/engine.ts", "export const legacy = true;");
    write(root, "src/legacy.png", "legacy");
    expect(auditChoiceBoundaries(root).errors.join("\n")).toContain(expected);
  });

  it("resolves tsconfig aliases before enforcing the production boundary", () => {
    const root = makeFixture();
    write(root, "tsconfig.json", JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@legacy/*": ["src/legacy/*"] } },
    }));
    write(root, "src/main.ts", 'import "@legacy/engine";');
    write(root, "src/legacy/engine.ts", "export const legacy = true;");
    expect(auditChoiceBoundaries(root).errors).toContain(
      "Legacy/out-of-bound production dependency: src/legacy/engine.ts"
    );
  });

  it("rejects layer inversions and forbidden globals in pure code", () => {
    const root = makeFixture();
    write(root, "src/choice-of-life/app.ts", 'import "./core/bad";');
    write(
      root,
      "src/choice-of-life/core/bad.ts",
      'import "../presentation/view"; export const value = Date.now() + Math.random();'
    );
    write(root, "src/choice-of-life/presentation/view.ts", "export const view = true;");
    const errors = auditChoiceBoundaries(root).errors;
    expect(errors).toContain(
      "Layer violation: src/choice-of-life/core/bad.ts -> src/choice-of-life/presentation/view.ts"
    );
    expect(errors).toContain("Forbidden Date in src/choice-of-life/core/bad.ts");
    expect(errors).toContain("Forbidden Math.random in src/choice-of-life/core/bad.ts");
  });

  it.each(["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"])(
    "scans dormant .%s production modules for forbidden globals",
    (extension) => {
      const root = makeFixture();
      write(
        root,
        `src/choice-of-life/core/dormant.${extension}`,
        "export const leaked = globalThis['document'];"
      );
      expect(auditChoiceBoundaries(root).errors).toContain(
        `Forbidden globalThis in src/choice-of-life/core/dormant.${extension}`
      );
    }
  );

  it("enforces layer rules for erased type-only dependencies", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/core/hidden-contract.ts",
      'import type { View } from "../presentation/view"; export type Hidden = View;'
    );
    write(root, "src/choice-of-life/presentation/view.ts", "export interface View { ok: true }");
    expect(auditChoiceBoundaries(root).errors).toContain(
      "Layer violation: src/choice-of-life/core/hidden-contract.ts -> src/choice-of-life/presentation/view.ts"
    );
  });

  it.each([
    ['export type Hidden = import("../presentation/view").View;', "import type expression"],
    ['import View = require("../presentation/view"); export type Hidden = View;', "import equals"],
    ['/// <reference path="../presentation/view.ts" />\nexport const hidden = true;', "triple-slash path"],
  ])("enforces layer rules for a %s", (source) => {
    const root = makeFixture();
    write(root, "src/choice-of-life/core/hidden-edge.ts", source);
    write(root, "src/choice-of-life/presentation/view.ts", "export interface View { ok: true }");
    expect(auditChoiceBoundaries(root).errors).toContain(
      "Layer violation: src/choice-of-life/core/hidden-edge.ts -> src/choice-of-life/presentation/view.ts"
    );
  });

  it("rejects an unbound require alias in a dormant CJS module", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/core/loader.cjs",
      "const load = require; module.exports = load;"
    );
    expect(auditChoiceBoundaries(root).errors).toContain(
      "Forbidden bare require capability in src/choice-of-life/core/loader.cjs"
    );
  });

  it("rejects unclassified bridge modules even when they are dormant", () => {
    const root = makeFixture();
    write(root, "src/choice-of-life/bridge.ts", 'export * from "./core/model";');
    write(root, "src/choice-of-life/core/model.ts", "export const model = true;");
    expect(auditChoiceBoundaries(root).errors).toContain(
      "Unclassified production module: src/choice-of-life/bridge.ts"
    );
  });

  it.each(["appearance", "accessibility", "identity"])(
    "rejects a dormant gameplay mechanics read of %s",
    (property) => {
      const root = makeFixture();
      write(
        root,
        `src/choice-of-life/core/gameplay-${property}.ts`,
        `export const outcome = (state) => state.${property};`
      );
      expect(auditChoiceBoundaries(root).errors).toContain(
        `Forbidden protected/cosmetic mechanics read ${property} in src/choice-of-life/core/gameplay-${property}.ts`
      );
    }
  );

  it("rejects destructured and computed cosmetic mechanics reads outside infrastructure", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/core/gameplay-cosmetic.ts",
      `
        export const outcome = ({ appearance: art, accessibility }) =>
          art["hairStyleId"] + accessibility["textScale"];
      `
    );
    const errors = auditChoiceBoundaries(root).errors;
    for (const property of ["appearance", "accessibility", "hairStyleId", "textScale"]) {
      expect(errors).toContain(
        `Forbidden protected/cosmetic mechanics read ${property} in src/choice-of-life/core/gameplay-cosmetic.ts`
      );
    }
  });

  it("allows protected-field handling only in the named infrastructure modules", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/core/run-state-hash.ts",
      "export const project = (state) => [state.appearance, state.accessibility, state.identity];"
    );
    expect(
      auditChoiceBoundaries(root).errors.filter((error) =>
        error.includes("protected/cosmetic mechanics read")
      )
    ).toEqual([]);
  });

  it("accepts renamed destructuring from an injected presentation dependency", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/presentation/injected.ts",
      "export const render = ({ document: dom }) => dom.createElement('p');"
    );
    expect(auditChoiceBoundaries(root).errors).not.toContain(
      "Forbidden document in src/choice-of-life/presentation/injected.ts"
    );
  });

  it("rejects symbolic links under the production and public trees when supported", () => {
    const root = makeFixture();
    write(root, "src/choice-of-life/core/real.ts", "export const real = true;");
    const sourceCreated = tryCreateFileSymlink(
      root,
      "src/choice-of-life/core/real.ts",
      "src/choice-of-life/core/linked.ts"
    );
    const publicCreated = tryCreateFileSymlink(
      root,
      "public/favicon.svg",
      "public/linked.svg"
    );
    if (!sourceCreated && !publicCreated) return;

    const errors = auditChoiceBoundaries(root).errors;
    if (sourceCreated) {
      expect(errors).toContain(
        "Unsupported production filesystem entry: src/choice-of-life/core/linked.ts (symbolic link)"
      );
    }
    if (publicCreated) {
      expect(errors).toContain(
        "Unsupported public filesystem entry: linked.svg (symbolic link)"
      );
    }
  });

  it.each(["legacy.svg", "font.woff2", "module.wasm", "content.json"])(
    "rejects reachable non-code Phase 1 assets: %s",
    (asset) => {
      const root = makeFixture();
      write(root, "src/choice-of-life/app.ts", `export const asset = new URL("./${asset}", import.meta.url);`);
      write(root, `src/choice-of-life/${asset}`, "legacy asset");
      expect(auditChoiceBoundaries(root).errors).toContain(
        `Legacy/out-of-bound production dependency: src/choice-of-life/${asset}`
      );
    }
  );

  it("rejects layer-owned CSS side effects outside the sole root stylesheet", () => {
    const root = makeFixture();
    write(root, "src/choice-of-life/app.ts", 'import "./core/escape.css";');
    write(root, "src/choice-of-life/core/escape.css", ".escape{display:none}");
    const errors = auditChoiceBoundaries(root).errors;
    expect(errors).toContain(
      "Legacy/out-of-bound production dependency: src/choice-of-life/core/escape.css"
    );
    expect(errors).toContain(
      "Unclassified production module: src/choice-of-life/core/escape.css"
    );
  });

  it("rejects presentation browser globals while accepting injected DOM values", () => {
    const root = makeFixture();
    write(root, "src/choice-of-life/presentation/bad.ts", "export const body = document.body;");
    write(
      root,
      "src/choice-of-life/presentation/injected.ts",
      "export const bodyOf = (document) => document.body;"
    );
    const errors = auditChoiceBoundaries(root).errors;
    expect(errors).toContain(
      "Forbidden document in src/choice-of-life/presentation/bad.ts"
    );
    expect(errors).not.toContain(
      "Forbidden document in src/choice-of-life/presentation/injected.ts"
    );
  });

  it("rejects HTML smuggling beside the sole module entry", () => {
    const root = makeFixture();
    write(
      root,
      "index.html",
      '<script type="module" src="/src/main.ts"></script><script src="legacy.js"></script><img src="old.png">'
    );
    const errors = auditChoiceBoundaries(root).errors.join("\n");
    expect(errors).toContain("Unexpected HTML dependency (html-script): legacy.js");
    expect(errors).toContain("Unexpected HTML dependency (html-image): old.png");
  });

  it.each([
    ['<script type="module" src="/src/main.ts"></script><script>alert(1)</script>', "Inline <script> is forbidden"],
    ['<script type="module" src="/src/main.ts"></script><script src="legacy.js"></script>', "Classic or untyped <script> is forbidden"],
    ['<script type="module" src=/src/main.ts></script>', "<script> src must be quoted"],
    ['<script type="module" src="/src/main.ts">alert(1)</script>', "Inline script body is forbidden"],
    ['<script type="module" src="/src/main.ts"></script><style>body{}</style>', "Inline <style> is forbidden"],
    ['<body style="background:url(old.png)"><script type="module" src="/src/main.ts"></script>', "Inline style attribute is forbidden"],
    ['<base href="/legacy/"><script type="module" src="/src/main.ts"></script>', "HTML <base> is forbidden"],
    ['<img srcset="old.png 1x"><script type="module" src="/src/main.ts"></script>', "srcset is forbidden"],
    ['<link rel="icon" href="./favicon.svg" imagesrcset="old.png 1x"><script type="module" src="/src/main.ts"></script>', "imagesrcset is forbidden"],
    ['<link rel="stylesheet" href="legacy.css"><script type="module" src="/src/main.ts"></script>', "Only a quoted rel=icon href=./favicon.svg link is allowed"],
    ['<link rel=icon href=./favicon.svg><script type="module" src="/src/main.ts"></script>', "Only a quoted rel=icon href=./favicon.svg link is allowed"],
    ['<link rel="icon"><script type="module" src="/src/main.ts"></script>', "<link> href is required"],
    ['<button onclick="legacy()"></button><script type="module" src="/src/main.ts"></script>', "Inline event handler onclick is forbidden"],
    ['<a href="java&#x73;cript:legacy()">bad</a><script type="module" src="/src/main.ts"></script>', "Executable script URL is forbidden"],
    ['<a href="&#106;&#97;vascript&colon;legacy()">bad</a><script type="module" src="/src/main.ts"></script>', "Executable script URL is forbidden"],
    ['<iframe srcdoc="legacy"></iframe><script type="module" src="/src/main.ts"></script>', "iframe srcdoc is forbidden"],
    ['<svg><use href="data:image/svg+xml,legacy"></use></svg><script type="module" src="/src/main.ts"></script>', "Unexpected HTML dependency (html-image): data:image/svg+xml,legacy"],
  ])("rejects HTML executable or dependency smuggling: %s", (html, expected) => {
    const root = makeFixture();
    write(root, "index.html", html);
    expect(auditChoiceBoundaries(root).errors.join("\n")).toContain(expected);
  });

  it("rejects CSS data dependencies instead of dropping them from the graph", () => {
    const root = makeFixture();
    write(root, "src/choice-of-life/style.css", ".x{background:url(data:image/svg+xml,legacy)}");
    expect(auditChoiceBoundaries(root).errors.join("\n")).toContain(
      "Bare runtime dependency (css-url)"
    );
  });

  it("rejects dynamic code constructors that could reconstruct hidden globals", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/core/dynamic-code.ts",
      'export const a = eval("globalThis.localStorage"); export const b = Function("return document")();'
    );
    const errors = auditChoiceBoundaries(root).errors;
    expect(errors).toContain(
      "Forbidden eval in src/choice-of-life/core/dynamic-code.ts"
    );
    expect(errors).toContain(
      "Forbidden Function in src/choice-of-life/core/dynamic-code.ts"
    );
  });

  it("rejects executable constructor-property access in pure and presentation modules", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/core/constructor-escape.ts",
      "export const leaked = (() => {}).constructor('return globalThis.document')();"
    );
    write(
      root,
      "src/choice-of-life/presentation/constructor-escape.ts",
      "export const leaked = Math.floor['constructor']('return document')();"
    );
    const errors = auditChoiceBoundaries(root).errors;
    expect(errors).toContain(
      "Forbidden constructor in src/choice-of-life/core/constructor-escape.ts"
    );
    expect(errors).toContain(
      "Forbidden constructor in src/choice-of-life/presentation/constructor-escape.ts"
    );
  });

  it("collects dormant JSDoc imports and module.require dependency edges", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/core/jsdoc-edge.js",
      "/** @type {import('../presentation/model').PresentationModel} */ export const model = null;"
    );
    write(
      root,
      "src/choice-of-life/core/cjs-edge.cjs",
      "module.require('../presentation/model');"
    );
    write(
      root,
      "src/choice-of-life/presentation/model.ts",
      "export const model = true;"
    );
    const errors = auditChoiceBoundaries(root).errors;
    expect(errors).toContain(
      "Layer violation: src/choice-of-life/core/jsdoc-edge.js -> src/choice-of-life/presentation/model.ts"
    );
    expect(errors).toContain(
      "Layer violation: src/choice-of-life/core/cjs-edge.cjs -> src/choice-of-life/presentation/model.ts"
    );
  });

  it("rejects dormant triple-slash lib and types directives", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/core/dom-lib.ts",
      '/// <reference lib="dom" />\nexport type Hidden = Document;'
    );
    write(
      root,
      "src/choice-of-life/persistence/ambient-types.ts",
      '/// <reference types="node" />\nexport const hidden = true;'
    );
    const errors = auditChoiceBoundaries(root).errors;
    expect(errors).toContain(
      "Bare source dependency (triple-slash-lib) in src/choice-of-life/core/dom-lib.ts: dom"
    );
    expect(errors).toContain(
      "Bare source dependency (triple-slash-types) in src/choice-of-life/persistence/ambient-types.ts: node"
    );
  });

  it("fails closed on CSS escapes and comments that can hide dependency tokens", () => {
    const root = makeFixture();
    write(root, "src/choice-of-life/style.css", String.raw`.a{background:u\72l(../old.png)} /* @im */ port '../old.css';`);
    expect(auditChoiceBoundaries(root).errors).toContain(
      "Non-literal production dependency (css-obfuscated-token) in src/choice-of-life/style.css"
    );
  });

  it("rejects passing or assigning the bare Math namespace and computed destructuring", () => {
    const root = makeFixture();
    write(
      root,
      "src/choice-of-life/core/math-capability.ts",
      `
        let alias;
        alias = Math;
        const consume = (candidate) => candidate.random();
        consume(Math);
        const key = "random";
        const { [key]: sampled } = Math;
        export const values = [alias.random(), sampled(), Math.random.bind(Math)()];
      `
    );
    const errors = auditChoiceBoundaries(root).errors;
    expect(errors).toContain(
      "Forbidden Math in src/choice-of-life/core/math-capability.ts"
    );
    expect(errors).toContain(
      "Forbidden Math.random in src/choice-of-life/core/math-capability.ts"
    );
  });

  it("rejects a favicon link that smuggles an additional relationship", () => {
    const root = makeFixture();
    write(
      root,
      "index.html",
      '<link rel="icon stylesheet" href="./favicon.svg"><script type="module" src="/src/main.ts"></script>'
    );
    expect(auditChoiceBoundaries(root).errors).toContain(
      "Only a quoted rel=icon href=./favicon.svg link is allowed"
    );
  });
});
