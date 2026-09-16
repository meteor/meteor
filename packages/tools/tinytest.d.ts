// Minimal type declarations for meteor/tinytest
export namespace Tinytest {
  interface Test {
    isTrue(value: boolean, message?: string): void;
    isFalse(value: boolean, message?: string): void;
    equal<T>(actual: T, expected: T, message?: string): void;
    notEqual<T>(actual: T, expected: T, message?: string): void;
    throws(func: () => void, expected?: string | RegExp): void;
  }

  function add(name: string, func: (test: Test) => void): void;
  function addAsync(
    name: string,
    func: (test: Test, onComplete: () => void) => void
  ): void;
}
