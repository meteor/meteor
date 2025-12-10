export {}

declare global {
  interface JSON {
    // The ES5 library fails to allow the input parameter to be a Buffer.
    parse(input: Buffer | string, reviver?: (this: any, key: string, value: any) => any): any;
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
