import { describe, expect, it } from "vitest";

import {
  chooseExamPreparation,
  createEducationState,
  resolveEducationExam,
  retrainEducation,
  selectEducationRoute,
} from "./education";
import { createNewbornState } from "./newborn";
import { decodeSaveEnvelope } from "./release";

describe("review regression guards", () => {
  it("does not allow retraining from an unfinished foundation route", () => {
    let state = createEducationState({
      runId: "review-education",
      priorAchievement: 0,
    });
    state = chooseExamPreparation(state, "education-prep-balanced-routine-v1");
    state = resolveEducationExam(state, 0);
    state = selectEducationRoute(state, "education-route-foundation-year-v1");

    expect(state.phase).toBe("route-selection");
    expect(() =>
      retrainEducation(state, "education-route-practical-v1"),
    ).toThrow(/complete an education route/i);
  });

  it("rejects forged newborn setup values at the runtime boundary", () => {
    expect(() =>
      createNewbornState({
        runId: "review-newborn",
        runSeed: "seed",
        difficulty: "impossible" as "normal",
      }),
    ).toThrow(/difficulty/i);
    expect(() =>
      createNewbornState({
        runId: "review-newborn",
        runSeed: "seed",
        initialLane: 9 as 1,
      }),
    ).toThrow(/initialLane/i);
  });

  it("quarantines calendar-invalid save timestamps without using a system clock", () => {
    const source = JSON.stringify({
      envelopeVersion: 1,
      schemaVersion: 1,
      contentVersion: "review-v1",
      savedAt: "2025-02-29T12:00:00Z",
      release: null,
      payload: { ok: true },
    });
    const result = decodeSaveEnvelope(source, {
      targetSchemaVersion: 1,
      targetContentVersion: "review-v1",
      validatePayload: (value): value is { ok: boolean } =>
        typeof value === "object" && value !== null && "ok" in value,
    });

    expect(result.kind).toBe("quarantined");
    if (result.kind === "quarantined") expect(result.code).toBe("invalid-envelope");
  });
});
