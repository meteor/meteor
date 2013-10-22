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
  WebApp.connectHandlers.stack.unshift(
    { route: TEST_RESPONDER_ROUTE, handle: respond });
};

run_responder();
