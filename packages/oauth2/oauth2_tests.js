Tinytest.add("oauth2 - loginResultForState is stored", function (test) {
  var http = Npm.require('http');
  var foobookId = Random.id();
  var foobookOption1 = Random.id();
  var state = Random.id();
  var serviceName = Random.id();

  ServiceConfiguration.configurations.insert({service: serviceName});

  try {
    // register a fake login service
    Oauth.registerService(serviceName, 2, null, function (query) {
      return {
        serviceData: {id: foobookId},
        options: {option1: foobookOption1}
      };
    });

    // simulate logging in using foobook
    var req = {method: "POST",
               url: "/_oauth/" + serviceName + "?close",
               query: {state: state}};
    Oauth._middleware(req, new http.ServerResponse(req));

    // Test that the login result for that user is prepared
    test.equal(
      Oauth._loginResultForState[state].serviceName, serviceName);
    test.equal(
      Oauth._loginResultForState[state].serviceData.id, foobookId);
    test.equal(
      Oauth._loginResultForState[state].options.option1, foobookOption1);

  } finally {
    Oauth._unregisterService(serviceName);
  }
});
