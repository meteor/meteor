
Tinytest.add("universal-events - basic", function(test) {

  var runTest = function (testMissingHandlers) {
    var msgs = [];
    var listeners = [];

    var createListener = function () {
      var out = [];
      msgs.push(out);
      var ret = new UniversalEventListener(function(event) {
        var node = event.currentTarget;
        if (DomUtils.elementContains(document.body, node)) {
          out.push(event.currentTarget.nodeName.toLowerCase());
        }
      }, testMissingHandlers);
      listeners.push(ret);
      return ret;
    };

    var L1 = createListener();

    var check = function (event, expected) {
      _.each(msgs, function (m) {
        m.length = 0;
      });
      simulateEvent(DomUtils.find(d.node(), "b"), event);
      for (var i = 0; i < listeners.length; i++)
        test.equal(msgs[i], testMissingHandlers ? [] : expected[i]);
    };

    var d = OnscreenDiv(Meteor.render("<div><span><b>Hello</b></span></div>"));
    L1.addType('mousedown');
    if (!testMissingHandlers)
      L1.installHandler(d.node(), 'mousedown');
    var x = ['b', 'span', 'div', 'div'];
    check('mousedown', [x]);

    check('mouseup', [[]]);

    L1.removeType('mousedown');
    check('mousedown', [[]]);
    L1.removeType('mousedown');
    check('mousedown', [[]]);

    L1.addType('mousedown');
    check('mousedown', [x]);
    L1.addType('mousedown');
    check('mousedown', [x]);
    L1.removeType('mousedown');
    check('mousedown', [[]]);

    var L2 = createListener();
    if (!testMissingHandlers)
      L2.installHandler(d.node(), 'mousedown');

    L1.addType('mousedown');
    check('mousedown', [x, []]);
    L2.addType('mousedown');
    check('mousedown', [x, x]);
    L2.addType('mousedown');
    check('mousedown', [x, x]);
    L1.removeType('mousedown');
    check('mousedown', [[], x]);
    L1.removeType('mousedown');
    check('mousedown', [[], x]);
    L2.removeType('mousedown');
    check('mousedown', [[], []]);
    L1.addType('mousedown');
    check('mousedown', [x, []]);
    L1.removeType('mousedown');
    check('mousedown', [[], []]);
    L2.addType('mousedown');
    check('mousedown', [[], x]);
    L2.removeType('mousedown');
    check('mousedown', [[], []]);

    d.kill();
  };

  runTest(false);
  runTest(true);
});
