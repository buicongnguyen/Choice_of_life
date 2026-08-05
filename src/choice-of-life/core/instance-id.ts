import { canonicalizeJson, fnv1a64Hex } from "./canonical-json";
import type { PatternKey } from "./pattern-entropy";

export const ENTITY_INSTANCE_ID_VERSION = "entity-instance-v1" as const;

export interface EntityInstanceCoordinates extends PatternKey {
  readonly slotIndex: number;
  readonly contentId: string;
}

const RUN_SEED_PATTERN = /^[0-9a-f]{16}$/;
const CATALOG_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9][0-9]*$/;

export function deriveEntityInstanceIdV1(coordinates: EntityInstanceCoordinates): string {
  if (!RUN_SEED_PATTERN.test(coordinates.runSeed)) throw new TypeError("Invalid entity run seed");
  if (!CATALOG_ID_PATTERN.test(coordinates.stageId) || coordinates.stageId.length > 64) {
    throw new TypeError("Invalid entity stage ID");
  }
  if (!CATALOG_ID_PATTERN.test(coordinates.contentId) || coordinates.contentId.length > 64) {
    throw new TypeError("Invalid entity content ID");
  }
  if (!Number.isSafeInteger(coordinates.patternIndex) || coordinates.patternIndex < 0) {
    throw new TypeError("Invalid entity pattern index");
  }
  if (!Number.isSafeInteger(coordinates.slotIndex) || coordinates.slotIndex < 0 || coordinates.slotIndex > 63) {
    throw new TypeError("Invalid entity slot index");
  }
  const payload = canonicalizeJson({
    "contentId": coordinates.contentId,
    "patternIndex": coordinates.patternIndex,
    "runSeed": coordinates.runSeed,
    "slotIndex": coordinates.slotIndex,
    "stageId": coordinates.stageId,
    "version": ENTITY_INSTANCE_ID_VERSION,
  });
  return `entity-${fnv1a64Hex(payload)}`;
}
