export interface EJSONableCustomType {
  clone?(): EJSONableCustomType;
  equals?(other: Object): boolean;
  toJSONValue(): JSONable;
  typeName(): string;
}

export type EJSONableProperty =
  | number
  | string
  | boolean
  | Object
  | number[]
  | string[]
  | Object[]
  | Date
  | Uint8Array
  | EJSONableCustomType
  | undefined
  | null;

export interface EJSONable {
  [key: string]: EJSONableProperty;
}

export interface JSONable {
  [key: string]:
    | number
    | string
    | boolean
    | Object
    | number[]
    | string[]
    | Object[]
    | undefined
    | null;
}

export interface EJSON extends EJSONable {}

export namespace EJSON {
  function addType(
    name: string,
    factory: (val: JSONable) => EJSONableCustomType
  ): void;

  function clone<T>(val: T): T;

  function equals(
    a: EJSON,
    b: EJSON,
    options?: { keyOrderSensitive?: boolean | undefined }
  ): boolean;

  function fromJSONValue(val: JSONable): any;

  function isBinary(x: Object): x is Uint8Array;
  function newBinary(size: number): Uint8Array;

  function parse(str: string): EJSON;

  function stringify(
    val: EJSON,
    options?: {
      indent?: boolean | number | string | undefined;
      canonical?: boolean | undefined;
    }
  ): string;

  function toJSONValue(val: EJSON): JSONable;
}
