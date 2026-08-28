// These deliberately permissive fallbacks keep the historically untyped
// package usable without forcing applications to install @types/jquery.  The
// global interface names and generic arity match DefinitelyTyped, so projects
// that do install @types/jquery get its complete API through declaration
// merging instead of a competing private definition.
declare global {
  interface JQuery<TElement = HTMLElement> {
    [member: string]: any;
  }

  interface JQueryStatic {
    (selector?: any, context?: any): JQuery;
    [member: string]: any;
  }
}

export const $: JQueryStatic;
export const jQuery: JQueryStatic;
