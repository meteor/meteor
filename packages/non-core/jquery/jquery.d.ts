// These safe fallbacks keep the historically untyped package importable
// without forcing applications to install @types/jquery. Unknown members must
// be narrowed or augmented by a plugin declaration before use. The global
// interface names and generic arity match DefinitelyTyped, so projects that do
// install @types/jquery get its complete API through declaration merging.
declare global {
  interface JQuery<TElement = HTMLElement> {
    [member: string]: unknown;
  }

  interface JQueryStatic {
    (selector?: unknown, context?: unknown): JQuery;
    [member: string]: unknown;
  }
}

export const $: JQueryStatic;
export const jQuery: JQueryStatic;
