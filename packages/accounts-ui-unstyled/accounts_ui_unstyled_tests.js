Tinytest.add(
  'accounts-ui - getLoginServices retuns an array of service hashes', 
  function (test) {
    // setup
    var services;
    Accounts._loginButtons.loginServices.push('password');
    services = Accounts._loginButtons.getLoginServices();

    test.equal(_.first(services), {name: "password"});
  }
);
