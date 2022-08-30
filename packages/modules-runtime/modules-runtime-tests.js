Tinytest.add('modules', function (test) {
  test.equal(typeof meteorInstall, 'function');
  var require = meteorInstall();
  test.equal(typeof require, 'function');
});

Tinytest.add('errors - standard', function (test) {
  var require = meteorInstall();
  test.throws(() => {
    require('meteor/foo');
  }, 'Cannot find package "foo". Try "meteor add foo".');
});



if (Meteor.isServer) {
  Tinytest.add('server - throwClientError', function (test) {
    var require = meteorInstall();
    test.throws(() => {
        require('./../server/main.js');
      }, "Cannot find module './../server/main.js'"
    );
  });
  Tinytest.add('server - throwServerError', function (test) {
    var require = meteorInstall();
    test.throws(() => {
        require('./../client/main.js');
      },
      'Unable to import on the server a module from a client directory: "./../client/main.js" \n' +
      ' (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories'
    );
  });
}

if (Meteor.isClient) {
  Tinytest.add('client - throwClientError', function (test) {
    var require = meteorInstall();
    test.throws(() => {
        require('./../server/main.js');
      },
      'Unable to import on the client a module from a server directory: "./../server/main.js" \n' +
      ' (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories'
    );
  });
  Tinytest.add('client - throwServerError', function (test) {
    var require = meteorInstall();
    test.throws(() => {
        require('./../client/main.js');
      }, "Cannot find module './../client/main.js'");
  });
}


