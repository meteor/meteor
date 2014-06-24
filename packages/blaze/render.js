
// generic stopped method for a range with a single computation attached to it
var _onstopForRender = function () {
  this.computation.stop();
};

Blaze.RenderController = Blaze.Controller.extend();

var contentEquals = function (a, b) {
  if (a instanceof HTML.Raw) {
    return (b instanceof HTML.Raw) && (a.value === b.value);
  } else if (a == null) {
    return (b == null);
  } else {
    return (a === b) &&
      ((typeof a === 'number') || (typeof a === 'boolean') ||
       (typeof a === 'string'));
  }
};

Blaze.TeardownWatcher = Blaze.DOMAugmenter.extend({
  attach: function (range, element) {
    Blaze.DOMBackend.Teardown.onElementTeardown(element, function () {
      range.stop();
    });
  }
});

// Takes a function that returns HTMLjs and returns a DOMRange.
// The function will be reactively re-run.  The resulting DOMRange
// may be attached to the DOM using `.attach(parentElement, [nextNode])`.
Blaze.render = function (func) {
  var range = new Blaze.DOMRange;
  var controller = Blaze.currentController;
  if (! controller)
    controller = new Blaze.RenderController;

  var oldContent;
  range.computation = Deps.autorun(function (c) {
    Blaze.withCurrentController(controller, function () {
      var content = func();
      if (c.firstRun || ! contentEquals(oldContent, content)) {
        oldContent = content;
        range.setMembers(Blaze._toDOM(content));
      }
    });
  });
  Blaze._wrapAutorun(range.computation);

  range.onstop(_onstopForRender);

  range.addDOMAugmenter(new Blaze.TeardownWatcher);

  return range;
};

// Instantiate a component class or a template like Template.foo
// (with no arguments), render it to DOM, and optionally
// attach it under parentElement.  Returns the component instance.
// If you want the DOMRange, use `.domrange` on the return value.
Blaze.renderComponent = function (constructorOrPrototype, parentElement, nextNode) {
  var controller = Blaze.currentController;
  if (! controller)
    controller = new Blaze.RenderController;

  var constructor = constructorOrPrototype;
  if (typeof constructor !== 'function') {
    constructor = constructorOrPrototype.constructor;
    if (! (constructor && constructor.prototype === constructorOrPrototype))
      throw new Error("Expected prototype, found: " + constructor);
  }

  var range = Blaze.withCurrentController(controller, function () {
    return (new constructor).createDOMRange();
  });

  if (parentElement) {
    range.attach(parentElement, nextNode);
  }

  return range.controller;
};

Blaze.renderList = function (funcSequence) {
  if (! (funcSequence instanceof Blaze.Sequence))
    throw new Error("Expected a Blaze.Sequence of functions in " +
                    "Blaze.renderList");

  var controller = Blaze.currentController;

  var initialMembers;
  var computation = Deps.autorun(function (c) {
    if (! c.firstRun)
      return; // can't get here

    var initialCount = funcSequence.size();
    initialMembers = new Array(initialCount);
    for (var i = 0; i < initialCount; i++) {
      var func = funcSequence.get(i);
      if (typeof func !== 'function')
        throw new Error("Expected a Blaze.Sequence of functions in " +
                        "Blaze.renderList, found item: " + func);
      initialMembers[i] = Blaze.render(func);
    }
  });
  Blaze._wrapAutorun(computation);

  var range = new Blaze.DOMRange(initialMembers);
  range.computation = computation;
  range.onstop(_onstopForRender);

  funcSequence.observeMutations({
    addItem: function (func, k) {
      if (typeof func !== 'function')
        throw new Error("Expected function in Blaze.renderList");
      Deps.nonreactive(function () {
        var newMember = Blaze.withCurrentController(
          controller,
          function () {
            return Blaze.render(func);
          });
        range.computation.onInvalidate(function () {
          newMember.stop();
        });
        range.addMember(newMember, k);
      });
    },
    removeItem: function (k) {
      Deps.nonreactive(function () {
        range.getMember(k).stop();
        range.removeMember(k);
      });
    },
    moveItem: function (oldIndex, newIndex) {
      Deps.nonreactive(function () {
        range.moveMember(oldIndex, newIndex);
      });
    }
  });

  return range;
};
