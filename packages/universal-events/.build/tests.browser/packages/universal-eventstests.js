(function () {

//////////////////////////////////////////////////////////////////////////////////
//                                                                              //
// packages/universal-events/event_tests.js                                     //
//                                                                              //
//////////////////////////////////////////////////////////////////////////////////
                                                                                //
                                                                                // 1
Tinytest.add("universal-events - basic", function(test) {                       // 2
                                                                                // 3
  var runTest = function (testMissingHandlers) {                                // 4
    var msgs = [];                                                              // 5
    var listeners = [];                                                         // 6
                                                                                // 7
    var createListener = function () {                                          // 8
      var out = [];                                                             // 9
      msgs.push(out);                                                           // 10
      var ret = new UniversalEventListener(function(event) {                    // 11
        var node = event.currentTarget;                                         // 12
        if (DomUtils.elementContains(document.body, node)) {                    // 13
          out.push(event.currentTarget.nodeName.toLowerCase());                 // 14
        }                                                                       // 15
      }, testMissingHandlers);                                                  // 16
      listeners.push(ret);                                                      // 17
      return ret;                                                               // 18
    };                                                                          // 19
                                                                                // 20
    var L1 = createListener();                                                  // 21
                                                                                // 22
    var check = function (event, expected) {                                    // 23
      _.each(msgs, function (m) {                                               // 24
        m.length = 0;                                                           // 25
      });                                                                       // 26
      simulateEvent(DomUtils.find(d.node(), "b"), event);                       // 27
      for (var i = 0; i < listeners.length; i++)                                // 28
        test.equal(msgs[i], testMissingHandlers ? [] : expected[i]);            // 29
    };                                                                          // 30
                                                                                // 31
    var d = OnscreenDiv(Meteor.render("<div><span><b>Hello</b></span></div>")); // 32
    L1.addType('mousedown');                                                    // 33
    if (!testMissingHandlers)                                                   // 34
      L1.installHandler(d.node(), 'mousedown');                                 // 35
    var x = ['b', 'span', 'div', 'div'];                                        // 36
    check('mousedown', [x]);                                                    // 37
                                                                                // 38
    check('mouseup', [[]]);                                                     // 39
                                                                                // 40
    L1.removeType('mousedown');                                                 // 41
    check('mousedown', [[]]);                                                   // 42
    L1.removeType('mousedown');                                                 // 43
    check('mousedown', [[]]);                                                   // 44
                                                                                // 45
    L1.addType('mousedown');                                                    // 46
    check('mousedown', [x]);                                                    // 47
    L1.addType('mousedown');                                                    // 48
    check('mousedown', [x]);                                                    // 49
    L1.removeType('mousedown');                                                 // 50
    check('mousedown', [[]]);                                                   // 51
                                                                                // 52
    var L2 = createListener();                                                  // 53
    if (!testMissingHandlers)                                                   // 54
      L2.installHandler(d.node(), 'mousedown');                                 // 55
                                                                                // 56
    L1.addType('mousedown');                                                    // 57
    check('mousedown', [x, []]);                                                // 58
    L2.addType('mousedown');                                                    // 59
    check('mousedown', [x, x]);                                                 // 60
    L2.addType('mousedown');                                                    // 61
    check('mousedown', [x, x]);                                                 // 62
    L1.removeType('mousedown');                                                 // 63
    check('mousedown', [[], x]);                                                // 64
    L1.removeType('mousedown');                                                 // 65
    check('mousedown', [[], x]);                                                // 66
    L2.removeType('mousedown');                                                 // 67
    check('mousedown', [[], []]);                                               // 68
    L1.addType('mousedown');                                                    // 69
    check('mousedown', [x, []]);                                                // 70
    L1.removeType('mousedown');                                                 // 71
    check('mousedown', [[], []]);                                               // 72
    L2.addType('mousedown');                                                    // 73
    check('mousedown', [[], x]);                                                // 74
    L2.removeType('mousedown');                                                 // 75
    check('mousedown', [[], []]);                                               // 76
                                                                                // 77
    d.kill();                                                                   // 78
  };                                                                            // 79
                                                                                // 80
  runTest(false);                                                               // 81
  runTest(true);                                                                // 82
});                                                                             // 83
                                                                                // 84
//////////////////////////////////////////////////////////////////////////////////

}).call(this);
