export type Cleanup = () => void;

export class CleanupBag {
  readonly #cleanups: Cleanup[] = [];
  #disposed = false;

  add(cleanup: Cleanup): Cleanup {
    if (this.#disposed) {
      cleanup();
      return cleanup;
    }
    this.#cleanups.push(cleanup);
    return cleanup;
  }

  listen<T extends EventTarget>(
    target: T,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.add(() => target.removeEventListener(type, listener, options));
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (let index = this.#cleanups.length - 1; index >= 0; index -= 1) {
      try {
        this.#cleanups[index]?.();
      } catch {
        // Cleanup is best-effort: one faulty adapter must not strand later work.
      }
    }
    this.#cleanups.length = 0;
  }
}
