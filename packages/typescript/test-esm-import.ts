import { testValue, testFunction } from './test-module.js';
import { Tinytest } from "meteor/tinytest";

Tinytest.add("TypeScript - ESM import with .js extension", test => {
  test.equal(testValue, "Hello from TypeScript module");
  test.equal(testFunction(), "TypeScript ESM import works");
});
