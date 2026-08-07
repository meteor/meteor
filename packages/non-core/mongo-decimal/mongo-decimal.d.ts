// Minimal typing for the Decimal type (decimal.js) as extended by mongo-decimal
// with the EJSON hooks it adds at runtime (typeName/toJSONValue/clone).
export class Decimal {
  constructor(value: string | number | Decimal);
  toString(): string;
  toJSON(): string;
  toNumber(): number;
  plus(n: Decimal | string | number): Decimal;
  minus(n: Decimal | string | number): Decimal;
  times(n: Decimal | string | number): Decimal;
  div(n: Decimal | string | number): Decimal;
  equals(n: Decimal | string | number): boolean;
  /** EJSON type name — added by mongo-decimal. */
  typeName(): string;
  /** EJSON serialization — added by mongo-decimal. */
  toJSONValue(): string;
  /** Returns a copy — added by mongo-decimal. */
  clone(): Decimal;
}
