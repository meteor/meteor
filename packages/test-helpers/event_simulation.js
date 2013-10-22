simulateEvent = function (node, event, args) {
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

focusElement = function(elem) {
  // This sequence is for benefit of IE 8 and 9;
  // test there before changing.
  window.focus();
  elem.focus();
  elem.focus();

  // focus() should set document.activeElement
  if (document.activeElement !== elem)
    throw new Error("focus() didn't set activeElement");
};

blurElement = function(elem) {
  elem.blur();
  if (document.activeElement === elem)
    throw new Error("blur() didn't affect activeElement");
};

clickElement = function(elem) {
  if (elem.click)
    elem.click(); // supported by form controls cross-browser; most native way
  else
    simulateEvent(elem, 'click');
};
