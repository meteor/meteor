
UI.Component.instantiate = function (parent) {
  var kind = this;

  // check arguments
  if (UI.isComponent(kind)) {
    if (kind.isInited)
      throw new Error("A component kind is required, not an instance");
  } else {
    throw new Error("Expected Component kind");
  }

  var inst = kind.extend(); // XXX args go here
  inst.isInited = true;

  // XXX messy to define this here
  inst.templateInstance = {
    findAll: function (selector) {
      // XXX check that `.dom` exists here?
      return inst.dom.$(selector);
    },
    find: function (selector) {
      var result = this.findAll(selector);
      return result[0] || null;
    },
    firstNode: null,
    lastNode: null,
    data: null,
    __component__: inst
  };

  inst.parent = (parent || null);

  if (inst.init)
    inst.init();

  if (inst.created) {
    updateTemplateInstance(inst);
    inst.created.call(inst.templateInstance);
  }

  return inst;
};

UI.Component.render = function () {
  return null;
};


// Takes a reactive function (call it `inner`) and returns a reactive function
// `outer` which is equivalent except in its reactive behavior.  Specifically,
// `outer` has the following two special properties:
//
// 1. Isolation:  An invocation of `outer()` only invalidates its context
//    when the value of `inner()` changes.  For example, `inner` may be a
//    function that gets one or more Session variables and calculates a
//    true/false value.  `outer` blocks invalidation signals caused by the
//    Session variables changing and sends a signal out only when the value
//    changes between true and false (in this example).  The value can be
//    of any type, and it is compared with `===` unless an `equals` function
//    is provided.
//
// 2. Value Sharing:  The `outer` function returned by `emboxValue` can be
//    shared between different contexts, for example by assigning it to an
//    object as a method that can be accessed at any time, such as by
//    different templates or different parts of a template.  No matter
//    how many times `outer` is called, `inner` is only called once until
//    it changes.  The most recent value is stored internally.
//
// Conceptually, an emboxed value is much like a Session variable which is
// kept up to date by an autorun.  Session variables provide storage
// (value sharing) and they don't notify their listeners unless a value
// actually changes (isolation).  The biggest difference is that such an
// autorun would never be stopped, and the Session variable would never be
// deleted even if it wasn't used any more.  An emboxed value, on the other
// hand, automatically stops computing when it's not being used, and starts
// again when called from a reactive context.  This means that when it stops
// being used, it can be completely garbage-collected.
//
// If a non-function value is supplied to `emboxValue` instead of a reactive
// function, then `outer` is still a function but it simply returns the value.
//
UI.emboxValue = function (funcOrValue, equals) {
  if (typeof funcOrValue === 'function') {
    var func = funcOrValue;

    var curResult = null;
    // There's one shared Dependency and Computation for all callers of
    // our box function.  It gets kicked off if necessary, and when
    // there are no more dependents, it gets stopped to avoid leaking
    // memory.
    var resultDep = null;
    var computation = null;

    return function () {
      if (! computation) {
        if (! Deps.active) {
          // Not in a reactive context.  Just call func, and don't start a
          // computation if there isn't one running already.
          return func();
        }

        // No running computation, so kick one off.  Since this computation
        // will be shared, avoid any association with the current computation
        // by using `Deps.nonreactive`.
        resultDep = new Deps.Dependency;

        computation = Deps.nonreactive(function () {
          return Deps.autorun(function (c) {
            var oldResult = curResult;
            curResult = func();
            if (! c.firstRun) {
// XXX THE `===` CHECK BREAKS TEST-IN-BROWSER
//              if (! (equals ? equals(curResult, oldResult) :
//                     curResult === oldResult))
                resultDep.changed();
            }
          });
        });
      }

      if (Deps.active) {
        var isNew = resultDep.depend();
        if (isNew) {
          // For each new dependent, schedule a task for after that dependent's
          // invalidation time and the subsequent flush. The task checks
          // whether the computation should be torn down.
          Deps.onInvalidate(function () {
            if (resultDep && ! resultDep.hasDependents()) {
              Deps.afterFlush(function () {
                // use a second afterFlush to bump ourselves to the END of the
                // flush, after computation re-runs have had a chance to
                // re-establish their connections to our computation.
                Deps.afterFlush(function () {
                  if (resultDep && ! resultDep.hasDependents()) {
                    computation.stop();
                    computation = null;
                    resultDep = null;
                  }
                });
              });
            }
          });
        }
      }

      return curResult;
    };

  } else {
    var value = funcOrValue;
    return function () {
      return value;
    };
  }
};


////////////////////////////////////////

UI.insert = UI.DomRange && UI.DomRange.insert;

// Insert a DOM node or DomRange into a DOM element or DomRange.
//
// One of three things happens depending on what needs to be inserted into what:
// - `range.add` (anything into DomRange)
// - `UI.insert` (DomRange into element)
// - `elem.insertBefore` (node into element)
//
// The optional `before` argument is an existing node or id to insert before in
// the parent element or DomRange.
var insert = function (nodeOrRange, parent, before) {
  if (! parent)
    throw new Error("Materialization parent required");

  if (parent.component && parent.component.dom) {
    // parent is DomRange; add node or range
    parent.add(nodeOrRange.component || nodeOrRange, before);
  } else if (nodeOrRange.component && nodeOrRange.component.dom) {
    // parent is an element; inserting a range
    UI.insert(nodeOrRange.component, parent, before);
  } else {
    // parent is an element; inserting an element
    parent.insertBefore(nodeOrRange, before || null); // `null` for IE
  }
};

// Update attributes on `elem` to the dictionary `attrs`, using the
// dictionary of existing `handlers` if provided.
//
// Values in the `attrs` dictionary are in pseudo-DOM form -- a string,
// CharRef, or array of strings and CharRefs -- but they are passed to
// the AttributeHandler in string form.
var updateAttributes = function(elem, newAttrs, handlers) {

  if (handlers) {
    for (var k in handlers) {
      if (! newAttrs.hasOwnProperty(k)) {
        // remove attributes (and handlers) for attribute names
        // that don't exist as keys of `newAttrs` and so won't
        // be visited when traversing it.  (Attributes that
        // exist in the `newAttrs` object but are `null`
        // are handled later.)
        var handler = handlers[k];
        var oldValue = handler.value;
        handler.value = null;
        handler.update(elem, oldValue, null);
        delete handlers[k];
      }
    }
  }

  for (var k in newAttrs) {
    var handler = null;
    var oldValue;
    var value = newAttrs[k];
    if ((! handlers) || (! handlers.hasOwnProperty(k))) {
      if (value !== null) {
        // make new handler
        handler = makeAttributeHandler(k, value);
        if (handlers)
          handlers[k] = handler;
        oldValue = null;
      }
    } else {
      handler = handlers[k];
      oldValue = handler.value;
    }
    if (handler) {
      handler.value = value;
      handler.update(elem, oldValue, value);
      if (value === null)
        delete handlers[k];
    }
  }
};

UI.render = function (kind, parentComponent) {
  if (kind.isInited)
    throw new Error("Can't render component instance, only component kind");
  var inst = kind.instantiate(parentComponent);

  var content = null;
  try {
    content = (inst.render && inst.render());
  } catch (e) {
    reportUIException(e);
  }

  var range = new UI.DomRange(inst);
  materialize(content, range, null, inst);

  inst.removed = function () {
    inst.isDestroyed = true;
    if (inst.destroyed) {
      updateTemplateInstance(inst);
      inst.destroyed.call(inst.templateInstance);
    }
  };

  return inst;
};

// Convert the pseudoDOM `node` into reactive DOM nodes and insert them
// into the element or DomRange `parent`, before the node or id `before`.
var materialize = function (node, parent, before, parentComponent) {
  // XXX should do more error-checking for the case where user is supplying the tags.
  // For example, check that CharRef has `html` and `str` properties and no content.
  // Check that Comment has a single string child and no attributes.  Etc.

  if (node == null) {
    // null or undefined.
    // do nothinge.
  } else if (typeof node === 'string') {
    insert(document.createTextNode(node), parent, before);
  } else if (node instanceof Array) {
    for (var i = 0; i < node.length; i++)
      materialize(node[i], parent, before, parentComponent);
  } else if (typeof node === 'function') {

    var range = new UI.DomRange;
    var rangeUpdater = Deps.autorun(function (c) {
      if (! c.firstRun)
        range.removeAll();

      var content = null;
      try {
        content = node();
      } catch (e) {
        reportUIException(e);
      }

      Deps.nonreactive(function () {
        materialize(content, range, null, parentComponent);
      });
    });
    range.removed = function () {
      rangeUpdater.stop();
    };
    insert(range, parent, before);
  } else if (node instanceof HTML.Tag) {
    var elem = document.createElement(node.tagName);
    if (node.attrs) {
      var attrUpdater = Deps.autorun(function (c) {
        if (! c.handlers)
          c.handlers = {};

        try {
          var attrs = node.evaluateDynamicAttributes();
          var stringAttrs = {};
          if (attrs) {
            for (var k in attrs) {
              stringAttrs[k] = HTML.toText(attrs[k], HTML.TEXTMODE.STRING,
                                           parentComponent);
            }
            updateAttributes(elem, stringAttrs, c.handlers);
          }
        } catch (e) {
          reportUIException(e);
        }
      });
      UI.DomBackend.onRemoveElement(elem, function () {
        attrUpdater.stop();
      });
    }
    if (node.tagName === 'TEXTAREA') {
      elem.value = HTML.toText(node.children, HTML.TEXTMODE.STRING, parentComponent);
    } else {
      materialize(node.children, elem, null, parentComponent);
    }
    insert(elem, parent, before);
  } else if (typeof node.instantiate === 'function') {
    // component
    var instance = UI.render(node, parentComponent);

    insert(instance.dom, parent, before);
  } else if (node instanceof HTML.CharRef) {
    insert(document.createTextNode(node.str), parent, before);
  } else if (node instanceof HTML.Comment) {
    insert(document.createComment(node.sanitizedValue), parent, before);
  } else if (node instanceof HTML.Raw) {
    // Get an array of DOM nodes by using the browser's HTML parser
    // (like innerHTML).
    var htmlNodes = UI.DomBackend.parseHTML(node.value);
    for (var i = 0; i < htmlNodes.length; i++)
      insert(htmlNodes[i], parent, before);
  } else if (node instanceof HTML.Special) {
    throw new Error("Can't materialize Special tag, it's just an intermediate rep");
  } else {
    // can't get here
    throw new Error("Unexpected node in htmljs: " + node);
  }
};



// XXX figure out the right names, and namespace, for these.
// for example, maybe some of them go in the HTML package.
UI.materialize = materialize;

UI.body = UI.Component.extend({
  kind: 'body',
  contentParts: [],
  render: function () {
    return this.contentParts;
  },
  // XXX revisit how body works.
  INSTANTIATED: false
});

UI.block = function (renderFunc) {
  return UI.Component.extend({ render: renderFunc });
};
