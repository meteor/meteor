// possible options:
// bubbles: A boolean indicating whether the event should bubble up through
//  the event chain or not. (default is true)
simulateEvent = function (node, event, args, options) {
  node = (node.jquery ? node[0] : node);

  var bubbles = (options && "bubbles" in options) ? options.bubbles : true;

  if (document.createEvent) {
    var e = document.createEvent("Event");
    e.initEvent(event, bubbles, true);
    Object.assign(e, args);
    node.dispatchEvent(e);
  } else {
    var e = document.createEventObject();
    Object.assign(e, args);
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

var inDocument = function (elem) {
  while ((elem = elem.parentNode)) {
    if (elem == document) {
      return true;
    }
  }
  return false;
};

clickIt = function (elem) {
  if (!inDocument(elem))
    throw new Error("Can't click on elements without first adding them to the document");

  // jQuery's bubbling change event polyfill for IE 8 seems
  // to require that the element in question have focus when
  // it receives a simulated click.
  if (elem.focus)
    elem.focus();
  clickElement(elem);
};

