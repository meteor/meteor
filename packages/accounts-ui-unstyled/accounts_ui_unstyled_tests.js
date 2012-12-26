(function(environment) {
  // setup
  Accounts._loginButtons.loginServices.push('password');
  environment.meteorServices = function() {
    return Accounts._loginButtons.getLoginServices();
  };

  Tinytest.add(
    'accounts-ui - getLoginServices retuns an array of service hashes', 
    function (test) {
      test.equal(_.first(environment.meteorServices()), {name: "password"});
    }
  );

  Tinytest.add(
    'accounts-ui - getLoginServices should always return password last', 
    function (test) {
      Accounts._loginButtons.loginServices.push('some_other_service');
      test.equal(_.last(environment.meteorServices()), {name: "password"});
    }
  );
})(Tinytest);

