Tinytest.add(
  'collection - call Mongo.Collection without new',
  function (test) {
    test.throws(
      function () {
        Mongo.Collection(null);
      },
      /use "new" to construct a Mongo\.Collection/
    );
  }
);

Tinytest.add('collection - call new Mongo.Collection multiple times',
  function (test) {
    new Mongo.Collection('multiple_times_1');

    test.throws(
      function () {
        new Mongo.Collection('multiple_times_1');
      },
      /There is already a collection named "multiple_times_1"/
    );
  }
);

Tinytest.add('collection - call new Mongo.Collection multiple times with _suppressSameNameError=true',
  function (test) {
    new Mongo.Collection('multiple_times_2');

    try {
      new Mongo.Collection('multiple_times_2', {_suppressSameNameError: true});
      test.ok();
    } catch (error) {
      console.log(error);
      test.fail('Expected new Mongo.Collection not to throw an error when called twice with the same name');
    }
  }
);

Tinytest.add('collection - call new Mongo.Collection with defineMutationMethods=false',
  function (test) {
    var handlerPropName = Meteor.isClient ? '_methodHandlers' : 'method_handlers';

    var hasmethods = new Mongo.Collection('hasmethods');
    test.equal(typeof hasmethods._connection[handlerPropName]['/hasmethods/insert'], 'function');

    var nomethods = new Mongo.Collection('nomethods', {defineMutationMethods: false});
    test.equal(nomethods._connection[handlerPropName]['/nomethods/insert'], undefined);
  }
);
