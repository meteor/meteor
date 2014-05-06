
// generic stopped method for a range with a single computation attached to it
var _onstopForRender = function () {
  this.computation.stop();
};

var RenderController = Blaze.RenderController = function () {
  Blaze.Controller.call(this);
};
__extends(Blaze.RenderController, Blaze.Controller);

Blaze.render = function (func) {
  var range = new Blaze.DOMRange;
  var controller = Blaze.currentController;
  if (! controller)
    controller = new RenderController;

  range.computation = Deps.autorun(function () {
    Blaze.withCurrentController(controller, function () {
      var content = func();
      range.setMembers(Blaze.toDOM(content));
    });
  });
  Blaze._wrapAutorun(range.computation);
  range.onstop(_onstopForRender);
  // XXX figure how else the autorun gets stopped
  // (from the app via a "finalize" API call; when the
  // range is removed from the DOM?)
  return range;
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
                        "Blaze.renderList");
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
    }
  });

  return range;
};
