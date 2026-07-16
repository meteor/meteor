/**
 * Start listening for `meteor shell` connections on the socket inside
 * `shellDir` (the app's local shell directory).
 */
export function listen(shellDir: string): void;

/**
 * Stop serving `meteor shell` connections for `shellDir`.
 */
export function disable(shellDir: string): void;
