// Tauri integration for Meteor.
//
// This mirrors tools/cordova/index.js. Tauri is a native packaging target
// (macOS first, extensible to ios/android/windows/linux) that reuses the
// Meteor client bundle produced for the "web.tauri" architecture.

export const TAURI_ARCH = "web.tauri";

// Platform identifiers stored in .meteor/platforms. Unlike Cordova (which uses
// bare "ios"/"android"), Tauri platforms are namespaced with a "tauri-" prefix
// so they can coexist with Cordova platforms in the same project.
export const TAURI_PLATFORMS = [
  'tauri-macos',
  'tauri-ios',
  'tauri-android',
  'tauri-windows',
  'tauri-linux',
];

// Only macOS is wired end-to-end for now; the rest are reserved so that
// add-platform/list-platforms can grow without further core changes.
export const TAURI_SUPPORTED_PLATFORMS = ['tauri-macos'];

const PLATFORM_TO_DISPLAY_NAME_MAP = {
  'tauri-macos': 'Tauri (macOS)',
  'tauri-ios': 'Tauri (iOS)',
  'tauri-android': 'Tauri (Android)',
  'tauri-windows': 'Tauri (Windows)',
  'tauri-linux': 'Tauri (Linux)',
};

export function displayNameForPlatform(platform) {
  return PLATFORM_TO_DISPLAY_NAME_MAP[platform] || platform;
}

// Maps a Tauri platform id to the host OS that is able to build it. Used to
// give a friendly error when building on the wrong host.
const PLATFORM_TO_HOST_OS_MAP = {
  'tauri-macos': 'darwin',
  'tauri-ios': 'darwin',
  // android can build from any host with the Android toolchain
  'tauri-android': null,
  'tauri-windows': 'win32',
  'tauri-linux': 'linux',
};

export function hostOsForPlatform(platform) {
  return PLATFORM_TO_HOST_OS_MAP[platform];
}

export function isTauriPlatform(platform) {
  return TAURI_PLATFORMS.indexOf(platform) !== -1;
}
