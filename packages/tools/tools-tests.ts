import { Tinytest } from "meteor/tinytest";

// Type compilation tests for meteor/tools
// These tests verify that TypeScript types are correctly defined.
// If this file compiles without errors, the types are correct.

// Import types to verify they exist
import type { Assets, Npm, Package, App, Cordova, PackageAPI } from "meteor/tools";

// ============================================================================
// Assets type tests (runtime global)
// ============================================================================

Tinytest.add("tools types - Assets.getTextAsync returns Promise<string>", (test) => {
  // Type assertion: getTextAsync should return Promise<string>
  const getTextAsync: Assets["getTextAsync"] = Assets.getTextAsync;
  test.isTrue(typeof getTextAsync === "function", "Assets.getTextAsync should be a function");
});

Tinytest.add("tools types - Assets.getBinaryAsync returns Promise<Uint8Array>", (test) => {
  // Type assertion: getBinaryAsync should return Promise<Uint8Array>
  const getBinaryAsync: Assets["getBinaryAsync"] = Assets.getBinaryAsync;
  test.isTrue(typeof getBinaryAsync === "function", "Assets.getBinaryAsync should be a function");
});

Tinytest.add("tools types - Assets.absoluteFilePath returns string", (test) => {
  const result = Assets.absoluteFilePath("test.txt");
  test.isTrue(typeof result === "string", "Assets.absoluteFilePath should return a string");
});

Tinytest.add("tools types - Assets.getServerDir returns string", (test) => {
  const result = Assets.getServerDir();
  test.isTrue(typeof result === "string", "Assets.getServerDir should return a string");
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

// Verify global declarations work with interface types
declare const _assetsGlobal: Assets;
declare const _npmGlobal: Npm;
declare const _packageGlobal: Package;
declare const _appGlobal: App;
declare const _cordovaGlobal: Cordova;
