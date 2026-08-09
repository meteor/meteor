export interface RuntimeTestResult {
  ok: boolean;
  stats: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    todo: number;
  };
  cases: Array<{
    name: string;
    fullName: string;
    testPath?: string;
    status: 'pass' | 'fail' | 'skip' | 'todo';
    duration?: number;
    errors?: Array<{ name: string; message: string; stack: string }>;
  }>;
}

export interface RuntimeMatchers {
  not: RuntimeMatchers;
  resolves: RuntimeMatchers;
  rejects: RuntimeMatchers;
  toBe(expected: unknown): void | Promise<void>;
  toEqual(expected: unknown): void | Promise<void>;
  toStrictEqual(expected: unknown): void | Promise<void>;
  toBeTruthy(): void | Promise<void>;
  toBeFalsy(): void | Promise<void>;
  toBeDefined(): void | Promise<void>;
  toBeUndefined(): void | Promise<void>;
  toBeNull(): void | Promise<void>;
  toContain(expected: unknown): void | Promise<void>;
  toMatch(expected: string | RegExp): void | Promise<void>;
  toThrow(expected?: string | RegExp | Function): void | Promise<void>;
}

export interface RuntimeTestFunction {
  (name: string, callback: () => unknown | Promise<unknown>): void;
  skip(name: string, callback?: () => unknown): void;
  todo(name: string): void;
  only(name: string, callback: () => unknown | Promise<unknown>): void;
}

export const test: RuntimeTestFunction;
export const describe: ((name: string, callback: () => void) => void) & {
  skip(name: string, callback: () => void): void;
};
export const expect: (value: unknown) => RuntimeMatchers;
export const beforeAll: (callback: () => unknown | Promise<unknown>) => void;
export const afterAll: (callback: () => unknown | Promise<unknown>) => void;
export const beforeEach: (callback: () => unknown | Promise<unknown>) => void;
export const afterEach: (callback: () => unknown | Promise<unknown>) => void;
