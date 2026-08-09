import {
  getCareerDefinition,
  currentCareerOutfit,
  type CareerAction,
  type CareerDecisionOption,
  type CareerOffer,
  type CareerOutfitVariant,
  type CareerSignal,
  type CareerState,
} from "../core/career/index";
import { createElement } from "./elements";
import { createStagePlayerAvatar, type StagePlayerCharacter } from "./stage-player-avatar";

export interface CareerViewCallbacks {
  readonly playerCharacter?: StagePlayerCharacter;
  readonly dispatch: (action: CareerAction) => void;
  readonly onContinueToAdult: () => void;
  readonly onReturnToReady: () => void;
}

export interface CareerView {
  readonly section: HTMLElement;
  render(state: CareerState): void;
  dispose(): void;
}

const SCORE_COPY = Object.freeze({
  health: "Healthy",
  happiness: "Happy",
  money: "Money",
});

function ageCopy(ageYears: number): string {
  const years = Math.floor(ageYears);
  const months = Math.round((ageYears - years) * 12);
  return months ? `Age ${years} years, ${months} months` : `Age ${years}`;
}

function signal(document: Document, item: CareerSignal): HTMLElement {
  const row = createElement(document, "span", { className: "col-career-signal" });
  row.append(createElement(document, "span", { text: item.label }));
  const dots = createElement(document, "span", {
    className: "col-career-signal-dots",
    attributes: { "aria-label": `${item.label}: ${item.level} out of 5` },
  });
  for (let index = 1; index <= 5; index += 1) {
    dots.append(createElement(document, "i", {
      className: index <= item.level ? "is-filled" : "",
      attributes: { "aria-hidden": "true" },
    }));
  }
  row.append(dots);
  return row;
}

function signals(document: Document, offer: CareerOffer): HTMLElement {
  const box = createElement(document, "div", { className: "col-career-signals" });
  box.append(
    signal(document, offer.labels.income),
    signal(document, offer.labels.pressure),
    signal(document, offer.labels.purposeAutonomy),
  );
  return box;
}

function outfitPreview(document: Document, outfit: CareerOutfitVariant): HTMLElement {
  const card = createElement(document, "div", { className: "col-career-outfit" });
  const swatches = createElement(document, "span", { className: "col-career-swatches" });
  for (const color of outfit.palette) {
    const swatch = createElement(document, "i", { attributes: { "aria-hidden": "true" } });
    swatch.style.backgroundColor = color;
    swatches.append(swatch);
  }
  card.append(
    createElement(document, "strong", { text: outfit.label }),
    swatches,
    createElement(document, "small", {
      text: `${outfit.top}; ${outfit.bottoms}; ${outfit.footwear}`,
    }),
  );
  return card;
}

function choiceButton(
  document: Document,
  option: CareerDecisionOption,
  onClick: () => void,
): HTMLButtonElement {
  const button = createElement(document, "button", { className: "col-career-choice" });
  button.type = "button";
  button.append(
    createElement(document, "strong", { text: option.label }),
    createElement(document, "span", { text: option.description }),
  );
  button.addEventListener("click", onClick);
  return button;
}

export function mountCareerView(
  host: HTMLElement,
  callbacks: CareerViewCallbacks,
): CareerView {
  const document = host.ownerDocument;
  let disposed = false;

  const section = createElement(document, "section", {
    className: "col-career-view",
    attributes: { "aria-labelledby": "career-stage-heading" },
  });
  const heading = createElement(document, "h2", {
    text: "First Career",
    attributes: { id: "career-stage-heading", tabindex: "-1" },
  });
  const age = createElement(document, "span", { className: "col-career-age" });
  const role = createElement(document, "strong", { className: "col-career-role" });
  const header = createElement(document, "header", { className: "col-career-header" });
  const headingCopy = createElement(document, "div", { className: "col-career-heading" });
  headingCopy.append(
    heading,
    createElement(document, "p", {
      text: "Choose a qualified path, experience its rewards and pressure, then reflect on the whole life—not money alone.",
    }),
  );
  const headerStatus = createElement(document, "div", { className: "col-career-status" });
  headerStatus.append(age, role);
  header.append(headingCopy, headerStatus);

  const scoreRow = createElement(document, "div", { className: "col-career-scores" });
  const scoreOutputs = new Map<keyof typeof SCORE_COPY, HTMLOutputElement>();
  for (const scoreId of ["health", "happiness", "money"] as const) {
    const card = createElement(document, "div", { className: `col-career-score col-career-score--${scoreId}` });
    const output = createElement(document, "output");
    card.append(createElement(document, "span", { text: SCORE_COPY[scoreId] }), output);
    scoreOutputs.set(scoreId, output);
    scoreRow.append(card);
  }

  const content = createElement(document, "div", { className: "col-career-content", attributes: { "aria-live": "polite" } });
  const playerScene = createElement(document, "div", { className: "col-career-player-scene" });
  const renderPlayer = (state: CareerState): void => {
    const selected = state.selectedRole;
    playerScene.replaceChildren(
      createStagePlayerAvatar(document, callbacks.playerCharacter, "young-adult", "col-career-player-avatar", {
        jobId: selected?.careerId,
        season: state.season,
      }),
      createElement(document, "span", { text: selected?.roleTitle ?? "Your next chapter" }),
    );
  };
  const footer = createElement(document, "div", { className: "col-career-footer" });
  const back = createElement(document, "button", { className: "col-button col-button--quiet", text: "Back to life overview" });
  back.type = "button";
  back.addEventListener("click", callbacks.onReturnToReady);
  footer.append(back);
  section.append(header, scoreRow, playerScene, content, footer);
  host.replaceChildren(section);

  const renderOffers = (state: CareerState): void => {
    content.append(
      createElement(document, "span", { className: "col-career-kicker", text: "Qualified offers" }),
      createElement(document, "h3", { text: "Choose your first working chapter" }),
      createElement(document, "p", { text: "Each offer shows its income, pressure, purpose, and both seasonal uniforms before you commit." }),
    );
    const grid = createElement(document, "div", { className: "col-career-offer-grid" });
    for (const offer of state.offerSet.careerOffers) {
      const card = createElement(document, "article", { className: "col-career-offer" });
      card.append(
        createElement(document, "h4", { text: offer.title }),
        createElement(document, "strong", { text: offer.roleTitle }),
        createElement(document, "p", { text: offer.summary }),
        createElement(document, "small", { text: `Qualified through: ${offer.qualificationLabel}` }),
        signals(document, offer),
        outfitPreview(document, offer.outfitPreview.standard),
        outfitPreview(document, offer.outfitPreview.summer),
      );
      const choose = createElement(document, "button", { className: "col-button col-button--primary", text: `Choose ${offer.title}` });
      choose.type = "button";
      choose.addEventListener("click", () => callbacks.dispatch({ type: "choose-career", offerId: offer.offerId }));
      card.append(choose);
      grid.append(card);
    }
    const retraining = state.offerSet.retrainingOffer;
    const retrain = createElement(document, "article", { className: "col-career-offer col-career-offer--retrain" });
    retrain.append(
      createElement(document, "h4", { text: retraining.title }),
      createElement(document, "p", { text: retraining.description }),
      createElement(document, "small", { text: `${retraining.durationMonths} months · Money ${retraining.costMoneyDelta}` }),
    );
    const retrainButton = createElement(document, "button", { className: "col-button col-button--quiet", text: `Retrain toward ${retraining.targetTitle}` });
    retrainButton.type = "button";
    retrainButton.addEventListener("click", () => callbacks.dispatch({ type: "choose-retraining", offerId: retraining.offerId }));
    retrain.append(retrainButton);
    grid.append(retrain);
    content.append(grid);
  };

  const renderDecision = (state: CareerState): void => {
    const decision = state.pendingDecision;
    if (!decision) return;
    content.append(
      createElement(document, "span", { className: "col-career-kicker", text: decision.kind === "doctor-emergency" ? "Residency emergency" : "Work pressure" }),
      createElement(document, "h3", { text: decision.title }),
      createElement(document, "p", { text: decision.prompt }),
    );
    const grid = createElement(document, "div", { className: "col-career-choice-grid" });
    if (decision.kind === "pressure") {
      for (const option of decision.options) {
        grid.append(choiceButton(document, option, () => callbacks.dispatch({ type: "resolve-pressure", optionId: option.optionId })));
      }
    } else {
      for (const option of decision.options) {
        grid.append(choiceButton(document, option, () => callbacks.dispatch({ type: "resolve-doctor-emergency", optionId: option.optionId })));
      }
    }
    content.append(grid);
  };

  const renderActive = (state: CareerState): void => {
    const selected = state.selectedRole;
    if (!selected) return;
    const definition = getCareerDefinition(selected.careerId);
    const outfit = currentCareerOutfit(state);
    content.append(
      createElement(document, "span", { className: "col-career-kicker", text: `${selected.cyclesCompleted} of 3 work cycles complete` }),
      createElement(document, "h3", { text: selected.roleTitle }),
      createElement(document, "p", { text: definition.summary }),
    );
    if (selected.careerId === "doctor") {
      content.append(createElement(document, "p", {
        className: "col-career-callout",
        text: selected.status === "trainee" ? "You are a resident doctor working toward full qualification." : "Residency complete: you are now a qualified doctor.",
      }));
    }
    const seasonRow = createElement(document, "div", { className: "col-career-season" });
    seasonRow.append(createElement(document, "strong", { text: "Uniform preview" }));
    for (const season of ["standard", "summer"] as const) {
      const button = createElement(document, "button", {
        className: `col-button col-button--quiet${state.season === season ? " is-active" : ""}`,
        text: season === "summer" ? "Summer outfit" : "Standard outfit",
      });
      button.type = "button";
      button.disabled = state.season === season;
      button.addEventListener("click", () => callbacks.dispatch({ type: "set-season", season }));
      seasonRow.append(button);
    }
    content.append(seasonRow);
    if (outfit) content.append(outfitPreview(document, outfit));
    const economy = createElement(document, "p", {
      className: "col-career-economy",
      text: `Next 4 months: salary +${definition.economy.salaryMoneyDelta}, recurring costs ${definition.economy.recurringCostMoneyDelta}. Health and happiness may also change.`,
    });
    const work = createElement(document, "button", { className: "col-button col-button--primary", text: "Work the next 4 months" });
    work.type = "button";
    work.addEventListener("click", () => callbacks.dispatch({ type: "settle-cycle" }));
    content.append(economy, work);
    const latest = state.settlements[state.settlements.length - 1];
    if (latest) content.append(createElement(document, "p", { className: "col-career-callout", text: latest.summary }));
  };

  const renderSettling = (state: CareerState): void => {
    content.append(
      createElement(document, "span", { className: "col-career-kicker", text: "First career chapter complete" }),
      createElement(document, "h3", { text: `${state.selectedRole?.monthsCompleted ?? 0} months of work, choices, and change` }),
      createElement(document, "p", { text: "Salary helped financial security, while work rhythms and pressure also shaped health and happiness." }),
    );
    const finish = createElement(document, "button", { className: "col-button col-button--primary", text: "See chapter reflection" });
    finish.type = "button";
    finish.addEventListener("click", () => callbacks.dispatch({ type: "complete" }));
    content.append(finish);
  };

  const renderEnding = (state: CareerState): void => {
    const ending = state.ending;
    if (!ending) return;
    content.append(
      createElement(document, "span", { className: "col-career-kicker", text: "Provisional ending" }),
      createElement(document, "h3", { text: ending.title }),
      createElement(document, "h4", { text: ending.headline }),
      createElement(document, "p", { text: ending.narrative }),
    );
    const lines = createElement(document, "div", { className: "col-career-ending-grid" });
    for (const line of ending.scoreLines) {
      const card = createElement(document, "article");
      card.append(
        createElement(document, "strong", { text: `${line.label}: ${line.value}` }),
        createElement(document, "p", { text: line.reflection }),
      );
      lines.append(card);
    }
    const next = createElement(document, "button", { className: "col-button col-button--primary", text: "Continue to Adult Life" });
    next.type = "button";
    next.addEventListener("click", callbacks.onContinueToAdult);
    content.append(lines, next);
  };

  return {
    section,
    render(state: CareerState): void {
      if (disposed) return;
      section.dataset.phase = state.phase;
      age.textContent = ageCopy(state.profile.ageYears);
      role.textContent = state.selectedRole?.roleTitle ?? "Career offers open";
      renderPlayer(state);
      for (const scoreId of ["health", "happiness", "money"] as const) {
        const output = scoreOutputs.get(scoreId);
        if (output) {
          output.value = String(state.scores[scoreId]);
          output.textContent = String(state.scores[scoreId]);
        }
      }
      content.replaceChildren();
      if (state.phase === "offers") renderOffers(state);
      else if (state.phase === "pressure-choice" || state.phase === "doctor-emergency-choice") renderDecision(state);
      else if (state.phase === "settling") renderSettling(state);
      else if (state.phase === "complete") renderEnding(state);
      else renderActive(state);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      host.replaceChildren();
    },
  };
}
