export interface IFace {
  a: number;
}

export type Alias = { key: string };

export class Klass {
  method(): void {}
}

export function fn(): void;

export enum Enum {
  A,
  B,
}

export namespace Ns {
  export interface Inner {
    x: number;
  }
}

export const CONST_V: number;

declare const _default: { hello: string };
export default _default;
