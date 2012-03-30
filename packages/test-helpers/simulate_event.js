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
