
// For IE 6-8.

Meteor.ui._loadNonW3CEvents = function() {

  var prefix = '_liveevents_';

  // use object property value so it doesn't show up in innerHTML
  var TRUE = {};

  var installOneHandler = function(node, eventType) {
    var propName = prefix + eventType;
    if (! node[propName]) {
      // only bind one event listener per type per node
      node[propName] = TRUE;
      node.attachEvent('on'+eventType, universalHandler);
    }
  };

  Meteor.ui._installLiveHandler = function(node, eventType) {
    if (node.nodeType === 1) { // ELEMENT
      installOneHandler(node, eventType);

      var descendents = node.getElementsByTagName('*');

      for(var i=0, N = descendents.length; i<N; i++)
        installOneHandler(descendents[i], eventType);
    }
  };

  Meteor.ui._attachSecondaryEvents = function(innerRange) {
    var types = {};
    for(var range = innerRange; range; range = range.findParent()) {
      if (range === innerRange)
        continue;

      if (! range.event_handlers)
        continue;

      _.each(range.event_handlers, function(h) {
        types[h.type] = true;
      });
    }

    _.each(types, function(z, t) {
      for(var n = innerRange.firstNode(),
              after = innerRange.lastNode().nextSibling;
          n && n !== after;
          n = n.nextSibling)
        Meteor.ui._installLiveHandler(n, t);
    });
  };

  var universalHandler = function() {
    var event = window.event;
    var type = event.type;
    event.target = event.srcElement || document;
    if (this.nodeType !== 1)
      return; // sanity check that we have a real target (always an element)
    event.currentTarget = this;
    var curNode = this;

    var innerRange = Meteor.ui._LiveRange.findRange(Meteor.ui._tag, curNode);
    if (! innerRange)
      return;

    var isPropagationStopped = false;
    event.stopPropagation = function() {
      isPropagationStopped = true;
      event.cancelBubble = true;
    };
    event.preventDefault = function() {
      event.returnValue = false;
    };

    // inspired by jQuery fix():
    if (event.metaKey === undefined)
      event.metaKey = event.ctrlKey;
    if (/^key/.test(type)) {
      // KEY EVENTS
      // Add `which`
      if (event.which === null)
	event.which = event.charCode !== null ? event.charCode : event.keyCode;
    } else if (/^(?:mouse|contextmenu)|click/.test(type)) {
      // MOUSE EVENTS
      // Add relatedTarget, if necessary
      if (! event.relatedTarget && event.fromElement)
	event.relatedTarget = (event.fromElement === event.target ?
                               event.toElement : event.fromElement);
      // Add which for click: 1 === left; 2 === middle; 3 === right
      if (! event.which && event.button !== undefined ) {
        var button = event.button;
	event.which = (button & 1 ? 1 :
                       (button & 2 ? 3 :
                         (button & 4 ? 2 : 0 )));
      }
    }


    for(var range = innerRange; range; range = range.findParent(true)) {
      if (! range.event_handlers)
        continue;

      _.each(range.event_handlers, function(h) {
        if (h.type !== type)
          return;

        var selector = h.selector;
        if (selector) {
          var contextNode = range.containerNode();
          var results = $(contextNode).find(selector);
          if (! _.contains(results, curNode))
            return;
        }

        var returnValue = h.callback.call(range.event_data, event);
        if (returnValue === false) {
          // extension due to jQuery
          event.stopPropagation();
          event.preventDefault();
        }
      });

      if (isPropagationStopped)
        break;
    }
  };

  var resetOne = function(node) {
    for(var k in node) {
      if (! node[k])
        continue;
      if (k.substring(0, prefix.length) !== prefix)
        continue;

      var type = k.substring(prefix.length);

      node.detachEvent('on'+type, universalHandler);
    }
  };

  Meteor.ui._resetEvents = function(node) {
    if (node.nodeType === 1) { // ELEMENT
      resetOne(node);

      var descendents = node.getElementsByTagName('*');

      for(var i=0, N = descendents.length; i<N; i++)
        resetOne(descendents[i]);
    }
  };

};
