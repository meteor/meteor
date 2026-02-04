import { Tinytest } from "meteor/tinytest";

// Type compilation tests for meteor/tools
// These tests verify that TypeScript types are correctly defined.
// If this file compiles without errors, the types are correct.

// Import types to verify they exist
import { Assets, Npm, Package, App, Cordova, PackageAPI } from "meteor/tools";

// ============================================================================
// Assets type tests (runtime global)
// ============================================================================

Tinytest.addAsync("tools types - Assets.getTextAsync returns Promise<string>", async (test) => {
  // Type assertion: getTextAsync should return Promise<string>
  // We can't actually call it without a real asset, but we can verify the type signature
  const getTextAsync: (path: string) => Promise<string> = Assets.getTextAsync;
  test.isTrue(typeof getTextAsync === "function", "Assets.getTextAsync should be a function");
});

Tinytest.addAsync("tools types - Assets.getBinaryAsync returns Promise<Uint8Array>", async (test) => {
  // Type assertion: getBinaryAsync should return Promise<Uint8Array>
  const getBinaryAsync: (path: string) => Promise<Uint8Array> = Assets.getBinaryAsync;
  test.isTrue(typeof getBinaryAsync === "function", "Assets.getBinaryAsync should be a function");
});

Tinytest.add("tools types - Assets.absoluteFilePath returns string", (test) => {
  // Type assertion: absoluteFilePath should return string
  const absoluteFilePath: (path: string) => string = Assets.absoluteFilePath;
  test.isTrue(typeof absoluteFilePath === "function", "Assets.absoluteFilePath should be a function");
});

Tinytest.add("tools types - Assets.getServerDir returns string", (test) => {
  // Type assertion: getServerDir should return string
  const getServerDir: () => string = Assets.getServerDir;
  test.isTrue(typeof getServerDir === "function", "Assets.getServerDir should be a function");
});

// ============================================================================
// Package type tests (build-time, may not be available at runtime)
// ============================================================================

Tinytest.add("tools types - Package namespace exists", (test) => {
  // Package is a build-time global, but we can test the types compile
  test.isTrue(true, "Package types compiled successfully");
});

Tinytest.add("tools types - Npm namespace exists", (test) => {
  // Npm is a build-time global
  test.isTrue(true, "Npm types compiled successfully");
});

Tinytest.add("tools types - App namespace exists", (test) => {
  // App is a build-time global for mobile config
  test.isTrue(true, "App types compiled successfully");
});

Tinytest.add("tools types - Cordova namespace exists", (test) => {
  // Cordova is a build-time global
  test.isTrue(true, "Cordova types compiled successfully");
});

// ============================================================================
// Type-level tests (compilation only, no runtime execution)
// These are compile-time assertions that verify type correctness.
// ============================================================================

// Test that PackageAPI interface has expected methods
type TestPackageAPI = {
  versionsFrom: PackageAPI["versionsFrom"];
  use: PackageAPI["use"];
  imply: PackageAPI["imply"];
  export: PackageAPI["export"];
  addFiles: PackageAPI["addFiles"];
  addAssets: PackageAPI["addAssets"];
  mainModule: PackageAPI["mainModule"];
};

// Type-level assertion: this will fail to compile if PackageAPI is missing methods
const _typeTest: TestPackageAPI = {} as PackageAPI;

// Verify global declarations work
declare const _assetsGlobal: typeof Assets;
declare const _npmGlobal: typeof Npm;
declare const _packageGlobal: typeof Package;
declare const _appGlobal: typeof App;
declare const _cordovaGlobal: typeof Cordova;
