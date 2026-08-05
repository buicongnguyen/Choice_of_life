import {
  canCompleteLaterLife,
  getCurrentLaterLifeChoice,
  getPresentingLaterLifeCallback,
  type BiographyChapter,
  type BiographyPerson,
  type FullBiography,
  type LaterCareerOptionId,
  type LaterLifeAction,
  type LaterLifeChoiceOption,
  type LaterLifeOptionId,
  type LaterLifePhase,
  type LaterLifeState,
  type LegacyOptionId,
  type LifeDecisionRecord,
  type RetirementOptionId,
} from "../core/later-life/index";
import type { ScoreId } from "../core/score-model";
import { createElement } from "./elements";
import "./later-life.css";

export interface LaterLifeViewCallbacks {
  /** Apply the action to the canonical later-life reducer, then render the returned state. */
  readonly dispatch: (action: LaterLifeAction) => void;
  /** Leave the current run and return to the game's title screen. */
  readonly onReturnToTitle: () => void;
  /** Begin a fresh life after the biography has been assembled. */
  readonly onNewLife: () => void;
}

export interface LaterLifeView {
  readonly section: HTMLElement;
  render(state: LaterLifeState): void;
  dispose(): void;
}

const SCORE_ORDER = ["health", "happiness", "money"] as const;

const SCORE_COPY: Readonly<
  Record<ScoreId, Readonly<{ label: string; icon: string; shortLabel: string }>>
> = Object.freeze({
  health: { label: "Health", icon: "♥", shortLabel: "Health" },
  happiness: { label: "Happiness", icon: "☀", shortLabel: "Happy" },
  money: { label: "Financial security", icon: "◆", shortLabel: "Money" },
});

const PHASE_PROGRESS: Readonly<Record<LaterLifePhase, number>> = Object.freeze({
  "later-career-choice": 8,
  "later-career-callback": 24,
  "retirement-choice": 38,
  "retirement-callback": 54,
  "legacy-choice": 68,
  "legacy-callback": 84,
  "ready-to-complete": 94,
  complete: 100,
});

const STAGE_COPY = Object.freeze({
  "later-career-v1": {
    kicker: "Chapter 10 of 12",
    title: "Later Career",
    scene: "Experience has become something you can spend, share, or protect.",
    aria: "A warm side-view studio where an experienced adult considers the final working chapter",
  },
  "retirement-v1": {
    kicker: "Chapter 11 of 12",
    title: "Retirement",
    scene: "The calendar opens. You decide when work loosens its hold.",
    aria: "A sunlit side-view home and garden where retirement can begin at a chosen pace",
  },
  "legacy-v1": {
    kicker: "Chapter 12 of 12",
    title: "Legacy",
    scene: "What lasts is carried by people, places, and practices—not by a score.",
    aria: "A welcoming side-view community garden where memories and skills pass between generations",
  },
} as const);

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function ageCopy(ageMonths: number): string {
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (years === 0) return months === 1 ? "1 month" : `${months} months`;
  if (months === 0) return `Age ${years}`;
  return `Age ${years} years, ${months} months`;
}

function compactAge(ageMonths: number): string {
  if (ageMonths < 12) return `${ageMonths}m`;
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  return months === 0 ? `${years}` : `${years}y ${months}m`;
}

function ageRange(chapter: BiographyChapter): string {
  return `${compactAge(chapter.ageStartMonths)}–${compactAge(chapter.ageEndMonths)}`;
}

function phaseAction(
  phase: LaterLifePhase,
  optionId: LaterLifeOptionId,
): LaterLifeAction | null {
  if (phase === "later-career-choice") {
    return { type: "choose-later-career", optionId: optionId as LaterCareerOptionId };
  }
  if (phase === "retirement-choice") {
    return { type: "choose-retirement", optionId: optionId as RetirementOptionId };
  }
  if (phase === "legacy-choice") {
    return { type: "choose-legacy", optionId: optionId as LegacyOptionId };
  }
  return null;
}

function effectClass(delta: number): string {
  return delta > 0
    ? "col-later-life-effect--gain"
    : delta < 0
      ? "col-later-life-effect--cost"
      : "col-later-life-effect--neutral";
}

function optionButton(
  document: Document,
  option: LaterLifeChoiceOption,
  phase: LaterLifePhase,
  dispatch: LaterLifeViewCallbacks["dispatch"],
): HTMLButtonElement {
  const button = createElement(document, "button", {
    className: "col-later-life-option",
    attributes: {
      "aria-label": `${option.label}. ${option.summary} Tradeoff: ${option.tradeoff}`,
    },
  });
  button.type = "button";

  const titleRow = createElement(document, "span", {
    className: "col-later-life-option-title",
  });
  titleRow.append(
    createElement(document, "strong", { text: option.label }),
    createElement(document, "span", {
      className: "col-later-life-option-time",
      text: `+${Math.round((option.ageAdvanceMonths / 12) * 10) / 10} years`,
    }),
  );
  const effects = createElement(document, "span", {
    className: "col-later-life-effects",
    attributes: { "aria-label": "Expected effects" },
  });
  for (const effect of option.effects) {
    effects.append(
      createElement(document, "span", {
        className: `col-later-life-effect ${effectClass(effect.requestedDelta)}`,
        text: `${SCORE_COPY[effect.scoreId].icon} ${SCORE_COPY[effect.scoreId].shortLabel} ${signed(effect.requestedDelta)}`,
      }),
    );
  }
  button.append(
    titleRow,
    createElement(document, "span", {
      className: "col-later-life-option-summary",
      text: option.summary,
    }),
    createElement(document, "small", {
      className: "col-later-life-option-tradeoff",
      text: option.tradeoff,
    }),
    effects,
  );
  button.addEventListener("click", () => {
    const action = phaseAction(phase, option.optionId);
    if (action !== null) dispatch(action);
  });
  return button;
}

function relationshipLabel(person: BiographyPerson): string {
  return `${person.role} · ${person.relationship}`;
}

function personChip(document: Document, person: BiographyPerson): HTMLElement {
  const chip = createElement(document, "span", {
    className: "col-later-life-person-chip",
  });
  chip.append(
    createElement(document, "span", {
      className: "col-later-life-person-avatar",
      text: person.name.slice(0, 1).toUpperCase(),
      attributes: { "aria-hidden": "true" },
    }),
    createElement(document, "span", {
      className: "col-later-life-person-copy",
    }),
  );
  const copy = chip.lastElementChild as HTMLElement;
  copy.append(
    createElement(document, "strong", { text: person.name }),
    createElement(document, "small", { text: relationshipLabel(person) }),
  );
  return chip;
}

function chapterCard(
  document: Document,
  chapter: BiographyChapter,
  decision: LifeDecisionRecord | undefined,
): HTMLElement {
  const article = createElement(document, "article", {
    className: "col-later-life-chapter-card",
    attributes: { "data-stage-id": chapter.stageId },
  });
  const number = createElement(document, "span", {
    className: "col-later-life-chapter-number",
    text: String(chapter.chapterNumber).padStart(2, "0"),
    attributes: { "aria-hidden": "true" },
  });
  const header = createElement(document, "header");
  const titleWrap = createElement(document, "div");
  titleWrap.append(
    createElement(document, "h4", { text: chapter.title }),
    createElement(document, "span", {
      className: "col-later-life-chapter-age",
      text: ageRange(chapter),
    }),
  );
  header.append(number, titleWrap);
  article.append(
    header,
    createElement(document, "p", { text: chapter.summary }),
    createElement(document, "footer", {
      text: decision?.optionLabel ?? chapter.majorChoiceLabel,
    }),
  );
  return article;
}

function renderBiography(
  document: Document,
  host: HTMLElement,
  biography: FullBiography,
  callbacks: LaterLifeViewCallbacks,
): void {
  const ending = createElement(document, "section", {
    className: "col-later-life-ending",
    attributes: { "aria-labelledby": "later-life-ending-title" },
  });
  const endingEyebrow = createElement(document, "span", {
    className: "col-later-life-eyebrow",
    text: "A life, reflected—not ranked",
  });
  const endingTitle = createElement(document, "h3", {
    text: biography.title.title,
    attributes: { id: "later-life-ending-title", tabindex: "-1" },
  });
  const balanceCopy = biography.balance.balanced
    ? "Your three resources stayed in conversation."
    : `Your resources carried a ${biography.balance.spread}-point spread—each tells a different truth.`;
  ending.append(
    endingEyebrow,
    endingTitle,
    createElement(document, "p", {
      className: "col-later-life-ending-reason",
      text: biography.title.reason,
    }),
    createElement(document, "p", {
      className: "col-later-life-no-score",
      text: `${balanceCopy} This title comes from wellbeing, security, people, decisions, and legacy together—not one victory score.`,
    }),
  );

  const reflections = createElement(document, "div", {
    className: "col-later-life-reflections",
    attributes: { "aria-label": "Three life reflections" },
  });
  for (const reflection of biography.scoreReflections) {
    const card = createElement(document, "article", {
      className: `col-later-life-reflection col-later-life-reflection--${reflection.scoreId}`,
    });
    card.append(
      createElement(document, "span", {
        className: "col-later-life-reflection-label",
        text: reflection.label,
      }),
      createElement(document, "strong", { text: String(reflection.value) }),
      createElement(document, "span", {
        className: "col-later-life-reflection-band",
        text: reflection.band,
      }),
      createElement(document, "p", { text: reflection.reflection }),
    );
    reflections.append(card);
  }

  const chapters = createElement(document, "section", {
    className: "col-later-life-biography-section",
    attributes: { "aria-labelledby": "later-life-chapters-title" },
  });
  chapters.append(
    createElement(document, "span", {
      className: "col-later-life-eyebrow",
      text: `${Math.round((biography.lifespanMonths / 12) * 10) / 10} years remembered`,
    }),
    createElement(document, "h3", {
      text: "Twelve chapters of this life",
      attributes: { id: "later-life-chapters-title" },
    }),
  );
  const chapterGrid = createElement(document, "div", {
    className: "col-later-life-chapter-grid",
  });
  const decisionsById = new Map(
    biography.importantDecisions.map((decision) => [decision.decisionId, decision]),
  );
  for (const chapter of biography.chapters) {
    chapterGrid.append(
      chapterCard(document, chapter, decisionsById.get(chapter.majorDecisionId)),
    );
  }
  chapters.append(chapterGrid);

  const remembered = createElement(document, "section", {
    className: "col-later-life-remembered",
    attributes: { "aria-label": "Important people and decisions" },
  });
  const peopleColumn = createElement(document, "div", {
    className: "col-later-life-remembered-column",
  });
  peopleColumn.append(createElement(document, "h3", { text: "People who shaped the story" }));
  const people = createElement(document, "div", {
    className: "col-later-life-people-list",
  });
  if (biography.importantPeople.length === 0) {
    people.append(
      createElement(document, "p", {
        className: "col-later-life-empty",
        text: "The unnamed people met along the way still live in the chapter memories.",
      }),
    );
  } else {
    for (const person of biography.importantPeople) people.append(personChip(document, person));
  }
  peopleColumn.append(people);

  const decisionsColumn = createElement(document, "div", {
    className: "col-later-life-remembered-column",
  });
  decisionsColumn.append(createElement(document, "h3", { text: "Decisions that bent the path" }));
  const decisions = createElement(document, "ol", {
    className: "col-later-life-decision-list",
  });
  for (const decision of biography.importantDecisions) {
    const item = createElement(document, "li");
    item.append(
      createElement(document, "strong", { text: decision.optionLabel }),
      createElement(document, "span", { text: decision.resultText }),
    );
    decisions.append(item);
  }
  decisionsColumn.append(decisions);
  remembered.append(peopleColumn, decisionsColumn);

  const closing = createElement(document, "blockquote", {
    className: "col-later-life-closing",
  });
  closing.append(createElement(document, "p", { text: biography.closingNarrative }));

  const actions = createElement(document, "div", {
    className: "col-later-life-ending-actions",
  });
  const newLife = createElement(document, "button", {
    className: "col-later-life-button col-later-life-button--primary",
    text: "Begin a new life",
  });
  newLife.type = "button";
  newLife.addEventListener("click", callbacks.onNewLife);
  const title = createElement(document, "button", {
    className: "col-later-life-button col-later-life-button--quiet",
    text: "Return to title",
  });
  title.type = "button";
  title.addEventListener("click", callbacks.onReturnToTitle);
  actions.append(newLife, title);

  host.replaceChildren(ending, reflections, chapters, remembered, closing, actions);
  endingTitle.focus({ preventScroll: true });
}

export function mountLaterLifeView(
  host: HTMLElement,
  callbacks: LaterLifeViewCallbacks,
): LaterLifeView {
  const document = host.ownerDocument;
  let disposed = false;

  const section = createElement(document, "section", {
    className: "col-later-life-view",
    attributes: {
      "aria-labelledby": "later-life-stage-heading",
      "data-phase": "later-career-choice",
      "data-stage": "later-career-v1",
    },
  });

  const heading = createElement(document, "h2", {
    text: "The final chapters",
    attributes: { id: "later-life-stage-heading", tabindex: "-1" },
  });
  const kicker = createElement(document, "span", {
    className: "col-later-life-header-kicker",
  });
  const lede = createElement(document, "p", {
    className: "col-later-life-lede",
    text: "Choose how work changes, when retirement begins, and what your life carries forward.",
  });
  const age = createElement(document, "span", { className: "col-later-life-age" });
  const progress = createElement(document, "progress", {
    className: "col-later-life-progress",
    attributes: { min: "0", max: "100", "aria-label": "Later-life chapter progress" },
  });
  const headerCopy = createElement(document, "div");
  headerCopy.append(kicker, heading, lede);
  const headerStatus = createElement(document, "div", {
    className: "col-later-life-header-status",
  });
  headerStatus.append(age, progress);
  const header = createElement(document, "header", {
    className: "col-later-life-header",
  });
  header.append(headerCopy, headerStatus);

  const stageRail = createElement(document, "ol", {
    className: "col-later-life-stage-rail",
    attributes: { "aria-label": "Final life chapters" },
  });
  const stageSteps = new Map<string, HTMLLIElement>();
  for (const [stageId, label] of [
    ["later-career-v1", "Later career"],
    ["retirement-v1", "Retirement"],
    ["legacy-v1", "Legacy"],
    ["complete", "Life story"],
  ] as const) {
    const item = createElement(document, "li", {
      attributes: { "data-step": stageId },
    });
    item.append(
      createElement(document, "span", { text: label }),
      createElement(document, "i", { attributes: { "aria-hidden": "true" } }),
    );
    stageSteps.set(stageId, item);
    stageRail.append(item);
  }

  const scoreRow = createElement(document, "div", {
    className: "col-later-life-scores",
    attributes: { "aria-label": "Life resources" },
  });
  const scoreOutputs = new Map<ScoreId, HTMLOutputElement>();
  const scoreMeters = new Map<ScoreId, HTMLMeterElement>();
  for (const scoreId of SCORE_ORDER) {
    const card = createElement(document, "div", {
      className: `col-later-life-score col-later-life-score--${scoreId}`,
    });
    const label = createElement(document, "span", {
      text: `${SCORE_COPY[scoreId].icon} ${SCORE_COPY[scoreId].label}`,
    });
    const output = createElement(document, "output");
    const meter = createElement(document, "meter", {
      attributes: { min: "0", max: "100" },
    });
    card.append(label, output, meter);
    scoreOutputs.set(scoreId, output);
    scoreMeters.set(scoreId, meter);
    scoreRow.append(card);
  }

  const playfield = createElement(document, "div", {
    className: "col-later-life-playfield",
    attributes: {
      role: "img",
      "aria-label": STAGE_COPY["later-career-v1"].aria,
    },
  });
  const sky = createElement(document, "div", {
    className: "col-later-life-sky",
    attributes: { "aria-hidden": "true" },
  });
  sky.append(
    createElement(document, "span", { className: "col-later-life-sun" }),
    createElement(document, "span", { className: "col-later-life-cloud col-later-life-cloud--one" }),
    createElement(document, "span", { className: "col-later-life-cloud col-later-life-cloud--two" }),
  );
  const sceneObjects = createElement(document, "div", {
    className: "col-later-life-scene-objects",
    attributes: { "aria-hidden": "true" },
  });
  sceneObjects.append(
    createElement(document, "span", { className: "col-later-life-object col-later-life-object--desk" }),
    createElement(document, "span", { className: "col-later-life-object col-later-life-object--home" }),
    createElement(document, "span", { className: "col-later-life-object col-later-life-object--tree" }),
    createElement(document, "span", { className: "col-later-life-object col-later-life-object--bench" }),
  );
  const figure = createElement(document, "div", {
    className: "col-later-life-figure",
    attributes: { "aria-hidden": "true" },
  });
  figure.append(
    createElement(document, "span", { className: "col-later-life-figure-hair" }),
    createElement(document, "span", { className: "col-later-life-figure-head" }),
    createElement(document, "span", { className: "col-later-life-figure-body" }),
    createElement(document, "span", { className: "col-later-life-figure-arm col-later-life-figure-arm--left" }),
    createElement(document, "span", { className: "col-later-life-figure-arm col-later-life-figure-arm--right" }),
    createElement(document, "span", { className: "col-later-life-figure-leg col-later-life-figure-leg--left" }),
    createElement(document, "span", { className: "col-later-life-figure-leg col-later-life-figure-leg--right" }),
  );
  const companion = createElement(document, "div", {
    className: "col-later-life-companion",
    attributes: { "aria-hidden": "true" },
  });
  companion.append(
    createElement(document, "span", { className: "col-later-life-companion-head" }),
    createElement(document, "span", { className: "col-later-life-companion-body" }),
  );
  const sceneCaption = createElement(document, "p", {
    className: "col-later-life-scene-caption",
  });
  playfield.append(sky, sceneObjects, figure, companion, sceneCaption);

  const tray = createElement(document, "div", {
    className: "col-later-life-tray",
    attributes: { "aria-live": "polite" },
  });

  const ledger = createElement(document, "aside", {
    className: "col-later-life-ledger",
    attributes: { "aria-labelledby": "later-life-ledger-title" },
  });
  ledger.append(
    createElement(document, "h3", {
      text: "What the final chapters remember",
      attributes: { id: "later-life-ledger-title" },
    }),
  );
  const ledgerBody = createElement(document, "div", {
    className: "col-later-life-ledger-body",
  });
  ledger.append(ledgerBody);

  const footer = createElement(document, "footer", {
    className: "col-later-life-footer",
  });
  const returnButton = createElement(document, "button", {
    className: "col-later-life-button col-later-life-button--quiet",
    text: "Return to title",
  });
  returnButton.type = "button";
  returnButton.addEventListener("click", callbacks.onReturnToTitle);
  footer.append(
    createElement(document, "p", {
      text: "Every route produces a complete life. The tradeoffs make it yours.",
    }),
    returnButton,
  );

  section.append(header, stageRail, scoreRow, playfield, tray, ledger, footer);
  host.replaceChildren(section);

  const renderStageRail = (state: LaterLifeState): void => {
    const order = ["later-career-v1", "retirement-v1", "legacy-v1", "complete"] as const;
    const activeId = state.phase === "complete" ? "complete" : state.currentStageId;
    const activeIndex = order.indexOf(activeId);
    order.forEach((id, index) => {
      const item = stageSteps.get(id);
      if (!item) return;
      item.classList.toggle("is-active", index === activeIndex);
      item.classList.toggle("is-complete", index < activeIndex);
      if (index === activeIndex) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  };

  const renderChoice = (state: LaterLifeState): void => {
    const choice = getCurrentLaterLifeChoice(state);
    if (choice === null) return;
    const isRetirement = state.phase === "retirement-choice";
    tray.className = "col-later-life-tray col-later-life-tray--choice";
    tray.append(
      createElement(document, "span", {
        className: "col-later-life-eyebrow",
        text: isRetirement ? "Your timing, not a fixed age" : "A consequential choice",
      }),
      createElement(document, "h3", { text: choice.title }),
      createElement(document, "p", { text: choice.prompt }),
    );
    const choices = createElement(document, "div", {
      className: "col-later-life-option-grid",
    });
    for (const option of choice.options) {
      choices.append(optionButton(document, option, state.phase, callbacks.dispatch));
    }
    tray.append(choices);
  };

  const renderCallback = (state: LaterLifeState): void => {
    const callback = getPresentingLaterLifeCallback(state);
    if (callback === null) return;
    tray.className = "col-later-life-tray col-later-life-tray--callback";
    const people = callback.namedPersonIds
      .map((personId) => state.people.find((person) => person.personId === personId))
      .filter((person): person is BiographyPerson => person !== undefined);
    tray.append(
      createElement(document, "span", {
        className: "col-later-life-eyebrow",
        text: "The consequence returns",
      }),
      createElement(document, "h3", { text: callback.title }),
      createElement(document, "p", {
        className: "col-later-life-callback-text",
        text: callback.text,
      }),
    );
    if (people.length > 0) {
      const peopleRow = createElement(document, "div", {
        className: "col-later-life-callback-people",
        attributes: { "aria-label": "People in this moment" },
      });
      for (const person of people) peopleRow.append(personChip(document, person));
      tray.append(peopleRow);
    }
    const acknowledge = createElement(document, "button", {
      className: "col-later-life-button col-later-life-button--primary",
      text: "Carry this moment forward",
    });
    acknowledge.type = "button";
    acknowledge.addEventListener("click", () =>
      callbacks.dispatch({ type: "acknowledge-callback" }),
    );
    tray.append(acknowledge);
  };

  const renderReady = (state: LaterLifeState): void => {
    tray.className = "col-later-life-tray col-later-life-tray--ready";
    tray.append(
      createElement(document, "span", {
        className: "col-later-life-eyebrow",
        text: "All twelve chapters are ready",
      }),
      createElement(document, "h3", { text: "Read the life you made" }),
      createElement(document, "p", {
        text: "The ending title considers your three resources, relationships, important decisions, retirement timing, and legacy route together.",
      }),
    );
    const complete = createElement(document, "button", {
      className: "col-later-life-button col-later-life-button--primary",
      text: "Open the full biography",
    });
    complete.type = "button";
    complete.disabled = !canCompleteLaterLife(state);
    complete.addEventListener("click", () => callbacks.dispatch({ type: "complete-life" }));
    tray.append(complete);
  };

  const renderLedger = (state: LaterLifeState): void => {
    const decisions = state.decisions.filter((decision) =>
      decision.stageId === "later-career-v1" ||
      decision.stageId === "retirement-v1" ||
      decision.stageId === "legacy-v1",
    );
    const list = createElement(document, "ol", {
      className: "col-later-life-ledger-list",
    });
    if (decisions.length === 0) {
      list.append(
        createElement(document, "li", {
          className: "col-later-life-ledger-empty",
          text: "Your first final-chapter decision is still ahead.",
        }),
      );
    } else {
      for (const decision of decisions) {
        const item = createElement(document, "li");
        item.append(
          createElement(document, "strong", { text: decision.optionLabel }),
          createElement(document, "span", { text: decision.resultText }),
        );
        list.append(item);
      }
    }
    const people = createElement(document, "div", {
      className: "col-later-life-ledger-people",
    });
    const laterPeople = state.people.filter((person) =>
      person.firstStageId === "later-career-v1" ||
      person.firstStageId === "retirement-v1" ||
      person.firstStageId === "legacy-v1",
    );
    for (const person of laterPeople.slice(-3)) people.append(personChip(document, person));
    ledgerBody.replaceChildren(list, people);
  };

  const render = (state: LaterLifeState): void => {
    if (disposed) return;
    section.dataset.phase = state.phase;
    section.dataset.stage = state.currentStageId;
    const stage = STAGE_COPY[state.currentStageId];
    kicker.textContent = stage.kicker;
    heading.textContent = state.phase === "complete" ? "Your complete life story" : stage.title;
    age.textContent = ageCopy(state.ageMonths);
    progress.value = PHASE_PROGRESS[state.phase];
    playfield.setAttribute("aria-label", stage.aria);
    sceneCaption.textContent = stage.scene;
    for (const scoreId of SCORE_ORDER) {
      const value = state.scores[scoreId];
      const output = scoreOutputs.get(scoreId);
      const meter = scoreMeters.get(scoreId);
      if (output) {
        output.value = String(value);
        output.textContent = String(value);
        output.setAttribute("aria-label", `${SCORE_COPY[scoreId].label}: ${value} out of 100`);
      }
      if (meter) meter.value = value;
    }
    renderStageRail(state);

    if (state.phase === "complete" && state.biography !== null) {
      section.classList.add("is-biography");
      playfield.hidden = true;
      tray.hidden = true;
      ledger.hidden = true;
      footer.hidden = true;
      renderBiography(document, tray, state.biography, callbacks);
      tray.hidden = false;
      return;
    }

    section.classList.remove("is-biography");
    playfield.hidden = false;
    tray.hidden = false;
    ledger.hidden = false;
    footer.hidden = false;
    tray.replaceChildren();
    if (getCurrentLaterLifeChoice(state) !== null) renderChoice(state);
    else if (getPresentingLaterLifeCallback(state) !== null) renderCallback(state);
    else if (state.phase === "ready-to-complete") renderReady(state);
    else {
      tray.append(
        createElement(document, "p", {
          className: "col-later-life-empty",
          text: "This chapter is preparing its next moment.",
        }),
      );
    }
    renderLedger(state);
  };

  return {
    section,
    render,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      section.remove();
    },
  };
}
