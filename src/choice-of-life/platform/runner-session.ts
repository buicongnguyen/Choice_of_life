import type { RunnerLaboratoryShellPort, ShellNotice } from "../core/shell-contracts";
import { deepFreeze } from "../core/immutable";
import type { Lane, RunStateV1 } from "../core/run-state";
import { mergeRetainedPresentationSettingsV1 } from "../core/run-factory";
import {
  advanceAutomaticRunnerLaboratory,
  applyAutomaticLabSettlement,
  createAutomaticOracleTrace,
  startAutomaticRunnerLaboratory,
  type AutomaticOracleTrace,
} from "../core/runner/automatic-oracle";
import { RUNNER_LABORATORY_STAGE_ID } from "../core/runner/contract";
import type { LaneDirection } from "../core/runner/lane-controller";
import { applyLabSettlement } from "../core/runner/settlement";
import {
  advanceRunnerLaboratory,
  chooseLane as chooseSemanticLane,
  createRunnerSimulationContext,
  startRunnerLaboratory,
  type RunnerIndependentPauseReason,
  type RunnerSimulationContext,
  type RunnerSimulationEvent,
  type RunnerSimulationResult,
} from "../core/runner/simulation";
import {
  createFixedStepDriver,
  type RuntimePauseReason,
} from "./fixed-step-driver";
import {
  attachFrameLifecycle,
  type RuntimeInterruptionReason,
  type VisibilityTarget,
} from "./frame-lifecycle";

export interface RunnerSessionClockPort {
  nowMilliseconds(): number;
}

export interface RunnerSessionAnimationFramePort {
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
}

export interface RunnerSessionLifecyclePort {
  readonly visibilityTarget: VisibilityTarget;
  readonly focusTarget: EventTarget;
  isFocused(): boolean;
}

export interface RunnerSessionDependencies {
  readonly shell: RunnerLaboratoryShellPort;
  readonly clock: RunnerSessionClockPort;
  readonly animationFrame: RunnerSessionAnimationFramePort;
  readonly lifecycle: RunnerSessionLifecyclePort;
}

export type RunnerSessionStatus =
  | "awaiting-start"
  | "running"
  | "paused"
  | "settling"
  | "completed"
  | "faulted"
  | "disposed";

export type RunnerSessionEvent =
  | RunnerSimulationEvent
  | Readonly<{
      type: "runtime-pause-changed";
      pauseReasons: readonly RuntimePauseReason[];
    }>
  | Readonly<{
      type: "user-pause-changed";
      active: boolean;
    }>
  | Readonly<{
      type: "settlement-applied";
      simulationTick: number;
    }>
  | Readonly<{
      type: "presentation-state-refreshed";
      simulationTick: number;
    }>;

export interface RunnerSessionSnapshot {
  readonly state: RunStateV1;
  readonly status: RunnerSessionStatus;
  readonly started: boolean;
  readonly queuedLaneIntent: LaneDirection | null;
  readonly pauseReasons: readonly RuntimePauseReason[];
  readonly events: readonly RunnerSessionEvent[];
  readonly notice: ShellNotice | null;
  readonly droppedLogicalSteps: number;
}

export interface RunnerSession {
  getSnapshot(): RunnerSessionSnapshot;
  subscribe(listener: (snapshot: RunnerSessionSnapshot) => void): () => void;
  start(): boolean;
  requestLaneIntent(intent: LaneDirection): boolean;
  chooseLane(targetLane: Lane): boolean;
  setUserPaused(active: boolean): boolean;
  setModalOpen(active: boolean): boolean;
  resumeInterruption(reason: RuntimeInterruptionReason): boolean;
  /** Permanently stops the frame loop after a presentation integrity failure. */
  reportPresentationFault(message: string): boolean;
  refreshPresentationState(): boolean;
  dispose(): void;
}

function runtimeToSimulationPauseReasons(
  reasons: readonly RuntimePauseReason[],
): readonly RunnerIndependentPauseReason[] {
  const mapped: RunnerIndependentPauseReason[] = [];
  for (const reason of reasons) {
    if (reason === "visibility") mapped.push("visibility");
    else if (reason === "focus-interruption") mapped.push("focus");
    else if (reason === "user") mapped.push("user");
    else if (reason === "modal") mapped.push("modal");
  }
  return Object.freeze(mapped);
}

function hasPendingSemanticMarker(state: RunStateV1): boolean {
  if (state.controlMode !== "semantic-assist" || state.runner === null) return false;
  const resolved = new Set(state.runner.spawn.resolvedEntityIds);
  return state.runner.activeEntities.some((entity) =>
    entity.kind === "opportunity" && !resolved.has(entity.instanceId));
}

function initialState(shell: RunnerLaboratoryShellPort): RunStateV1 {
  const state = shell.currentRunState();
  if (state === null || state.stage.stageId !== RUNNER_LABORATORY_STAGE_ID) {
    throw new TypeError("runner session requires an entered runner laboratory state");
  }
  return deepFreeze(state);
}

export function createRunnerSession(
  dependencies: RunnerSessionDependencies,
): RunnerSession {
  const driver = createFixedStepDriver();
  let state = initialState(dependencies.shell);
  const context: RunnerSimulationContext = createRunnerSimulationContext(
    state.runSeed,
    state.difficulty,
  );
  let automaticTrace: AutomaticOracleTrace | null = state.controlMode === "automatic-assist"
    ? createAutomaticOracleTrace(state)
    : null;
  const lifecycle = attachFrameLifecycle(
    driver,
    dependencies.lifecycle.visibilityTarget,
    dependencies.lifecycle.focusTarget,
    dependencies.lifecycle.isFocused,
  );
  const listeners = new Set<(snapshot: RunnerSessionSnapshot) => void>();
  let disposed = false;
  let faulted = false;
  let queuedLaneIntent: LaneDirection | null = null;
  let frameHandle: number | null = null;
  let notice: ShellNotice | null = null;
  let droppedLogicalSteps = 0;
  let lastShellState: RunStateV1 | null = state;

  const started = (): boolean =>
    state.runner === null ||
    state.runner.spawn.resolvedEntityIds.includes(context.course.startMarker.instanceId);

  const status = (): RunnerSessionStatus => {
    if (disposed) return "disposed";
    if (faulted) return "faulted";
    if (state.runStatus === "completed" || state.stage.phase === "complete") {
      return "completed";
    }
    if (!started()) return "awaiting-start";
    if (lifecycle.activePauseReasons().length > 0) return "paused";
    if (state.stage.phase === "settling") return "settling";
    return "running";
  };

  const createSnapshot = (
    events: readonly RunnerSessionEvent[] = [],
  ): RunnerSessionSnapshot => deepFreeze({
    state,
    status: status(),
    started: started(),
    queuedLaneIntent,
    pauseReasons: lifecycle.activePauseReasons(),
    events: [...events],
    notice: notice === null ? null : { ...notice },
    droppedLogicalSteps,
  });

  let snapshot = createSnapshot();

  const publish = (events: readonly RunnerSessionEvent[] = []): void => {
    snapshot = createSnapshot(events);
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch {
        // A presentation listener cannot stop the authoritative session.
      }
    }
  };

  const failSession = (message: string, suppliedNotice?: ShellNotice): false => {
    faulted = true;
    queuedLaneIntent = null;
    if (frameHandle !== null) {
      dependencies.animationFrame.cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
    notice = deepFreeze(suppliedNotice
      ? { ...suppliedNotice }
      : { tone: "error" as const, message });
    publish();
    return false;
  };

  const rebuildAutomaticTrace = (): void => {
    automaticTrace = state.controlMode === "automatic-assist"
      ? createAutomaticOracleTrace(state)
      : null;
  };

  const synchronizePresentationState = (): "unchanged" | "changed" | "conflict" => {
    const external = dependencies.shell.currentRunState();
    if (external === null) return "conflict";
    if (external === lastShellState || external === state) {
      return "unchanged";
    }
    lastShellState = external;
    try {
      const merged = mergeRetainedPresentationSettingsV1(state, external);
      if (merged.kind === "conflict") return "conflict";
      if (merged.kind === "unchanged") return "unchanged";
      state = merged.state;
      rebuildAutomaticTrace();
      return "changed";
    } catch {
      return "conflict";
    }
  };

  const commit = (candidate: RunStateV1): boolean => {
    let result: ReturnType<RunnerLaboratoryShellPort["saveRunnerLaboratoryState"]>;
    try {
      result = dependencies.shell.saveRunnerLaboratoryState(candidate);
    } catch {
      return failSession("The runner checkpoint could not be saved.");
    }
    if (result.kind === "invalid") {
      return failSession(result.notice.message, result.notice);
    }
    state = deepFreeze(result.state);
    lastShellState = result.state;
    notice = result.kind === "unavailable"
      ? deepFreeze({ ...result.notice })
      : null;
    return true;
  };

  const synchronizeRuntimeReasons = (): void => {
    lifecycle.setUserPaused(state.runner?.userPaused ?? false);
    lifecycle.setSemanticPaused(hasPendingSemanticMarker(state));
    if (lifecycle.activePauseReasons().length > 0) queuedLaneIntent = null;
  };

  const applySimulationResult = (
    result: RunnerSimulationResult,
    publishResult: boolean,
  ): boolean => {
    if (!result.stateChanged) {
      if (publishResult) publish(result.events);
      return false;
    }
    if (result.shouldPersist && !commit(result.state)) return false;
    if (!result.shouldPersist) state = result.state;
    synchronizeRuntimeReasons();
    if (publishResult) publish(result.events);
    return true;
  };

  const independentPauseReasons = (): readonly RunnerIndependentPauseReason[] =>
    runtimeToSimulationPauseReasons(lifecycle.activePauseReasons());

  const applyPendingSettlement = (): readonly RunnerSessionEvent[] => {
    if (
      state.runStatus !== "active" ||
      state.stage.phase !== "settling" ||
      state.stage.settlement?.status !== "pending"
    ) {
      return [];
    }
    let completed: RunStateV1;
    try {
      if (state.controlMode === "automatic-assist") {
        if (automaticTrace === null) {
          throw new TypeError("Automatic settlement requires its oracle trace");
        }
        completed = applyAutomaticLabSettlement(state, automaticTrace);
      } else {
        completed = applyLabSettlement(state, null);
      }
    } catch {
      failSession("The runner settlement could not be applied.");
      return [];
    }
    if (!commit(completed)) return [];
    synchronizeRuntimeReasons();
    return [deepFreeze({
      type: "settlement-applied" as const,
      simulationTick: state.simulationTick,
    })];
  };

  const advanceOneLogicalStep = (): RunnerSimulationResult => {
    const reasons = independentPauseReasons();
    if (state.controlMode === "automatic-assist") {
      if (automaticTrace === null) {
        throw new TypeError("Automatic runner requires its oracle trace");
      }
      return advanceAutomaticRunnerLaboratory(
        context,
        state,
        automaticTrace,
        reasons,
      );
    }
    const laneIntent = state.controlMode === "manual" ? queuedLaneIntent : null;
    queuedLaneIntent = null;
    return advanceRunnerLaboratory(context, state, {
      laneIntent,
      independentPauseReasons: reasons,
    });
  };

  const currentPauseKey = (): string => lifecycle.activePauseReasons().join("|");

  const onAnimationFrame = (): void => {
    frameHandle = null;
    if (disposed || faulted) return;
    const events: RunnerSessionEvent[] = [];
    const pauseBefore = snapshot.pauseReasons.join("|");
    const presentation = synchronizePresentationState();
    if (presentation === "conflict") {
      failSession("The active runner changed outside this session.");
      return;
    }
    if (presentation === "changed") {
      events.push(deepFreeze({
        type: "presentation-state-refreshed" as const,
        simulationTick: state.simulationTick,
      }));
    }

    synchronizeRuntimeReasons();
    if (state.stage.phase === "settling") {
      if (lifecycle.activePauseReasons().length === 0) {
        events.push(...applyPendingSettlement());
      }
    } else if (state.runStatus === "active" && state.stage.phase === "active") {
      let frame;
      try {
        frame = driver.advanceFrame(dependencies.clock.nowMilliseconds());
      } catch {
        failSession("The runner frame clock became invalid.");
        return;
      }
      droppedLogicalSteps = frame.droppedLogicalSteps;
      for (let step = 0; step < frame.logicalSteps; step += 1) {
        let result: RunnerSimulationResult;
        try {
          result = advanceOneLogicalStep();
        } catch {
          failSession("The runner simulation could not advance.");
          return;
        }
        if (!result.stateChanged) {
          events.push(...result.events);
          break;
        }
        if (result.shouldPersist && !commit(result.state)) return;
        if (!result.shouldPersist) state = result.state;
        events.push(...result.events);
        synchronizeRuntimeReasons();
        if (
          lifecycle.activePauseReasons().length > 0 ||
          state.stage.phase !== "active" ||
          state.runStatus !== "active"
        ) {
          break;
        }
      }
    }

    const pauseAfter = currentPauseKey();
    if (pauseAfter !== pauseBefore) {
      events.push(deepFreeze({
        type: "runtime-pause-changed" as const,
        pauseReasons: lifecycle.activePauseReasons(),
      }));
    }
    if (events.length > 0 || presentation === "changed") publish(events);
    if (
      !disposed &&
      !faulted &&
      state.runStatus !== "completed" &&
      state.stage.phase !== "complete"
    ) {
      frameHandle = dependencies.animationFrame.requestAnimationFrame(onAnimationFrame);
    }
  };

  const scheduleInitialFrame = (): void => {
    if (
      frameHandle === null &&
      !disposed &&
      !faulted &&
      state.runStatus !== "completed" &&
      state.stage.phase !== "complete"
    ) {
      frameHandle = dependencies.animationFrame.requestAnimationFrame(onAnimationFrame);
    }
  };

  synchronizeRuntimeReasons();
  snapshot = createSnapshot();
  scheduleInitialFrame();

  return {
    getSnapshot(): RunnerSessionSnapshot {
      return snapshot;
    },
    subscribe(listener: (next: RunnerSessionSnapshot) => void): () => void {
      if (disposed) return () => undefined;
      listeners.add(listener);
      try {
        listener(snapshot);
      } catch (error) {
        listeners.delete(listener);
        throw error;
      }
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
    start(): boolean {
      if (disposed || faulted || started()) return false;
      if (synchronizePresentationState() === "conflict") {
        return failSession("The active runner changed outside this session.");
      }
      let result: RunnerSimulationResult;
      try {
        result = state.controlMode === "automatic-assist"
          ? startAutomaticRunnerLaboratory(
              context,
              state,
              automaticTrace!,
              independentPauseReasons(),
            )
          : startRunnerLaboratory(context, state, independentPauseReasons());
      } catch {
        return failSession("The runner could not start.");
      }
      return applySimulationResult(result, true);
    },
    requestLaneIntent(intent: LaneDirection): boolean {
      if (intent !== "up" && intent !== "down") {
        throw new TypeError("runner lane intent must be up or down");
      }
      if (
        disposed ||
        faulted ||
        state.controlMode !== "manual" ||
        state.runStatus !== "active" ||
        state.stage.phase !== "active" ||
        !started() ||
        lifecycle.activePauseReasons().length > 0 ||
        queuedLaneIntent !== null
      ) {
        return false;
      }
      queuedLaneIntent = intent;
      publish();
      return true;
    },
    chooseLane(targetLane: Lane): boolean {
      if (targetLane !== 0 && targetLane !== 1 && targetLane !== 2) {
        throw new RangeError("runner target lane must be 0, 1, or 2");
      }
      if (disposed || faulted || state.controlMode !== "semantic-assist") {
        return false;
      }
      if (synchronizePresentationState() === "conflict") {
        return failSession("The active runner changed outside this session.");
      }
      let result: RunnerSimulationResult;
      try {
        result = chooseSemanticLane(
          context,
          state,
          targetLane,
          independentPauseReasons(),
        );
      } catch {
        return failSession("The Semantic lane choice could not be applied.");
      }
      return applySimulationResult(result, true);
    },
    setUserPaused(active: boolean): boolean {
      if (typeof active !== "boolean") {
        throw new TypeError("runner user pause state must be a boolean");
      }
      if (
        disposed ||
        faulted ||
        !started() ||
        state.runStatus !== "active" ||
        state.stage.phase !== "active" ||
        state.runner === null ||
        state.runner.userPaused === active
      ) {
        return false;
      }
      if (synchronizePresentationState() === "conflict") {
        return failSession("The active runner changed outside this session.");
      }
      const candidate = deepFreeze({
        ...state,
        runner: {
          ...state.runner,
          userPaused: active,
        },
      });
      if (!commit(candidate)) return false;
      queuedLaneIntent = null;
      lifecycle.setUserPaused(active);
      publish([deepFreeze({ type: "user-pause-changed" as const, active })]);
      return true;
    },
    setModalOpen(active: boolean): boolean {
      if (typeof active !== "boolean") {
        throw new TypeError("runner modal state must be a boolean");
      }
      if (disposed || faulted) return false;
      let before: boolean;
      try {
        before = lifecycle.activePauseReasons().includes("modal");
        if (!lifecycle.setModalOpen(active)) return false;
      } catch {
        return false;
      }
      if (active) queuedLaneIntent = null;
      if (before !== active) {
        publish([deepFreeze({
          type: "runtime-pause-changed" as const,
          pauseReasons: lifecycle.activePauseReasons(),
        })]);
      }
      try {
        return lifecycle.activePauseReasons().includes("modal") === active;
      } catch {
        return false;
      }
    },
    resumeInterruption(reason: RuntimeInterruptionReason): boolean {
      if (disposed || faulted) return false;
      const changed = lifecycle.resumeInterruption(reason);
      if (!changed) return false;
      queuedLaneIntent = null;
      publish([deepFreeze({
        type: "runtime-pause-changed" as const,
        pauseReasons: lifecycle.activePauseReasons(),
      })]);
      return true;
    },
    reportPresentationFault(message: string): boolean {
      if (
        typeof message !== "string" ||
        message.trim().length === 0 ||
        message.length > 500
      ) {
        throw new TypeError("runner presentation fault message is invalid");
      }
      if (disposed || faulted) return false;
      failSession(message.trim());
      return true;
    },
    refreshPresentationState(): boolean {
      if (disposed || faulted) return false;
      const result = synchronizePresentationState();
      if (result === "conflict") {
        return failSession("The active runner changed outside this session.");
      }
      if (result === "unchanged") return false;
      publish([deepFreeze({
        type: "presentation-state-refreshed" as const,
        simulationTick: state.simulationTick,
      })]);
      return true;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (frameHandle !== null) {
        dependencies.animationFrame.cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }
      lifecycle.dispose();
      queuedLaneIntent = null;
      publish();
      listeners.clear();
    },
  };
}
