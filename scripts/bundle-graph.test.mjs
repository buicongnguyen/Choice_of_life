import { describe, expect, it } from "vitest";

import { extractRelativeJsImports } from "./bundle-graph.mjs";

describe("bundle entry graph extraction", () => {
  it("counts re-exports, side-effect imports, and dynamic imports", () => {
    const source = `
      export { value } from "./re-export.js";
      import "./side-effect.js";
      const lazy = import('./dynamic.js');
      import external from "package-name";
      const image = "./not-code.js";
    `;

    expect(extractRelativeJsImports(source)).toEqual([
      "./re-export.js",
      "./side-effect.js",
      "./dynamic.js",
    ]);
  });
});
