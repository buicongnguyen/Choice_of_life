import { describe, expect, it } from "vitest";
import { createBrowserShellPort } from "./platform/browser-shell";
import { ADULT_CALLBACK_DEFINITIONS } from "./core/adult/content";
import type { StoragePort } from "./persistence/storage-port";

/**
 * The whole game must be finishable.
 *
 * Drives the deterministic shell from a new life to the ending with no rendering
 * and no requestAnimationFrame, taking a real decision at every gate. It caught
 * two defects no unit test did: an unknown adult route id crashed with a raw
 * TypeError the shell showed the player verbatim, and every stage reducer
 * returned `undefined` for an unrecognised action, which the sessions assigned
 * back to their own state - permanently bricking the chapter so the life could
 * never be completed.
 */

describe("full life playthrough", () => {
  it("reaches an ending with a biography", async () => {

      const memory = new Map<string, string>();
      const storage: StoragePort = {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => void memory.set(k, v),
        removeItem: (k) => void memory.delete(k),
      };
      let seedCounter = 0;
      const seed = {
        nextSeed: () => (seedCounter++).toString(16).padStart(16, "0") as never,
      };

      const shell = createBrowserShellPort({ storage, seed });
      const say = (_m: string) => undefined;
      const j = (v: unknown) => JSON.stringify(v);
      type Rec = Record<string, unknown>;

      function ok(label: string, r: { kind: string; notice?: { message?: string } }) {
        if (r.kind === "invalid" || r.kind === "unavailable" || r.kind === "invalid-save") {
          throw new Error(`${label}: ${r.kind} - ${r.notice?.message ?? ""}`);
        }
        return r;
      }

      /** Find any presenting decision anywhere in a stage state. */
      function findPresenting(state: unknown, depth = 0): Rec | null {
        if (!state || typeof state !== "object" || depth > 4) return null;
        const rec = state as Rec;
        const ids = rec.optionIds;
        if (rec.status === "presenting" && Array.isArray(ids) && ids.length) return rec;
        for (const value of Object.values(rec)) {
          if (Array.isArray(value)) {
            for (const item of value) {
              const hit = findPresenting(item, depth + 1);
              if (hit) return hit;
            }
          } else {
            const hit = findPresenting(value, depth + 1);
            if (hit) return hit;
          }
        }
        return null;
      }

      function drive(
        label: string,
        read: () => unknown,
        step: (a: unknown) => { kind: string; notice?: { message?: string } },
        choose: (s: Rec) => unknown | null,
        done: (s: Rec) => boolean,
        budget = 6000,
      ): Rec {
        let s = read() as Rec;
        let guard = 0;
        let choices = 0;
        while (!done(s)) {
          if (++guard > budget) {
            throw new Error(`${label}: unfinished after ${budget} steps (phase=${String(s.phase)})`);
          }
          const action = choose(s);
          if (action) {
            ok(`${label} ${j(action)}`, step(action));
            choices++;
          } else {
            ok(`${label} advance`, step({ type: "advance", ticks: 30 }));
          }
          s = read() as Rec;
        }
        say(`  ${label}: ${guard} steps, ${choices} choices, phase=${String(s.phase)} scores=${j(s.scores)}`);
        return s;
      }

      say("=== FULL LIFE PLAYTHROUGH ===");
      ok("startNewLife", await shell.startNewLife({
        startingProfileId: "steady-mix-v1",
        difficulty: "normal",
        controlMode: "manual",
        gender: "female",
        appearance: {
          heritageStyleId: "asian", hairStyleId: "short-soft",
          hairColorId: "black", clothingPaletteId: "sunrise",
        },
      } as never) as never);
      say("1. new life");

      ok("enterNewborn", shell.enterNewborn() as never);
      drive("2. newborn", () => shell.currentNewbornState(),
        (a) => shell.dispatchNewborn(a as never) as never,
        (s) => {
          const p = findPresenting(s);
          if (p) return { type: "choose-caregiver", optionId: (p.optionIds as string[])[0] };
          if (s.phase === "settling") return { type: "settle" };
          return null;
        },
        (s) => s.phase === "complete");

      ok("enterEncounters", shell.enterEncounters() as never);
      drive("3. encounters", () => shell.currentEncounterState(),
        (a) => shell.dispatchEncounter(a as never) as never,
        (s) => {
          const engine = s.engine as Rec;
          const rec = (engine?.recoveryHooks as Rec[] ?? []).find((h) => h.status === "offered");
          if (rec) return { type: "accept-recovery", recoveryId: rec.recoveryId };
          const tx = (engine?.transactions as Rec[] ?? []).find((t) => t.status === "presenting");
          if (tx) {
            const opts = tx.optionIds as string[] | undefined;
            if (opts?.length) return { type: "choose", transactionId: tx.transactionId, optionId: opts[0] };
          }
          return null;
        },
        (s) => s.phase === "complete");

      ok("enterChildhood", shell.enterChildhood() as never);
      drive("4. childhood", () => (shell.currentChildhoodState() as Rec | null)?.childhood,
        (a) => shell.dispatchChildhood(a as never) as never,
        (s) => {
          const active = s.activeChoice as Rec | null;
          if (active) {
            const opts = active.optionIds as string[] | undefined;
            if (opts?.length) return { type: "choose", optionId: opts[0] };
          }
          const p = findPresenting(s);
          if (p) return { type: "choose", optionId: (p.optionIds as string[])[0] };
          if (s.phase === "stage-summary") return { type: "continue-stage" };
          return null;
        },
        (s) => s.phase === "complete");

      ok("enterEducation", shell.enterEducation() as never);
      drive("5. education", () => shell.currentEducationState(),
        (a) => shell.dispatchEducation(a as never) as never,
        (s) => {
          if (!s.preparationChoiceId) {
            return { type: "choose-preparation", choiceId: "education-prep-balanced-routine-v1" };
          }
          if (!s.gradeResult) return { type: "reveal-grade" };
          if (!(s.routeHistory as unknown[])?.length) {
            return { type: "select-route", routeId: "education-route-direct-work-v1" };
          }
          return null;
        },
        (s) => Boolean((s.routeHistory as unknown[])?.length));

      ok("enterCareer", shell.enterCareer() as never);
      drive("6. career", () => shell.currentCareerState(),
        (a) => shell.dispatchCareer(a as never) as never,
        (s) => {
          const pending = s.pendingDecision as Rec | null;
          if (pending) {
            const opts = (pending.optionIds ?? (pending.options as Rec[] ?? []).map((o) => o.optionId)) as string[];
            const kind = String(pending.kind ?? "");
            if (/doctor|emergency/.test(kind)) return { type: "resolve-doctor-emergency", optionId: opts[0] };
            return { type: "resolve-pressure", optionId: opts[0] };
          }
          if (!s.selectedRole) {
            const offers = ((s.offerSet as Rec)?.careerOffers as Rec[]) ?? [];
            if (offers.length) return { type: "choose-career", offerId: offers[0]!.offerId as string };
          }
          if (s.phase === "settling") return { type: "complete" };
          return { type: "settle-cycle" };
        },
        (s) => s.phase === "complete" || Boolean(s.ending));

      ok("enterAdult", shell.enterAdult() as never);
      drive("7. adult", () => shell.currentAdultState(),
        (a) => shell.dispatchAdult(a as never) as never,
        (s) => {
          const first = (v: unknown) => ((v as Rec[])?.[0]?.choiceId
            ?? (v as Rec[])?.[0]?.planId ?? (v as Rec[])?.[0]?.optionId) as string;
          switch (s.phase) {
            case "route-choice": return { type: "choose-route", routeId: "community" };
            case "partner-choice": return { type: "skip-partnering" };
            case "commitment-choice":
              return { type: "choose-commitment", choiceId: first(s.commitmentChoices) };
            case "home-choice":
              return { type: "choose-home", choiceId: "community-household" };
            case "family-choice":
              return { type: "choose-family-plan", planId: "no-children" };
            case "callback": {
              const active = (s.callbacks as Rec[] ?? [])
                .find((c) => c.selectedOptionId === null && c.status !== "expired");
              const def = ADULT_CALLBACK_DEFINITIONS
                .find((d) => d.callbackId === active?.callbackId);
              const optionId = def?.options?.[0]?.optionId;
              if (!optionId) throw new Error(`no option for callback ${j(active?.callbackId)}`);
              return { type: "resolve-callback", optionId };
            }
            case "settling": return { type: "advance-to-later-career" };
            default: return { type: "settle-cycle" };
          }
        },
        (s) => s.phase === "complete" || Boolean(s.handoff));

      ok("enterLaterLife", shell.enterLaterLife() as never);
      const ending = drive("8. later life", () => shell.currentLaterLifeState(),
        (a) => shell.dispatchLaterLife(a as never) as never,
        (s) => {
          const cb = (s.callbacks as Rec[] ?? []).find((c) => c.status === "presenting");
          if (cb) return { type: "acknowledge-callback" };
          switch (s.phase) {
            case "later-career-choice":
              return { type: "choose-later-career", optionId: "later-career-mentor-v1" };
            case "retirement-choice":
              return { type: "choose-retirement", optionId: "retirement-gradual-v1" };
            case "legacy-choice":
              return { type: "choose-legacy", optionId: "legacy-family-stories-v1" };
            default:
              return { type: "complete-life" };
          }
        },
        (s) => s.phase === "complete" && Boolean(s.biography));

      say("");
      say("=== LIFE COMPLETE ===");
      say(`final scores: ${j(ending.scores)}`);
      const bio = ending.biography as Rec | undefined;
      if (bio) say(`biography: ${j(bio).slice(0, 220)}`);


      expect(String(ending.phase)).toBe("complete");
      expect(ending.biography, "the life produced no biography").toBeTruthy();
      const scores = ending.scores as Record<string, number>;
      for (const id of ["health", "happiness", "money"]) {
        expect(scores[id], id).toBeGreaterThanOrEqual(0);
        expect(scores[id], id).toBeLessThanOrEqual(100);
      }
  }, 120_000);
});
