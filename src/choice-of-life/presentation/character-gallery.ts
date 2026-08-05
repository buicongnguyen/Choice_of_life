import type { CareerId, CareerSeason } from "../core/career";
import {
  CHARACTER_JOB_WARDROBES,
  createCharacterModel,
  createCompanionModel,
  createUniqueNpcCharacterModels,
  renderCharacterMarkup,
  renderCompanionMarkup,
  type CharacterDirection,
  type CharacterExpression,
  type CharacterGender,
  type CharacterHairColorId,
  type CharacterHairStyleId,
  type CharacterHeritage,
  type CharacterLifeStage,
  type CharacterModel,
  type CharacterMotion,
  type CharacterSkinToneId,
  type CompanionExpression,
  type CompanionMotion,
  type CompanionRequest,
} from "./character-system";
import "./polish.css";
import "./character-gallery.css";

export interface CharacterGalleryOptions {
  readonly onClose: () => void;
}

export interface CharacterGalleryController {
  dispose(): void;
}

type GalleryMode = "idle" | "walk" | "talk" | "smile";

interface GalleryState {
  direction: CharacterDirection;
  season: CareerSeason;
  mode: GalleryMode;
  walkFrame: 0 | 1;
}

interface StageExample {
  readonly label: string;
  readonly ageNote: string;
  readonly lifeStage: CharacterLifeStage;
  readonly heritage: CharacterHeritage;
  readonly femaleHair: CharacterHairStyleId;
  readonly maleHair: CharacterHairStyleId;
  readonly hairColor: CharacterHairColorId;
  readonly skinTone: CharacterSkinToneId;
  readonly clothingPaletteId:
    | "sunrise"
    | "meadow"
    | "ocean"
    | "berry"
    | "coral-teal"
    | "mint-navy"
    | "sunflower-denim"
    | "rust-ocean";
}

interface JobExample {
  readonly id: CareerId;
  readonly label: string;
  readonly icon: string;
}

const STAGE_EXAMPLES: readonly StageExample[] = Object.freeze([
  Object.freeze({
    label: "Baby",
    ageNote: "First year",
    lifeStage: "newborn",
    heritage: "asian",
    femaleHair: "twin-buns",
    maleHair: "short-soft",
    hairColor: "black",
    skinTone: "golden",
    clothingPaletteId: "coral-teal",
  }),
  Object.freeze({
    label: "Child",
    ageNote: "School years",
    lifeStage: "child",
    heritage: "western",
    femaleHair: "braided-pigtails",
    maleHair: "curly-crown",
    hairColor: "auburn",
    skinTone: "peach",
    clothingPaletteId: "sunflower-denim",
  }),
  Object.freeze({
    label: "Teen",
    ageNote: "Growing up",
    lifeStage: "teen",
    heritage: "black",
    femaleHair: "high-ponytail",
    maleHair: "curly-crop",
    hairColor: "dark-brown",
    skinTone: "deep-brown",
    clothingPaletteId: "mint-navy",
  }),
  Object.freeze({
    label: "Adult",
    ageNote: "Independent life",
    lifeStage: "adult",
    heritage: "middle-eastern",
    femaleHair: "wavy-bob",
    maleHair: "soft-undercut",
    hairColor: "warm-brown",
    skinTone: "tan",
    clothingPaletteId: "berry",
  }),
  Object.freeze({
    label: "Middle age",
    ageNote: "Experienced years",
    lifeStage: "middle-age",
    heritage: "asian",
    femaleHair: "classic-bun",
    maleHair: "side-part-crop",
    hairColor: "dark-brown",
    skinTone: "golden",
    clothingPaletteId: "meadow",
  }),
  Object.freeze({
    label: "Elder",
    ageNote: "Later life",
    lifeStage: "senior",
    heritage: "western",
    femaleHair: "silver-wave",
    maleHair: "silver-wave",
    hairColor: "silver",
    skinTone: "porcelain-warm",
    clothingPaletteId: "rust-ocean",
  }),
]);

const JOBS: readonly JobExample[] = Object.freeze([
  Object.freeze({ id: "teacher", label: "Teacher", icon: "📚" }),
  Object.freeze({ id: "chef", label: "Chef", icon: "🍳" }),
  Object.freeze({ id: "barista", label: "Barista", icon: "☕" }),
  Object.freeze({ id: "athlete", label: "Athlete", icon: "🏅" }),
  Object.freeze({ id: "entrepreneur", label: "Entrepreneur", icon: "💡" }),
  Object.freeze({ id: "engineer", label: "Engineer", icon: "⚙️" }),
  Object.freeze({ id: "software-engineer", label: "Software engineer", icon: "💻" }),
  Object.freeze({ id: "manager", label: "Manager", icon: "📋" }),
  Object.freeze({ id: "financial-analyst", label: "Financial analyst", icon: "📈" }),
  Object.freeze({ id: "artist", label: "Artist", icon: "🎨" }),
  Object.freeze({ id: "police", label: "Police officer", icon: "🛡️" }),
  Object.freeze({ id: "lawyer", label: "Lawyer", icon: "⚖️" }),
  Object.freeze({ id: "ceo", label: "CEO", icon: "🏢" }),
  Object.freeze({ id: "doctor", label: "Doctor", icon: "🩺" }),
  Object.freeze({ id: "nurse", label: "Nurse", icon: "🩹" }),
  Object.freeze({ id: "farmer", label: "Farmer", icon: "🌾" }),
  Object.freeze({ id: "dancer", label: "Dancer", icon: "🎵" }),
  Object.freeze({ id: "gym-trainer", label: "Gym trainer", icon: "🏋️" }),
  Object.freeze({ id: "army", label: "Army", icon: "🎖️" }),
]);

const NPC_REQUESTS = Object.freeze([
  Object.freeze({ characterId: "npc-mei", label: "Mei, neighbourhood baker", gender: "female" as const, heritage: "asian" as const, lifeStage: "adult" as const, seed: "gallery-mei", jobId: "chef" as const }),
  Object.freeze({ characterId: "npc-jordan", label: "Jordan, art club friend", gender: "male" as const, heritage: "black" as const, lifeStage: "young-adult" as const, seed: "gallery-jordan", jobId: "artist" as const }),
  Object.freeze({ characterId: "npc-sofia", label: "Sofia, local teacher", gender: "female" as const, heritage: "western" as const, lifeStage: "middle-age" as const, seed: "gallery-sofia", jobId: "teacher" as const }),
  Object.freeze({ characterId: "npc-amir", label: "Amir, software mentor", gender: "male" as const, heritage: "middle-eastern" as const, lifeStage: "adult" as const, seed: "gallery-amir", jobId: "software-engineer" as const }),
  Object.freeze({ characterId: "npc-nia", label: "Nia, fitness coach", gender: "female" as const, heritage: "black" as const, lifeStage: "adult" as const, seed: "gallery-nia", jobId: "gym-trainer" as const }),
  Object.freeze({ characterId: "npc-kenji", label: "Kenji, community doctor", gender: "male" as const, heritage: "asian" as const, lifeStage: "middle-age" as const, seed: "gallery-kenji", jobId: "doctor" as const }),
  Object.freeze({ characterId: "npc-elena", label: "Elena, farm owner", gender: "female" as const, heritage: "western" as const, lifeStage: "middle-age" as const, seed: "gallery-elena", jobId: "farmer" as const }),
  Object.freeze({ characterId: "npc-darius", label: "Darius, cafe regular", gender: "male" as const, heritage: "black" as const, lifeStage: "senior" as const, seed: "gallery-darius", jobId: "barista" as const }),
]);

const COMPANIONS: readonly CompanionRequest[] = Object.freeze([
  Object.freeze({ companionId: "gallery-cat-mochi", name: "Mochi", kind: "cat", coatId: "ginger-tabby", seed: "gallery-mochi" }),
  Object.freeze({ companionId: "gallery-cat-pepper", name: "Pepper", kind: "cat", coatId: "tuxedo", seed: "gallery-pepper" }),
  Object.freeze({ companionId: "gallery-dog-bori", name: "Bori", kind: "dog", coatId: "brown-white-dog", seed: "gallery-bori" }),
  Object.freeze({ companionId: "gallery-dog-sunny", name: "Sunny", kind: "dog", coatId: "golden-dog", seed: "gallery-sunny" }),
]);

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function characterState(state: GalleryState): Readonly<{
  motion: CharacterMotion;
  expression: CharacterExpression;
}> {
  if (state.mode === "walk") {
    return Object.freeze({
      motion: state.walkFrame === 0 ? "walk-a" : "walk-b",
      expression: "neutral",
    });
  }
  return Object.freeze({
    motion: "idle",
    expression: state.mode === "talk" ? "talk" : state.mode === "smile" ? "smile" : "neutral",
  });
}

function companionState(state: GalleryState): Readonly<{
  motion: CompanionMotion;
  expression: CompanionExpression;
}> {
  if (state.mode === "walk") {
    return Object.freeze({
      motion: state.walkFrame === 0 ? "walk-a" : "walk-b",
      expression: "curious",
    });
  }
  return Object.freeze({
    motion: state.mode === "idle" ? "idle" : "sit",
    expression: state.mode === "smile" ? "happy" : state.mode === "talk" ? "curious" : "neutral",
  });
}

function actorMarkup(model: CharacterModel, compact = false): string {
  return `<span class="col-gallery__actor col-polish-actor col-polish-actor--character${compact ? " col-gallery__actor--compact" : ""}">${renderCharacterMarkup(model)}</span>`;
}

function stageModel(
  example: StageExample,
  gender: CharacterGender,
  state: GalleryState,
): CharacterModel {
  const pose = characterState(state);
  return createCharacterModel({
    characterId: `gallery-${gender}-${example.lifeStage}`,
    label: `${example.label}, ${gender}, ${titleCase(example.heritage)} appearance`,
    gender,
    heritage: example.heritage,
    lifeStage: example.lifeStage,
    direction: state.direction,
    motion: pose.motion,
    expression: pose.expression,
    season: state.season,
    seed: `gallery-${gender}-${example.lifeStage}`,
    appearance: {
      skinToneId: example.skinTone,
      hairStyleId: gender === "female" ? example.femaleHair : example.maleHair,
      hairColorId: example.hairColor,
      clothingPaletteId: example.clothingPaletteId,
      detailId: example.lifeStage === "senior" ? "round-glasses" : example.lifeStage === "teen" ? "friendship-pin" : "none",
    },
  });
}

function renderStageSection(gender: CharacterGender, state: GalleryState): string {
  const models = STAGE_EXAMPLES.map((example) => ({ example, model: stageModel(example, gender, state) }));
  const heading = gender === "female" ? "Female characters" : "Male characters";
  const description = gender === "female"
    ? "Female silhouettes, hairstyles, clothing colours, and life-stage proportions stay distinct."
    : "Male silhouettes, hairstyles, clothing colours, and life-stage proportions stay distinct.";
  return `<section class="col-gallery__section col-gallery__section--gender" aria-labelledby="col-gallery-${gender}-heading">
    <div class="col-gallery__section-heading">
      <div>
        <p class="col-gallery__eyebrow">Life-stage lineup</p>
        <h2 id="col-gallery-${gender}-heading">${heading}</h2>
        <p>${description}</p>
      </div>
      <span class="col-gallery__gender-badge col-gallery__gender-badge--${gender}">${gender === "female" ? "Female" : "Male"}</span>
    </div>
    <div class="col-gallery__stage-grid">
      ${models.map(({ example, model }) => `<article class="col-gallery__card col-gallery__card--stage">
        <div class="col-gallery__preview">${actorMarkup(model)}</div>
        <div class="col-gallery__card-copy">
          <h3>${example.label}</h3>
          <p>${example.ageNote} · ${titleCase(example.heritage)}</p>
          <div class="col-gallery__trait-row">
            <span>${titleCase(model.appearance.hairStyleId)}</span>
            <span>${titleCase(model.appearance.clothingPaletteId)}</span>
          </div>
        </div>
      </article>`).join("")}
    </div>
  </section>`;
}

function jobModel(
  job: JobExample,
  gender: CharacterGender,
  index: number,
  state: GalleryState,
): CharacterModel {
  const pose = characterState(state);
  const heritages: readonly CharacterHeritage[] = ["asian", "western", "black", "middle-eastern"];
  return createCharacterModel({
    characterId: `gallery-job-${job.id}-${gender}`,
    label: `${gender === "female" ? "Female" : "Male"} ${job.label}, ${state.season} uniform`,
    gender,
    heritage: heritages[(index + (gender === "male" ? 1 : 0)) % heritages.length] as CharacterHeritage,
    lifeStage: index % 4 === 0 ? "middle-age" : "adult",
    direction: state.direction,
    motion: pose.motion,
    expression: pose.expression,
    season: state.season,
    seed: `gallery-job-${job.id}-${gender}`,
    jobId: job.id,
  });
}

function renderJobSection(state: GalleryState): string {
  return `<section class="col-gallery__section" aria-labelledby="col-gallery-jobs-heading">
    <div class="col-gallery__section-heading">
      <div>
        <p class="col-gallery__eyebrow">Complete wardrobe</p>
        <h2 id="col-gallery-jobs-heading">19 career outfits</h2>
        <p>Every role has separate female and male examples, with standard and summer versions.</p>
      </div>
      <span class="col-gallery__count-badge">${state.season === "summer" ? "☀️ Summer" : "🧥 Standard"}</span>
    </div>
    <div class="col-gallery__job-grid">
      ${JOBS.map((job, index) => {
        const female = jobModel(job, "female", index, state);
        const male = jobModel(job, "male", index, state);
        const wardrobe = CHARACTER_JOB_WARDROBES[job.id][state.season];
        return `<article class="col-gallery__card col-gallery__card--job" data-job-id="${job.id}">
          <div class="col-gallery__job-title">
            <span aria-hidden="true">${job.icon}</span>
            <div><h3>${job.label}</h3><p>${wardrobe.label}</p></div>
          </div>
          <div class="col-gallery__preview col-gallery__preview--pair">
            <span class="col-gallery__paired-character"><span class="col-gallery__pair-label">Female</span>${actorMarkup(female, true)}</span>
            <span class="col-gallery__paired-character"><span class="col-gallery__pair-label">Male</span>${actorMarkup(male, true)}</span>
          </div>
        </article>`;
      }).join("")}
    </div>
  </section>`;
}

function renderNpcSection(state: GalleryState): string {
  const pose = characterState(state);
  const models = createUniqueNpcCharacterModels(NPC_REQUESTS.map((request) => ({
    ...request,
    direction: state.direction,
    motion: pose.motion,
    expression: pose.expression,
    season: state.season,
  })));
  return `<section class="col-gallery__section" aria-labelledby="col-gallery-npcs-heading">
    <div class="col-gallery__section-heading">
      <div>
        <p class="col-gallery__eyebrow">Distinct people</p>
        <h2 id="col-gallery-npcs-heading">Unique NPC examples</h2>
        <p>Deterministic appearance signatures keep recurring friends and neighbours recognisable.</p>
      </div>
      <span class="col-gallery__count-badge">8 unique looks</span>
    </div>
    <div class="col-gallery__npc-grid">
      ${models.map((model) => `<article class="col-gallery__card col-gallery__card--npc">
        <div class="col-gallery__preview">${actorMarkup(model)}</div>
        <div class="col-gallery__card-copy">
          <h3>${model.label.split(",")[0]}</h3>
          <p>${model.label.split(",").slice(1).join(",").trim()}</p>
          <div class="col-gallery__trait-row">
            <span>${titleCase(model.heritage)}</span>
            <span>${titleCase(model.appearance.hairStyleId)}</span>
          </div>
        </div>
      </article>`).join("")}
    </div>
  </section>`;
}

function renderCompanionSection(state: GalleryState): string {
  const pose = companionState(state);
  const models = COMPANIONS.map((request) => createCompanionModel({
    ...request,
    direction: state.direction,
    motion: pose.motion,
    expression: pose.expression,
  }));
  return `<section class="col-gallery__section" aria-labelledby="col-gallery-companions-heading">
    <div class="col-gallery__section-heading">
      <div>
        <p class="col-gallery__eyebrow">Family companions</p>
        <h2 id="col-gallery-companions-heading">Cats and dogs</h2>
        <p>Pets use the same fixed bottom-centre ground anchor as people.</p>
      </div>
    </div>
    <div class="col-gallery__companion-grid">
      ${models.map((model) => `<article class="col-gallery__card col-gallery__card--companion">
        <div class="col-gallery__preview col-gallery__preview--pet">
          <span class="col-gallery__actor col-gallery__actor--pet col-polish-actor col-polish-actor--pet">${renderCompanionMarkup(model)}</span>
        </div>
        <div class="col-gallery__card-copy"><h3>${model.name}</h3><p>${titleCase(model.coatId)} ${model.kind}</p></div>
      </article>`).join("")}
    </div>
  </section>`;
}

function renderContent(content: HTMLElement, state: GalleryState): void {
  content.innerHTML = [
    renderStageSection("female", state),
    renderStageSection("male", state),
    renderJobSection(state),
    renderNpcSection(state),
    renderCompanionSection(state),
  ].join("");
}

function optionButton(
  group: "direction" | "season" | "mode",
  value: string,
  label: string,
  active: boolean,
): string {
  return `<button class="col-gallery__option" type="button" data-gallery-${group}="${value}" aria-pressed="${active}">${label}</button>`;
}

function renderControlState(root: HTMLElement, state: GalleryState): void {
  root.querySelectorAll<HTMLElement>("[data-gallery-direction]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.galleryDirection === state.direction));
  });
  root.querySelectorAll<HTMLElement>("[data-gallery-season]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.gallerySeason === state.season));
  });
  root.querySelectorAll<HTMLElement>("[data-gallery-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.galleryMode === state.mode));
  });
}

function updateWalkFrames(root: HTMLElement, state: GalleryState): void {
  const nextMotion = state.walkFrame === 0 ? "walk-a" : "walk-b";
  root.querySelectorAll<HTMLElement>(".col-character[data-motion^=\"walk-\"]").forEach((character) => {
    character.classList.toggle("col-character--walk-a", nextMotion === "walk-a");
    character.classList.toggle("col-character--walk-b", nextMotion === "walk-b");
    character.dataset.motion = nextMotion;
  });
  root.querySelectorAll<HTMLElement>(".col-companion[data-motion^=\"walk-\"]").forEach((companion) => {
    companion.classList.toggle("col-companion--walk-a", nextMotion === "walk-a");
    companion.classList.toggle("col-companion--walk-b", nextMotion === "walk-b");
    companion.dataset.motion = nextMotion;
  });
}

export function mountCharacterGallery(
  host: HTMLElement,
  options: CharacterGalleryOptions,
): CharacterGalleryController {
  const state: GalleryState = {
    direction: "front",
    season: "standard",
    mode: "idle",
    walkFrame: 0,
  };
  const root = host.ownerDocument.createElement("section");
  root.className = "col-gallery";
  root.setAttribute("aria-labelledby", "col-gallery-heading");
  root.innerHTML = `<header class="col-gallery__header">
    <div>
      <p class="col-gallery__eyebrow">Phase 10 · Character studio</p>
      <h1 id="col-gallery-heading">Life, work, and friendship lineup</h1>
      <p>Compare consistent character proportions, diverse appearances, expressive poses, job uniforms, and companions.</p>
    </div>
    <button class="col-gallery__close" type="button" data-gallery-close aria-label="Close character gallery">Close</button>
  </header>
  <div class="col-gallery__toolbar" aria-label="Character preview controls">
    <fieldset class="col-gallery__control-group">
      <legend>Direction</legend>
      <div class="col-gallery__segmented">
        ${optionButton("direction", "front", "Front", true)}
        ${optionButton("direction", "left", "Left", false)}
        ${optionButton("direction", "right", "Right", false)}
        ${optionButton("direction", "back", "Back", false)}
      </div>
    </fieldset>
    <fieldset class="col-gallery__control-group">
      <legend>Action</legend>
      <div class="col-gallery__segmented">
        ${optionButton("mode", "idle", "Idle", true)}
        ${optionButton("mode", "walk", "Walk", false)}
        ${optionButton("mode", "talk", "Talk", false)}
        ${optionButton("mode", "smile", "Smile", false)}
      </div>
    </fieldset>
    <fieldset class="col-gallery__control-group">
      <legend>Job outfit</legend>
      <div class="col-gallery__segmented">
        ${optionButton("season", "standard", "Standard", true)}
        ${optionButton("season", "summer", "Summer", false)}
      </div>
    </fieldset>
  </div>
  <p class="col-gallery__status" data-gallery-status aria-live="polite">Showing front-facing, idle characters in standard outfits.</p>
  <div class="col-gallery__content" data-gallery-content></div>`;

  host.replaceChildren(root);
  const content = root.querySelector<HTMLElement>("[data-gallery-content]");
  const status = root.querySelector<HTMLElement>("[data-gallery-status]");
  if (!content || !status) throw new Error("Character gallery failed to create its content region");
  renderContent(content, state);

  const abortController = new AbortController();
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("button");
    if (!button || !root.contains(button)) return;
    if (button.hasAttribute("data-gallery-close")) {
      options.onClose();
      return;
    }

    const direction = button.dataset.galleryDirection as CharacterDirection | undefined;
    const season = button.dataset.gallerySeason as CareerSeason | undefined;
    const mode = button.dataset.galleryMode as GalleryMode | undefined;
    if (!direction && !season && !mode) return;
    if (direction) state.direction = direction;
    if (season) state.season = season;
    if (mode) {
      state.mode = mode;
      state.walkFrame = 0;
    }
    renderControlState(root, state);
    renderContent(content, state);
    status.textContent = `Showing ${state.direction}-facing, ${state.mode} characters in ${state.season} outfits.`;
  }, { signal: abortController.signal });

  const ownerWindow = host.ownerDocument.defaultView;
  const walkTimer = ownerWindow?.setInterval(() => {
    if (state.mode !== "walk") return;
    state.walkFrame = state.walkFrame === 0 ? 1 : 0;
    updateWalkFrames(root, state);
  }, 360);

  return Object.freeze({
    dispose(): void {
      if (walkTimer !== undefined) ownerWindow?.clearInterval(walkTimer);
      abortController.abort();
      root.remove();
    },
  });
}
