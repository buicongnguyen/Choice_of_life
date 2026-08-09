import {
  DEFAULT_ENCOUNTER_CATALOG,
  getEncounterDefinition,
  getPresentingEncounter,
  type EncounterDefinition,
  type EncounterOptionDefinition,
} from "../core/encounters/index";
import type {
  EncounterChapterAction,
  EncounterChapterState,
} from "../core/shell-contracts";
import { createElement } from "./elements";
import { createStagePlayerAvatar, type StagePlayerCharacter } from "./stage-player-avatar";
import { createCharacterElement, createCharacterModel, type CharacterHeritage } from "./character-system";
import "./polish.css";

export interface EncounterViewCallbacks {
  readonly playerCharacter?: StagePlayerCharacter;
  readonly dispatch: (action: EncounterChapterAction) => void;
  readonly onContinueToEducation: () => void;
  readonly onReturnToReady: () => void;
}

export interface EncounterView {
  readonly section: HTMLElement;
  render(state: EncounterChapterState): void;
  dispose(): void;
}

const SCORE_COPY = Object.freeze({
  health: { label: "Healthy", icon: "♥" },
  happiness: { label: "Happy", icon: "☀" },
  money: { label: "Money", icon: "◆" },
});

function optionEffectText(option: EncounterOptionDefinition): string {
  const effects = option.effects ?? [];
  if (effects.length === 0) return "A story choice with no immediate score change";
  return effects
    .map((effect) => {
      const sign = effect.requestedDelta > 0 ? "+" : "";
      return `${SCORE_COPY[effect.scoreId].label} ${sign}${effect.requestedDelta}`;
    })
    .join(" · ");
}

function encounterKindLabel(definition: EncounterDefinition): string {
  return ({
    caregiver: "Caregiver",
    friend: "Friend",
    mentor: "Mentor",
    stranger: "New person",
    institution: "Community",
    "self-reflection": "Inner voice",
  } as const)[definition.kind];
}

function humanizeId(value: string): string {
  return value
    .replace(/-v\d+$/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function personMarkup(document: Document, role: "player" | "visitor"): HTMLElement {
  return createElement(document, "div", {
    className: `col-encounter-person col-encounter-person--${role}`,
    attributes: { "aria-hidden": "true" },
  });
}

function encounterVisitorCharacter(document: Document, definition: EncounterDefinition): HTMLElement {
  const hash = [...definition.encounterId].reduce((value, character) =>
    (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0, 0);
  const heritages: readonly CharacterHeritage[] = ["asian", "western", "black", "middle-eastern"];
  return createCharacterElement(document, createCharacterModel({
    characterId: `encounter-${definition.encounterId}`,
    label: encounterKindLabel(definition),
    gender: hash % 2 === 0 ? "female" : "male",
    heritage: heritages[hash % heritages.length] ?? "asian",
    lifeStage: definition.kind === "friend" ? "child" : "adult",
    direction: "left",
    motion: "idle",
    expression: "talk",
    seed: definition.encounterId,
  }));
}

export function mountEncounterView(
  host: HTMLElement,
  callbacks: EncounterViewCallbacks,
): EncounterView {
  const document = host.ownerDocument;
  let disposed = false;
  let trayKey = "";

  const section = createElement(document, "section", {
    className: "col-encounter-view",
    attributes: {
      "aria-labelledby": "encounter-stage-heading",
      "data-phase": "active",
    },
  });

  const heading = createElement(document, "h2", {
    text: "Encounters & consequences",
    attributes: { id: "encounter-stage-heading", tabindex: "-1" },
  });
  const chapterCopy = createElement(document, "p", {
    className: "col-encounter-lede",
    text: "Time moves forward until a life moment creates a safe place to choose.",
  });
  const progress = createElement(document, "progress", {
    className: "col-encounter-progress",
    attributes: { "aria-label": "Chapter progress" },
  });
  progress.max = 100;
  const progressText = createElement(document, "span", {
    className: "col-encounter-progress-text",
  });
  const header = createElement(document, "header", { className: "col-encounter-header" });
  const headerCopy = createElement(document, "div");
  headerCopy.append(heading, chapterCopy);
  const progressWrap = createElement(document, "div", { className: "col-encounter-progress-wrap" });
  progressWrap.append(progress, progressText);
  header.append(headerCopy, progressWrap);

  const scoreRow = createElement(document, "div", {
    className: "col-encounter-scores",
    attributes: { "aria-label": "Life scores" },
  });
  const scoreOutputs = new Map<string, HTMLOutputElement>();
  const scoreMeters = new Map<string, HTMLMeterElement>();
  for (const scoreId of ["health", "happiness", "money"] as const) {
    const card = createElement(document, "div", {
      className: `col-encounter-score col-encounter-score--${scoreId}`,
    });
    const label = createElement(document, "span", {
      className: "col-encounter-score-label",
      text: `${SCORE_COPY[scoreId].icon} ${SCORE_COPY[scoreId].label}`,
    });
    const output = createElement(document, "output", {
      className: "col-encounter-score-value",
    });
    const meter = createElement(document, "meter", {
      attributes: { min: "0", max: "100" },
    });
    card.append(label, output, meter);
    scoreOutputs.set(scoreId, output);
    scoreMeters.set(scoreId, meter);
    scoreRow.append(card);
  }

  const playfield = createElement(document, "div", {
    className: "col-encounter-playfield",
    attributes: {
      role: "img",
      "aria-label": "A side-view path through changing moments of life",
    },
  });
  const scenery = createElement(document, "div", {
    className: "col-encounter-scenery",
    attributes: { "aria-hidden": "true" },
  });
  scenery.append(
    createElement(document, "span", { className: "col-encounter-cloud col-encounter-cloud--one" }),
    createElement(document, "span", { className: "col-encounter-cloud col-encounter-cloud--two" }),
    createElement(document, "span", { className: "col-encounter-home" }),
    createElement(document, "span", { className: "col-encounter-tree col-encounter-tree--one" }),
    createElement(document, "span", { className: "col-encounter-tree col-encounter-tree--two" }),
    createElement(document, "span", { className: "col-encounter-school" }),
    createElement(document, "span", { className: "col-encounter-path" }),
  );
  const player = createStagePlayerAvatar(document, callbacks.playerCharacter, "toddler", "col-encounter-person col-encounter-person--player");
  const visitor = personMarkup(document, "visitor");
  visitor.classList.add("col-polish-actor", "col-polish-actor--character");
  const visitorLabel = createElement(document, "span", {
    className: "col-encounter-visitor-label",
  });
  visitor.append(visitorLabel);
  const speech = createElement(document, "p", {
    className: "col-encounter-speech",
    attributes: { "aria-live": "polite" },
  });
  const pausePill = createElement(document, "span", {
    className: "col-encounter-pause-pill",
    text: "Safe choice moment",
  });
  playfield.append(scenery, player, visitor, speech, pausePill);

  const tray = createElement(document, "div", {
    className: "col-encounter-tray",
    attributes: { "aria-live": "polite" },
  });
  const story = createElement(document, "aside", {
    className: "col-encounter-story",
    attributes: { "aria-labelledby": "encounter-story-heading" },
  });
  const storyHeading = createElement(document, "h3", {
    text: "What this life remembers",
    attributes: { id: "encounter-story-heading" },
  });
  const storySummary = createElement(document, "div", { className: "col-encounter-story-summary" });
  const storyDetails = createElement(document, "div", { className: "col-encounter-story-details" });
  const storyLog = createElement(document, "ol", { className: "col-encounter-story-log" });
  story.append(storyHeading, storySummary, storyDetails, storyLog);

  const footer = createElement(document, "div", { className: "col-encounter-footer" });
  const back = createElement(document, "button", {
    className: "col-button col-button--quiet",
    text: "Back to life overview",
  });
  back.type = "button";
  back.addEventListener("click", callbacks.onReturnToReady);
  footer.append(back);

  section.append(header, scoreRow, playfield, tray, story, footer);
  host.replaceChildren(section);

  const renderTray = (state: EncounterChapterState): void => {
    const offeredRecovery = state.engine.recoveryHooks.find((hook) => hook.status === "offered");
    const presenting = getPresentingEncounter(state.engine, DEFAULT_ENCOUNTER_CATALOG);
    const key = offeredRecovery
      ? `recovery:${offeredRecovery.recoveryId}`
      : presenting
        ? `encounter:${presenting.transaction.transactionId}`
        : state.phase === "complete"
          ? "complete"
          : "moving";
    if (key === trayKey) return;
    trayKey = key;
    tray.replaceChildren();

    if (offeredRecovery) {
      tray.className = "col-encounter-tray col-encounter-tray--recovery";
      const title = createElement(document, "h3", { text: "A safety net appears" });
      const scores = offeredRecovery.triggerScoreIds
        .map((scoreId) => SCORE_COPY[scoreId].label.toLowerCase())
        .join(" and ");
      const copy = createElement(document, "p", {
        text: `Your ${scores} needs support. Accepting help restores a bounded amount; it does not erase the choice.`,
      });
      const actions = createElement(document, "div", { className: "col-encounter-tray-actions" });
      const accept = createElement(document, "button", {
        className: "col-button col-button--primary",
        text: "Accept support",
      });
      accept.type = "button";
      accept.addEventListener("click", () => callbacks.dispatch({
        type: "accept-recovery",
        recoveryId: offeredRecovery.recoveryId,
      }));
      const decline = createElement(document, "button", {
        className: "col-button col-button--quiet",
        text: "Continue without it",
      });
      decline.type = "button";
      decline.addEventListener("click", () => callbacks.dispatch({
        type: "dismiss-recovery",
        recoveryId: offeredRecovery.recoveryId,
      }));
      actions.append(accept, decline);
      tray.append(title, copy, actions);
      return;
    }

    if (presenting) {
      tray.className = "col-encounter-tray col-encounter-tray--choice";
      const badge = createElement(document, "span", {
        className: `col-encounter-importance col-encounter-importance--${presenting.transaction.importance}`,
        text: presenting.transaction.importance === "mandatory" ? "Required life choice" : "Optional moment",
      });
      tray.append(
        badge,
        createElement(document, "h3", { text: presenting.definition.title }),
        createElement(document, "p", { text: presenting.definition.prompt }),
      );
      const choices = createElement(document, "div", { className: "col-encounter-choice-list" });
      for (const option of presenting.definition.options) {
        const button = createElement(document, "button", { className: "col-encounter-choice" });
        button.type = "button";
        button.append(
          createElement(document, "strong", { text: option.label }),
          createElement(document, "span", { text: option.description }),
          createElement(document, "small", { text: optionEffectText(option) }),
        );
        button.addEventListener("click", () => callbacks.dispatch({
          type: "choose",
          transactionId: presenting.transaction.transactionId,
          optionId: option.optionId,
        }));
        choices.append(button);
      }
      tray.append(choices);
      if (presenting.transaction.importance === "optional") {
        const skip = createElement(document, "button", {
          className: "col-button col-button--quiet col-encounter-skip",
          text: "Let this moment pass",
        });
        skip.type = "button";
        skip.addEventListener("click", () => callbacks.dispatch({
          type: "skip",
          transactionId: presenting.transaction.transactionId,
        }));
        tray.append(skip);
      }
      return;
    }

    if (state.phase === "complete") {
      tray.className = "col-encounter-tray col-encounter-tray--complete";
      const settledChoices = state.engine.transactions.filter(
        (transaction) => transaction.status === "resolved",
      ).length;
      tray.append(
        createElement(document, "span", { className: "col-encounter-complete-mark", text: "Chapter complete" }),
        createElement(document, "h3", { text: "Your choices now travel with you" }),
        createElement(document, "p", {
          text: `${settledChoices} decisions, ${state.engine.facts.length} facts, ${state.engine.memories.length} memories, and ${state.engine.relationships.length} relationships will shape what comes next.`,
        }),
      );
      const continueButton = createElement(document, "button", {
        className: "col-button col-button--primary",
        text: "Continue to Education",
      });
      continueButton.type = "button";
      continueButton.addEventListener("click", callbacks.onContinueToEducation);
      tray.append(continueButton);
      return;
    }

    tray.className = "col-encounter-tray col-encounter-tray--moving";
    const next = state.engine.transactions.find((transaction) => transaction.status === "scheduled");
    const nextDefinition = next
      ? getEncounterDefinition(DEFAULT_ENCOUNTER_CATALOG, next.encounterId)
      : null;
    tray.append(
      createElement(document, "h3", { text: "Life keeps moving" }),
      createElement(document, "p", {
        text: nextDefinition
          ? `The next moment is ${nextDefinition.title.toLowerCase()}. The choice tray will appear here without covering your character.`
          : "Consequences are catching up with the choices already made.",
      }),
    );
  };

  const renderStory = (state: EncounterChapterState): void => {
    storySummary.replaceChildren();
    const facts = createElement(document, "span", { text: `${state.engine.facts.length} facts` });
    const memories = createElement(document, "span", { text: `${state.engine.memories.length} memories` });
    const relationships = createElement(document, "span", { text: `${state.engine.relationships.length} relationships` });
    const callbacks = createElement(document, "span", {
      text: `${state.engine.callbacks.filter((item) => item.status === "resolved").length} consequences returned`,
    });
    storySummary.append(facts, memories, relationships, callbacks);
    storyDetails.replaceChildren();
    const latestFact = state.engine.facts[state.engine.facts.length - 1];
    const latestMemory = state.engine.memories[state.engine.memories.length - 1];
    const closestRelationship = [...state.engine.relationships]
      .sort((left, right) => right.closeness - left.closeness)[0];
    if (latestFact) {
      storyDetails.append(createElement(document, "p", {
        text: `Fact · ${humanizeId(latestFact.valueId)}`,
      }));
    }
    if (latestMemory) {
      storyDetails.append(createElement(document, "p", {
        text: `Memory · ${latestMemory.summary}`,
      }));
    }
    if (closestRelationship) {
      storyDetails.append(createElement(document, "p", {
        text: `${humanizeId(closestRelationship.kind)} relationship · ${closestRelationship.closeness}/100`,
      }));
    }
    if (storyDetails.childElementCount === 0) {
      storyDetails.append(createElement(document, "p", {
        text: "Facts, memories, and relationships will collect here.",
      }));
    }
    storyLog.replaceChildren();
    const entries = [...state.engine.storyLog].reverse().slice(0, 5);
    if (entries.length === 0) {
      storyLog.append(createElement(document, "li", { text: "Your story is waiting for its first encounter." }));
      return;
    }
    for (const entry of entries) {
      const item = createElement(document, "li");
      item.append(
        createElement(document, "span", { className: "col-encounter-log-dot", attributes: { "aria-hidden": "true" } }),
        createElement(document, "span", { text: entry.text }),
      );
      storyLog.append(item);
    }
  };

  const view: EncounterView = {
    section,
    render(state: EncounterChapterState): void {
      if (disposed) return;
      const percent = Math.round((state.simulationTick / state.durationTicks) * 100);
      section.dataset.phase = state.phase;
      section.style.setProperty("--col-encounter-progress", `${percent}%`);
      progress.value = percent;
      progressText.textContent = state.phase === "complete" ? "Complete" : `${percent}% through this chapter`;
      for (const scoreId of ["health", "happiness", "money"] as const) {
        const value = state.engine.scores[scoreId];
        const output = scoreOutputs.get(scoreId);
        const meter = scoreMeters.get(scoreId);
        if (output) {
          output.value = String(value);
          output.textContent = String(value);
          output.setAttribute("aria-label", `${SCORE_COPY[scoreId].label}: ${value} out of 100`);
        }
        if (meter) meter.value = value;
      }

      const presenting = getPresentingEncounter(state.engine, DEFAULT_ENCOUNTER_CATALOG);
      const recoveryPending = state.engine.recoveryHooks.some((hook) => hook.status === "offered");
      section.dataset.paused = presenting || recoveryPending ? "true" : "false";
      visitor.hidden = presenting === null;
      pausePill.hidden = presenting === null && !recoveryPending;
      if (presenting) {
        visitor.dataset.kind = presenting.definition.kind;
        const priorCharacter = visitor.querySelector(":scope > .col-character");
        if (priorCharacter?.getAttribute("data-character-id") !== `encounter-${presenting.definition.encounterId}`) {
          visitor.replaceChildren(encounterVisitorCharacter(document, presenting.definition), visitorLabel);
        }
        visitorLabel.textContent = encounterKindLabel(presenting.definition);
        speech.textContent = presenting.definition.prompt;
      } else if (recoveryPending) {
        speech.textContent = "Support can help you return to a stable path.";
      } else {
        const latest = state.engine.storyLog.at(-1);
        speech.textContent = latest?.text ?? "Small moments are becoming a life story.";
      }
      renderTray(state);
      renderStory(state);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      host.replaceChildren();
    },
  };

  return view;
}
