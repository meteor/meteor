export namespace OAuthEncryption {
  /**
   * Load the AES-128-GCM key used to seal/open OAuth secrets. Pass `null` to
   * unload the current key.
   * @param key Base64-encoded 16-byte key, or `null` to clear it.
   */
  export function loadKey(key: string | null): void;

  /** Whether an encryption key is currently loaded. */
  export function keyIsLoaded(): boolean;

  /**
   * Encrypt `data`, binding the ciphertext to `userId` as additional
   * authenticated data. Returns the sealed value.
   */
  export function seal(data: unknown, userId: string): string;

  /**
   * Decrypt a value previously produced by `seal`, verifying it was bound to
   * `userId`. Returns the original data.
   */
  export function open(ciphertext: string, userId: string): unknown;

  /** Whether `value` looks like a value produced by `seal`. */
  export function isSealed(value: unknown): boolean;
}
