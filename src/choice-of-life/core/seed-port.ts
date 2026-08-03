import type { RunSeed } from "./pattern-entropy";

export interface SeedPort {
  nextSeed(): RunSeed;
}
