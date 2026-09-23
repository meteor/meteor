import assert from "assert";

// Define todos publication, method, and collection to test full-app mode
export const Todos = new Mongo.Collection('todos');

if (Meteor.isServer) {
  Meteor.publish('todos', function () {
    return Todos.find();
  });
}

Meteor.methods({
  'todos.add'(text) {
    return Todos.insert({ text, createdAt: new Date() });
  },
});

describe("react-router", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "react");
  });

  if (Meteor.isClient) {
    it("client is not server", function () {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it("server is not client", function () {
      assert.strictEqual(Meteor.isClient, false);
    });

    it('registers the todos.add method in full-app mode', function () {
      // Methods only exist if app startup code runs
      assert.strictEqual(
        typeof Meteor.server.method_handlers['todos.add'],
        'function',
        'Expected todos.add method to be registered'
      );
    });

    it('registers the todos publication in full-app mode', function () {
      assert.strictEqual(
        typeof Meteor.server.publish_handlers['todos'],
        'function',
        'Expected todos publication to be registered'
      );
    });
  }

  it("is app test", function () {
    assert.strictEqual(Meteor.isAppTest, true);
    assert.strictEqual(Meteor.isTest, false);
  });
});
