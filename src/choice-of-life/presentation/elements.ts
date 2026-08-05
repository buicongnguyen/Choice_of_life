import type { CoreScores, ScorePreviewItem } from "./model";

export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tagName: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}

export function appendText(document: Document, parent: Node, text: string): void {
  parent.appendChild(document.createTextNode(text));
}

export function createScorePreview(
  document: Document,
  items: readonly ScorePreviewItem[],
  className = "col-score-grid",
  announceChanges = true,
): HTMLDListElement {
  const list = createElement(document, "dl", {
    className,
    attributes: { "aria-label": "Starting score preview" },
  });
  for (const item of items) {
    const card = createElement(document, "div", {
      className: "col-score-card",
      attributes: { "data-score-id": item.id },
    });
    const term = createElement(document, "dt", { text: item.label });
    const value = createElement(document, "dd");
    const output = createElement(document, "output", {
      className: "col-score-value",
      text: String(item.value),
      attributes: {
        "data-score-value": item.id,
        "aria-label": `${item.label}: ${item.value} out of 100`,
        "aria-live": announceChanges ? "polite" : "off",
      },
    });
    const meter = createElement(document, "meter", {
      className: "col-score-meter",
      attributes: {
        "min": "0",
        "max": "100",
        value: String(item.value),
        "data-score-meter": item.id,
        "aria-hidden": "true",
      },
    });
    value.append(output, meter);
    card.append(term, value);
    list.append(card);
  }
  return list;
}

export function scoreItemsFromScores(scores: CoreScores): readonly ScorePreviewItem[] {
  return [
    { id: "health", label: "Health", value: scores.health },
    { id: "happiness", label: "Happiness", value: scores.happiness },
    { id: "money", label: "Financial security", value: scores.money },
  ];
}
