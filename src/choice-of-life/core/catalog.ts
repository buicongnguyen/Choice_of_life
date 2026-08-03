import { RUN_STATE_CONTENT_VERSION } from "./run-state";

export type CatalogDomain =
  | "stage"
  | "entity"
  | "effect-category"
  | "choice"
  | "option"
  | "fact"
  | "value"
  | "memory"
  | "credential"
  | "person"
  | "condition"
  | "encounter"
  | "consequence"
  | "text-input"
  | "terminal-reason"
  | "acknowledgment";

export interface CatalogRegistry {
  readonly contentVersion: typeof RUN_STATE_CONTENT_VERSION;
  readonly entityInstanceIdPolicy: "stable-coordinate-v1" | "contract-fixture-v1";
  has(domain: CatalogDomain, id: string): boolean;
  metadata(domain: CatalogDomain, id: string): CatalogMetadata | null;
}

export interface CatalogMetadata {
  readonly kind: string | null;
  readonly encounterId: string | null;
  readonly choiceId: string | null;
  readonly allowedEffectSources: readonly string[] | null;
  readonly allowedTerminalStatuses: readonly string[] | null;
}

export interface CatalogRecord {
  readonly id: string;
  readonly kind?: string;
  readonly encounterId?: string;
  readonly choiceId?: string;
  readonly allowedEffectSources?: readonly ("runner" | "choice" | "callback" | "settlement" | "recovery" | "system")[];
  readonly allowedTerminalStatuses?: readonly ("complete" | "expired" | "superseded")[];
}

export type CatalogEntry = string | CatalogRecord;
export type CatalogEntries = Readonly<Partial<Record<CatalogDomain, readonly CatalogEntry[]>>>;

const CATALOG_DOMAINS: readonly CatalogDomain[] = [
  "stage",
  "entity",
  "effect-category",
  "choice",
  "option",
  "fact",
  "value",
  "memory",
  "credential",
  "person",
  "condition",
  "encounter",
  "consequence",
  "text-input",
  "terminal-reason",
  "acknowledgment",
];

const CATALOG_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9][0-9]*$/;
const KINDS_BY_DOMAIN: Readonly<Partial<Record<CatalogDomain, readonly string[]>>> = Object.freeze({
  entity: ["benefit", "hazard", "narrative", "opportunity"],
  fact: ["learning", "care", "community", "autonomy", "route"],
  memory: ["milestone", "relationship", "challenge", "joy"],
  credential: ["education", "training", "license", "experience"],
  condition: ["support", "stress", "health", "opportunity", "constraint"],
  encounter: ["caregiver", "friend", "mentor", "stranger", "institution", "self-reflection"],
});

export function createCatalogRegistry(
  entries: CatalogEntries,
  options: Readonly<{ entityInstanceIdPolicy?: CatalogRegistry["entityInstanceIdPolicy"] }> = {},
): CatalogRegistry {
  if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
    throw new Error("Catalog entries must be an object");
  }
  const unknownDomain = Object.keys(entries).find((domain) => !CATALOG_DOMAINS.includes(domain as CatalogDomain));
  if (unknownDomain !== undefined) throw new Error(`Unknown catalog domain: ${unknownDomain}`);
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Catalog options must be an object");
  }
  const unknownOption = Object.keys(options).find((key) => key !== "entityInstanceIdPolicy");
  if (unknownOption !== undefined) throw new Error(`Unknown catalog option: ${unknownOption}`);
  const entityInstanceIdPolicy = options.entityInstanceIdPolicy ?? "stable-coordinate-v1";
  if (entityInstanceIdPolicy !== "stable-coordinate-v1" && entityInstanceIdPolicy !== "contract-fixture-v1") {
    throw new Error(`Invalid entity instance ID policy: ${String(entityInstanceIdPolicy)}`);
  }
  const records = new Map<CatalogDomain, ReadonlyMap<string, CatalogMetadata>>();
  const idOwners = new Map<string, CatalogDomain>();
  for (const domain of CATALOG_DOMAINS) {
    const domainRecords = new Map<string, CatalogMetadata>();
    for (const entry of entries[domain] ?? []) {
      const record = typeof entry === "string" ? { id: entry } : entry;
      if (record.id.length > 64 || !CATALOG_ID.test(record.id)) {
        throw new Error(`Invalid ${domain} catalog ID: ${record.id}`);
      }
      if (domainRecords.has(record.id)) throw new Error(`Duplicate ${domain} catalog ID: ${record.id}`);
      const priorDomain = idOwners.get(record.id);
      if (priorDomain !== undefined) {
        throw new Error(`Duplicate catalog ID across domains ${priorDomain}/${domain}: ${record.id}`);
      }
      idOwners.set(record.id, domain);
      const allowedKinds = KINDS_BY_DOMAIN[domain];
      if (allowedKinds !== undefined) {
        if (record.kind === undefined || !allowedKinds.includes(record.kind)) {
          throw new Error(`Invalid or missing ${domain} kind for ${record.id}`);
        }
      } else if (record.kind !== undefined) {
        throw new Error(`Catalog kind is not applicable to ${domain}: ${record.id}`);
      }
      if (domain === "option") {
        if (record.encounterId === undefined || record.choiceId === undefined) {
          throw new Error(`Option metadata is incomplete: ${record.id}`);
        }
      } else if (record.encounterId !== undefined || record.choiceId !== undefined) {
        throw new Error(`Option ownership metadata is not applicable to ${domain}: ${record.id}`);
      }
      if (domain === "effect-category") {
        if (record.allowedEffectSources === undefined || record.allowedEffectSources.length === 0) {
          throw new Error(`Effect category source metadata is incomplete: ${record.id}`);
        }
      } else if (record.allowedEffectSources !== undefined) {
        throw new Error(`Effect source metadata is not applicable to ${domain}: ${record.id}`);
      }
      if (domain === "terminal-reason") {
        if (record.allowedTerminalStatuses === undefined || record.allowedTerminalStatuses.length === 0) {
          throw new Error(`Terminal reason status metadata is incomplete: ${record.id}`);
        }
      } else if (record.allowedTerminalStatuses !== undefined) {
        throw new Error(`Terminal status metadata is not applicable to ${domain}: ${record.id}`);
      }
      domainRecords.set(record.id, Object.freeze({
        kind: record.kind ?? null,
        encounterId: record.encounterId ?? null,
        choiceId: record.choiceId ?? null,
        allowedEffectSources: record.allowedEffectSources === undefined ? null : Object.freeze([...new Set(record.allowedEffectSources)]),
        allowedTerminalStatuses: record.allowedTerminalStatuses === undefined ? null : Object.freeze([...new Set(record.allowedTerminalStatuses)]),
      }));
    }
    records.set(domain, domainRecords);
  }
  for (const [id, metadata] of records.get("option") ?? []) {
    if (!(records.get("encounter")?.has(metadata.encounterId ?? "") ?? false)) {
      throw new Error(`Option ${id} references an unknown encounter`);
    }
    if (!(records.get("choice")?.has(metadata.choiceId ?? "") ?? false)) {
      throw new Error(`Option ${id} references an unknown choice`);
    }
  }
  return Object.freeze({
    contentVersion: RUN_STATE_CONTENT_VERSION,
    entityInstanceIdPolicy,
    has(domain: CatalogDomain, id: string): boolean {
      return records.get(domain)?.has(id) ?? false;
    },
    metadata(domain: CatalogDomain, id: string): CatalogMetadata | null {
      return records.get(domain)?.get(id) ?? null;
    },
  });
}

export const PHASE_1_CATALOG = createCatalogRegistry({
  stage: ["setup-shell-v1"],
});

export const RUN_STATE_CONTRACT_ENTRIES: CatalogEntries = {
  stage: ["setup-shell-v1", "runner-lab-v1", "newborn-v1"],
  entity: [
    { id: "runner-contract-hazard-v1", kind: "hazard" },
    { id: "runner-contract-benefit-v1", kind: "benefit" },
  ],
  "effect-category": [
    { id: "choice-practice-v1", allowedEffectSources: ["choice", "system"] },
    { id: "hazard-depletion-v1", allowedEffectSources: ["runner"] },
    { id: "recovery-bounded-v1", allowedEffectSources: ["recovery"] },
  ],
  choice: ["choice-ask-for-help-v1", "choice-other-v1"],
  option: [
    {
      id: "option-ask-for-help-v1",
      encounterId: "encounter-practice-help-v1",
      choiceId: "choice-ask-for-help-v1",
    },
    {
      id: "option-try-alone-v1",
      encounterId: "encounter-practice-help-v1",
      choiceId: "choice-ask-for-help-v1",
    },
    {
      id: "option-other-v1",
      encounterId: "encounter-practice-help-v1",
      choiceId: "choice-other-v1",
    },
  ],
  fact: [{ id: "fact-asked-for-help-v1", kind: "care" }],
  value: ["value-trust-support-v1"],
  memory: [{ id: "memory-first-support-v1", kind: "relationship" }],
  credential: [{ id: "credential-practice-v1", kind: "training" }],
  person: ["person-caregiver-a-v1"],
  condition: [{ id: "condition-supported-v1", kind: "support" }],
  encounter: [{ id: "encounter-practice-help-v1", kind: "caregiver" }],
  consequence: [
    "consequence-support-callback-v1",
    "consequence-practice-result-v1",
    "consequence-replaced-support-v1",
  ],
  "text-input": ["text-input-support-v1"],
  "terminal-reason": [
    { id: "reason-merged-into-support-v1", allowedTerminalStatuses: ["complete", "expired", "superseded"] },
    { id: "reason-complete-v1", allowedTerminalStatuses: ["complete"] },
    { id: "reason-expired-v1", allowedTerminalStatuses: ["expired"] },
  ],
  acknowledgment: ["acknowledgment-support-recap-v1"],
};

export const RUN_STATE_CONTRACT_FIXTURE_CATALOG = createCatalogRegistry(
  RUN_STATE_CONTRACT_ENTRIES,
  { entityInstanceIdPolicy: "contract-fixture-v1" },
);

export const STRICT_RUN_STATE_CONTRACT_CATALOG = createCatalogRegistry(RUN_STATE_CONTRACT_ENTRIES);
