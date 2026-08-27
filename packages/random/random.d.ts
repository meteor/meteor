export namespace Random {
  function id(numberOfChars?: number): string;

  function secret(numberOfChars?: number): string;

  function fraction(): number;
  // @param numberOfDigits, @returns a random hex string of the given length
  function hexString(numberOfDigits: number): string;
  // @param array, @return a random element in array
  function choice<T>(array: T[]): T | undefined;
  // @param str, @return a random char in str
  function choice(str: string): string;

  /** A random generator with the same API as `Random`. */
  interface RandomGenerator {
    id(numberOfChars?: number): string;
    secret(numberOfChars?: number): string;
    fraction(): number;
    hexString(numberOfDigits: number): string;
    choice<T>(array: T[]): T | undefined;
    choice(str: string): string;
  }

  /** A fast, non-cryptographic generator (same API as `Random`). */
  var insecure: RandomGenerator;

  /** Create a deterministic generator seeded with the given values. */
  function createWithSeeds(
    firstSeed: string | number,
    ...additionalSeeds: (string | number)[]
  ): RandomGenerator;
}
