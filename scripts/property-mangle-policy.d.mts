export interface PropertyMangleGraphComparison {
  readonly rollupSourceFiles: readonly string[];
  readonly emittedSourceFiles: readonly string[];
  readonly missingFromPolicy: readonly string[];
  readonly absentFromRollupGraph: readonly string[];
  readonly emittedMissingFromPolicy: readonly string[];
  readonly treeShakenSourceFiles: readonly string[];
}

export interface AuditedPropertyMangleOptions {
  readonly regex: RegExp;
  readonly keep_quoted: "strict";
  readonly builtins: false;
}

export function createAuditedPropertyMangleOptions(
  repoRoot?: string,
): AuditedPropertyMangleOptions;

export function assertPropertyMangleProductionGraph(
  repoRoot: string,
  rollupModuleIds: Iterable<string>,
  emittedModuleIds?: Iterable<string>,
): PropertyMangleGraphComparison;
