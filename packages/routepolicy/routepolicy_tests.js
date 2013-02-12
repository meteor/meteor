Tinytest.add("routepolicy", function (test) {
  var policy = new Meteor.__RoutePolicyConstructor();

  policy.declare('/sockjs/', 'network');
  // App routes might look like this...
  // policy.declare('/posts/', 'app');
  // policy.declare('/about', 'app');

  test.equal(policy.classify('/'), null);
  test.equal(policy.classify('/foo'), null);
  test.equal(policy.classify('/sockjs'), null);

  test.equal(policy.classify('/sockjs/'), 'network');
  test.equal(policy.classify('/sockjs/foo'), 'network');

  // test.equal(policy.classify('/posts/'), 'app');
  // test.equal(policy.classify('/posts/1234'), 'app');

  test.equal(policy.urlPrefixesFor('network'), ['/sockjs/']);
  // test.equal(policy.urlPrefixesFor('app'), ['/about', '/posts/']);
});

Tinytest.add("routepolicy - static conflicts", function (test) {
  var manifest = [
    {
      "path": "static/sockjs/socks-are-comfy.jpg",
      "type": "static",
      "where": "client",
      "cacheable": false,
      "url": "/sockjs/socks-are-comfy.jpg"
    },
  ];
  var policy = new Meteor.__RoutePolicyConstructor();

  test.equal(
    policy.checkForConflictWithStatic('/sockjs/', 'network', manifest),
    "static resource /sockjs/socks-are-comfy.jpg conflicts with network route /sockjs/"
  );
});
