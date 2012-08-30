(function () {

var TEST_RESPONDER_ROUTE = "/spark_test_responder";

var respond = function(req, res) {

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  if (req.url === '/blank')
    res.end();
  else
    res.end('<script>'+
            'window.onload = frameElement.loadFunc;'+
            'window.onunload = frameElement.unloadFunc;'+
            '</script>');
};

var run_responder = function() {

  var app = __meteor_bootstrap__.app;
  app.stack.unshift({ route: TEST_RESPONDER_ROUTE, handle: respond });
};

run_responder();

})();
