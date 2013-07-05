var Component = UIComponent;


Component({
  start: null,
  end: null,

  isAttached: false,
  _offscreenFragment: null,

  render: function (buf) {},

  build: function () {
    var self = this;

    self._requireNotDestroyed();
    if (self.stage === Component.BUILT)
      throw new Error("Component already built");
    if (self.stage !== Component.ADDED)
      throw new Error("Component must be added to a parent (or made a root) before building");

    // Do something like old `build`.
    //
    // Version 1:
    //
    // * Calls render, getting {fragment, start, end}
    // * Sets {_offscreenFragment, start, end}
    // * Calls _built.
    //
    // Then allow attaching and detaching.
    //
    // Reactive building:
    //
    // * Perhaps factor out into a `_rebuild` method.
    // * Removes all children
    //   - Destroys them first, which is important when
    //     removing a child also removes it from the DOM.
    //     We don't do this yet.
    // * There should be some natural way for the autorun
    //   to die with the Component.  One solution is to
    //   have `self.autorun`, which performs an autorun
    //   that stops when the component is destroyed.  Note
    //   that autoruns nested inside the `build` autorun
    //   will (additionally) stop on rebuild, as they
    //   should.
    //
    // Remove should `detach`, as it does in the old code.
    //
    // Add should have the option to attach, but allow
    // you to attach relative to a component as well as a
    // node.  Perhaps `(before, parentNode)` where `before`
    // is a node or a Component, and parentNode is looked
    // at if `before` is null, so that if you have element
    // P having children A and B you can pass (A, P), (B, P),
    // or (null, P) to insert at various positions.  (This
    // also works if A and B are components, incidentally.)
    // Oh, the problem with this argument order is it
    // neglects the one-argument case, like attach(document.body),
    // where you just want to specify a parent.
    //
    // Well, either way, `attach` and `add` take the same
    // arguments, and they are optional for `add`.
    // Could also have addAfter, addBefore, attachAfter, and
    // attachBefore, which take (nodeOrComponent, [parentNode]).
    // What about "append" and "prepend"?  But do they add or
    // attach?  Maybe `add` is also `attach`?  But we don't want
    // `add` to attach in th basic case.  Maybe `add` with
    // any DOM arguments will attach an existing component.
    // Then `append` and `prepend` will also add or attach.
    //
    // These methods should potentially take DOM elements as
    // well...
    //
    // If Component is ever emptied, it gets an empty comment node.
    // This case is treated specially and the comment is removed
    // if you then, say, append a node or component.  However,
    // the developer doing advanced things needs to be aware of
    // this case or they may be surprised there is a node there
    // that they didn't put there, e.g. if they call remove() on
    // the last component and then start inserting DOM nodes
    // manually.
  }
});