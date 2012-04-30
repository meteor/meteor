var simulateEvent = function (node, event, args) {
  node = (node instanceof $ ? node[0] : node);

  if (document.createEvent) {
    var e = document.createEvent("Event");
    e.initEvent(event, true, true);
    _.extend(e, args);
    node.dispatchEvent(e);
  } else {
    var e = document.createEventObject();
    _.extend(e, args);
    node.fireEvent("on" + event, e);
  }
};

var focusElement = function(elem) {
  elem.focus();
  elem.focus(); // IE 8 seems to need a second call!
  // focus() should set document.activeElement
  if (document.activeElement !== elem)
    throw new Error("focus() didn't set activeElement");
};

var blurElement = function(elem) {
  elem.blur();
  if (document.activeElement === elem)
    throw new Error("blur() didn't affect activeElement");
};

var clickElement = function(elem) {
  simulateEvent(elem, 'click');
};
