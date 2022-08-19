declare module "meteor/random" {
  namespace Random {
    /**
     * Return a unique identifier, such as `"Jjwjg6gouWLXhMGKW"`, that is
     * likely to be unique in the whole world.
     * @param numberOfChars Optional length of the identifier in characters (defaults to 17)
     */
    function id(numberOfChars?: number): string;

    /**
     * Return a random string of printable characters with 6 bits of
     * entropy per character. Use `Random.secret` for security-critical secrets
     * that are intended for machine, rather than human, consumption.
     * @param numberOfChars Optional length of the secret string (defaults to 43 characters, or 256 bits of entropy)
     */
    function secret(numberOfChars?: number): string;

    /**
     * @summary Return a number between 0 and 1, like `Math.random`.
     * @see Math.random
     */
    function fraction(): number;

    /**
     * @param numberOfDigits Length of the string
     * @returns a random hex string of the given length from param
     */
    function hexString(numberOfDigits: number): string;

    /**
     * Return a random element of the given array or string.
     * @param array Array to choose from.
     */
    function choice<T>(array: T[]): T | undefined;

    /**
     * Return a random element of the given array or string.
     * @param str string to choose from.
     */
    function choice(str: string): string;
  }
}
