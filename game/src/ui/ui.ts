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

/** Icons rendered in Blender by art/ui/build_ui.py (public/ui/*.webp). */
export type IconName =
  | ScoreKey
  | "keepsake"
  | "letter"
  | "pause"
  | "play"
  | "close"
  | "back"
  | "up"
  | "down"
  | "jump"
  | "settings"
  | "music"
  | "volume"
  | "motion"
  | "text"
  | "quality"
  | "journal"
  | "home"
  | "dog"
  | "partner";

const UI_BASE = "./ui/";
const ALL_ICONS: IconName[] = ["health", "happiness", "money", "keepsake", "letter", "pause", "play", "close", "back", "up", "down", "jump", "settings", "music", "volume", "motion", "text", "quality", "journal", "home", "dog", "partner"];

/** Decorative icon: the button or label next to it carries the accessible name. */
export function icon(name: IconName, cls = "ico") {
  const img = h("img", { class: cls, src: `${UI_BASE}${name}.webp`, alt: "", draggable: "false", decoding: "async" });
  return img;
}

/** Warms the browser cache so icons never pop in mid-game. */
export function preloadUi() {
  for (const n of [...ALL_ICONS, "logo"]) {
    const img = new Image();
    img.decoding = "async";
    img.src = `${UI_BASE}${n}.webp`;
  }
}

const SCORE_NAME: Record<ScoreKey, string> = { health: "Health", happiness: "Happiness", money: "Money" };
const BOND_NAME: Record<BondKey, string> = { juno: "Juno", family: "Family", sam: "Sam", dex: "Dex", okafor: "Ms Okafor" };

export interface JournalData {
  people: { name: string; hearts: number; note: string }[];
  memories: string[];
}

export interface CreateResult {
  name: string;
  pronoun: Pronoun;
  look: Look;
  assist: Assist;
}

export interface Companion {
  name: string;
  icon: IconName;
  text: string;
  ready?: boolean;
}

const isTouch = () => document.body.classList.contains("touch");

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
        if (!e.repeat) finish();
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

/** Input that arrives this soon after a decision appears was aimed at the previous screen. */
const LOCKOUT_MS = 380;

/** Disables a button briefly so a carried-over key press or double-click can't trigger it. */
function armLater(button: HTMLButtonElement, focus = true) {
  button.disabled = true;
  setTimeout(() => {
    button.disabled = false;
    if (focus) button.focus({ preventScroll: true });
  }, LOCKOUT_MS);
}

/** A button with a rendered icon and a text label. */
function iconButton(label: string, name: IconName | null, cls: string, attrs: Record<string, unknown> = {}) {
  return h("button", { class: cls, type: "button", ...attrs }, name && icon(name), h("span", {}, label));
}

/** A settings switch: the whole row is the control, so the tap target is large. */
function switchRow(label: string, name: IconName, on: boolean, change: (on: boolean) => void) {
  const row = h(
    "button",
    { class: "setting switch-row", type: "button", role: "switch", "aria-checked": String(on) },
    icon(name, "ico row-ico"),
    h("span", { class: "setting-label" }, label),
    h("span", { class: "toggle", "aria-hidden": "true" }),
  );
  row.addEventListener("click", () => {
    const next = row.getAttribute("aria-checked") !== "true";
    row.setAttribute("aria-checked", String(next));
    change(next);
  });
  return row;
}

export class UI {
  readonly root: HTMLElement;
  private hudEl?: HTMLElement;
  private hudObserver?: ResizeObserver;
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
    preloadUi();
  }

  private clearLayer() {
    this.layer?.remove();
    this.layer = undefined;
    this.root.classList.remove("story-on");
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
    if (text) this.root.append(h("div", { class: "loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), text));
  }

  // ------------------------------------------------------------------ title
  title(hasSave: boolean): Promise<"new" | "continue" | "settings"> {
    return new Promise((resolve) => {
      const pick = (v: "new" | "continue" | "settings") => () => {
        this.onTap?.();
        resolve(v);
      };
      const actions = h(
        "div",
        { class: "title-actions" },
        hasSave && iconButton("Continue your life", "play", "btn teal big", { onclick: pick("continue"), "data-qa": "continue" }),
        iconButton(hasSave ? "Start a new life" : "Begin a life", hasSave ? null : "play", hasSave ? "btn ghost big" : "btn big", { onclick: pick("new"), "data-qa": "new" }),
        iconButton("Settings", "settings", "btn ghost", { onclick: pick("settings"), "data-qa": "settings" }),
      );
      this.setLayer(
        h(
          "div",
          { class: "title-screen fade-in" },
          h(
            "div",
            { class: "title-card" },
            h("div", { class: "title-kicker" }, "One life · one promise"),
            h("h1", { class: "title-logo" }, h("img", { src: `${UI_BASE}logo.webp`, alt: "Choice of Life", width: "936", height: "540", decoding: "async" })),
            h("p", { class: "title-tag" }, "Two kids bury a tin under a lighthouse and promise to open it together at seventy. Run the whole life in between, and choose what it becomes."),
            actions,
          ),
          h("div", { class: "title-foot" }, isTouch() ? "Swipe up or down to change lanes · tap to jump" : "↑ ↓ or W S to change lanes · Space to jump · Esc to pause"),
        ),
      );
    });
  }

  // ------------------------------------------------------------------ create
  create(initial: CreateResult, onChange: (r: CreateResult) => void): Promise<CreateResult | null> {
    return new Promise((resolve) => {
      const state: CreateResult = structuredClone(initial);
      const changed = () => onChange(structuredClone(state));
      const group = <T,>(labelText: string, values: T[], current: () => T, set: (v: T) => void, render: (v: T) => Child, cls: string, label: (v: T) => string) => {
        const box = h("div", { class: cls === "swatch" ? "swatches" : "chips", role: "radiogroup", "aria-label": labelText });
        const select = (index: number, focus: boolean) => {
          const v = values[index];
          set(v);
          // Roving tabindex: the group is one Tab stop; arrow keys move inside it.
          buttons.forEach((x, i) => {
            x.setAttribute("aria-checked", String(i === index));
            x.tabIndex = i === index ? 0 : -1;
          });
          if (focus) buttons[index].focus();
          this.onTap?.();
          changed();
        };
        const buttons = values.map((v, i) => {
          // Chips are named by their visible text; colour swatches need a spoken name.
          const b = h("button", { class: cls, type: "button", role: "radio", "aria-label": cls === "swatch" ? label(v) : undefined, "aria-checked": String(current() === v), tabindex: current() === v ? "0" : "-1" }, render(v));
          if (cls === "swatch") b.style.setProperty("--swatch", String(v));
          b.addEventListener("click", () => select(i, false));
          b.addEventListener("keydown", (e) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (step) select((i + step + values.length) % values.length, true);
            else if (e.key === "Home") select(0, true);
            else if (e.key === "End") select(values.length - 1, true);
            else return;
            e.preventDefault();
          });
          return b;
        });
        box.append(...buttons);
        return h("div", { class: "field" }, h("div", { class: "label", "aria-hidden": "true" }, labelText), box);
      };
      const name = h("input", { type: "text", maxlength: "16", value: state.name, "aria-label": "Your name", autocomplete: "off", enterkeyhint: "done", spellcheck: "false" }) as HTMLInputElement;
      name.addEventListener("input", () => {
        state.name = name.value;
      });
      name.addEventListener("keydown", (e) => {
        if (e.key === "Enter") name.blur();
      });
      const begin = iconButton("Begin this life", "play", "btn", {
        "data-qa": "begin",
        onclick: () => {
          this.onTap?.();
          resolve(structuredClone(state));
        },
      });
      const back = iconButton("Back", "back", "btn ghost", { onclick: () => resolve(null), "aria-label": "Back to the title" });
      const panel = h(
        "div",
        { class: "create sheet pop-in", role: "dialog", "aria-label": "Create your character" },
        h("div", { class: "sheet-head" }, h("h2", {}, "Who are you?"), h("p", { class: "lead" }, "Your look never changes your chances. It just makes this life yours.")),
        h(
          "div",
          { class: "sheet-body" },
          h("div", { class: "field" }, h("label", {}, "Name", name)),
          group<Pronoun>("Pronouns", ["she", "he", "they"], () => state.pronoun, (v) => (state.pronoun = v), (v) => ({ she: "she / her", he: "he / him", they: "they / them" })[v], "chip", (v) => `${v} pronouns`),
          group("Skin", SKIN_TONES, () => state.look.skin, (v) => (state.look.skin = v), () => null, "swatch", (v) => `Skin tone ${SKIN_TONES.indexOf(v) + 1}`),
          group<HairStyle>("Hair", HAIR_STYLES, () => state.look.hairStyle, (v) => (state.look.hairStyle = v), (v) => v, "chip", (v) => `${v} hair`),
          group("Hair colour", HAIR_COLOURS, () => state.look.hair, (v) => (state.look.hair = v), () => null, "swatch", (v) => `Hair colour ${HAIR_COLOURS.indexOf(v) + 1}`),
          group("Favourite colour", FAVOURITE_COLOURS, () => state.look.colour, (v) => (state.look.colour = v), () => null, "swatch", (v) => `Favourite colour ${FAVOURITE_COLOURS.indexOf(v) + 1}`),
          group<Assist>("Pace", ["relaxed", "standard", "brisk"], () => state.assist, (v) => (state.assist = v), (v) => ({ relaxed: "Relaxed", standard: "Standard", brisk: "Brisk" })[v], "chip", (v) => `${v} pace`),
          h("p", { class: "note" }, "Relaxed is slower with fewer obstacles. You can't lose either way."),
        ),
        h("div", { class: "sheet-actions" }, back, begin),
      );
      this.setLayer(h("div", { class: "create-wrap fade-in" }, panel));
      changed();
      // Don't open the on-screen keyboard on phones; desktop gets the name field ready to type.
      if (!isTouch()) setTimeout(() => name.focus(), 50);
      else setTimeout(() => begin.focus({ preventScroll: true }), 50);
    });
  }

  // ------------------------------------------------------------------ chapter card
  chapterCard(chapter: ChapterDef, subtitle: string, intro: string): Promise<void> {
    const el = this.setLayer(
      h(
        "div",
        { class: "chapter-card fade-in", "data-qa": "chapter-card" },
        h(
          "div",
          { class: "chapter-inner" },
          h("div", { class: "num" }, chapter.number),
          h("h1", {}, chapter.title),
          h("div", { class: "sub" }, subtitle),
          intro && h("p", { class: "intro" }, intro),
          iconButton(chapter.index === 0 ? "Remember" : "Begin", "play", "btn big"),
          chapter.hazards.length > 0 &&
            h("div", { class: "controls" }, isTouch() ? "Swipe up or down to change lanes · tap to jump" : "↑ ↓ or W S to change lanes · Space to jump · Esc to pause"),
        ),
      ),
    );
    return waitForAdvance(el).then(() => this.clearLayer());
  }

  // ------------------------------------------------------------------ HUD
  showHud(show: boolean) {
    if (!show) {
      this.hudObserver?.disconnect();
      this.hudObserver = undefined;
      this.hudEl?.remove();
      this.hudEl = undefined;
      this.chapterKey = "";
      this.companionsKey = "";
      return;
    }
    if (this.hudEl) return;
    const scores = h("div", { class: "hud-scores", role: "group", "aria-label": "Your scores" });
    for (const key of ["health", "happiness", "money"] as ScoreKey[]) {
      const el = h(
        "div",
        { class: `score ${key}`, title: SCORE_NAME[key] },
        icon(key, "ico score-ico"),
        h("span", { class: "value" }, "0"),
        h("span", { class: "meter", title: `${PICKUPS_PER_POINT} small good things make a point` }, h("i", {})),
        h("span", { class: "sr-only" }, SCORE_NAME[key]),
      );
      this.scoresEl.set(key, el);
      scores.append(el);
    }
    this.chapterEl = h("div", { class: "hud-chapter" });
    this.companionsEl = h("div", { class: "companions" });
    this.timelineEl = h("div", { class: "timeline", "aria-hidden": "true" });
    for (let i = 1; i <= 7; i++) this.timelineEl.append(h("div", { class: "seg" }, h("div", { class: "fill" })));
    this.toastsEl = h("div", { class: "toasts", "aria-live": "polite" });
    const pause = h("button", { class: "icon-btn", type: "button", "aria-label": "Pause and settings", onclick: () => this.onPause?.() }, icon("pause", "ico big-ico"));
    const pad = h(
      "div",
      { class: "touch-pad" },
      h(
        "div",
        { class: "group lanes" },
        h("button", { type: "button", "aria-label": "Move up a lane", onclick: () => this.touchHandlers?.up() }, icon("up", "ico pad-ico")),
        h("button", { type: "button", "aria-label": "Move down a lane", onclick: () => this.touchHandlers?.down() }, icon("down", "ico pad-ico")),
      ),
      h("div", { class: "group" }, h("button", { type: "button", "aria-label": "Jump", onclick: () => this.touchHandlers?.jump() }, icon("jump", "ico pad-ico"))),
    );
    const top = h("div", { class: "hud-top" }, h("div", { class: "hud-left" }, scores, h("div", { class: "hud-meta" }, this.chapterEl, this.companionsEl)), pause);
    this.hudEl = h("div", { class: "hud" }, top, this.toastsEl, this.timelineEl, pad);
    // Toasts always appear just below the top bar, however it wraps on this screen.
    const hud = this.hudEl;
    this.hudObserver = new ResizeObserver(() => hud.style.setProperty("--hud-h", `${top.offsetHeight}px`));
    this.hudObserver.observe(top);
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

  private chapterKey = "";
  private companionsKey = "";

  setChapter(title: string, age: number) {
    const key = `${title}|${age}`;
    if (!this.chapterEl || key === this.chapterKey) return;
    this.chapterKey = key;
    this.chapterEl.replaceChildren(h("span", { class: "t" }, title), h("span", { class: "age" }, `Age ${age}`));
  }

  setTimeline(chapter: number, progress: number, marks: number[] = []) {
    if (!this.timelineEl) return;
    this.timelineEl.querySelectorAll(".seg").forEach((seg, i) => {
      const index = i + 1;
      const fill = seg.querySelector(".fill") as HTMLElement;
      fill.style.width = index < chapter ? "100%" : index === chapter ? `${Math.round(progress * 100)}%` : "0%";
      seg.classList.toggle("now", index === chapter);
      if (index === chapter && seg.querySelectorAll(".mark").length !== marks.length) {
        seg.querySelectorAll(".mark").forEach((m) => m.remove());
        for (const m of marks) seg.append(h("i", { class: "mark", style: `left:${m * 100}%` }));
      }
      if (index !== chapter) seg.querySelectorAll(".mark").forEach((m) => m.remove());
    });
  }

  setCompanions(list: Companion[]) {
    const key = JSON.stringify(list);
    if (key === this.companionsKey) return;
    this.companionsKey = key;
    this.companionsEl?.replaceChildren(
      ...list.map((c) => h("div", { class: `companion ${c.ready === false ? "waiting" : ""}` }, icon(c.icon, "ico chip-ico"), h("span", {}, c.text))),
    );
  }

  toast(kind: string, text: string, style = "") {
    if (!this.toastsEl || this.root.classList.contains("story-on")) return;
    const t = h("div", { class: `toast ${style}` }, h("span", { class: "kind" }, kind), text);
    this.toastsEl.append(t);
    while (this.toastsEl.children.length > 2) this.toastsEl.firstElementChild?.remove();
    setTimeout(() => t.remove(), 3500);
  }

  /** A friendly first-time tip, bigger and longer than a toast. Returns whether it was shown. */
  hint(text: string): boolean {
    if (!this.hudEl || this.root.classList.contains("story-on")) return false;
    this.hudEl.querySelector(".hint")?.remove();
    const el = h("div", { class: "hint", role: "status" }, h("span", { class: "kind" }, "Tip"), text);
    this.hudEl.append(el);
    setTimeout(() => el.remove(), 5200);
    return true;
  }

  gust(dir: -1 | 1) {
    const el = h("div", { class: "gust" }, dir < 0 ? "Wind! ↑" : "Wind! ↓");
    this.hudEl?.append(el);
    setTimeout(() => el.remove(), 1100);
  }

  /** Clears transient HUD messages (a conversation is starting). */
  private quietHud() {
    this.toastsEl?.replaceChildren();
    this.hudEl?.querySelectorAll(".hint, .gust").forEach((n) => n.remove());
  }

  // ------------------------------------------------------------------ story
  private storyLayer(title?: string) {
    this.quietHud();
    const el = h("div", { class: "story", "data-qa": "story", "aria-live": "polite" }, title ? h("div", { class: "story-title" }, title) : null);
    const layer = this.setLayer(el);
    this.root.classList.add("story-on");
    return layer;
  }

  async say(lines: Line[], title: string | undefined, nameFor: (who: Line["who"]) => string, onLine?: (line: Line) => void) {
    const layer = this.storyLayer(title);
    for (const line of lines) {
      onLine?.(line);
      const box = h(
        "div",
        { class: `line ${line.who === "narrator" ? "narrator" : ""}`, "data-qa": "line", role: "button", tabindex: "0", "aria-label": `${line.who === "narrator" ? "" : `${nameFor(line.who)}: `}${line.text}. Tap to continue.` },
        line.who !== "narrator" && h("span", { class: "who" }, nameFor(line.who)),
        h("span", { class: "text" }, line.text),
        h("span", { class: "next", "aria-hidden": "true" }, isTouch() ? "tap" : "▶"),
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
      const shownAt = performance.now();
      const ready = () => performance.now() - shownAt >= LOCKOUT_MS;
      let chosen = false;
      const pick = (id: string) => {
        if (chosen || !ready()) return;
        chosen = true;
        window.removeEventListener("keydown", onKey);
        this.onTap?.();
        resolve(id);
      };
      const cards = options.map((o, i) => {
        const card = h(
          "button",
          { class: `card ${o.star ? "starred" : ""}`, type: "button", disabled: !!o.locked, "data-qa": `option-${o.id}`, style: `animation-delay:${i * 70}ms` },
          h("span", { class: "key", "aria-hidden": "true" }, String(i + 1)),
          h("span", { class: "label" }, o.label),
          o.detail && h("span", { class: "detail" }, o.detail),
          effectChips(o.effects),
          o.star && h("span", { class: "star" }, "★ This feels like you. +1 Happiness"),
          o.because && h("span", { class: "because" }, `↺ ${o.because}`),
          o.hint && h("span", { class: "hint-line" }, `→ ${o.hint}`),
          o.locked && h("span", { class: "lock" }, `🔒 ${o.locked}`),
        );
        card.addEventListener("click", () => !o.locked && pick(o.id));
        return card;
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.repeat) return;
        const n = Number(e.key);
        if (n >= 1 && n <= options.length && !options[n - 1].locked) pick(options[n - 1].id);
      };
      window.addEventListener("keydown", onKey);
      const row = h("div", { class: "cards", role: "group", "aria-label": prompt }, ...cards);
      // In the landscape card row, the right-edge fade hints at more cards until you reach the end.
      const edge = () => row.classList.toggle("more", row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
      row.addEventListener("scroll", edge, { passive: true });
      layer.append(h("div", { class: "choices" }, h("div", { class: "prompt" }, prompt), row));
      requestAnimationFrame(edge);
      // Focus the first card only once the lockout has passed, so a held Space/Enter can't choose.
      setTimeout(() => (cards.find((c) => !c.hasAttribute("disabled")) as HTMLElement | undefined)?.focus({ preventScroll: true }), LOCKOUT_MS);
      if (this.autoAdvance && available.length === 0) resolve(options[0].id);
    });
  }

  endStory() {
    if (this.layer?.classList.contains("story")) this.clearLayer();
  }

  // ------------------------------------------------------------------ summaries & modals
  summary(chapter: ChapterDef, lines: string[], outro: string[], keepsakes: number, deltas: Scores, status: string[] = []): Promise<void> {
    const chips = (["health", "happiness", "money"] as ScoreKey[]).map((k) =>
      h("span", { class: `sum-chip ${k} ${deltas[k] < 0 ? "down" : ""}` }, icon(k, "ico chip-ico"), h("b", {}, `${deltas[k] >= 0 ? "+" : ""}${deltas[k]}`), h("span", { class: "sr-only" }, SCORE_NAME[k])),
    );
    const el = this.setLayer(
      h(
        "div",
        { class: "summary fade-in", "data-qa": "summary" },
        h(
          "div",
          { class: "panel sheet pop-in", role: "dialog", "aria-label": `${chapter.title} complete` },
          h(
            "div",
            { class: "sheet-body" },
            h("div", { class: "kicker" }, `${chapter.number} · complete`),
            h("h2", {}, chapter.title),
            h("div", { class: "row" }, ...chips, h("span", { class: "sum-chip keep" }, icon("keepsake", "ico chip-ico"), h("b", {}, `${keepsakes}/3`), h("span", { class: "sr-only" }, "keepsakes"))),
            lines.length > 0 && h("ul", {}, ...lines.map((l) => h("li", {}, l))),
            outro.length > 0 && h("div", { class: "outro" }, ...outro.map((o) => h("p", {}, o))),
            status.length > 0 && h("div", { class: "status" }, h("div", { class: "kicker" }, "How you're doing"), ...status.map((o) => h("p", {}, o))),
          ),
          h("div", { class: "sheet-actions" }, iconButton("Continue", "play", "btn", { "data-qa": "continue-chapter" })),
        ),
      ),
    );
    const button = el.querySelector("[data-qa=continue-chapter]") as HTMLButtonElement;
    armLater(button);
    return new Promise((resolve) => {
      button.addEventListener("click", () => {
        this.onTap?.();
        this.clearLayer();
        resolve();
      });
      if (this.autoAdvance) setTimeout(() => button.click(), LOCKOUT_MS + 60);
    });
  }

  message(title: string, text: string, button = "Continue"): Promise<void> {
    const el = this.setLayer(
      h(
        "div",
        { class: "modal fade-in", "data-qa": "message" },
        h("div", { class: "panel pop-in", role: "alertdialog", "aria-modal": "true", "aria-label": title }, h("h2", {}, title), h("p", {}, text), h("div", { class: "stack" }, iconButton(button, "play", "btn"))),
      ),
    );
    const b = el.querySelector("button") as HTMLButtonElement;
    armLater(b);
    return new Promise((resolve) => {
      b.addEventListener("click", () => {
        this.clearLayer();
        resolve();
      });
      if (this.autoAdvance) setTimeout(() => b.click(), LOCKOUT_MS + 60);
    });
  }

  pauseMenu(prefs: Prefs, onPrefs: (p: Prefs) => void, canQuit: boolean, journal?: () => JournalData): Promise<"resume" | "quit"> {
    const opener = document.activeElement as HTMLElement | null;
    return new Promise((resolve) => {
      const p = { ...prefs };
      const update = () => onPrefs({ ...p });
      const volume = h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(p.volume), "aria-label": "Volume" }) as HTMLInputElement;
      const setFill = () => volume.style.setProperty("--fill", `${Math.round(Number(volume.value) * 100)}%`);
      setFill();
      volume.addEventListener("input", () => {
        p.volume = Number(volume.value);
        setFill();
        update();
      });
      const close = (v: "resume" | "quit") => {
        window.removeEventListener("keydown", onKey);
        el.remove();
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        resolve(v);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.code === "Escape" && !this.root.querySelector(".journal-modal")) close("resume");
      };
      window.addEventListener("keydown", onKey);
      const title = canQuit ? "Paused" : "Settings";
      const el = h(
        "div",
        { class: "modal sheet-modal pause-modal fade-in" },
        h(
          "div",
          { class: "panel sheet settings-sheet pop-in", role: "dialog", "aria-modal": "true", "aria-label": title },
          h(
            "div",
            { class: "sheet-head with-close" },
            icon(canQuit ? "pause" : "settings", "ico head-ico"),
            h("h2", {}, title),
            h("button", { class: "close-btn", type: "button", "aria-label": "Close", onclick: () => close("resume") }, icon("close", "ico")),
          ),
          h(
            "div",
            { class: "settings-grid" },
            h(
              "div",
              { class: "sheet-body settings-list" },
              h("label", { class: "setting slider-row" }, icon("volume", "ico row-ico"), h("span", { class: "setting-label" }, "Volume"), volume),
              switchRow("Music", "music", p.music, (v) => {
                p.music = v;
                update();
              }),
              switchRow("Reduced motion", "motion", p.reducedMotion, (v) => {
                p.reducedMotion = v;
                update();
              }),
              switchRow("Larger text", "text", p.largeText, (v) => {
                p.largeText = v;
                update();
              }),
              switchRow("High quality graphics", "quality", p.quality === "high", (v) => {
                p.quality = v ? "high" : "low";
                update();
              }),
            ),
            h(
              "div",
              { class: "sheet-actions stacked" },
              iconButton(canQuit ? "Resume" : "Done", "play", "btn teal", { "data-qa": "resume", onclick: () => close("resume") }),
              journal && iconButton("Your life so far", "journal", "btn ghost", { "data-qa": "journal", onclick: () => this.journal(journal()) }),
              canQuit && iconButton("Save and return to title", "home", "btn ghost", { "data-qa": "quit", onclick: () => close("quit") }),
            ),
          ),
        ),
      );
      this.root.append(el);
      setTimeout(() => (el.querySelector("[data-qa=resume]") as HTMLButtonElement | null)?.focus({ preventScroll: true }), 30);
    });
  }

  /** The people who matter and what this life remembers, from the pause menu. */
  journal(data: JournalData) {
    this.root.querySelector(".journal-modal")?.remove();
    const opener = document.activeElement as HTMLElement | null;
    const heart = (n: number) => (n <= 0 ? "·" : "♥".repeat(n));
    const close = () => {
      window.removeEventListener("keydown", onKey, true);
      el.remove();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    };
    const el = h(
      "div",
      { class: "modal sheet-modal journal-modal fade-in" },
      h(
        "div",
        { class: "panel sheet journal pop-in", role: "dialog", "aria-modal": "true", "aria-label": "Your life so far" },
        h("div", { class: "sheet-head with-close" }, icon("journal", "ico head-ico"), h("h2", {}, "Your life so far"), h("button", { class: "close-btn", type: "button", "aria-label": "Close", onclick: close }, icon("close", "ico"))),
        h(
          "div",
          { class: "sheet-body" },
          h("div", { class: "kicker" }, "The people"),
          h("ul", { class: "people" }, ...data.people.map((p) => h("li", {}, h("b", {}, p.name), h("span", { class: "hearts", "aria-label": `${p.hearts} of 4 hearts` }, heart(p.hearts)), h("span", { class: "note" }, p.note)))),
          h("div", { class: "kicker" }, "What you remember"),
          h("ul", { class: "memories" }, ...(data.memories.length ? data.memories : ["Nothing yet. It's early."]).map((m) => h("li", {}, m))),
        ),
        h("div", { class: "sheet-actions" }, iconButton("Back", "back", "btn teal", { onclick: close })),
      ),
    );
    window.addEventListener("keydown", onKey, true);
    this.root.append(el);
    setTimeout(() => (el.querySelector(".sheet-actions button") as HTMLButtonElement).focus({ preventScroll: true }), 30);
  }

  letter(lines: string[]): Promise<void> {
    const body = lines.slice(0, -1);
    const sign = lines[lines.length - 1];
    const el = this.setLayer(
      h(
        "div",
        { class: "letter-wrap fade-in", "data-qa": "letter" },
        h("div", { class: "letter", role: "document", tabindex: "0", "aria-label": "Nana's letter" }, ...body.map((l) => h("p", {}, l)), h("p", { class: "sign" }, `— ${sign}`)),
        h("div", { class: "actions" }, iconButton("Fold the letter", "letter", "btn")),
      ),
    );
    const b = el.querySelector(".actions button") as HTMLButtonElement;
    armLater(b, false);
    setTimeout(() => (el.querySelector(".letter") as HTMLElement).focus({ preventScroll: true }), 40);
    return new Promise((resolve) => {
      b.addEventListener("click", () => {
        this.clearLayer();
        resolve();
      });
      if (this.autoAdvance) setTimeout(() => b.click(), LOCKOUT_MS + 60);
    });
  }

  book(book: Book, end: Finale): Promise<void> {
    const scoreCards = book.scores.map((s) =>
      h("div", { class: `score-card ${s.key}` }, icon(s.key, "ico score-card-ico"), h("div", { class: "big" }, String(s.value)), h("div", { class: "name" }, SCORE_NAME[s.key]), h("p", {}, s.line)),
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
          h("div", { class: "actions" }, iconButton("Live another life", "play", "btn big", { "data-qa": "again" })),
        ),
      ),
    );
    const b = el.querySelector("[data-qa=again]") as HTMLButtonElement;
    armLater(b, false);
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
    if (v) box.append(h("span", { class: `fx-chip ${key} ${v < 0 ? "down" : ""}` }, icon(key, "ico fx-ico"), `${SCORE_NAME[key]} ${v > 0 ? "+" : ""}${v}`));
  }
  if (fx.bonds) {
    for (const [k, v] of Object.entries(fx.bonds) as [BondKey, number][]) {
      if (v) box.append(h("span", { class: `fx-chip bond ${v < 0 ? "down" : ""}` }, `${BOND_NAME[k]} ${v > 0 ? "♥".repeat(Math.min(3, v)) : "💔"}`));
    }
  }
  return box;
}

export const nameOf = (who: Line["who"], you: string) => (who === "you" ? you : who === "narrator" ? "" : DISPLAY_NAME[who]);
