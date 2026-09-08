// Rust toolchain management for the Tauri build pipeline.
//
// Tauri builds native binaries with Cargo, so a Rust toolchain (rustc + cargo)
// must be available. This module detects the toolchain and, when missing,
// offers to install it via rustup.

import { Console } from '../console/console.js';
import { execFileAsync } from '../utils/processes';
import buildmessage from '../utils/buildmessage.js';

// Returns true if both `cargo` and `rustc` are runnable.
export async function hasRustToolchain() {
  for (const bin of ['cargo', 'rustc']) {
    try {
      await execFileAsync(bin, ['--version'], { stdio: 'pipe' });
    } catch (e) {
      return false;
    }
  }
  return true;
}

// Returns true if `rustup` is available.
async function hasRustup() {
  try {
    await execFileAsync('rustup', ['--version'], { stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

// Attempt to install Rust via rustup's official installer (non-interactive).
// Returns true on success. Only runs on POSIX hosts; on Windows we point the
// user at the installer.
async function installRustViaRustup() {
  if (process.platform === 'win32') {
    Console.info(
      'Please install Rust from', Console.url('https://rustup.rs/'),
      'and re-run this command.');
    return false;
  }

  Console.info('Installing the Rust toolchain via rustup...');
  try {
    // curl https://sh.rustup.rs -sSf | sh -s -- -y
    await execFileAsync('/bin/sh', ['-c',
      'curl --proto =https --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y'],
      { stdio: 'inherit' });
    return await hasRustToolchain();
  } catch (e) {
    Console.error('Failed to install Rust automatically:', e.message);
    return false;
  }
}

// Ensures a usable Rust toolchain is present, attempting auto-install when it
// is not. Adds a buildmessage error (so the caller can abort) if it cannot be
// made available.
export async function ensureRustToolchain({ autoInstall = true } = {}) {
  if (await hasRustToolchain()) {
    return true;
  }

  Console.warn('The Tauri build target requires a Rust toolchain (cargo/rustc), '
    + 'which was not found on your PATH.');

  if (autoInstall) {
    if (await hasRustup()) {
      Console.info('Found rustup; installing the default toolchain...');
      try {
        await execFileAsync('rustup', ['toolchain', 'install', 'stable'],
          { stdio: 'inherit' });
        await execFileAsync('rustup', ['default', 'stable'],
          { stdio: 'pipe' });
      } catch (e) {
        // fall through to the installer below
      }
      if (await hasRustToolchain()) {
        return true;
      }
    }

    if (await installRustViaRustup()) {
      Console.info('Rust toolchain installed. You may need to restart your '
        + 'shell (or run `source $HOME/.cargo/env`) for cargo to be on PATH.');
      return true;
    }
  }

  buildmessage.error(
    'A Rust toolchain is required to build Tauri apps. Install it from '
    + 'https://rustup.rs/ and ensure `cargo` is on your PATH.');
  return false;
}
