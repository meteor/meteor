Tinytest.add('modules', function (test) {
  test.equal(typeof meteorInstall, "function");
  var require = meteorInstall();
  test.equal(typeof require, "function");
});

Tinytest.add('modules - error', function (test) {

  const require = meteorInstall('non_existent_module');
  test.throws(require(), /Cannot find package "meteor". Try "meteor add meteor"./);
});
