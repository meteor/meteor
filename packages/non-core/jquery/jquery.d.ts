// Minimal typing for the jquery core package. This package re-exports whatever
// `jquery` version is installed in the app's node_modules; for the full API,
// run `meteor npm install @types/jquery` in your app.
interface JQueryStatic {
  (selector: string | Element | object, context?: Element | object): unknown;
  ajax(settings: object): unknown;
  each<T>(collection: readonly T[], callback: (index: number, value: T) => void): void;
  extend(target: object, ...sources: object[]): object;
  readonly fn: object;
}

export const $: JQueryStatic;
export const jQuery: JQueryStatic;
