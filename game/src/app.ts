import * as THREE from "three";

import { audio } from "./audio/audio";
import { APPROACH, END_CLEAR, generateCourse, LANE_Z, type Course, type Lane } from "./game/course";
import { createLife, has } from "./game/life";
import { Runner, STEP, type RunnerEvent } from "./game/runner";
import { clearLife, loadLife, loadPrefs, saveLife, savePrefs, type Prefs } from "./game/save";
import { ageAt, CHAPTERS, FINALE, stageAt, stageSpeed } from "./game/story/chapters";
import { activeEncounters } from "./game/story/encounters";
import { book, finale } from "./game/story/ending";
import {
  advance,
  choose,
  closeChapter,
  collectKeepsake,
  collectLetter,
  hazardCost,
  incomeFor,
  lettersActive,
  optionViews,
  recover,
  runnerHit,
  runnerPickup,
  runnerStreak,
  peopleSoFar,
  startChapter,
  statusLines,
} from "./game/story/flow";
import { resolve, type AgeKey, type ChapterDef, type EncounterDef, type Line, type PersonId } from "./game/story/model";
import type { LifeState, ScoreKey, Scores } from "./game/types";
import { findNode, instance, loadManifest, readyAll } from "./render/assets";
import { CameraDirector } from "./render/camera";
import { DISPLAY_NAME, FAVOURITE_COLOURS, HAIR_COLOURS, personSpec, playerSpec, SKIN_TONES, type CharacterSpec } from "./render/cast";
import { Engine } from "./render/engine";
import { MOODS } from "./render/sky";
import { Particles, Rain } from "./render/fx";
import { disposeSprite, nameBubble } from "./render/label";
import { CRANK_RATIO } from "./render/gait";
import { LaneGlow } from "./render/lane";
import { createPerson, preloadSpecs, type Person } from "./render/people";
import { SpawnView } from "./render/spawns";
import { World } from "./render/world";
import { nameOf, UI, type CreateResult } from "./ui/ui";

type Mode = "title" | "create" | "card" | "run" | "story" | "finale";

interface Qa {
  ready: boolean;
  mode: () => Mode;
  life: () => LifeState | null;
  x: () => number;
  chapter: () => number;
  autopilot: boolean;
  policy: string;
  timeScale: number;
  events: string[];
  /** World position of the player's left foot and Biscuit's front paw (gait verification). */
  feet: () => { player?: { x: number; y: number }; dog?: { x: number; y: number }; speed: number } | null;
}

const DEFAULT_LOOK: CreateResult = {
  name: "Kai",
  pronoun: "they",
  look: { skin: SKIN_TONES[1], hair: HAIR_COLOURS[1], hairStyle: "short", colour: FAVOURITE_COLOURS[1] },
  assist: "standard",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WARM = ["kite", "home", "rebuild", "key", "study", "stay", "shop", "sofa", "share", "summer", "own", "warn", "family", "toast", "people", "juno", "room", "walks", "campaign", "story", "garden", "sail", "forgive", "thanks"];

export async function startGame(params: URLSearchParams) {
  const game = new Game(params);
  await game.boot();
}

class Game {
  private engine!: Engine;
  private director!: CameraDirector;
  private ui!: UI;
  private particles = new Particles();
  private rain = new Rain();
  private laneGlow = new LaneGlow();
  private glowZ = 0;
  private prefs: Prefs = loadPrefs();
  private life: LifeState | null = null;
  private mode: Mode = "title";
  private clock = new THREE.Clock();

  // Chapter runtime
  private chapter?: ChapterDef;
  private course?: Course;
  private runner?: Runner;
  private world?: World;
  private spawns?: SpawnView;
  private player?: Person;
  private playerAge?: AgeKey;
  private swapping = false;
  private bike?: THREE.Object3D;
  private biscuit?: Person;
  private sam?: Person;
  private npcs = new Map<string, Person[]>();
  private staged = new Set<string>();
  private pendingEncounter?: EncounterDef;
  private chapterStartScores: Scores = { health: 0, happiness: 0, money: 0 };
  private accumulator = 0;
  private input: { laneStep?: -1 | 1; jump?: boolean } = {};
  private focus = new THREE.Vector3();
  private titleScene?: THREE.Group;
  private previewPerson?: Person;
  private qa?: Qa;
  private paused = false;
  /** The place layout the current world was built for (re-laid out if a choice changes it). */
  private placesKey = "";
  private walkers: { person: Person; to: THREE.Vector3; speed: number }[] = [];
  /** The prologue and finale can't be paused or quit mid-scene. */
  private cutscene = false;
  /** Bumped on every teardown so late async work (people still loading) knows to drop itself. */
  private chapterToken = 0;
  private bikeParts: { node: THREE.Object3D; ratio: number }[] = [];
  private bikeSeatNode?: THREE.Object3D;
  private titleWorld?: World;
  private alpha = 0;
  /** "! Name" bubbles over people waiting ahead, by encounter id. */
  private bubbles = new Map<string, THREE.Sprite>();
  private hintsSeen = new Set<string>(readHints());
  private stagedSpeaker = new Map<string, PersonId | null>();
  private scratch = new THREE.Vector3();

  constructor(private params: URLSearchParams) {}

  async boot() {
    const canvas = document.getElementById("scene") as HTMLCanvasElement;
    try {
      this.engine = new Engine(canvas, { quality: this.params.get("q") === "low" ? "low" : this.prefs.quality });
    } catch (error) {
      const ui = document.getElementById("ui")!;
      ui.innerHTML = `<div class="modal"><div class="panel"><h2>3D graphics are unavailable</h2><p>Choice of Life needs WebGL. Try another browser, or turn on hardware acceleration in your browser's settings.</p></div></div>`;
      throw error;
    }
    this.director = new CameraDirector(this.engine.camera);
    this.ui = new UI(document.getElementById("ui")!);
    this.ui.onTap = () => {
      audio.unlock();
      audio.tap();
    };
    this.ui.onPause = () => void this.pause();
    this.ui.touchHandlers = { up: () => this.lane(-1), down: () => this.lane(1), jump: () => this.jump() };
    this.engine.scene.add(this.particles.points, this.rain.lines, this.laneGlow.mesh);
    this.engine.onLightning = () => audio.thunder();
    this.applyPrefs(this.prefs);
    this.bindInput(canvas);
    if (this.params.get("qa") === "1") this.setupQa();
    this.ui.loading("Loading Marigold Bay…");
    await loadManifest();
    requestAnimationFrame(() => this.frame());
    const start = this.params.get("start");
    if (this.qa && start !== null) {
      // QA: jump straight into a chapter with a synthetic life (art and flow review).
      this.life = createLife({ ...DEFAULT_LOOK, seed: Number(this.params.get("seed")) || 7 });
      this.life.flags = (this.params.get("flags") ?? "biscuit,letters,partner,kids,met_sam").split(",").filter(Boolean).sort();
      this.life.dream = "maker";
      this.life.spark = "maker";
      this.life.path = (this.params.get("path") as LifeState["path"]) ?? "uni";
      const mood = this.params.get("happiness");
      if (mood !== null) this.life.scores.happiness = Number(mood);
      this.ui.loading(null);
      this.qa.ready = true;
      await this.playFrom(Number(start), false);
      return;
    }
    await this.titleLoop();
  }

  // ======================================================================= input
  private bindInput(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat || this.mode !== "run" || this.paused) return;
      if (e.code === "ArrowUp" || e.code === "KeyW") this.lane(-1);
      else if (e.code === "ArrowDown" || e.code === "KeyS") this.lane(1);
      else if (e.code === "Space") {
        e.preventDefault();
        this.jump();
      } else if (e.code === "Escape" || e.code === "KeyP") void this.pause();
    });
    let start: { x: number; y: number; t: number } | null = null;
    // Touch UI shows from the first screen on touch devices, not only after a tap on the canvas.
    if (window.matchMedia?.("(pointer: coarse)").matches) document.body.classList.add("touch");
    document.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") document.body.classList.add("touch");
    });
    canvas.addEventListener("pointerdown", (e) => {
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!start || this.mode !== "run") return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx)) this.lane(dy < 0 ? -1 : 1);
      else if (performance.now() - start.t < 350) this.jump();
      start = null;
    });
    document.addEventListener("visibilitychange", () => {
      audio.setHidden(document.hidden);
      if (document.hidden && this.mode === "run" && !this.cutscene && !this.qa?.autopilot) void this.pause();
    });
  }

  /** A first-time tip, shown once per browser. */
  private hintOnce(id: string, text: string) {
    if (this.hintsSeen.has(id) || this.qa?.autopilot || this.cutscene) return;
    // Only count a tip as seen once it was actually on screen.
    if (!this.ui.hint(text)) return;
    this.hintsSeen.add(id);
    writeHints(this.hintsSeen);
  }

  private get touch() {
    return document.body.classList.contains("touch");
  }

  private lane(step: -1 | 1) {
    audio.unlock();
    this.input.laneStep = step;
  }

  private jump() {
    audio.unlock();
    this.input.jump = true;
  }

  private applyPrefs(p: Prefs) {
    this.prefs = p;
    savePrefs(p);
    audio.setVolume(p.volume);
    audio.setMusic(p.music);
    document.body.classList.toggle("reduced-motion", p.reducedMotion);
    document.body.classList.toggle("large-text", p.largeText);
    this.director.reducedMotion = p.reducedMotion;
    this.engine.reducedMotion = p.reducedMotion;
    document.body.classList.toggle("low-gfx", (this.params.get("q") === "low" ? "low" : p.quality) === "low");
    this.engine.setQuality(this.params.get("q") === "low" ? "low" : p.quality);
  }

  private async pause() {
    if (this.mode !== "run" || this.paused || this.cutscene) return;
    this.paused = true;
    const choice = await this.ui.pauseMenu(this.prefs, (p) => this.applyPrefs(p), true, () => ({
      people: peopleSoFar(this.life!),
      memories: this.life!.memories.filter((m) => m.kind !== "recovery").slice(-8).map((m) => m.text),
    }));
    this.paused = false;
    this.input = {};
    this.clock.getDelta();
    if (choice === "quit") {
      this.saveProgress();
      this.teardownChapter();
      this.ui.showHud(false);
      void this.titleLoop();
    }
  }

  // ======================================================================= main loop
  private frame() {
    const raw = Math.min(this.qa?.autopilot ? 0.2 : 0.05, this.clock.getDelta());
    const dt = this.paused ? 0 : raw * (this.qa?.timeScale ?? 1);
    if (this.mode === "run" && this.runner && !this.paused) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 60) {
        const input = this.qa?.autopilot ? this.autopilotInput() : this.input;
        this.input = {};
        for (const ev of this.runner.step(input)) this.onRunnerEvent(ev);
        this.accumulator -= STEP;
        steps++;
        if (this.mode !== "run") {
          this.accumulator = 0;
          break;
        }
      }
      if (this.runner) this.afterRunnerStep();
    }
    this.alpha = this.mode === "run" ? Math.min(1, this.accumulator / STEP) : 1;
    this.updateScene(dt);
    this.engine.render(dt);
    requestAnimationFrame(() => this.frame());
  }

  private updateScene(dt: number) {
    const t = this.engine.time;
    if (this.player && this.runner) {
      const r = this.runner;
      const p = this.player;
      // Render between the last two fixed simulation steps so motion is smooth at any refresh rate.
      const a = this.alpha;
      const rx = r.prevX + (r.x - r.prevX) * a;
      const ry = r.prevY + (r.y - r.prevY) * a;
      const rz = r.prevZ + (r.z - r.prevZ) * a;
      p.root.position.set(rx, ry, rz);
      if (this.bike) {
        this.bike.position.set(rx, ry, rz);
        this.bike.rotation.z = THREE.MathUtils.lerp(this.bike.rotation.z, (LANE_Z[r.lane] - r.z) * 0.12, 0.2);
        const spin = (r.speed * dt) / 0.33;
        for (const part of this.bikeParts) part.node.rotation.x += spin * part.ratio;
        const crank = this.bikeParts.find((part) => part.ratio !== 1);
        if (crank) p.pedal = crank.node.rotation.x;
        p.root.position.copy(this.bikeSeat());
      }
      p.speed = r.speed;
      p.lift = this.bike ? 0 : r.y;
      if (this.mode === "run" && this.chapter) {
        const stage = stageAt(this.chapter, r.x / this.chapter.length);
        p.anim = this.bike ? "bike" : r.speed < 0.3 ? "idle" : stage.mode === "crawl" ? "crawl" : stage.mode === "toddle" ? "toddle" : stage.mode === "walk" ? "walk" : "run";
        const target = Math.PI / 2 - (LANE_Z[r.lane] - r.z) * 0.18;
        p.root.rotation.y = THREE.MathUtils.lerp(p.root.rotation.y, target, 0.25);
      }
      this.focus.set(rx, 0, rz);
      this.glowZ += (LANE_Z[r.lane] - this.glowZ) * Math.min(1, dt * 14);
      this.laneGlow.update(rx, this.glowZ, 0.06, this.mode === "run" && !this.cutscene, 0.34, this.world?.laneGlowAt(rx));
      this.followCompanions(dt);
      if (this.world) {
        this.world.update(this.engine.camera.position.x, t);
        const sea = this.world.seaAt(r.x);
        this.engine.sea.mesh.visible = sea.shore !== null;
        if (sea.shore !== null) {
          this.engine.sea.mesh.position.y = sea.y;
          this.engine.sea.mesh.material.uniforms.shore.value = sea.shore;
        }
      }
      this.spawns?.update(dt, r.x, t);
    }
    for (const w of this.walkers) {
      const d = w.to.clone().sub(w.person.root.position);
      const dist = d.length();
      if (dist < 0.05) {
        w.person.anim = "idle";
        w.person.face(-Math.PI / 2 + 0.5);
        continue;
      }
      w.person.anim = "run";
      w.person.speed = w.speed;
      w.person.face(Math.atan2(d.x, d.z));
      d.normalize();
      w.person.root.position.addScaledVector(d, Math.min(dist, w.speed * dt));
    }
    this.walkers = this.walkers.filter((w) => w.person.root.position.distanceTo(w.to) >= 0.05);
    for (const list of this.npcs.values()) for (const n of list) n.update(dt);
    this.player?.update(dt);
    this.previewPerson?.update(dt);
    this.biscuit?.update(dt);
    this.sam?.update(dt);
    this.director.update(dt, this.focus, this.runner?.speed ?? 0);
    this.engine.followShadows(this.scratch.set(this.focus.x + 4, 0, 0));
    this.ambient(dt);
    this.particles.update(dt, this.engine.renderer.domElement.height);
    this.rain.update(dt, this.focus);
  }

  private lastFootfalls = 0;
  private moteClock = 0;
  /** Footstep dust, and air that fits the hour: warm motes at dusk, leaves in the storm. */
  private ambient(dt: number) {
    const r = this.runner;
    // A puff of dust on each real footfall, left on the ground where the foot came down.
    const feet = this.player?.footfalls ?? 0;
    if (r && this.mode === "run" && !r.airborne && r.speed > 1.5 && !this.bike && feet !== this.lastFootfalls) {
      const at = this.player?.lastFootfall() ?? new THREE.Vector3(r.x, 0, r.z);
      this.particles.emit(new THREE.Vector3(at.x, 0.06, at.z), { count: 2, colour: "#fff6e6", speed: 0.5, up: 0.3, life: 0.5, size: 0.26, gravity: -0.4, spread: 0.2 });
    }
    this.lastFootfalls = feet;
    if (this.prefs.reducedMotion) return;
    const mood = this.engine.mood;
    const warm = mood === MOODS.sunset || mood === MOODS.dusk;
    const storm = mood.rain > 0;
    if (!warm && !storm) return;
    this.moteClock += dt;
    if (this.moteClock < (storm ? 0.09 : 0.14)) return;
    this.moteClock = 0;
    const c = this.engine.camera.position;
    const at = new THREE.Vector3(c.x - 8 + Math.random() * 26, 0.5 + Math.random() * 4, -6 + Math.random() * 10);
    if (storm) this.particles.emit(at, { count: 1, colour: ["#8fd35a", "#ffb627", "#c9803a"], speed: 3, up: 0.1, life: 2.2, size: 0.22, gravity: 0.6 });
    else this.particles.emit(at, { count: 1, colour: ["#ffd98a", "#fff3c4", "#ffb070"], speed: 0.35, up: 1, life: 2.6, size: 0.2, gravity: -0.15 });
  }

  // ======================================================================= title & creation
  private async titleLoop(): Promise<void> {
    this.mode = "title";
    this.life = null;
    audio.play("title");
    await this.showTitleScene();
    this.ui.loading(null);
    for (;;) {
      const save = loadLife();
      const pick = await this.ui.title(!!save && !save.finished);
      if (pick === "settings") {
        await this.ui.pauseMenu(this.prefs, (p) => this.applyPrefs(p), false);
        continue;
      }
      if (pick === "continue" && save) {
        this.life = save;
        this.ui.clear();
        this.hideTitleScene();
        await this.playFrom(save.chapter, true);
        return;
      }
      const created = await this.createCharacter();
      if (!created) continue;
      this.life = createLife({ ...created, seed: Number(this.params.get("seed")) || undefined });
      saveLife(this.life);
      this.ui.clear();
      this.hideTitleScene();
      await this.playFrom(0, false);
      return;
    }
  }

  private async showTitleScene() {
    if (this.titleScene) return;
    const life = createLife({ ...DEFAULT_LOOK, seed: 7 });
    life.flags = ["saved_light"];
    const world = await World.prepare({ ...CHAPTERS[0], length: 120 }, life, {});
    this.titleWorld = world;
    this.titleScene = new THREE.Group();
    this.titleScene.add(world.group);
    this.engine.scene.add(this.titleScene);
    world.update(60, 0);
    this.engine.setMood("sunset");
    this.engine.refreshGlow();
    this.rain.intensity = 0;
    this.engine.sea.mesh.visible = true;
    this.engine.sea.mesh.position.y = -9;
    this.engine.sea.mesh.material.uniforms.shore.value = -15;
    this.focus.set(96, 0, 0);
    this.director.set({ kind: "orbit", target: new THREE.Vector3(108, 7, -6), distance: 34, height: 9, speed: 0.05 }, true);
  }

  private hideTitleScene() {
    this.titleScene?.removeFromParent();
    this.titleScene = undefined;
    this.titleWorld?.dispose();
    this.titleWorld = undefined;
    this.previewPerson?.dispose();
    this.previewPerson = undefined;
  }

  /** Frames the preview character in the part of the screen the creation sheet leaves open. */
  private createShot() {
    // Same condition as the CSS: on portrait phones the sheet docks to the bottom 62%.
    const docked = window.matchMedia("(max-width: 640px) and (min-height: 501px)").matches;
    if (docked) {
      // Look well below the character so it stands in the open top of the screen.
      return { kind: "wide" as const, target: new THREE.Vector3(99.7, -1.3, 0.6), distance: 5.2, height: 1.3, side: 0.2 };
    }
    // Otherwise the sheet is on the right: look to the right of the character so it stands on the left.
    const narrow = this.engine.camera.aspect < 1;
    const short = window.innerHeight <= 500;
    return { kind: "wide" as const, target: new THREE.Vector3(narrow ? 100.6 : short ? 101.3 : 100.9, 0.8, 0), distance: narrow ? 7.2 : short ? 5.4 : 5.2, height: 1.7, side: 0.6 };
  }

  private async createCharacter(): Promise<CreateResult | null> {
    this.mode = "create";
    this.director.set(this.createShot());
    const reframe = () => {
      if (this.mode === "create") this.director.set(this.createShot());
    };
    window.addEventListener("resize", reframe);
    let building = Promise.resolve();
    const result = await this.ui.create(DEFAULT_LOOK, (r) => {
      building = building.then(async () => {
        const person = await createPerson(playerSpec(createLife({ ...r, seed: 1 }), "child", 2));
        this.previewPerson?.dispose();
        this.previewPerson = person;
        person.root.position.set(99.6, 0, 0.6);
        person.face(0.35);
        this.engine.scene.add(person.root);
      });
    });
    await building;
    window.removeEventListener("resize", reframe);
    if (!result) {
      this.previewPerson?.dispose();
      this.previewPerson = undefined;
      this.director.set({ kind: "orbit", target: new THREE.Vector3(108, 7, -6), distance: 34, height: 9, speed: 0.05 });
      this.mode = "title";
    }
    return result;
  }

  // ======================================================================= chapters
  private async playFrom(index: number, resume: boolean) {
    for (let i = index; i <= FINALE; i++) {
      await this.playChapter(i, resume && i === index);
      if (!this.life || this.mode === "title") return;
    }
  }

  private async playChapter(index: number, resume: boolean) {
    const life = this.life!;
    const chapter = CHAPTERS[index];
    this.chapter = chapter;
    let drift: Record<ScoreKey, number> | null = null;
    if (!resume || life.started !== index) {
      drift = startChapter(life, index);
      saveLife(life);
      resume = false;
    }
    this.chapterStartScores = life.chapterStart ? { ...life.chapterStart } : { ...life.scores };
    this.ui.loading("Loading…");
    await this.setupChapter(chapter, resume);
    this.ui.loading(null);
    this.mode = "card";
    audio.play(chapter.music);
    this.director.set({ kind: "follow", mode: stageAt(chapter, 0).mode }, true);
    await (this.ui.autoAdvance ? delay(30) : this.ui.chapterCard(chapter, resolve(chapter.subtitle, life), resolve(chapter.intro, life)));
    this.ui.clear();
    audio.unlock();
    audio.stinger("chapter");
    if (index === 0) return this.playPrologue();
    if (index === FINALE) return this.playFinale();
    this.ui.showHud(true);
    this.refreshHud();
    if (drift) {
      this.showDeltas(drift);
      const income = incomeFor(life, index);
      if (income) this.ui.toast("Work", `Your working years add up. Money +${income}`);
      if (chapter.drift?.health) this.ui.toast("Getting older", `Health ${chapter.drift.health}`, "warn");
    }
    this.mode = "run";
    this.clock.getDelta();
    if (index === 1) this.hintOnce("lanes", this.touch ? "Swipe up or down to change lane. There are three." : "Press ↑ or ↓ (or W and S) to change lane. There are three.");
    // Entry drift can itself empty a score.
    void this.checkRecovery();
    await this.waitForChapterEnd();
    if ((this.mode as Mode) === "title") return;
    await this.endChapter();
  }

  private async setupChapter(chapter: ChapterDef, resume: boolean) {
    this.teardownChapter();
    const life = this.life!;
    const encounters = activeEncounters(life, chapter.index);
    this.course = generateCourse(chapter, encounters, life);
    const encounterXs = Object.fromEntries(this.course.encounters.map((m) => [m.id, m.x]));
    // Resume just after the last resolved encounter so nothing is replayed.
    let startX = 0;
    let collected: number[] = [];
    if (resume) {
      const done = this.course.encounters.filter((m) => life.resolved.includes(m.id));
      if (done.length) startX = done[done.length - 1].x + 1;
      // A mid-run save knows exactly where you were and what you'd already picked up, but only
      // for the same course layout (an update that reshapes the chapter invalidates both).
      if (life.progress?.chapter === chapter.index && life.progress.course === courseKey(this.course)) {
        startX = Math.max(startX, life.progress.x);
        collected = life.progress.collected;
      }
      // Never resume past a scene that hasn't happened yet.
      const pending = this.course.encounters.find((m) => !life.resolved.includes(m.id));
      if (pending) startX = Math.min(startX, Math.max(0, pending.x - APPROACH - 1));
    }
    const specs: CharacterSpec[] = chapter.stages.map((stage) => playerSpec(life, stage.age, chapter.index));
    for (const e of encounters) {
      const speaker = resolve(e.speaker, life);
      if (speaker) specs.push(personSpec(speaker, life, chapter.index));
      for (const c of e.cast ? resolve(e.cast, life) : []) specs.push(personSpec(c, life, chapter.index));
    }
    specs.push(personSpec("biscuit", life, chapter.index), personSpec("sam", life, Math.max(5, chapter.index)));
    const [world, spawns] = await Promise.all([
      World.prepare(chapter, life, encounterXs),
      SpawnView.prepare(this.course, this.particles),
      preloadSpecs(specs),
      chapter.stages.some((s) => s.mode === "bike") ? readyAll(["bicycle"]) : Promise.resolve(),
    ]);
    this.world = world;
    this.spawns = spawns;
    this.engine.scene.add(world.group, spawns.group);
    this.engine.setMood(chapter.sky);
    this.engine.refreshGlow();
    this.rain.intensity = this.engine.mood.rain;
    // Sam's shield covers chapters 5-7; in the finale Sam is part of the gathering instead.
    const shield = has(life, "partner") && chapter.index >= 5 && chapter.index < FINALE;
    this.runner = new Runner(this.course, { speed: this.speedFor(chapter, startX), magnet: this.hasBiscuit(chapter.index), shield, letters: lettersActive(life) }, startX);
    this.runner.preCollect(collected);
    spawns.markDone(collected);
    spawns.showLetters = lettersActive(life);
    this.placesKey = JSON.stringify(resolve(chapter.places, life));
    await this.setPlayerStage(stageAt(chapter, startX / chapter.length).age, false);
    if (this.hasBiscuit(chapter.index)) this.biscuit = await this.companion("biscuit");
    if (shield) this.sam = await this.companion("sam");
    this.focus.set(startX, 0, 0);
    this.staged = new Set(life.resolved);
    this.updateScene(0);
  }

  /** The cruise speed for wherever the runner is: each stage (crawl, toddle, run...) has its own pace. */
  private speedFor(chapter: ChapterDef, x: number) {
    return stageSpeed(chapter, stageAt(chapter, x / chapter.length), this.life!.assist);
  }


  private hasBiscuit(chapter: number) {
    return has(this.life!, "biscuit") && chapter >= 2 && chapter <= 4;
  }

  private teardownChapter() {
    this.chapterToken++;
    for (const b of this.bubbles.values()) disposeSprite(b);
    this.bubbles.clear();
    this.laneGlow.mesh.visible = false;
    this.walkers = [];
    this.cutscene = false;
    this.bikeParts = [];
    this.bikeSeatNode = undefined;
    this.world?.dispose();
    this.spawns?.dispose();
    this.player?.dispose();
    this.bike?.removeFromParent();
    this.biscuit?.dispose();
    this.sam?.dispose();
    for (const list of this.npcs.values()) list.forEach((n) => n.dispose());
    this.npcs.clear();
    this.world = undefined;
    this.spawns = undefined;
    this.player = undefined;
    this.bike = undefined;
    this.biscuit = undefined;
    this.sam = undefined;
    this.runner = undefined;
    this.pendingEncounter = undefined;
    this.playerAge = undefined;
  }

  private async setPlayerStage(age: AgeKey, sparkle: boolean) {
    if (age === this.playerAge || this.swapping) return;
    this.swapping = true;
    const token = this.chapterToken;
    const person = await createPerson(playerSpec(this.life!, age, this.chapter!.index));
    if (token !== this.chapterToken) {
      person.dispose();
      this.swapping = false;
      return;
    }
    this.player?.dispose();
    this.player = person;
    this.playerAge = age;
    person.face(Math.PI / 2);
    this.engine.scene.add(person.root);
    this.swapping = false;
    const stage = stageAt(this.chapter!, (this.runner?.x ?? 0) / this.chapter!.length);
    if (stage.mode === "bike" && !this.bike) {
      this.bike = instance("bicycle");
      this.bike.rotation.y = Math.PI / 2;
      this.engine.scene.add(this.bike);
      this.bikeParts = (["WheelF", "WheelB", "Crank"] as const)
        .map((name) => ({ node: findNode(this.bike!, name)!, ratio: name === "Crank" ? CRANK_RATIO : 1 }))
        .filter((p) => p.node);
      this.bikeSeatNode = findNode(this.bike, "Seat");
    }
    if (sparkle && this.runner) {
      this.particles.emit(new THREE.Vector3(this.runner.x, 0.8, this.runner.z), { count: 70, colour: ["#fff3c4", "#ffd84a", "#8fe3ff", "#ff9ecb"], speed: 5, life: 1.1, size: 0.45, gravity: 1 });
      audio.sparkle();
    }
  }

  private bikeSeat(): THREE.Vector3 {
    const pos = this.scratch;
    const seat = this.bikeSeatNode;
    if (!seat || !this.player || !this.bike) return pos.copy(this.bike?.position ?? pos.set(0, 0, 0));
    this.bike.updateMatrixWorld(true);
    seat.getWorldPosition(pos);
    // The rider's hips sit on the saddle.
    pos.y -= this.player.height * 0.36;
    return pos;
  }

  private async companion(id: "biscuit" | "sam") {
    const p = await createPerson(personSpec(id, this.life!, this.chapter!.index));
    p.face(Math.PI / 2);
    const r = this.runner!;
    p.root.position.set(r.x - (id === "sam" ? 3 : 2), 0, r.z + (id === "sam" ? -1.2 : 1.2));
    this.engine.scene.add(p.root);
    return p;
  }

  private followCompanions(dt: number) {
    const r = this.runner!;
    const target = this.scratch;
    const follow = (p: Person, back: number, side: number) => {
      // Follow the smoothly rendered position, not the fixed simulation steps (which would jerk).
      target.set(this.focus.x - back, 0, THREE.MathUtils.clamp(this.focus.z + side, -2.4, 2.4));
      const fromX = p.root.position.x;
      p.root.position.lerp(target, 1 - Math.exp(-dt * 5));
      // Their strides match how fast they actually move along the path (they ease in and out
      // behind you); crossing between lanes is a side-step, not a longer stride.
      if (dt > 0) p.speed = THREE.MathUtils.lerp(p.speed, Math.abs(p.root.position.x - fromX) / dt, 1 - Math.exp(-dt * 12));
      if (this.mode === "run") {
        p.anim = p.speed < 0.3 ? "idle" : p.isDog ? "run" : this.chapter?.stages[0].mode === "walk" ? "walk" : "run";
        p.face(Math.PI / 2);
      }
    };
    if (this.biscuit) follow(this.biscuit, 1.7, r.z > 0 ? -1.1 : 1.1);
    if (this.sam) follow(this.sam, 2.6, r.z > 0 ? -1.2 : 1.2);
  }

  // ======================================================================= running
  private afterRunnerStep() {
    const r = this.runner!;
    const chapter = this.chapter!;
    const life = this.life!;
    const progress = r.x / chapter.length;
    const stage = stageAt(chapter, progress);
    if (stage.age !== this.playerAge && this.mode === "run" && !this.swapping) {
      void this.setPlayerStage(stage.age, true).then(() => this.ui.toast("Growing up", `Age ${ageAt(chapter, progress)}`, "keepsake"));
    }
    if (this.mode === "run") this.proximityHints(r);
    // Growing from crawling to toddling (and so on) changes the pace; legs follow automatically.
    if (r.cruise > 0 && r.stopAt === null) {
      const pace = this.speedFor(chapter, r.x);
      if (Math.abs(r.cruise - pace) > 0.01) r.setOptions({ speed: pace });
    }
    const active = activeEncounters(life, chapter.index);
    for (const mark of this.course!.encounters) {
      if (this.staged.has(mark.id) || r.x < mark.x - 75) continue;
      const enc = active.find((e) => e.id === mark.id);
      this.staged.add(mark.id);
      if (enc) void this.stageNpcs(enc, mark.x);
    }
    const next = this.course!.encounters.find((m) => !life.resolved.includes(m.id) && active.some((e) => e.id === m.id));
    if (next && r.x > next.x - APPROACH && r.stopAt === null && r.cruise > 0 && !this.pendingEncounter) {
      r.autopilotLane = 1;
      r.stopAt = next.x - 2.6;
      this.pendingEncounter = active.find((e) => e.id === next.id);
    }
    this.ui.setChapter(chapter.title, ageAt(chapter, progress));
    this.ui.setTimeline(chapter.index, Math.min(1, progress), this.course!.encounters.map((m) => m.x / chapter.length));
    const companions = [];
    if (this.biscuit) companions.push({ name: "biscuit", icon: "dog" as const, text: "Biscuit fetches" });
    if (this.sam) companions.push({ name: "sam", icon: "partner" as const, ready: r.shieldReady, text: r.shieldReady ? "Sam has your back" : "Sam is catching up" });
    this.ui.setCompanions(companions);
  }

  private proximityHints(r: Runner) {
    const ahead = (kind: string, within: number) => this.course!.spawns.find((sp) => sp.kind === kind && sp.x > r.x && sp.x < r.x + within && !r.isCollected(sp.id));
    if (!this.hintsSeen.has("hazard") && ahead("hazard", 14)) {
      this.hintOnce("hazard", this.touch ? "A red patch means trouble. Swipe to another lane, or tap to jump over low things." : "A red patch means trouble. Change lane, or press Space to jump over low things.");
    } else if (!this.hintsSeen.has("person") && this.course!.encounters.some((m) => m.x > r.x && m.x < r.x + 17 && this.bubbles.has(m.id))) {
      this.hintOnce("person", "Someone's waiting ahead. You'll stop to talk, and there's no timer when you choose.");
    } else if (!this.hintsSeen.has("keepsake") && ahead("keepsake", 18)) {
      this.hintOnce("keepsake", "A glowing keepsake! Get in its lane and jump to reach it.");
    }
  }

  private onRunnerEvent(ev: RunnerEvent) {
    const life = this.life!;
    const r = this.runner!;
    switch (ev.type) {
      case "pickup": {
        const score = ev.spawn.score ?? "happiness";
        this.spawns?.collect(ev.spawn.id);
        // The prologue and finale walks are memories: their lights are for looking at, not scoring.
        if (this.cutscene) {
          audio.pickup(score, 0);
          break;
        }
        const { delta } = runnerPickup(life, score);
        audio.pickup(score, r.streak);
        if (delta[score]) {
          this.ui.delta(score, delta[score]);
          audio.point(score);
        }
        this.ui.setScores(life.scores, life.meters);
        this.qa?.events.push(`pickup:${score}`);
        this.hintOnce("pickup", "Hearts are Health, stars are Happiness, coins are Money. Seven of a kind make a point.");
        break;
      }
      case "streak": {
        if (this.cutscene) break;
        const delta = runnerStreak(life, ev.count);
        const key = (Object.keys(delta) as ScoreKey[]).find((k) => delta[k]);
        this.ui.toast("In the flow", `${ev.count} in a row!${key ? ` ${key[0].toUpperCase() + key.slice(1)} +1` : ""}`);
        if (key) this.ui.delta(key, delta[key]);
        this.ui.setScores(life.scores, life.meters);
        break;
      }
      case "keepsake": {
        this.spawns?.collect(ev.spawn.id);
        const got = collectKeepsake(life, ev.spawn.index ?? 0);
        if (got) {
          this.ui.toast("Keepsake found", got.text, "keepsake");
          this.ui.delta(got.score, 1);
          audio.sparkle();
        }
        this.ui.setScores(life.scores, life.meters);
        this.qa?.events.push("keepsake");
        break;
      }
      case "letter": {
        this.spawns?.collect(ev.spawn.id);
        const text = collectLetter(life, ev.spawn.index ?? 0);
        this.ui.toast("A letter from Juno", `“${text}”`, "letter");
        this.ui.delta("happiness", 1);
        audio.chime();
        this.ui.setScores(life.scores, life.meters);
        break;
      }
      case "hit": {
        const hz = ev.spawn.hazard!;
        this.spawns?.hit(ev.spawn.id);
        const delta = runnerHit(life, hz.score, hz.kind);
        this.ui.delta(hz.score, delta[hz.score]);
        this.ui.toast("Oof", `${hz.label}: ${hz.score[0].toUpperCase() + hz.score.slice(1)} −${hazardCost(hz.kind)}`, "warn");
        this.ui.setScores(life.scores, life.meters);
        if (this.player) this.player.stumble = 0.7;
        this.director.shake = 0.25;
        audio.hit();
        this.qa?.events.push(`hit:${hz.model}`);
        void this.checkRecovery();
        break;
      }
      case "shielded": {
        this.spawns?.hit(ev.spawn.id);
        this.ui.toast("Sam caught you", "No harm done. Sam needs a moment to catch up.");
        this.particles.emit(new THREE.Vector3(r.x, 0.9, r.z), { count: 30, colour: ["#5cc639", "#dff7ea"], speed: 4, life: 0.8, size: 0.5, gravity: 0 });
        audio.chime();
        break;
      }
      case "jump":
        life.stats.jumps += 1;
        audio.jump();
        break;
      case "land":
        this.particles.emit(new THREE.Vector3(r.x, 0.05, r.z), { count: 8, colour: "#ffffff", speed: 1.5, life: 0.4, size: 0.4, gravity: 0, up: 0.1 });
        break;
      case "gust-warning":
        this.ui.gust(ev.dir);
        this.hintOnce("wind", "The wind will shove you into the next lane. Steer back!");
        audio.whoosh();
        break;
      case "gust":
        this.particles.emit(new THREE.Vector3(r.x + 2, 1.2, r.z), { count: 20, colour: ["#8fd35a", "#ffb627"], speed: 6, life: 1, size: 0.3, gravity: 1 });
        break;
      case "arrived":
        if (this.pendingEncounter) void this.runEncounter(this.pendingEncounter);
        break;
    }
  }

  private recovering = false;

  private async checkRecovery() {
    const life = this.life;
    if (!life || this.recovering) return;
    this.recovering = true;
    const wasRunning = this.mode === "run";
    // Two scores can empty at once; each gets its own rescue.
    for (let rec = recover(life); rec; rec = recover(life)) {
      this.mode = "story";
      audio.stinger("sad");
      await this.ui.message(rec.title, rec.text, "Keep going");
      this.ui.setScores(life.scores, life.meters);
    }
    this.recovering = false;
    if (this.mode === "story" && wasRunning) this.saveProgress();
    if (wasRunning && this.mode === "story") {
      this.mode = "run";
      this.clock.getDelta();
    }
  }

  private waitForChapterEnd(): Promise<void> {
    return new Promise((done) => {
      const check = () => {
        if (this.mode === "title" || !this.runner) return done();
        const pending = this.course?.encounters.some((m) => !this.life?.resolved.includes(m.id));
        if (this.runner.x >= this.chapter!.length - END_CLEAR * 0.5 && this.mode === "run" && !pending) return done();
        setTimeout(check, 100);
      };
      check();
    });
  }

  // ======================================================================= encounters
  private async stageNpcs(enc: EncounterDef, x: number) {
    const life = this.life!;
    const index = this.chapter!.index;
    const speaker = resolve(enc.speaker, life);
    const cast = enc.cast ? resolve(enc.cast, life) : [];
    const people: Person[] = [];
    const token = this.chapterToken;
    const place = async (id: PersonId, pos: THREE.Vector3, face: number) => {
      // Companions already on screen play themselves.
      if ((id === "biscuit" && this.biscuit) || (id === "sam" && this.sam)) return;
      const p = await createPerson(personSpec(id, life, index));
      if (token !== this.chapterToken) {
        p.dispose();
        return;
      }
      p.root.position.copy(pos);
      p.face(face);
      if (enc.id === "nanas-last-summer" && id === "nana") p.anim = "sit";
      this.engine.scene.add(p.root);
      people.push(p);
    };
    if (speaker) {
      await place(speaker, new THREE.Vector3(x, 0, 0), -Math.PI / 2 + 0.55);
      const who = people[0];
      if (who && token === this.chapterToken && !life.resolved.includes(enc.id)) {
        const bubble = nameBubble(speaker === "you" ? life.name : DISPLAY_NAME[speaker]);
        bubble.position.set(x, who.height * (who.spec.scale ?? 1) + 0.85, 0);
        this.engine.scene.add(bubble);
        this.bubbles.set(enc.id, bubble);
      }
    }
    for (let i = 0; i < cast.length; i++) await place(cast[i], new THREE.Vector3(x + 1.3 + i * 0.5, 0, i % 2 === 0 ? -1.5 : 1.5), -Math.PI / 2 + 0.4);
    this.npcs.set(enc.id, people);
    this.stagedSpeaker.set(enc.id, speaker);
  }

  private personFor(enc: EncounterDef, who: PersonId): Person | undefined {
    const life = this.life!;
    if (who === "biscuit" && this.biscuit) return this.biscuit;
    if (who === "sam" && this.sam) return this.sam;
    const npcs = this.npcs.get(enc.id) ?? [];
    const ids = [resolve(enc.speaker, life), ...(enc.cast ? resolve(enc.cast, life) : [])].filter((id) => id && !(id === "biscuit" && this.biscuit) && !(id === "sam" && this.sam));
    const i = ids.indexOf(who);
    return i >= 0 ? npcs[i] : undefined;
  }

  private async runEncounter(enc: EncounterDef) {
    const life = this.life!;
    this.mode = "story";
    this.pendingEncounter = undefined;
    const bubble = this.bubbles.get(enc.id);
    if (bubble) disposeSprite(bubble);
    this.bubbles.delete(enc.id);
    // Placed 75 m ahead, the speaker may have changed since (Sam became your partner in between).
    const mark = this.course?.encounters.find((m) => m.id === enc.id);
    if (mark && this.stagedSpeaker.get(enc.id) !== resolve(enc.speaker, life)) {
      this.npcs.get(enc.id)?.forEach((n) => n.dispose());
      this.npcs.delete(enc.id);
      await this.stageNpcs(enc, mark.x);
      const late = this.bubbles.get(enc.id);
      if (late) disposeSprite(late);
      this.bubbles.delete(enc.id);
    }
    audio.duck(true);
    const speakerId = resolve(enc.speaker, life);
    const speakerPerson = speakerId ? this.personFor(enc, speakerId) : undefined;
    const player = this.player!;
    const playerPos = player.root.position.clone();
    player.anim = "idle";
    player.face(Math.PI / 2 - 0.5);
    if (speakerPerson) this.director.set({ kind: "two-shot", a: playerPos, b: speakerPerson.root.position.clone() });
    else this.director.set({ kind: "wide", target: playerPos.clone().add(new THREE.Vector3(1.5, 1, 0)), distance: 7.5, height: 2.6 });
    const title = resolve(enc.title, life);
    const everyone = () => [...(this.npcs.get(enc.id) ?? []), ...(this.sam ? [this.sam] : []), ...(this.biscuit ? [this.biscuit] : [])];
    const speaking = (line: Line) => {
      for (const n of everyone()) if (n.anim !== "sit") n.anim = "idle";
      player.anim = line.who === "you" ? "talk" : "idle";
      if (line.who !== "narrator" && line.who !== "you") {
        const who = this.personFor(enc, line.who);
        if (who && !who.isDog && who.anim !== "sit") who.anim = "talk";
      }
    };
    await this.ui.say(resolve(enc.lines, life), title, (who) => nameOf(who, life.name), speaking);
    const views = optionViews(enc, life);
    let optionId = "continue";
    if (enc.kind !== "event") {
      optionId = this.qa?.autopilot ? this.qaPick(enc, views) : await this.ui.choose(resolve(enc.prompt ?? "", life), views, title);
    }
    const outcome = choose(life, enc, optionId);
    audio.stinger(enc.kind === "event" && outcome.delta.happiness < 0 ? "sad" : "choice");
    this.showDeltas(outcome.delta);
    this.ui.setScores(life.scores, life.meters);
    if (outcome.star) this.particles.emit(playerPos.clone().add(new THREE.Vector3(0, 1.6, 0)), { count: 40, colour: ["#ffd84a", "#fff3c4"], speed: 4, life: 1, size: 0.4, gravity: 2 });
    if (outcome.lines.length) await this.ui.say(outcome.lines, title, (who) => nameOf(who, life.name), speaking);
    this.ui.endStory();
    this.qa?.events.push(`choice:${enc.id}:${optionId}`);
    // Companions who join because of this choice.
    if (enc.id === "pup" && has(life, "biscuit")) {
      const pup = this.npcs.get(enc.id)?.[0];
      if (pup) {
        this.biscuit = pup;
        this.npcs.delete(enc.id);
        this.runner?.setOptions({ magnet: true });
        this.ui.toast("Biscuit joins you", "He fetches pickups from the lanes next to you.", "keepsake");
      }
    }
    if ((enc.id === "sams-question" || enc.id === "second-chance") && has(life, "partner") && !this.sam) {
      const samPerson = this.npcs.get(enc.id)?.[0];
      if (samPerson) {
        this.sam = samPerson;
        this.npcs.delete(enc.id);
        this.runner?.setOptions({ shield: true });
        this.ui.toast("Sam is with you now", "Once every 20 seconds, Sam catches you before you stumble.", "keepsake");
      }
    }
    for (const n of this.npcs.get(enc.id) ?? []) n.anim = n.isDog ? "idle" : "wave";
    const letters = lettersActive(life);
    this.runner?.setOptions({ letters });
    if (this.spawns) this.spawns.showLetters = letters;
    // A choice can change where the rest of the chapter happens (staying home at the station).
    const key = JSON.stringify(resolve(this.chapter!.places, life));
    if (key !== this.placesKey && this.course) {
      this.placesKey = key;
      const encounterXs = Object.fromEntries(this.course.encounters.map((m) => [m.id, m.x]));
      const world = await World.prepare(this.chapter!, life, encounterXs);
      this.world?.dispose();
      this.world = world;
      this.engine.scene.add(world.group);
      this.engine.refreshGlow();
    }
    this.saveProgress();
    await this.checkRecovery();
    audio.duck(false);
    const r = this.runner!;
    r.autopilotLane = null;
    r.setOptions({ speed: this.speedFor(this.chapter!, r.x) });
    this.director.set({ kind: "follow", mode: stageAt(this.chapter!, r.x / this.chapter!.length).mode });
    this.mode = "run";
    this.clock.getDelta();
    const id = enc.id;
    setTimeout(() => {
      this.npcs.get(id)?.forEach((n) => n.dispose());
      this.npcs.delete(id);
    }, 15000 / (this.qa?.timeScale ?? 1));
  }

  /** Saves the life plus where the runner is and what it has taken this chapter. */
  private saveProgress() {
    const life = this.life;
    if (!life) return;
    if (this.runner && this.chapter && this.chapter.index === life.chapter) {
      life.progress = { chapter: life.chapter, x: this.runner.x, collected: this.runner.collectedIds(), course: this.course ? courseKey(this.course) : undefined };
    }
    saveLife(life);
  }

  private showDeltas(delta: Record<ScoreKey, number>) {
    for (const k of ["health", "happiness", "money"] as ScoreKey[]) if (delta[k]) this.ui.delta(k, delta[k]);
  }

  private refreshHud() {
    const life = this.life!;
    this.ui.setScores(life.scores, life.meters);
    if (this.runner && this.chapter) this.ui.setChapter(this.chapter.title, ageAt(this.chapter, this.runner.x / this.chapter.length));
  }

  private async endChapter() {
    const life = this.life!;
    const chapter = this.chapter!;
    this.mode = "story";
    const outro = closeChapter(life);
    const lines = life.choices.filter((c) => c.chapter === chapter.index).map((c) => c.memory).filter((m): m is string => !!m);
    const keepsakes = life.keepsakes.filter((k) => k.startsWith(`${chapter.index}:`)).length;
    const deltas = {
      health: life.scores.health - this.chapterStartScores.health,
      happiness: life.scores.happiness - this.chapterStartScores.happiness,
      money: life.scores.money - this.chapterStartScores.money,
    };
    audio.stinger("end");
    await this.ui.summary(chapter, lines, outro, keepsakes, deltas, statusLines(life));
    life.chapter = advance(life);
    life.resolved = [];
    life.progress = undefined;
    saveLife(life);
    this.ui.showHud(false);
    await this.ui.veil(true, 500);
    this.teardownChapter();
    await this.ui.veil(false, 50);
  }

  // ======================================================================= prologue & finale
  private async playPrologue() {
    const life = this.life!;
    const r = this.runner!;
    this.cutscene = true;
    r.autopilotLane = 1;
    r.stopAt = this.chapter!.length - 22;
    this.director.set({ kind: "wide", target: new THREE.Vector3(r.x + 6, 1.5, -2), distance: 13, height: 3.6 });
    this.mode = "run";
    const lines: Line[] = [
      { who: "narrator", text: "Marigold Bay. The old lighthouse still stands on the cliff." },
      { who: "narrator", text: "Fifty-nine years ago, two kids buried a tin under it and promised to open it together, at seventy." },
      { who: "narrator", text: `Today, ${life.name}, you are seventy.` },
      { who: "narrator", text: "But first, let's go back. All the way back." },
    ];
    for (const line of lines) {
      await this.ui.say([line], "Prologue", () => "");
      this.director.set({ kind: "wide", target: new THREE.Vector3((this.runner?.x ?? 0) + 6, 1.8, -3), distance: 12.5, height: 3.4 });
    }
    this.ui.endStory();
    this.mode = "story";
    await this.ui.veil(true, 900);
    life.chapter = advance(life);
    life.resolved = [];
    saveLife(life);
    this.teardownChapter();
    await this.ui.veil(false, 50);
  }

  private async playFinale() {
    const life = this.life!;
    const r = this.runner!;
    this.cutscene = true;
    r.autopilotLane = 1;
    r.stopAt = this.chapter!.length - 18;
    this.mode = "run";
    this.director.set({ kind: "follow", mode: "walk" });
    const memories = life.memories.filter((m) => m.kind === "choice" || m.kind === "keepsake").slice(-8);
    for (const m of memories) {
      this.ui.showHud(true);
      this.ui.toast("Remember", m.text, "keepsake");
      await delay(this.qa?.autopilot ? 40 : 2600);
      if (!this.runner || this.runner.stopAt === null) break;
    }
    await new Promise<void>((res) => {
      const wait = () => (this.runner && this.runner.stopAt !== null ? setTimeout(wait, 100) : res());
      wait();
    });
    this.ui.showHud(false);
    this.mode = "finale";
    const end = finale(life);
    if (!this.runner) return;
    const x = this.runner.x;
    const people: Person[] = [];
    const slots = [
      [2.5, -1.2],
      [3.4, 1.0],
      [4.4, -0.3],
      [1.6, 1.6],
      [5.2, 1.4],
      [5.6, -1.6],
    ];
    for (const [i, id] of end.company.entries()) {
      const p = await createPerson(personSpec(id, life, 8));
      p.root.position.set(x + slots[i % 6][0], 0, slots[i % 6][1]);
      p.face(-Math.PI / 2 + 0.5);
      // Juno is still running up from the evening ferry.
      if (id === "juno" && end.juno === "ferry") {
        p.root.position.set(x - 16, 0, 1.6);
        p.face(Math.PI / 2);
      }
      this.engine.scene.add(p.root);
      people.push(p);
    }
    this.npcs.set("finale", people);
    this.director.set({ kind: "wide", target: new THREE.Vector3(x + 6, 2.2, -2), distance: 13, height: 3.6, side: -1 });
    await this.ui.say(end.scene, "The Promise", (who) => nameOf(who, life.name), (line) => {
      for (const p of people) p.anim = "idle";
      if (this.player) this.player.anim = /dig|spade hits/.test(line.text) ? "dig" : "idle";
      const idx = end.company.indexOf(line.who as PersonId);
      if (idx >= 0) people[idx].anim = "talk";
      if (line.who === "juno" && end.juno === "ferry" && !this.walkers.length) {
        const juno = people[end.company.indexOf("juno")];
        const slot = slots[end.company.indexOf("juno") % 6];
        this.walkers.push({ person: juno, to: new THREE.Vector3(x + slot[0], 0, slot[1]), speed: 6 });
      }
    });
    this.ui.endStory();
    await readyAll(["tin"]);
    const tin = instance("tin");
    tin.position.set(x + 1.2, 0, 0.3);
    this.engine.scene.add(tin);
    this.particles.emit(new THREE.Vector3(x + 1.2, 0.5, 0.3), { count: 90, colour: ["#fff3c4", "#ffd84a", "#8fe3ff", "#ff9ecb"], speed: 5, life: 1.4, size: 0.5, gravity: 0.5 });
    audio.sparkle();
    this.director.set({ kind: "two-shot", a: this.player!.root.position.clone(), b: tin.position.clone() });
    await delay(this.qa?.autopilot ? 20 : 1400);
    await this.ui.letter(end.letter);
    for (const p of people) p.anim = "cheer";
    this.director.set({ kind: "orbit", target: new THREE.Vector3(x + 3, 3, -2), distance: 16, height: 6, speed: 0.08 });
    audio.stinger("end");
    life.finished = true;
    saveLife(life);
    this.qa?.events.push("finished");
    const bookDone = this.ui.book(book(life), end);
    if (this.qa?.autopilot) await delay(50);
    else await bookDone;
    clearLife();
    tin.removeFromParent();
    this.teardownChapter();
    this.life = null;
    if (!this.qa?.autopilot) void this.titleLoop();
  }

  // ======================================================================= QA
  private setupQa() {
    this.qa = {
      ready: false,
      mode: () => this.mode,
      life: () => this.life,
      x: () => this.runner?.x ?? 0,
      chapter: () => this.chapter?.index ?? -1,
      autopilot: this.params.get("auto") === "1",
      policy: this.params.get("policy") ?? "mixed",
      timeScale: Number(this.params.get("speed") ?? 1),
      events: [],
      feet: () => {
        if (!this.runner) return null;
        // Where the left leg (a crawling baby's knee) and Biscuit's front paw meet the floor.
        const foot = (p: Person | undefined, leg: "LegL" | "LegFL") => {
          const at = p?.contactPoint(leg);
          return at && { x: at.x, y: at.y };
        };
        return { player: foot(this.player, "LegL"), dog: foot(this.biscuit, "LegFL"), speed: this.runner.speed };
      },
    };
    if (this.qa.autopilot) this.ui.autoAdvance = true;
    (window as unknown as { __COL__: Qa }).__COL__ = this.qa;
    const poll = () => {
      if (document.querySelector("[data-qa=new]")) this.qa!.ready = true;
      else setTimeout(poll, 100);
    };
    poll();
  }

  private qaPick(enc: EncounterDef, views: ReturnType<typeof optionViews>): string {
    const open = views.filter((v) => !v.locked);
    const policy = this.qa!.policy;
    if (policy === "first") return open[0].id;
    if (policy === "last") return open[open.length - 1].id;
    if (policy === "warm") return (open.find((v) => WARM.includes(v.id)) ?? open[0]).id;
    return open[(enc.id.length * 7) % open.length].id;
  }

  /** Steers into the nearest free lane; jumps low hazards; detours for keepsakes. */
  private autopilotInput(): { laneStep?: -1 | 1; jump?: boolean } {
    const r = this.runner!;
    if (r.autopilotLane !== null) return {};
    const horizon = Math.max(6, r.speed * 0.85);
    const ahead = this.course!.spawns.filter((s) => s.kind === "hazard" && s.x > r.x - 0.8 && s.x < r.x + horizon && !r.isCollected(s.id));
    const tall = new Set(ahead.filter((s) => s.hazard?.kind === "tall").map((s) => s.lane));
    const any = new Set(ahead.map((s) => s.lane));
    const lowHere = ahead.find((s) => s.lane === r.lane && s.hazard?.kind === "low" && s.x - r.x <= r.jumpLead() + 0.05);
    const keepsake = this.course!.spawns.find((s) => s.kind === "keepsake" && !r.isCollected(s.id) && s.x > r.x && s.x < r.x + 16);
    if (keepsake) {
      if (keepsake.lane === r.lane && !tall.has(r.lane)) return lowHere && !r.airborne ? { jump: true } : {};
      if (!tall.has(keepsake.lane) && !any.has((r.lane + (keepsake.lane < r.lane ? -1 : 1)) as Lane)) return { laneStep: keepsake.lane < r.lane ? -1 : 1 };
    }
    if (!any.has(r.lane)) return {};
    const free = ([0, 1, 2] as Lane[]).filter((l) => !any.has(l)).sort((a, b) => Math.abs(a - r.lane) - Math.abs(b - r.lane));
    if (free.length) return { laneStep: free[0] < r.lane ? -1 : 1 };
    return lowHere && !r.airborne ? { jump: true } : {};
  }
}

/** Identifies a chapter's course layout, so saved positions are only reused on the same layout. */
function courseKey(course: Course): string {
  return `${course.length}|${course.spawns.length}|${course.encounters.map((m) => `${m.id}@${m.x}`).join(",")}`;
}

const HINTS_KEY = "choice-of-life-2:hints";

function readHints(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HINTS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function writeHints(seen: Set<string>) {
  try {
    localStorage.setItem(HINTS_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable */
  }
}
