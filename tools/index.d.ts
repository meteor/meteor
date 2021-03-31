export {}

declare global {
  interface JSON {
    // The ES5 library fails to allow the input parameter to be a Buffer.
    parse(input: Buffer | string, reviver?: (this: any, key: string, value: any) => any): any;
  }

  interface Promise<T> {
    // This is an incomplete list of methods added to Promise.prototype by the
    // meteor-promise npm package. TODO Eventually these declarations should be
    // moved into that package.
    await(): T;
  }

  // Promise.await(x) is a shorthand provided by meteor-promise for
  // Promise.resolve(x).await().
  interface PromiseConstructor {
    await<T>(arg: T | PromiseLike<T>): T;
  }

  interface Function {
    // func-utils.ts makes usage of this feature
    displayName?: string;
  }

  type DiscardPattern = string | RegExp;

  interface Discards {
    [packageName: string]: DiscardPattern[];
  }

  interface DiscardsInput {
    [packageName: string]: DiscardPattern[] | DiscardPattern;
  }
}
