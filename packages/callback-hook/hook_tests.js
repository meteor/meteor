import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Meteor } from 'meteor/meteor';

describe('callback-hook', () => {
  it("binds to registrar's env by default", () => {
    const hook = new Hook();
    const envVar = new Meteor.EnvironmentVariable;
    envVar.withValue("registrar's value", () => {
      hook.register(() => {
        assert.strictEqual(envVar.get(), "registrar's value");
      });
    });
    envVar.withValue("invoker's value", () => {
      hook.forEach((callback) => {
        callback();
      });
    });
  });

  it("uses invoker's env with {bindEnvironment: false}", () => {
    const hook = new Hook({ bindEnvironment: false });
    const envVar = new Meteor.EnvironmentVariable;
    envVar.withValue("registrar's value", () => {
      hook.register(() => {
        assert.strictEqual(envVar.get(), "invoker's value");
      });
    });
    envVar.withValue("invoker's value", () => {
      hook.each((callback) => {
        callback();
      });
    });
  });

  it("exceptions unhandled with {bindEnvironment: false}", () => {
    const hook = new Hook({ bindEnvironment: false });
    hook.register(() => {
      throw new Error("Test error");
    });
    hook.forEach((callback) => {
      assert.throws(callback, { message: /Test error/ });
    });
  });

  it("exceptionHandler used with {bindEnvironment: false}", () => {
    const exToThrow = new Error("Test error");
    let thrownEx = null;
    const hook = new Hook({
      bindEnvironment: false,
      exceptionHandler: (ex) => { thrownEx = ex; }
    });
    hook.register(() => {
      throw exToThrow;
    });
    hook.each((callback) => {
      callback();
    });
    assert.strictEqual(exToThrow, thrownEx);
  });
});
