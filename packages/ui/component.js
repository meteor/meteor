
Component = function (args) {
  this.parent = null;
  this.nameInParent = '';
  this.children = {};
  this.isInited = false;
  this.isBuilt = false;
  this.isAttached = false;
  this.isDestroyed = false;

  this.dom = null; // Chunk, if built
  this._fragment = null; // DocumentFragment, if built; empty when attached
  this._uniqueIdCounter = 1;

  this._args = args;
  this._argDeps = {};
};

_.extend(Component.prototype, {
  _requireAlive: function () {
    if (this.isDestroyed)
      throw new Error("Component was destroyed");
  },
  _forceInit: function () {
    this._requireAlive();
    if (! this.isInited) {
      this.init();
      this.isInited = true;
    }
  },
  _build: function () {
    this._forceInit();
    if (this.isBuilt)
      throw new Error("Component already built");

    this._fragment = document.createDocumentFragment();

    this.build(this._fragment);

    if (! this.dom)
      throw new Error("build() must call setBounds()");
    this.isBuilt = true;
    this.built();
  },
  attach: function (parent, before) {
    this._forceInit();
    if (this.isAttached)
      throw new Error("Component already attached");

    if (! this.isBuilt)
      this._build();

    parent.insertBefore(this._fragment, before);

    this.isAttached = true;

    this.attached();

    return this;
  },
  detach: function () {
    this._requireAlive();
    if (! this.isAttached)
      throw new Error("Component not attached");

    var start = this.dom.firstNode();
    var end = this.dom.lastNode();
    var frag = this._fragment;
    // extract start..end into frag
    var parent = start.parentNode;
    var before = start.previousSibling;
    var after = end.nextSibling;
    var n;
    while ((n = (before ? before.nextSibling : parent.firstChild)) &&
           (n !== after))
      frag.appendChild(n);

    this.isAttached = false;

    this.detached();

    return this;
  },
  destroy: function () {
    if (! this.isDestroyed) {
      this.isDestroyed = true;

      // maybe GC the DOM sooner
      this.dom = null;
      this._fragment = null;

      this.destroyed();

      var children = this.children;
      for (var k in children)
        if (children.hasOwnProperty(k))
          children[k].destroy();

      if (this.parent && ! this.parent.isDestroyed)
        delete this.parent.children[this.nameInParent];

      this.children = {};
    }

    return this;
  },
  hasChild: function (name) {
    return this.children.hasOwnProperty(name);
  },
  addChild: function (name, childComponent) {
    if (name instanceof Component) {
      // omitted name arg
      childComponent = name;
      name = null;
    }
    // omitted name, generate unique child ID
    if (name === null || typeof name === 'undefined')
      name = "__child#" + (this._uniqueIdCounter++) + "__";
    name = String(name);

    if (! (childComponent instanceof Component))
      throw new Error("not a Component: " + childComponent);

    this._requireAlive();
    if (this.hasChild(name))
      throw new Error("Already have a child named: " + name);

    if (childComponent.isDestroyed)
      throw new Error("Can't add a destroyed component");
    if (childComponent.isInited)
      throw new Error("Can't add a previously added or built component");

    this.children[name] = childComponent;

    childComponent._added(name, this);
  },
  setChild: function (name, childClass, childArgs) {
    name = String(name);

    this._requireAlive();
    if (this.hasChild(name)) {
      var oldChild = this.children[name];
      if (oldChild.constructor === childClass) {
        // old child present with same class
        oldChild.update(childArgs);
      } else {
        var newChild = new childClass(childArgs);
        if (oldChild.isAttached) {
          var beforeNode = oldChild.lastNode().nextSibling;
          var parentNode = oldChild.parentNode();
          this.removeChild(name);
          this.addChild(name, newChild);
          newChild.attach(parentNode, beforeNode);
        } else {
          this.addChild(newChild);
        }
      }
    } else {
      this.addChild(name, new childClass(childArgs));
    }
  },
  _added: function (name, parent) {
    name = String(name);
    this.nameInParent = name;
    this.parent = parent;

    this._forceInit();
  },
  removeChild: function (name) {
    name = String(name);
    this._requireAlive();
    if (! this.hasChild(name))
      throw new Error("No such child component: " + name);

    var childComponent = this.children[name];

    if (childComponent.isDestroyed) {
      // shouldn't be possible, because destroying a component
      // deletes it from the parent's children dictionary,
      // but just in case...
      delete this.children[name];
    } else {

      if (childComponent.isAttached)
        childComponent.detach();

      childComponent.destroy();

    }
  },
  setBounds: function (start, end) {
    end = end || start;
    if (start instanceof Component)
      start = start.dom;
    if (end instanceof Component)
      end = end.dom;

    if (! (start instanceof Chunk || (start && start.nodeType)))
      throw new Error("setBounds: start must be a built Component or a Node");
    if (! (end instanceof Chunk || (end && end.nodeType)))
      throw new Error("setBounds: end must be a built Component or a Node");

    if (! this.dom) {
      this.dom = new Chunk(start, end);
    } else {
      this.dom.set(start, end);
    }
  },
  setStart: function (start) {
    if (start instanceof Component)
      start = start.dom;

    if (! (start instanceof Chunk || (start && start.nodeType)))
      throw new Error("setStart: start must be a built Component or a Node");
    if (! this.dom)
      throw new Error("Can only call setStart after setBounds has been called");

    this.dom.start = start;
  },
  setEnd: function (end) {
    if (end instanceof Component)
      end = end.dom;

    if (! (end instanceof Chunk || (end && end.nodeType)))
      throw new Error("setEnd: end must be a built Component or a Node");
    if (! this.dom)
      throw new Error("Can only call setEnd after setBounds has been called");

    this.dom.end = end;
  },
  getArg: function (argName) {
    var dep = (this._argDeps.hasOwnProperty(argName) ?
               this._argDeps[argName] :
               (this._argDeps[argName] = new Deps.Dependency));
    dep.depend();
    return this._args[argName];
  },
  update: function (args) {
    var oldArgs = this._args;
    this._args = args;

    var argDeps = this._argDeps;

    for (var k in args) {
      if (args.hasOwnProperty(k) &&
          argDeps.hasOwnProperty(k) &&
          ! EJSON.equal(args[k], oldArgs[k])) {
        argDeps[k].invalidate();
        delete oldArgs[k];
      }
    }
    for (var k in oldArgs) {
      if (oldArgs.hasOwnProperty(k) &&
          argDeps.hasOwnProperty(k)) {
        argDeps[k].invalidate();
      }
    }

    this.updated(args, oldArgs);
  },
  findOne: function (selector) { return this.dom.findOne(selector); },
  findAll: function (selector) { return this.dom.findAll(selector); },
  firstNode: function () { return this.dom.firstNode(); },
  lastNode: function () { return this.dom.lastNode(); },
  parentNode: function () { return this.dom.parentNode(); },
  // Above methods are NOT overridable.
  //
  // These are all overridable, with the behavior that all implementations
  // are executed from super to sub.
  init: function () {},
  build: function (frag) {},
  built: function () {},
  attached: function () {},
  detached: function () {},
  destroyed: function () {},
  updated: function (args, oldArgs) {},
  // This is overridable but should probably get normal override behavior;
  // it has a return value and we only run one implementation.
  toHtml: function () {
    return '';
  }
});

Component.extend = function (options) {
  var superClass = this;
  var baseClass = Component;
  // all constructors just call the base constructor
  var newClass = function CustomComponent(/*args*/) {
    baseClass.apply(this, arguments);
  };

  // Establish a prototype link from newClass.prototype to
  // superClass.prototype.  This is similar to making
  // newClass.prototype a `new superClass` but bypasses
  // the constructor.
  var fakeSuperClass = function () {};
  fakeSuperClass.prototype = superClass.prototype;
  newClass.prototype = new fakeSuperClass;

  // Record the superClass for our future use.
  newClass.superClass = superClass;

  // Inherit class (static) properties from parent.
  _.extend(newClass, superClass);

  // For callbacks, call one in turn from super to sub.
  // Or rather, redefine each callback we are given to call
  // super method first.
  // XXX TODO: clean this up.
  // - General combining mechanism?  Filtering mechanism?
  // - Get the lookup hash out of here!
  _.each(options, function (v, k) {
    // important that we have a closure here to capture
    // each old function!
    var oldFunction = v;
    if ({init:1, build:1, built:1, attached:1, detached:1,
         destroyed:1, updated:1}.hasOwnProperty(k)) {
      options[k] = function () {
        superClass.prototype[k].apply(this, arguments);
        oldFunction.apply(this, arguments);
      };
    }
  });

  // Add instance properties and methods.
  if (options)
    _.extend(newClass.prototype, options);

  // For browsers that don't support it, fill in `obj.constructor`.
  newClass.prototype.constructor = newClass;

  return newClass;
};
