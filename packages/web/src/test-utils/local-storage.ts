import { afterEach, beforeEach } from 'vitest';

/**
 * テスト環境の window.localStorage を、毎テスト空のインメモリ実装に差し替える。
 * Node 側の localStorage が jsdom のものを覆い隠して clear() などが欠けるため。
 */
export function useInMemoryLocalStorage(): void {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');

  beforeEach(() => {
    const store = new Map<string, string>();
    const stub: Storage = {
      get length() {
        return store.size;
      },
      key: (index) => Array.from(store.keys())[index] ?? null,
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, String(value));
      },
      removeItem: (key) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    };
    Object.defineProperty(window, 'localStorage', {
      value: stub,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
}
