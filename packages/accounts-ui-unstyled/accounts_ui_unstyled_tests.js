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


Tinytest.add(
  'accounts-ui - getLoginServices retuns unique services', 
  function (test) {
    // setup
    var services;
    Accounts._loginButtons.loginServices.push('password');
    Accounts._loginButtons.loginServices.push('password');

    services = Accounts._loginButtons.getLoginServices();
    test.length(services, 1);
  }
);
