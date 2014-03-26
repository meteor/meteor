(function () {

///////////////////////////////////////////////////////////////////////
//                                                                   //
// packages/spark/test_form_responder.js                             //
//                                                                   //
///////////////////////////////////////////////////////////////////////
                                                                     //
var TEST_RESPONDER_ROUTE = "/spark_test_responder";                  // 1
                                                                     // 2
var respond = function(req, res) {                                   // 3
                                                                     // 4
  res.statusCode = 200;                                              // 5
  res.setHeader("Content-Type", "text/html");                        // 6
  if (req.url === '/blank')                                          // 7
    res.end();                                                       // 8
  else                                                               // 9
    res.end('<script>'+                                              // 10
            'window.onload = frameElement.loadFunc;'+                // 11
            'window.onunload = frameElement.unloadFunc;'+            // 12
            '</script>');                                            // 13
};                                                                   // 14
                                                                     // 15
var run_responder = function() {                                     // 16
  WebApp.connectHandlers.stack.unshift(                              // 17
    { route: TEST_RESPONDER_ROUTE, handle: respond });               // 18
};                                                                   // 19
                                                                     // 20
run_responder();                                                     // 21
                                                                     // 22
///////////////////////////////////////////////////////////////////////

}).call(this);
