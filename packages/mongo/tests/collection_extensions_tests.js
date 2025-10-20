import { Tinytest } from "meteor/tinytest";
import { Mongo } from "meteor/mongo";
import { CollectionExtensions } from "meteor/mongo";
import { Random } from "meteor/random";

// Test setup and teardown
function setupTest() {
  CollectionExtensions.clearExtensions();
}

function teardownTest() {
  CollectionExtensions.clearExtensions();
}

Tinytest.add("CollectionExtensions - constructor extension", function (test) {
  setupTest();
  
  let extensionCallCount = 0;
  let extensionData = null;
  
  CollectionExtensions.addExtension(function(name, options) {
    extensionCallCount++;
    extensionData = { name, options, instance: this };
  });
  
  const testCollection = new Mongo.Collection(Random.id());
  
  test.equal(extensionCallCount, 1);
  test.equal(extensionData.name, testCollection._name);
  test.equal(extensionData.instance, testCollection);
  test.isTrue(extensionData.options && typeof extensionData.options === 'object');
  
  teardownTest();
});

Tinytest.add("CollectionExtensions - multiple extensions", function (test) {
  setupTest();
  
  let callOrder = [];
  
  CollectionExtensions.addExtension(function(name, options) {
    callOrder.push('extension1');
  });
  
  CollectionExtensions.addExtension(function(name, options) {
    callOrder.push('extension2');
  });
  
  CollectionExtensions.addExtension(function(name, options) {
    callOrder.push('extension3');
  });
  
  const testCollection = new Mongo.Collection(Random.id());
  
  test.equal(callOrder, ['extension1', 'extension2', 'extension3']);
  
  teardownTest();
});

Tinytest.add("CollectionExtensions - prototype methods", function (test) {
  setupTest();
  
  CollectionExtensions.addPrototypeMethod('testMethod', function() {
    return 'testResult';
  });
  
  const testCollection = new Mongo.Collection(Random.id());
  
  test.isTrue(typeof testCollection.testMethod === 'function');
  test.equal(testCollection.testMethod(), 'testResult');
  
  teardownTest();
});

// Test prototype method with collection context
Tinytest.add("CollectionExtensions - prototype method context", function (test) {
  setupTest();
  
  // Add prototype method that uses collection context
  CollectionExtensions.addPrototypeMethod('getCollectionName', function() {
    return this._name;
  });
  
  // Create collection
  const testCollection = new Mongo.Collection(Random.id());
  
  // Verify method has correct context
  test.equal(testCollection.getCollectionName(), testCollection._name);
  
  teardownTest();
});

// Test static methods
Tinytest.add("CollectionExtensions - static methods", function (test) {
  setupTest();
  
  // Add static method
  CollectionExtensions.addStaticMethod('testStaticMethod', function() {
    return 'staticResult';
  });
  
  // Apply static methods (this happens automatically in real usage)
  CollectionExtensions._applyStaticMethods(Mongo.Collection);
  
  // Verify static method was added
  test.isTrue(typeof Mongo.Collection.testStaticMethod === 'function');
  test.equal(Mongo.Collection.testStaticMethod(), 'staticResult');
  
  // Clean up
  delete Mongo.Collection.testStaticMethod;
  teardownTest();
});

// Test error handling in extensions
Tinytest.add("CollectionExtensions - extension error handling", function (test) {
  setupTest();
  
  // Add extension that throws error
  CollectionExtensions.addExtension(function(name, options) {
    throw new Error('Test extension error');
  });
  
  // Creating collection should throw with helpful error message
  test.throws(() => {
    new Mongo.Collection(Random.id());
  }, /Extension failed for collection/);
  
  teardownTest();
});

// Test extension removal
Tinytest.add("CollectionExtensions - extension removal", function (test) {
  setupTest();
  
  let callCount = 0;
  
  const extension = function(name, options) {
    callCount++;
  };
  
  CollectionExtensions.addExtension(extension);
  
  const testCollection1 = new Mongo.Collection(Random.id());
  test.equal(callCount, 1);
  
  CollectionExtensions.removeExtension(extension);
  
  // Create another collection - should not call extension
  const testCollection2 = new Mongo.Collection(Random.id());
  test.equal(callCount, 1); // Still 1, not 2
  
  teardownTest();
});

Tinytest.add("CollectionExtensions - prototype method removal", function (test) {
  setupTest();
  
  CollectionExtensions.addPrototypeMethod('testMethod', function() {
    return 'test';
  });
  
  const testCollection1 = new Mongo.Collection(Random.id());
  test.isTrue(typeof testCollection1.testMethod === 'function');
  
  CollectionExtensions.removePrototypeMethod('testMethod');
  
  const testCollection2 = new Mongo.Collection(Random.id());
  test.isUndefined(testCollection2.testMethod);
  
  teardownTest();
});

Tinytest.add("CollectionExtensions - input validation", function (test) {
  setupTest();
  
  test.throws(() => {
    CollectionExtensions.addExtension("not a function");
  }, /Extension must be a function/);
  
  test.throws(() => {
    CollectionExtensions.addPrototypeMethod("", function() {});
  }, /Prototype method name must be a non-empty string/);
  
  test.throws(() => {
    CollectionExtensions.addPrototypeMethod(123, function() {});
  }, /Prototype method name must be a non-empty string/);
  
  test.throws(() => {
    CollectionExtensions.addPrototypeMethod("test", "not a function");
  }, /Prototype method must be a function/);
  
  test.throws(() => {
    CollectionExtensions.addStaticMethod("", function() {});
  }, /Static method name must be a non-empty string/);
  
  test.throws(() => {
    CollectionExtensions.addStaticMethod("test", "not a function");
  }, /Static method must be a function/);
  
  teardownTest();
});

Tinytest.add("CollectionExtensions - introspection", function (test) {
  setupTest();
  
  const extension1 = function() {};
  const extension2 = function() {};
  
  test.equal(CollectionExtensions.getExtensions(), []);
  test.equal(CollectionExtensions.getPrototypeMethods().size, 0);
  test.equal(CollectionExtensions.getStaticMethods().size, 0);
  
  CollectionExtensions.addExtension(extension1);
  CollectionExtensions.addExtension(extension2);
  CollectionExtensions.addPrototypeMethod('test1', function() {});
  CollectionExtensions.addStaticMethod('test2', function() {});
  
  // Test introspection
  const extensions = CollectionExtensions.getExtensions();
  test.equal(extensions.length, 2);
  test.equal(extensions[0], extension1);
  test.equal(extensions[1], extension2);
  
  const prototypeMethods = CollectionExtensions.getPrototypeMethods();
  test.equal(prototypeMethods.size, 1);
  test.isTrue(prototypeMethods.has('test1'));
  
  const staticMethods = CollectionExtensions.getStaticMethods();
  test.equal(staticMethods.size, 1);
  test.isTrue(staticMethods.has('test2'));
  
  teardownTest();
});