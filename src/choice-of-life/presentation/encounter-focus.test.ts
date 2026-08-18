// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  advanceEncounterEngine,
  createEncounterEngineState,
  resolveEncounter,
  scheduleEncounter,
  DEFAULT_ENCOUNTER_CATALOG,
} from "../core/encounters/index";
import { ENCOUNTER_CHAPTER_STAGE_ID } from "../core/shell-contracts";
import type { EncounterChapterState } from "../core/shell-contracts";
import { mountEncounterView } from "./encounter-view";

/**
 * Rebuilding the choice tray destroys the button the player just activated. If
 * focus was inside it and nothing takes focus, the browser drops it to <body>:
 * the focus ring disappears and a screen reader's position collapses to the top
 * of the document while the live region announces new content.
 */

function stateAtTick(tick: number): EncounterChapterState {
  let engine = createEncounterEngineState({ health: 65, happiness: 60, money: 35 });
  engine = scheduleEncounter(engine, DEFAULT_ENCOUNTER_CATALOG, {
    transactionId: "test:encounter:caregiver",
    encounterId: "caregiver-comfort-v1",
    stageId: ENCOUNTER_CHAPTER_STAGE_ID,
    opensAtTick: 5,
    closesAtTick: 400,
  });
  engine = advanceEncounterEngine(engine, DEFAULT_ENCOUNTER_CATALOG, {
    stageId: ENCOUNTER_CHAPTER_STAGE_ID,
    simulationTick: tick,
  });
  return {
    schemaVersion: 1,
    contentVersion: "encounter-chapter-v1",
    runId: "test-run",
    stageId: ENCOUNTER_CHAPTER_STAGE_ID,
    phase: "active",
    simulationTick: tick,
    durationTicks: 400,
    engine,
  } satisfies EncounterChapterState;
}

/** Same chapter after the caregiver choice is answered: the tray key changes. */
function stateAfterChoice(): EncounterChapterState {
  const presenting = stateAtTick(10);
  const engine = resolveEncounter(
    presenting.engine,
    DEFAULT_ENCOUNTER_CATALOG,
    "test:encounter:caregiver",
    "ask-for-comfort-v1",
    { stageId: ENCOUNTER_CHAPTER_STAGE_ID, simulationTick: 12 },
  );
  return { ...presenting, simulationTick: 12, engine } satisfies EncounterChapterState;
}

function mount() {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  const view = mountEncounterView(host, {
    dispatch: () => undefined,
    onContinueToEducation: () => undefined,
    onReturnToReady: () => undefined,
  });
  return { host, view };
}

describe("encounter tray focus", () => {
  it("moves focus to the new heading when the tray that held focus is rebuilt", () => {
    const { host, view } = mount();
    view.render(stateAtTick(0));
    view.render(stateAtTick(10));

    const tray = host.querySelector(".col-encounter-tray");
    expect(tray).not.toBeNull();
    const button = tray!.querySelector("button");
    expect(button, "expected a focusable control in the tray").not.toBeNull();

    (button as HTMLButtonElement).focus();
    expect(tray!.contains(document.activeElement)).toBe(true);

    // Answering the choice changes the tray key, so the tray is rebuilt and the
    // focused button is destroyed.
    view.render(stateAfterChoice());

    expect(document.activeElement, "focus fell out of the document")
      .not.toBe(document.body);
    const heading = host.querySelector(".col-encounter-tray h3");
    expect(document.activeElement).toBe(heading);
    view.dispose();
  });

  it("leaves focus alone when it was never inside the tray", () => {
    const { host, view } = mount();
    view.render(stateAtTick(0));

    const outside = document.createElement("button");
    outside.textContent = "elsewhere";
    document.body.append(outside);
    outside.focus();

    view.render(stateAtTick(10));
    view.render(stateAfterChoice());

    expect(document.activeElement, "a rebuild yanked focus from outside the tray")
      .toBe(outside);
    view.dispose();
  });
});
