import {
  EDUCATION_ROUTES,
  EXAM_PREPARATION_CHOICES,
  getCareerQualifications,
  getEducationRouteOptions,
  getRetrainingOption,
  type EducationIntensity,
  type EducationRouteDefinition,
  type EducationState,
  type SchoolGrade,
} from "../core/education/index";
import type { EducationChapterAction } from "../core/shell-contracts";
import { createElement } from "./elements";
import { createStagePlayerAvatar, type StagePlayerCharacter } from "./stage-player-avatar";

export interface EducationViewCallbacks {
  readonly playerCharacter?: StagePlayerCharacter;
  readonly dispatch: (action: EducationChapterAction) => void;
  readonly onContinueToCareer: () => void;
  readonly onReturnToReady: () => void;
}

export interface EducationView {
  readonly section: HTMLElement;
  render(state: EducationState): void;
  dispose(): void;
}

const SCORE_COPY = Object.freeze({
  health: { label: "Healthy", icon: "♥" },
  happiness: { label: "Happy", icon: "☀" },
  money: { label: "Money", icon: "◆" },
});

const PHASE_PROGRESS: Readonly<Record<EducationState["phase"], number>> =
  Object.freeze({
    "exam-preparation": 18,
    exam: 42,
    "route-selection": 66,
    qualified: 100,
  });

const GRADE_COPY: Readonly<Record<SchoolGrade, { label: string; copy: string }>> =
  Object.freeze({
    basic: {
      label: "Basic pass",
      copy: "You completed high school. Practical routes, direct work, and a foundation year are open.",
    },
    good: {
      label: "Good result",
      copy: "You earned a strong result and can consider professional, practical, or direct-work routes.",
    },
    excellent: {
      label: "Excellent result",
      copy: "Your result opens every education route, including the most demanding professional paths.",
    },
  });

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function scoreEffects(
  effects: readonly { readonly scoreId: keyof typeof SCORE_COPY; readonly requestedDelta: number }[],
): string {
  return effects
    .map((effect) => `${SCORE_COPY[effect.scoreId].label} ${signed(effect.requestedDelta)}`)
    .join(" · ");
}

function ageCopy(ageMonths: number): string {
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  return months === 0 ? `Age ${years}` : `Age ${years} years, ${months} months`;
}

function intensityDots(document: Document, label: string, value: EducationIntensity): HTMLElement {
  const amount = value === "high" ? 3 : value === "medium" ? 2 : 1;
  const row = createElement(document, "span", { className: "col-education-intensity" });
  row.append(createElement(document, "span", { text: label }));
  const dots = createElement(document, "span", {
    className: "col-education-intensity-dots",
    attributes: { "aria-label": `${label}: ${value}` },
  });
  for (let index = 0; index < 3; index += 1) {
    dots.append(createElement(document, "i", {
      className: index < amount ? "is-filled" : "",
      attributes: { "aria-hidden": "true" },
    }));
  }
  row.append(dots);
  return row;
}

function routeCard(
  document: Document,
  route: EducationRouteDefinition,
  eligible: boolean,
  reasons: readonly string[],
  effectiveFunding: number,
  dispatch: EducationViewCallbacks["dispatch"],
): HTMLButtonElement {
  const button = createElement(document, "button", {
    className: `col-education-choice${eligible ? "" : " col-education-choice--locked"}`,
  });
  button.type = "button";
  button.disabled = !eligible;
  button.append(
    createElement(document, "strong", { text: route.label }),
    createElement(document, "span", { text: route.summary }),
    createElement(document, "small", {
      text: `${Math.round(route.durationMonths / 12 * 10) / 10} years · ${scoreEffects(route.effects)}`,
    }),
    createElement(document, "small", {
      className: eligible ? "col-education-eligible" : "col-education-locked",
      text: eligible
        ? `Available · funding ${effectiveFunding}`
        : reasons.join(" "),
    }),
  );
  if (eligible) {
    button.addEventListener("click", () => dispatch({
      type: "select-route",
      routeId: route.routeId,
    }));
  }
  return button;
}

export function mountEducationView(
  host: HTMLElement,
  callbacks: EducationViewCallbacks,
): EducationView {
  const document = host.ownerDocument;
  let disposed = false;
  let trayKey = "";

  const section = createElement(document, "section", {
    className: "col-education-view",
    attributes: {
      "aria-labelledby": "education-stage-heading",
      "data-phase": "exam-preparation",
    },
  });

  const heading = createElement(document, "h2", {
    text: "High School & Education",
    attributes: { id: "education-stage-heading", tabindex: "-1" },
  });
  const lede = createElement(document, "p", {
    className: "col-education-lede",
    text: "Prepare for exams, discover what your result opens, and choose a route that fits this life.",
  });
  const age = createElement(document, "span", { className: "col-education-age" });
  const progress = createElement(document, "progress", {
    className: "col-education-progress",
    attributes: { "aria-label": "Education chapter progress", max: "100" },
  });
  const headerCopy = createElement(document, "div");
  headerCopy.append(heading, lede);
  const headerStatus = createElement(document, "div", { className: "col-education-header-status" });
  headerStatus.append(age, progress);
  const header = createElement(document, "header", { className: "col-education-header" });
  header.append(headerCopy, headerStatus);

  const scoreRow = createElement(document, "div", {
    className: "col-education-scores",
    attributes: { "aria-label": "Life scores" },
  });
  const scoreOutputs = new Map<keyof typeof SCORE_COPY, HTMLOutputElement>();
  for (const scoreId of ["health", "happiness", "money"] as const) {
    const card = createElement(document, "div", {
      className: `col-education-score col-education-score--${scoreId}`,
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
    scoreRow.append(card);
  }

  const playfield = createElement(document, "div", {
    className: "col-education-playfield",
    attributes: {
      role: "img",
      "aria-label": "A warm side-view school campus with a student moving toward graduation",
    },
  });
  const campus = createElement(document, "div", {
    className: "col-education-campus",
    attributes: { "aria-hidden": "true" },
  });
  campus.append(
    createElement(document, "span", { className: "col-education-sun" }),
    createElement(document, "span", { className: "col-education-cloud col-education-cloud--one" }),
    createElement(document, "span", { className: "col-education-cloud col-education-cloud--two" }),
    createElement(document, "span", { className: "col-education-school-building" }),
    createElement(document, "span", { className: "col-education-tree col-education-tree--one" }),
    createElement(document, "span", { className: "col-education-tree col-education-tree--two" }),
    createElement(document, "span", { className: "col-education-path" }),
  );
  const student = createStagePlayerAvatar(document, callbacks.playerCharacter, "teen", "col-education-student");
  const sceneCaption = createElement(document, "p", { className: "col-education-scene-caption" });
  playfield.append(campus, student, sceneCaption);

  const tray = createElement(document, "div", {
    className: "col-education-tray",
    attributes: { "aria-live": "polite" },
  });

  const footer = createElement(document, "div", { className: "col-education-footer" });
  const back = createElement(document, "button", {
    className: "col-button col-button--quiet",
    text: "Back to life overview",
  });
  back.type = "button";
  back.addEventListener("click", callbacks.onReturnToReady);
  footer.append(back);

  section.append(header, scoreRow, playfield, tray, footer);
  host.replaceChildren(section);

  const renderPreparation = (): void => {
    tray.className = "col-education-tray col-education-tray--choice";
    tray.append(
      createElement(document, "span", { className: "col-education-kicker", text: "Final school year" }),
      createElement(document, "h3", { text: "How will you prepare for the exam?" }),
      createElement(document, "p", {
        text: "There is no free answer: each plan changes health, happiness, money, and study strength.",
      }),
    );
    const choices = createElement(document, "div", { className: "col-education-choice-grid" });
    for (const choice of Object.values(EXAM_PREPARATION_CHOICES)) {
      const button = createElement(document, "button", { className: "col-education-choice" });
      button.type = "button";
      button.append(
        createElement(document, "strong", { text: choice.label }),
        createElement(document, "span", { text: choice.summary }),
        createElement(document, "small", { text: choice.tradeoff }),
        createElement(document, "small", { className: "col-education-effects", text: scoreEffects(choice.effects) }),
      );
      button.addEventListener("click", () => callbacks.dispatch({
        type: "choose-preparation",
        choiceId: choice.choiceId,
      }));
      choices.append(button);
    }
    tray.append(choices);
  };

  const renderExam = (state: EducationState): void => {
    const choice = state.preparationChoiceId
      ? EXAM_PREPARATION_CHOICES[state.preparationChoiceId]
      : null;
    tray.className = "col-education-tray col-education-tray--exam";
    tray.append(
      createElement(document, "span", { className: "col-education-kicker", text: "Exam complete" }),
      createElement(document, "h3", { text: "Your result is ready" }),
      createElement(document, "p", {
        text: choice
          ? `You followed “${choice.label}.” The final result also reflects earlier achievement, support, and one deterministic exam-day performance.`
          : "Your result reflects preparation, earlier achievement, support, and exam-day performance.",
      }),
    );
    const reveal = createElement(document, "button", {
      className: "col-button col-button--primary",
      text: "Reveal my grade",
    });
    reveal.type = "button";
    reveal.addEventListener("click", () => callbacks.dispatch({ type: "reveal-grade" }));
    tray.append(reveal);
  };

  const renderRoutes = (state: EducationState): void => {
    const result = state.gradeResult;
    const grade = result ? GRADE_COPY[result.grade] : null;
    tray.className = "col-education-tray col-education-tray--routes";
    if (grade && result) {
      const resultCard = createElement(document, "div", {
        className: `col-education-result col-education-result--${result.grade}`,
      });
      resultCard.append(
        createElement(document, "span", { text: "High-school result" }),
        createElement(document, "strong", { text: grade.label }),
        createElement(document, "b", { text: `${result.academicScore}/100` }),
        createElement(document, "small", {
          text: `Exam-day contribution ${signed(result.runnerContribution)}`,
        }),
      );
      tray.append(resultCard, createElement(document, "p", { text: grade.copy }));
    }
    if (state.foundationCompleted) {
      tray.append(createElement(document, "p", {
        className: "col-education-foundation-note",
        text: "Foundation year complete — your improved result has reopened the routes below.",
      }));
    }
    tray.append(createElement(document, "h3", { text: "Choose what comes next" }));
    const choices = createElement(document, "div", { className: "col-education-choice-grid" });
    for (const availability of getEducationRouteOptions(state)) {
      choices.append(routeCard(
        document,
        availability.route,
        availability.eligible,
        availability.reasons,
        availability.effectiveFunding,
        callbacks.dispatch,
      ));
    }
    tray.append(choices);
  };

  const renderQualified = (state: EducationState): void => {
    const route = state.qualificationRouteId
      ? EDUCATION_ROUTES[state.qualificationRouteId]
      : null;
    const qualifications = getCareerQualifications(state).slice(0, 3);
    tray.className = "col-education-tray col-education-tray--qualified";
    tray.append(
      createElement(document, "span", { className: "col-education-kicker", text: "Credential earned" }),
      createElement(document, "h3", { text: route ? `${route.label} complete` : "Education route complete" }),
      createElement(document, "p", {
        text: route
          ? `You completed ${route.summary.toLowerCase()} These are realistic first career steps—not a lifetime lock-in.`
          : "Your education has created several realistic first steps.",
      }),
    );
    const preview = createElement(document, "div", { className: "col-education-career-grid" });
    for (const qualification of qualifications) {
      const card = createElement(document, "article", { className: "col-education-career" });
      card.append(
        createElement(document, "strong", { text: qualification.label }),
        createElement(document, "p", { text: qualification.summary }),
      );
      const intensities = createElement(document, "div", { className: "col-education-intensities" });
      intensities.append(
        intensityDots(document, "Income", qualification.income),
        intensityDots(document, "Pressure", qualification.pressure),
        intensityDots(document, "Purpose", qualification.purpose),
      );
      card.append(intensities);
      preview.append(card);
    }
    tray.append(
      createElement(document, "h4", { text: "Career qualifications" }),
      preview,
    );

    const retraining = getRetrainingOption(state);
    if (retraining.targetRouteIds.length > 0) {
      const details = createElement(document, "details", { className: "col-education-retraining" });
      details.append(createElement(document, "summary", { text: retraining.label }));
      details.append(createElement(document, "p", { text: retraining.summary }));
      const routes = createElement(document, "div", { className: "col-education-retraining-actions" });
      for (const routeId of retraining.targetRouteIds) {
        const target = EDUCATION_ROUTES[routeId];
        const button = createElement(document, "button", {
          className: "col-button col-button--quiet",
          text: target.label,
        });
        button.type = "button";
        button.addEventListener("click", () => callbacks.dispatch({
          type: "retrain",
          routeId,
        }));
        routes.append(button);
      }
      details.append(routes);
      tray.append(details);
    }

    const continueButton = createElement(document, "button", {
      className: "col-button col-button--primary col-education-continue",
      text: "Continue to Career",
    });
    continueButton.type = "button";
    continueButton.addEventListener("click", callbacks.onContinueToCareer);
    tray.append(continueButton);
  };

  const renderTray = (state: EducationState): void => {
    const key = `${state.phase}:${state.preparationChoiceId ?? "none"}:${state.gradeResult?.grade ?? "none"}:${state.qualificationRouteId ?? "none"}:${state.routeHistory.length}`;
    if (trayKey === key) return;
    trayKey = key;
    tray.replaceChildren();
    if (state.phase === "exam-preparation") renderPreparation();
    else if (state.phase === "exam") renderExam(state);
    else if (state.phase === "route-selection") renderRoutes(state);
    else renderQualified(state);
  };

  const view: EducationView = {
    section,
    render(state: EducationState): void {
      if (disposed) return;
      section.dataset.phase = state.phase;
      const progressValue = PHASE_PROGRESS[state.phase];
      progress.value = progressValue;
      age.textContent = ageCopy(state.ageMonths);
      for (const scoreId of ["health", "happiness", "money"] as const) {
        const output = scoreOutputs.get(scoreId);
        const value = state.scores[scoreId];
        if (output) {
          output.value = String(value);
          output.textContent = String(value);
          output.setAttribute("aria-label", `${SCORE_COPY[scoreId].label}: ${value} out of 100`);
          const meter = output.nextElementSibling as HTMLMeterElement | null;
          if (meter) meter.value = value;
        }
      }
      student.dataset.phase = state.phase;
      sceneCaption.textContent = state.phase === "exam-preparation"
        ? "The final school year: time, energy, and opportunity all compete for attention."
        : state.phase === "exam"
          ? "The exam is over. One result will open some doors and make other routes longer."
          : state.phase === "route-selection"
            ? "A grade creates options—not a judgment of your worth or your future."
            : "Skills become a starting point for work, with retraining still available later.";
      renderTray(state);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      host.replaceChildren();
    },
  };

  return view;
}
