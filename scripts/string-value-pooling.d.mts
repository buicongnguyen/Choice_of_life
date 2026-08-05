import type { Plugin } from "vite";

export interface StringValuePoolingOptions {
  readonly identifierPrefix?: string;
  readonly minimumEstimatedSavings?: number;
  readonly minimumOccurrences?: number;
  readonly minimumStringLength?: number;
}

export interface StringValuePoolingResult {
  readonly changed: boolean;
  readonly code: string;
  readonly estimatedIdentifierBytes: 2 | 3 | null;
  readonly estimatedSavings: number;
  readonly pooledOccurrenceCount: number;
  readonly pooledValueCount: number;
  readonly skipReason: "direct-eval" | null;
}

export function poolRepeatedStringValues(
  source: string,
  options?: StringValuePoolingOptions,
): StringValuePoolingResult;

export function createRepeatedStringValuePoolingPlugin(
  options?: StringValuePoolingOptions,
): Plugin;
