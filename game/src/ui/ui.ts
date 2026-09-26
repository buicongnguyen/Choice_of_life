import type { Book, Finale } from "../game/story/ending";
import { PICKUPS_PER_POINT, type OptionView } from "../game/story/flow";
import type { ChapterDef, Line } from "../game/story/model";
import type { Assist, BondKey, Effects, HairStyle, Look, Pronoun, ScoreKey, Scores } from "../game/types";
import { DISPLAY_NAME, FAVOURITE_COLOURS, HAIR_COLOURS, HAIR_STYLES, SKIN_TONES } from "../render/cast";
import type { Prefs } from "../game/save";

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "style") el.setAttribute("style", String(v));
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const ICONS: Record<ScoreKey, string> = {
  health: `<svg viewBox="0 0 24 24" width="26" height="26"><path fill="#ff5a6e" stroke="#c9243b" stroke-width="1.5" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3.1 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3.1 1.6-1.9 3-3.1 5.2-3.1 3.7 0 5.9 3.7 4.4 7.2C19.5 16.4 12 21 12 21z"/><ellipse cx="7.8" cy="8.6" rx="1.8" ry="1.1" fill="#fff" opacity=".8"/></svg>`,
  happiness: `<svg viewBox="0 0 24 24" width="26" height="26"><path fill="#ffd23f" stroke="#d99a00" stroke-width="1.5" stroke-linejoin="round" d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.7l-5.6 3.1 1.3-6.2L3 9.3l6.3-.7z"/><circle cx="9.6" cy="9.5" r="1.1" fill="#fff" opacity=".85"/></svg>`,
  money: `<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="9.4" fill="#3ddc97" stroke="#0f8a55" stroke-width="1.6"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="#0f8a55" stroke-width="1.2" opacity=".6"/><path d="M12 7.5c-1.6 1.7-2.4 3.2-2.4 4.5a2.4 2.4 0 004.8 0c0-1.3-.8-2.8-2.4-4.5z" fill="#0f8a55"/></svg>`,
};
const SCORE_NAME: Record<ScoreKey, string> = { health: "Health", happiness: "Happiness", money: "Money" };
const BOND_NAME: Record<BondKey, string> = { juno: "Juno", family: "Family", sam: "Sam", dex: "Dex", okafor: "Ms Okafor" };

export interface CreateResult {
  name: string;
  pronoun: Pronoun;
  look: Look;
  assist: Assist;
}

/** One key/click to advance; resolves once. Cleans up its own listeners. */
function waitForAdvance(target: HTMLElement, keys = ["Space", "Enter", "KeyE"]): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("keydown", onKey);
      target.removeEventListener("click", onClick);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (keys.includes(e.code)) {
        e.preventDefault();
        finish();
      }
    };
    const onClick = () => finish();
    // Defer so the event that opened this doesn't also close it.
    setTimeout(() => {
      window.addEventListener("keydown", onKey);
      target.addEventListener("click", onClick);
    }, 180);
  });
}

export class UI {
  readonly root: HTMLElement;
  private hudEl?: HTMLElement;
  private scoresEl = new Map<ScoreKey, HTMLElement>();
  private toastsEl?: HTMLElement;
  private chapterEl?: HTMLElement;
  private timelineEl?: HTMLElement;
  private companionsEl?: HTMLElement;
  private layer?: HTMLElement;
  private veilEl: HTMLElement;
  onPause?: () => void;
  onTap?: () => void;
  touchHandlers?: { up(): void; down(): void; jump(): void };
  /** Auto-advance dialogue (QA autopilot). */
  autoAdvance = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.veilEl = h("div", { class: "veil" });
    root.append(this.veilEl);
  }

  private clearLayer() {
    this.layer?.remove();
    this.layer = undefined;
  }

  private setLayer(el: HTMLElement) {
    this.clearLayer();
    this.layer = el;
    this.root.insertBefore(el, this.veilEl);
    return el;
  }

  async veil(on: boolean, ms = 600) {
    this.veilEl.classList.toggle("on", on);
    await new Promise((r) => setTimeout(r, ms));
  }

  loading(text: string | null) {
    this.root.querySelector(".loading")?.remove();
    if (text) this.root.append(h("div", { class: "loading" }, text));
  }

  // ------------------------------------------------------------------ title
  title(hasSave: boolean): Promise<"new" | "continue" | "settings"> {
    return new Promise((resolve) => {
      const pick = (v: "new" | "continue" | "settings") => () => {
        this.onTap?.();
        resolve(v);
      };
      this.setLayer(
        h(
          "div",
          { class: "title-screen fade-in" },
          h(
            "div",
            { class: "title-card" },
            h("div", { class: "title-kicker" }, "One life · one promise"),
            h("h1", { class: "title-logo" }, "Choice of ", h("span", {}, "Life")),
            h("p", { class: "title-tag" }, "Two kids bury a tin under a lighthouse and promise to open it together at seventy. Run the whole life in between, and choose what it becomes."),
            h(
              "div",
              { class: "title-actions" },
              hasSave && h("button", { class: "btn teal", onclick: pick("continue"), "data-qa": "continue" }, "Continue your life"),
              h("button", { class: "btn", onclick: pick("new"), "data-qa": "new" }, hasSave ? "Start a new life" : "Begin a life"),
              h("button", { class: "btn ghost", onclick: pick("settings") }, "Settings"),
            ),
          ),
          h("div", { class: "title-foot" }, "Arrows or WASD to change lanes · Space to jump · Esc to pause"),
        ),
      );
    });
  }

  // ------------------------------------------------------------------ create
  create(initial: CreateResult, onChange: (r: CreateResult) => void): Promise<CreateResult | null> {
    return new Promise((resolve) => {
      const state: CreateResult = structuredClone(initial);
      const changed = () => onChange(structuredClone(state));
      const group = <T,>(values: T[], current: () => T, set: (v: T) => void, render: (v: T) => Child, cls: string, label: (v: T) => string) => {
        const box = h("div", { class: cls === "swatch" ? "swatches" : "chips", role: "group" });
        const buttons = values.map((v) => {
          const b = h("button", { class: cls, type: "button", "aria-label": label(v), "aria-pressed": String(current() === v) }, render(v));
          if (cls === "swatch") b.style.background = String(v);
          b.addEventListener("click", () => {
            set(v);
            buttons.forEach((x, i) => x.setAttribute("aria-pressed", String(values[i] === v)));
            this.onTap?.();
            changed();
          });
          return b;
        });
        box.append(...buttons);
        return box;
      };
      const name = h("input", { type: "text", maxlength: "16", value: state.name, "aria-label": "Your name", autocomplete: "off" }) as HTMLInputElement;
      name.addEventListener("input", () => {
        state.name = name.value;
      });
      const panel = h(
        "div",
        { class: "create panel pop-in" },
        h("h2", {}, "Who are you?"),
        h("p", { class: "lead" }, "Your look never changes your chances. It just makes this life yours."),
        h("div", { class: "field" }, h("label", {}, "Name"), name),
        h("div", { class: "field" }, h("div", { class: "label" }, "Pronouns"), group<Pronoun>(["she", "he", "they"], () => state.pronoun, (v) => (state.pronoun = v), (v) => ({ she: "she / her", he: "he / him", they: "they / them" })[v], "chip", (v) => v)),
        h("div", { class: "field" }, h("div", { class: "label" }, "Skin"), group(SKIN_TONES, () => state.look.skin, (v) => (state.look.skin = v), () => null, "swatch", (v) => `Skin tone ${SKIN_TONES.indexOf(v) + 1}`)),
        h("div", { class: "field" }, h("div", { class: "label" }, "Hair"), group<HairStyle>(HAIR_STYLES, () => state.look.hairStyle, (v) => (state.look.hairStyle = v), (v) => v, "chip", (v) => `${v} hair`)),
        h("div", { class: "field" }, h("div", { class: "label" }, "Hair colour"), group(HAIR_COLOURS, () => state.look.hair, (v) => (state.look.hair = v), () => null, "swatch", (v) => `Hair colour ${HAIR_COLOURS.indexOf(v) + 1}`)),
        h("div", { class: "field" }, h("div", { class: "label" }, "Favourite colour"), group(FAVOURITE_COLOURS, () => state.look.colour, (v) => (state.look.colour = v), () => null, "swatch", (v) => `Favourite colour ${FAVOURITE_COLOURS.indexOf(v) + 1}`)),
        h(
          "div",
          { class: "field" },
          h("div", { class: "label" }, "Pace"),
          group<Assist>(["relaxed", "standard", "brisk"], () => state.assist, (v) => (state.assist = v), (v) => ({ relaxed: "Relaxed", standard: "Standard", brisk: "Brisk" })[v], "chip", (v) => `${v} pace`),
          h("div", { class: "note" }, "Relaxed is slower with fewer obstacles. You can't lose either way."),
        ),
        h(
          "div",
          { class: "actions" },
          h("button", { class: "btn ghost small", type: "button", onclick: () => resolve(null) }, "Back"),
          h(
            "button",
            {
              class: "btn",
              type: "button",
              "data-qa": "begin",
              onclick: () => {
                this.onTap?.();
                resolve(structuredClone(state));
              },
            },
            "Begin this life",
          ),
        ),
      );
      this.setLayer(h("div", { class: "fade-in", style: "position:absolute;inset:0;pointer-events:none" }, panel));
      panel.style.pointerEvents = "auto";
      changed();
      setTimeout(() => name.focus(), 50);
    });
  }

  // ------------------------------------------------------------------ chapter card
  chapterCard(chapter: ChapterDef, subtitle: string, intro: string): Promise<void> {
    const touch = document.body.classList.contains("touch");
    const el = this.setLayer(
      h(
        "div",
        { class: "chapter-card fade-in", "data-qa": "chapter-card" },
        h(
          "div",
          {},
          h("div", { class: "num" }, chapter.number),
          h("h1", {}, chapter.title),
          h("div", { class: "sub" }, subtitle),
          intro && h("p", { class: "intro" }, intro),
          h("button", { class: "btn", type: "button" }, chapter.index === 0 ? "Remember" : "Begin"),
          chapter.hazards.length > 0 &&
            h("div", { class: "controls" }, touch ? "Swipe up/down to change lanes · tap to jump" : "↑ ↓ or W S to change lanes · Space to jump · Esc to pause"),
        ),
      ),
    );
    return waitForAdvance(el).then(() => this.clearLayer());
  }

  // ------------------------------------------------------------------ HUD
  showHud(show: boolean) {
    if (!show) {
      this.hudEl?.remove();
      this.hudEl = undefined;
      return;
    }
    if (this.hudEl) return;
    const scores = h("div", { class: "hud-scores" });
    for (const key of ["health", "happiness", "money"] as ScoreKey[]) {
      const icon = h("span", { class: "icon" });
      icon.innerHTML = ICONS[key];
      const el = h(
        "div",
        { class: `score ${key}`, title: SCORE_NAME[key], "aria-label": SCORE_NAME[key] },
        icon,
        h("span", { class: "value" }, "0"),
        h("span", { class: "meter", title: "Six small good things make a point" }, h("i", {})),
        h("span", { class: "sr-only" }, SCORE_NAME[key]),
      );
      this.scoresEl.set(key, el);
      scores.append(el);
    }
    this.chapterEl = h("div", { class: "hud-chapter" });
    this.timelineEl = h("div", { class: "timeline", "aria-hidden": "true" });
    for (let i = 1; i <= 7; i++) this.timelineEl.append(h("div", { class: "seg" }, h("div", { class: "fill" })));
    this.toastsEl = h("div", { class: "toasts", "aria-live": "polite" });
    this.companionsEl = h("div", { class: "companions" });
    const pause = h("button", { class: "icon-btn", type: "button", "aria-label": "Pause", onclick: () => this.onPause?.() }, "❚❚");
    const pad = h(
      "div",
      { class: "touch-pad" },
      h("div", { class: "group" }, h("button", { type: "button", "aria-label": "Lane up", onclick: () => this.touchHandlers?.up() }, "▲"), h("button", { type: "button", "aria-label": "Lane down", onclick: () => this.touchHandlers?.down() }, "▼")),
      h("div", { class: "group" }, h("button", { type: "button", "aria-label": "Jump", onclick: () => this.touchHandlers?.jump() }, "⤒")),
    );
    this.hudEl = h("div", { class: "hud" }, scores, this.chapterEl, h("div", { class: "hud-right" }, pause), this.companionsEl, this.toastsEl, this.timelineEl, pad);
    this.root.insertBefore(this.hudEl, this.root.firstChild);
  }

  setScores(scores: Scores, meters?: Record<ScoreKey, number>) {
    for (const [key, el] of this.scoresEl) {
      (el.querySelector(".value") as HTMLElement).textContent = String(scores[key]);
      el.classList.toggle("low", scores[key] <= 15);
      if (meters) (el.querySelector(".meter i") as HTMLElement).style.width = `${Math.round((meters[key] / PICKUPS_PER_POINT) * 100)}%`;
    }
  }

  delta(key: ScoreKey, value: number) {
    const el = this.scoresEl.get(key);
    if (!el || !value) return;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
    const d = h("span", { class: `delta ${value > 0 ? "up" : "down"}` }, `${value > 0 ? "+" : ""}${value}`);
    el.append(d);
    setTimeout(() => d.remove(), 1400);
  }

  setChapter(title: string, age: number) {
    if (this.chapterEl) {
      this.chapterEl.replaceChildren(h("div", { class: "t" }, title), h("div", { class: "age" }, `Age ${age}`));
    }
  }

  setTimeline(chapter: number, progress: number, marks: number[] = []) {
    if (!this.timelineEl) return;
    this.timelineEl.querySelectorAll(".seg").forEach((seg, i) => {
      const index = i + 1;
      const fill = seg.querySelector(".fill") as HTMLElement;
      fill.style.width = index < chapter ? "100%" : index === chapter ? `${Math.round(progress * 100)}%` : "0%";
      if (index === chapter && seg.querySelectorAll(".mark").length !== marks.length) {
        seg.querySelectorAll(".mark").forEach((m) => m.remove());
        for (const m of marks) seg.append(h("i", { class: "mark", style: `left:${m * 100}%` }));
      }
      if (index !== chapter) seg.querySelectorAll(".mark").forEach((m) => m.remove());
    });
  }

  setCompanions(list: { name: string; ready?: boolean; text: string }[]) {
    this.companionsEl?.replaceChildren(...list.map((c) => h("div", { class: `companion ${c.ready ? "ready" : ""}` }, c.text)));
  }

  toast(kind: string, text: string, style = "") {
    if (!this.toastsEl) return;
    const t = h("div", { class: `toast ${style}` }, h("span", { class: "kind" }, kind), text);
    this.toastsEl.append(t);
    while (this.toastsEl.children.length > 2) this.toastsEl.firstElementChild?.remove();
    setTimeout(() => t.remove(), 3500);
  }

  gust(dir: -1 | 1) {
    const el = h("div", { class: "gust" }, dir < 0 ? "🍃 Wind! ↑" : "🍃 Wind! ↓");
    this.hudEl?.append(el);
    setTimeout(() => el.remove(), 1100);
  }

  // ------------------------------------------------------------------ story
  private storyLayer(title?: string) {
    const el = h("div", { class: "story", "data-qa": "story" }, title ? h("div", { class: "story-title" }, title) : null);
    return this.setLayer(el);
  }

  async say(lines: Line[], title: string | undefined, nameFor: (who: Line["who"]) => string, onLine?: (line: Line) => void) {
    const layer = this.storyLayer(title);
    for (const line of lines) {
      onLine?.(line);
      const box = h(
        "div",
        { class: `line ${line.who === "narrator" ? "narrator" : ""}`, "data-qa": "line", role: "button", tabindex: "0" },
        line.who !== "narrator" && h("span", { class: "who" }, nameFor(line.who)),
        line.text,
        h("span", { class: "next" }, "▶"),
      );
      layer.querySelectorAll(".line, .choices").forEach((n) => n.remove());
      layer.append(box);
      if (this.autoAdvance) await new Promise((r) => setTimeout(r, 30));
      else await waitForAdvance(layer);
    }
  }

  choose(prompt: string, options: OptionView[], title?: string): Promise<string> {
    const layer = (this.layer?.classList.contains("story") ? this.layer : this.storyLayer(title)) as HTMLElement;
    layer.querySelectorAll(".line, .choices").forEach((n) => n.remove());
    return new Promise((resolve) => {
      const available = options.filter((o) => !o.locked);
      const pick = (id: string) => {
        window.removeEventListener("keydown", onKey);
        this.onTap?.();
        resolve(id);
      };
      const cards = options.map((o, i) => {
        const fx = effectChips(o.effects);
        const card = h(
          "button",
          { class: `card ${o.star ? "starred" : ""}`, type: "button", disabled: !!o.locked, "data-qa": `option-${o.id}`, style: `animation-delay:${i * 70}ms` },
          h("span", { class: "key" }, String(i + 1)),
          h("span", { class: "label" }, o.label),
          o.detail && h("span", { class: "detail" }, o.detail),
          fx,
          o.star && h("span", { class: "star" }, "★ This feels like you. +1 Happiness"),
          o.because && h("span", { class: "because" }, `↺ ${o.because}`),
          o.hint && h("span", { class: "hint" }, `→ ${o.hint}`),
          o.locked && h("span", { class: "lock" }, `🔒 ${o.locked}`),
        );
        card.addEventListener("click", () => !o.locked && pick(o.id));
        return card;
      });
      const onKey = (e: KeyboardEvent) => {
        const n = Number(e.key);
        if (n >= 1 && n <= options.length && !options[n - 1].locked) pick(options[n - 1].id);
      };
      window.addEventListener("keydown", onKey);
      layer.append(h("div", { class: "choices" }, h("div", { class: "prompt" }, prompt), h("div", { class: "cards" }, ...cards)));
      (cards.find((c) => !c.hasAttribute("disabled")) as HTMLElement | undefined)?.focus({ preventScroll: true });
      if (this.autoAdvance && available.length === 0) resolve(options[0].id);
    });
  }

  endStory() {
    if (this.layer?.classList.contains("story")) this.clearLayer();
  }

  // ------------------------------------------------------------------ summaries & modals
  summary(chapter: ChapterDef, lines: string[], outro: string[], keepsakes: number, deltas: Scores): Promise<void> {
    const chips = (["health", "happiness", "money"] as ScoreKey[]).map((k) =>
      h("span", { class: `fx-chip ${k} ${deltas[k] < 0 ? "down" : ""}` }, `${SCORE_NAME[k]} ${deltas[k] >= 0 ? "+" : ""}${deltas[k]}`),
    );
    const el = this.setLayer(
      h(
        "div",
        { class: "summary fade-in", "data-qa": "summary" },
        h(
          "div",
          { class: "panel pop-in" },
          h("div", { class: "kicker" }, `${chapter.number} · complete`),
          h("h2", {}, chapter.title),
          h("div", { class: "row" }, ...chips, h("span", { class: "fx-chip bond" }, `Keepsakes ${keepsakes}/3`)),
          lines.length > 0 && h("ul", {}, ...lines.map((l) => h("li", {}, l))),
          outro.length > 0 && h("div", { class: "outro" }, ...outro.map((o) => h("p", {}, o))),
          h("div", { class: "actions" }, h("button", { class: "btn", type: "button", "data-qa": "continue-chapter" }, "Continue")),
        ),
      ),
    );
    const button = el.querySelector("button") as HTMLButtonElement;
    setTimeout(() => button.focus({ preventScroll: true }), 50);
    return new Promise((resolve) => {
      button.addEventListener("click", () => {
        this.onTap?.();
        this.clearLayer();
        resolve();
      });
      if (this.autoAdvance) setTimeout(() => button.click(), 30);
    });
  }

  message(title: string, text: string, button = "Continue"): Promise<void> {
    const el = this.setLayer(
      h("div", { class: "modal fade-in", "data-qa": "message" }, h("div", { class: "panel pop-in" }, h("h2", {}, title), h("p", {}, text), h("div", { class: "stack" }, h("button", { class: "btn", type: "button" }, button)))),
    );
    const b = el.querySelector("button") as HTMLButtonElement;
    setTimeout(() => b.focus({ preventScroll: true }), 50);
    return new Promise((resolve) => {
      b.addEventListener("click", () => {
        this.clearLayer();
        resolve();
      });
      if (this.autoAdvance) setTimeout(() => b.click(), 30);
    });
  }

  pauseMenu(prefs: Prefs, onPrefs: (p: Prefs) => void, canQuit: boolean): Promise<"resume" | "quit"> {
    return new Promise((resolve) => {
      const p = { ...prefs };
      const toggle = (label: string, key: "music" | "reducedMotion" | "largeText") => {
        const b = h("button", { class: "toggle", type: "button", "aria-pressed": String(p[key]), "aria-label": label });
        b.addEventListener("click", () => {
          p[key] = !p[key];
          b.setAttribute("aria-pressed", String(p[key]));
          onPrefs({ ...p });
        });
        return h("div", { class: "setting" }, label, b);
      };
      const volume = h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(p.volume), "aria-label": "Volume" }) as HTMLInputElement;
      volume.addEventListener("input", () => {
        p.volume = Number(volume.value);
        onPrefs({ ...p });
      });
      const quality = h("button", { class: "toggle", type: "button", "aria-pressed": String(p.quality === "high"), "aria-label": "High quality graphics" });
      quality.addEventListener("click", () => {
        p.quality = p.quality === "high" ? "low" : "high";
        quality.setAttribute("aria-pressed", String(p.quality === "high"));
        onPrefs({ ...p });
      });
      const close = (v: "resume" | "quit") => {
        window.removeEventListener("keydown", onKey);
        this.root.querySelector(".pause-modal")?.remove();
        resolve(v);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.code === "Escape") close("resume");
      };
      window.addEventListener("keydown", onKey);
      const el = h(
        "div",
        { class: "modal pause-modal fade-in" },
        h(
          "div",
          { class: "panel pop-in" },
          h("h2", {}, canQuit ? "Paused" : "Settings"),
          h("div", { class: "setting" }, "Volume", volume),
          toggle("Music", "music"),
          toggle("Reduced motion", "reducedMotion"),
          toggle("Larger text", "largeText"),
          h("div", { class: "setting" }, "High quality graphics", quality),
          h(
            "div",
            { class: "stack" },
            h("button", { class: "btn teal", type: "button", onclick: () => close("resume") }, canQuit ? "Resume" : "Done"),
            canQuit && h("button", { class: "btn ghost", type: "button", onclick: () => close("quit") }, "Save and return to title"),
          ),
        ),
      );
      this.root.append(el);
    });
  }

  letter(lines: string[]): Promise<void> {
    const body = lines.slice(0, -1);
    const sign = lines[lines.length - 1];
    const el = this.setLayer(
      h(
        "div",
        { class: "letter-wrap fade-in", "data-qa": "letter" },
        h("div", { class: "letter" }, ...body.map((l) => h("p", {}, l)), h("p", { class: "sign" }, `— ${sign}`)),
        h("div", { class: "actions" }, h("button", { class: "btn", type: "button" }, "Fold the letter")),
      ),
    );
    const b = el.querySelector(".actions button") as HTMLButtonElement;
    return new Promise((resolve) => {
      b.addEventListener("click", () => {
        this.clearLayer();
        resolve();
      });
      if (this.autoAdvance) setTimeout(() => b.click(), 30);
    });
  }

  book(book: Book, end: Finale): Promise<void> {
    const scoreCards = book.scores.map((s) =>
      h("div", { class: `score-card ${s.key}` }, h("div", { class: "name" }, SCORE_NAME[s.key]), h("div", { class: "big" }, String(s.value)), h("p", {}, s.line)),
    );
    const pages = book.chapters.map((c) =>
      h("div", { class: "page" }, h("div", { class: "ages" }, `${c.number} · age ${c.ages}`), h("h3", {}, c.title), h("ul", {}, ...(c.lines.length ? c.lines : ["A quiet chapter."]).map((l) => h("li", {}, l)))),
    );
    const el = this.setLayer(
      h(
        "div",
        { class: "book fade-in", "data-qa": "book" },
        h(
          "div",
          { class: "book-inner" },
          h("div", { class: "cover" }, h("div", { class: "kicker" }, "The Book of Life"), h("h1", {}, book.title), h("p", {}, book.subtitle)),
          h("div", { class: "page reflection" }, end.reflection),
          h("div", { class: "scores" }, ...scoreCards),
          h("div", { class: "grid" }, ...pages),
          h(
            "div",
            { class: "grid", style: "margin-top:16px" },
            h("div", { class: "page" }, h("h3", {}, "The people"), h("ul", {}, ...book.people.map((p) => h("li", {}, p)))),
            h(
              "div",
              { class: "page" },
              h("h3", {}, `Keepsakes · ${book.keepsakes.found} of ${book.keepsakes.total}`),
              h("ul", {}, ...(book.keepsakes.items.length ? book.keepsakes.items : ["None found this time. They float above the hard places."]).map((p) => h("li", {}, p))),
              h("h3", { style: "margin-top:12px" }, "Along the way"),
              h("ul", {}, ...book.stats.map((p) => h("li", {}, p))),
            ),
          ),
          h("div", { class: "actions" }, h("button", { class: "btn", type: "button", "data-qa": "again" }, "Live another life")),
        ),
      ),
    );
    const b = el.querySelector("[data-qa=again]") as HTMLButtonElement;
    return new Promise((resolve) => {
      b.addEventListener("click", () => {
        this.clearLayer();
        resolve();
      });
    });
  }

  clear() {
    this.clearLayer();
  }
}

export function effectChips(fx: Effects): HTMLElement {
  const box = h("span", { class: "fx" });
  for (const key of ["health", "happiness", "money"] as ScoreKey[]) {
    const v = fx[key];
    if (v) box.append(h("span", { class: `fx-chip ${key} ${v < 0 ? "down" : ""}` }, `${SCORE_NAME[key]} ${v > 0 ? "+" : ""}${v}`));
  }
  if (fx.bonds) {
    for (const [k, v] of Object.entries(fx.bonds) as [BondKey, number][]) {
      if (v) box.append(h("span", { class: `fx-chip bond ${v < 0 ? "down" : ""}` }, `${BOND_NAME[k]} ${v > 0 ? "♥".repeat(Math.min(3, v)) : "💔"}`));
    }
  }
  return box;
}

export const nameOf = (who: Line["who"], you: string) => (who === "you" ? you : who === "narrator" ? "" : DISPLAY_NAME[who]);
