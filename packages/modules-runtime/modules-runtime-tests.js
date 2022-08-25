Tinytest.add('modules', function (test) {
  test.equal(typeof meteorInstall, 'function');
  var require = meteorInstall();
  test.equal(typeof require, 'function');
});

Tinytest.add('modules.throwStandardError', function (test) {
  const require = meteorInstall();
  test.throws(require('meteor/foo'), /Cannot find package "meteor". Try "meteor add meteor"./);
});

if (Meteor.isClient) {
  Tinytest.add('modules.throwClientError', function (test) {
    const require = meteorInstall();
    test.throws(require('./../server/main.js'), 'Unable to import on the client a module from a server directory: ../server/main.js \n (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories`'
    );
  });
}

if (Meteor.isServer) {
  Tinytest.add('modules.throwServerError', function (test) {
    const require = meteorInstall();
    test.throws(require('./../client/main.js'), 'Unable to import on the server a module from a client directory: ../client/main.js \n (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories`'
    );
  });
}
