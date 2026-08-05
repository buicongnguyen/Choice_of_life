import { describe, expect, it } from "vitest";

import {
  AUDITED_PRODUCTION_MINIFICATION_APPROVED,
  assertProductionBuildEnvironment,
  createProductionMinificationPipeline,
  createProductionTerserOptions,
} from "../vite.config";

describe("production minification approval gate", () => {
  it("fails closed unless Vite resolved an exact production environment", () => {
    const canonical = {
      command: "build",
      mode: "production",
      isProduction: true,
      env: { MODE: "production", DEV: false, PROD: true },
    } as const;
    expect(() => assertProductionBuildEnvironment(canonical as never)).not.toThrow();
    for (const mutation of [
      { command: "serve" },
      { mode: "development" },
      { isProduction: false },
      { env: { MODE: "development", DEV: false, PROD: true } },
      { env: { MODE: "production", DEV: true, PROD: true } },
      { env: { MODE: "production", DEV: false, PROD: false } },
    ]) {
      expect(() => assertProductionBuildEnvironment({ ...canonical, ...mutation } as never))
        .toThrow(/requires build mode production with DEV=false and PROD=true/);
    }
  });

  it("keeps the default pipeline exactly aligned with the explicit gate", () => {
    const selected = createProductionMinificationPipeline(
      AUDITED_PRODUCTION_MINIFICATION_APPROVED,
    );
    expect(selected.preTerserPlugins.some((plugin) =>
      plugin.name === "choice-of-life-repeated-string-value-pooling"))
      .toBe(AUDITED_PRODUCTION_MINIFICATION_APPROVED);
    expect("keep_quoted" in selected.propertyOptions)
      .toBe(AUDITED_PRODUCTION_MINIFICATION_APPROVED);
  });

  it("constructs the complete audited pipeline without activating it", () => {
    expect(() => createProductionMinificationPipeline("true" as never))
      .toThrow(/approval must be boolean/i);
    const inactive = createProductionMinificationPipeline(false);
    expect(inactive.preTerserPlugins).toEqual([]);
    expect(inactive.propertyOptions).toEqual({ regex: expect.any(RegExp) });
    expect("keep_quoted" in inactive.propertyOptions).toBe(false);

    const audited = createProductionMinificationPipeline(true);
    expect(audited.preTerserPlugins.map((plugin) => plugin.name)).toEqual([
      "choice-of-life-repeated-string-value-pooling",
    ]);
    expect(audited.propertyOptions).toMatchObject({
      regex: expect.any(RegExp),
      keep_quoted: "strict",
      builtins: false,
    });
    expect(createProductionTerserOptions(audited.propertyOptions)).toEqual({
      compress: { passes: 3 },
      mangle: {
        module: true,
        toplevel: true,
        properties: audited.propertyOptions,
      },
      format: { comments: false },
    });
  });
});
