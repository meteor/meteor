Tinytest.add('modules', function (test) {
  test.equal(typeof meteorInstall, 'function');
  var require = meteorInstall();
  test.equal(typeof require, 'function');
});

Tinytest.add('modules - meteor/ - error', function (test) {
  const require = meteorInstall();
  test.throws(require('meteor/foo'), /Cannot find package "meteor". Try "meteor add meteor"./);
});

Tinytest.add('modules - client calling server', function (test) {
  const require = meteorInstall();
  test.throws(require('./../server/main.js'), `Unable to import on the client a module from a server directory: './../server/main.js'
       (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories`);
});

Tinytest.add('modules - server - error', function (test) {
  const require = meteorInstall();
  test.throws(require('./../client/main.js'), `Unable to import on the server a module from a client directory: './../client/main.js'
       (cross-boundary import) see: https://guide.meteor.com/structure.html#special-directories`);
});
