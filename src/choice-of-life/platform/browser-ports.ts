import type { RunSeed } from "../core/pattern-entropy";
import type { SeedPort } from "../core/seed-port";
import type { StoragePort } from "../persistence/storage-port";

export function createBrowserStoragePort(
  storageProvider: () => Storage = () => window.localStorage,
): StoragePort {
  return {
    getItem(key: string): string | null {
      return storageProvider().getItem(key);
    },
    setItem(key: string, value: string): void {
      storageProvider().setItem(key, value);
    },
    removeItem(key: string): void {
      storageProvider().removeItem(key);
    },
  };
}

export function createBrowserSeedPort(
  cryptoProvider: () => Pick<Crypto, "getRandomValues"> = () => window.crypto,
): SeedPort {
  return {
    nextSeed(): RunSeed {
      const bytes = new Uint8Array(8);
      cryptoProvider().getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") as RunSeed;
    },
  };
}
