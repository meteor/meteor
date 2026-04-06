export namespace Base64 {
  /**
   * Encode a Uint8Array or ASCII string to a Base64 string.
   * @param input The data to encode. If a string, it must be ASCII-only.
   * @returns The Base64-encoded string
   * @throws Error if the input string contains non-ASCII characters
   */
  function encode(input: Uint8Array | string): string;

  /**
   * Decode a Base64 string to a Uint8Array.
   * @param str The Base64-encoded string to decode
   * @returns The decoded binary data
   * @throws Error if the input is not valid Base64
   */
  function decode(str: string): Uint8Array;

  /**
   * Create a new binary array of the specified length, initialized to zeros.
   * Uses Uint8Array when available, otherwise falls back to a polyfill array.
   * @param len The length of the binary array to create
   * @returns A Uint8Array of the specified length
   */
  function newBinary(len: number): Uint8Array;
}
