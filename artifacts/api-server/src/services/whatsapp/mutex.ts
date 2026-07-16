/** Basit async mutex — aynı session için tek Client işlemi. */
export class Mutex {
  private chain: Promise<void> = Promise.resolve();
  private locked = false;

  get isLocked(): boolean {
    return this.locked;
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.chain;
    this.chain = prev.then(() => next);
    await prev;
    this.locked = true;
    try {
      return await fn();
    } finally {
      this.locked = false;
      release();
    }
  }
}

const locks = new Map<string, Mutex>();

export function getSessionLock(sessionId: string): Mutex {
  let m = locks.get(sessionId);
  if (!m) {
    m = new Mutex();
    locks.set(sessionId, m);
  }
  return m;
}
