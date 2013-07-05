var Component = UIComponent;


Component({
  start: null,
  end: null,

  // XXX implement firstNode, lastNode

  isAttached: false,
  // array of nodes (if component is BUILT and not attached)
  _offscreenNodes: null,

  render: function (buf) {},

  _buildNodes: function () {
    var html = "<hr>"; // this could be anything
    // Returns an array of top-level nodes.
    // If there are two or more, they share a DocumentFragment
    // parent.
    var nodes = $.parseHTML(html);

    return nodes;
  },

  build: function () {
    var self = this;

    self._requireNotDestroyed();
    if (self.stage === Component.BUILT)
      throw new Error("Component already built");
    if (self.stage !== Component.ADDED)
      throw new Error("Component must be added to a parent (or made a root) before building");

    self._offscreenNodes = self._buildNodes();
    self._built();

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



    // Don't ever create DocumentFragments because of jQuery's
    // "safe fragment" workaround that we want to be sure to
    // use.  It has to do with custom elements in IE 8 (and
    // not 9?).  Document this with a link to the DOM quirk.

    // # component.add(child)
    //
    // Adds `child` to this component in the parent/child
    // hierarchy.
    //
    // Components must be assembled from "top to bottom."  Each
    // component must either be added as a child of another,
    // or made a root using `component.makeRoot()`, before
    // it can receive its own children.  This ensures that
    // every component already knows its parent when it is
    // initialized.  A component's parent is permanent; the
    // component cannot be removed or reparented without
    // destroying it.
    //
    // The child is not attached to the DOM unless a further call
    // to `child.attach` is made specifying where to put the child
    // in the DOM.  The convenience methods
    // `component.append(child)`, `prepend`, and `insert` will
    // will both add the child if necessary and insert it into
    // the DOM.
    //
    // Requires `component` is not destroyed.
    //
    // # component.remove([child])
    //
    // Removes `child` from this component's list of children,
    // removes its nodes from the DOM (if it is built and attached),
    // and destroys it.  If no child is given, removes `component`
    // itself from its parent.
    //
    // If `child` is already destroyed, its DOM is left untouched.
    // Components with destroyed children still attached are
    // presumed to be in the process of being destroyed or rebuilt.
    //
    // If you want to just remove a component from the DOM but not
    // remove it as a child or destroy it, use `child.detach()`.
    //
    // Requires `component` is not destroyed.
    //
    // Updates `start` and `end` and populates the component with
    // a comment if it becomes empty.
    //
    // # component.attach(parentNode, [beforeNode])
    //
    // Requires `component` be parented and not attached.  Builds it
    // if necessary, then plunks it in the DOM.
    //
    // If you want to move a Component in the DOM, detach it first
    // and then attach it somewhere else.
    //
    // # component.append(childOrDom)
    //
    // childOrDom is a Component, or node, or HTML string,
    // or array of elements (various things a la jQuery).
    //
    // Given `child`: It must be a child of this component or addable
    // as one.  Builds it if necessary.  Attaches it at the end of
    // this component.  Updates `start` and `end` of this component.
    //
    // # component.prepend(childOrDom)
    //
    // See append.
    //
    // # component.insert(childOrDom, before, parentNode)
    //
    // `before` is a Component or node.  parentNode is only used
    // if `before` is null.  See append.
    //
    // # component.detach()
    //
    // Component must be built and attached.  Removes this component's
    // DOM and puts it into an offscreen storage.  Updates the parent's
    // `start` and `end` and populates it with a comment if it becomes
    // empty.

    // You are free to manipulate the DOM of your component, excluding
    // the regions that belong to child components, though if you do it
    // in ways other than calling the above methods, you are responsible
    // for ensuring that `start` and `end` poing to the first and last
    // *node or Component* at the top level of the component's DOM,
    // and that the component does not become empty.
  }
});