// @export UI
UI = {
  isComponentClass: function (value) {
    return (typeof value === 'function') &&
      ((value === Component) ||
       (value.prototype instanceof Component));
  }
};

var constructorsLocked = true;

var templatesAssigned = false;
var global = (function () { return this; })();

// @export Component
Component = function (args) {
  if (! (this instanceof Component)) {
    // without `new`, `Component(...)` is an alias for
    // `Component.augment(...)`.  This code controls just
    // the base class, but derived classes have the same logic.
    return Component.augment.apply(Component, arguments);
  }

  if (constructorsLocked)
    throw new Error("To create a Component, " +
                    "use ComponentClass.create(...)");
  constructorsLocked = true;

  this.stage = Component.UNADDED;

  this._uniqueIdCounter = 1;

  // UNINITED Components get these:
  this._args = args || {};
  this._argDeps = {};

  // INITED Components get these:
  this.key = '';
  this.parent = null;
  this.children = {};

  // BUILT Components get these:
  this._start = null; // first Component or Node
  this._end = null; // last Component or Node
  this.isAttached = false;
  this._detachedContent = null; // DocumentFragment

  this._buildUpdater = null;
  this._childUpdaters = {};
  this.elements = {};

  this.constructed();
};

// life stages of a Component
_.extend(Component, {
  UNADDED: ['UNADDED'],
  ADDED: ['ADDED'],
  BUILT: ['BUILT'],
  DESTROYED: ['DESTROYED']
});

// Fills in for _start and _end on a temporary basis.
var EMPTY = ['EMPTY'];

_.extend(Component.prototype, {
  _requireStage: function (stage) {
    if (this.stage !== stage)
      throw new Error("Need " + stage + " Component, found " +
                      this.stage + " Component.");
  },
  _added: function (key, parent) {
    this._requireStage(Component.UNADDED);
    this.key = key;
    this.parent = parent;
    this.stage = Component.ADDED;
    this.init();
  },
  build: function () {
    var self = this;
    self._requireStage(Component.ADDED);
    self._buildUpdater =
      Deps.autorun(function (c) {
        var isRebuild = (self.stage === Component.BUILT);
        var oldFirstNode, oldLastNode;
        if (isRebuild) {
          oldFirstNode = self.firstNode();
          oldLastNode = self.lastNode();
          Deps.nonreactive(function () {
            for (var k in self.children) {
              if (self.children.hasOwnProperty(k)) {
                var child = self.children[k];
                child.destroy();
                self.removeChild(child.key);
              }
            }
          });
          self.elements = {};
          self.stage = Component.ADDED;
        }
        var buf = new RenderBuffer(self);
        self.render(buf);
        var buildResult = buf.build();
        if (isRebuild) {
          var parentNode = oldFirstNode.parentNode;
          var beforeNode = oldLastNode.nextSibling;
          DomUtils.extractRange(oldFirstNode, oldLastNode);
          parentNode.insertBefore(buildResult.fragment,
                                  beforeNode);
        } else {
          self._detachedContent = buildResult.fragment;
        }
        self._start = buildResult.start;
        self._end = buildResult.end;

        self.stage = Component.BUILT;
        Deps.nonreactive(function () {
          if (c.firstRun) {
            self.built();
          } else {
            self.rebuilt();
          }
        });
      });
  },
  destroy: function () {
    // Leaves the DOM and component hierarchy in place

    if (this.stage === Component.DESTROYED)
      return;

    var oldStage = this.stage;
    this.stage = Component.DESTROYED;

    if (oldStage === Component.UNADDED)
      return;

    if (this._buildUpdater)
      this._buildUpdater.stop();

    for (var k in this._childUpdaters) {
      if (this._childUpdaters.hasOwnProperty(k)) {
        this._childUpdaters[k].stop();
        delete this._childUpdaters[k];
      }
    }

    // maybe GC sooner
    this._start = null;
    this._end = null;

    this.destroyed();

    var children = this.children;
    for (var k in children)
      if (children.hasOwnProperty(k))
        children[k].destroy();
  },
  attach: function (parentNode, beforeNode) {
    var self = this;
    if (self.stage === Component.ADDED) // not built
      self.build();

    var parent = self.parent;

    self._requireStage(Component.BUILT);
    if (self.isAttached)
      throw new Error("Component already attached");

    if ((! parentNode) || ! parentNode.nodeType)
      throw new Error("first argument of attach must be a Node");
    if (beforeNode && ! beforeNode.nodeType)
      throw new Error("second argument of attach must be a Node" +
                      " if given");

    var frag = self._detachedContent;

    if (DomUtils.wrapFragmentForContainer(frag, parentNode))
      self.setBounds(frag.firstChild, frag.lastChild);

    parentNode.insertBefore(frag, beforeNode);
    self._detachedContent = null;

    self.isAttached = true;

    if (parent && parent.stage === Component.BUILT) {
      if (parent._start === EMPTY) {
        parent.setBounds(self);
      } else {
        if (parent.firstNode() === self.lastNode().nextSibling)
          parent.setStart(self);
        if (parent.lastNode() === self.firstNode().previousSibling)
          parent.setEnd(self);
      }
    }

    self.attached();
  },
  detach: function (_allowTransientEmpty) {
    var self = this;
    var parent = self.parent;

    if (parent)
      parent._requireStage(Component.BUILT);
    self._requireStage(Component.BUILT);
    if (! self.isAttached)
      throw new Error("Component not attached");

    if (parent) {
      if (parent._start === self) {
        if (parent._end === self) {
          if (_allowTransientEmpty)
            parent._start = parent._end = EMPTY;
          else
            throw new Error("Can't detach entire contents of " +
                            "Component; use swapInChild instead");
        } else {
          var newFirstNode = self.lastNode().nextSibling;
          var foundComp = null;
          for (var k in parent.children) {
            if (parent.children.hasOwnProperty(k) &&
                parent.children[k].firstNode() === newFirstNode) {
              foundComp = parent.children[k];
              break;
            }
          }
          parent.setStart(foundComp || newFirstNode);
        }
      } else if (parent._end === self) {
        var newLastNode = self.firstNode().previousSibling;
        var foundComp = null;
        for (var k in parent.children) {
          if (parent.children.hasOwnProperty(k) &&
              parent.children[k].lastNode() === newLastNode) {
            foundComp = parent.children[k];
            break;
          }
        }
        parent.setEnd(foundComp || newLastNode);
      }
    }

    self._detachedContent = document.createDocumentFragment();

    DomUtils.extractRange(self.firstNode(), self.lastNode(),
                          self._detachedContent);

    self.isAttached = false;

    self.detached();
  },
  swapInChild: function (toAttach, toDetach) {
    var parentNode = toDetach.parentNode();
    var beforeNode = toDetach.lastNode().nextSibling;
    toDetach.detach(true);
    toAttach.attach(parentNode, beforeNode);
  },
  getPreviewHtml: function () {
    this._requireStage(Component.ADDED);
    var buf = new RenderBuffer(this, { preview: true });
    this.render(buf);
    return buf.getFullHtml();
  }
});

// Once the Component is built, if the Component implementation
// modifies the DOM composition of the Component, it must specify
// the new bounds using some combination of these.
_.extend(Component.prototype, {
  setStart: function (start) {
    this._requireStage(Component.BUILT);

    if (! ((start instanceof Component &&
            start.stage === Component.BUILT) ||
           (start && start.nodeType)))
      throw new Error("start must be a built Component or a Node");

    this._start = start;
  },
  setEnd: function (end) {
    this._requireStage(Component.BUILT);

    if (! ((end instanceof Component &&
            end.stage === Component.BUILT) ||
           (end && end.nodeType)))
      throw new Error("end must be a built Component or a Node");

    this._end = end;
  },
  setBounds: function (start, end) {
    end = end || start;
    this.setStart(start);
    this.setEnd(end);
  },
  firstNode: function () {
    this._requireStage(Component.BUILT);
    return this._start instanceof Component ?
      this._start.firstNode() : this._start;
  },
  lastNode: function () {
    this._requireStage(Component.BUILT);
    return this._end instanceof Component ?
      this._end.lastNode() : this._end;
  },
  parentNode: function () {
    return this.firstNode().parentNode;
  },
  findOne: function (selector) {
    return DomUtils.findClipped(
      this.parentNode(), selector,
      this.firstNode(), this.lastNode());
  },
  findAll: function (selector) {
    return DomUtils.findAllClipped(
      this.parentNode(), selector,
      this.firstNode(), this.lastNode());
  }
});

_.extend(Component.prototype, {
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
          ! EJSON.equals(args[k], oldArgs[k])) {
        argDeps[k].changed();
        delete oldArgs[k];
      }
    }
    for (var k in oldArgs) {
      if (oldArgs.hasOwnProperty(k) &&
          argDeps.hasOwnProperty(k)) {
        argDeps[k].changed();
      }
    }

    this.updated(args, oldArgs);
  }
});

_.extend(Component.prototype, {
  hasChild: function (key) {
    return this.children.hasOwnProperty(key);
  },
  addChild: function (key, childComponentOrFunc,
                      attachParentNode,
                      attachBeforeNode) {
    if ((key instanceof Component) ||
        ((typeof key) === 'function')) {
      // omitted key arg
      childComponentOrFunc = key;
      key = null;
    }

    // omitted key, generate unique child key
    if (key === null || typeof key === 'undefined')
      key = "__child#" + (this._uniqueIdCounter++) + "__";
    key = String(key);

    var self = this;
    if (self.stage === Component.DESTROYED)
      throw new Error("parent Component already destroyed");
    if (self.stage === Component.UNADDED)
      throw new Error("parent Component is unadded");

    if (self.hasChild(key))
      throw new Error("Already have a child with key: " + key);

    var childComponent;
    if (typeof childComponentOrFunc === 'function') {
      var func = childComponentOrFunc;
      this._childUpdaters[key] =
        Deps.autorun(function (c) {
          if (c.firstRun) {
            childComponent = func();
            return;
          }
          var oldChild = self.children[key];
          if ((! (oldChild instanceof Component)) ||
              oldChild.stage === Component.DESTROYED) {
            // child shouldn't be missing, but may be
            // destroyed
            c.stop();
            return;
          }
          var newChild = func();
          if (! (newChild instanceof Component))
            throw new Error("not a Component: " + newChild);
          if (oldChild.constructor === newChild.constructor) {
            oldChild.update(newChild._args);
          } else {
            self.replaceChild(key, newChild);
          }
        });
    } else {
      childComponent = childComponentOrFunc;
    }

    if (! (childComponent instanceof Component))
      throw new Error("not a Component: " + childComponent);

    childComponent._requireStage(Component.UNADDED);

    self.children[key] = childComponent;

    childComponent._added(key, self);

    if (attachParentNode) {
      if (self.stage !== Component.BUILT)
        throw new Error("Attaching new child requires built " +
                        "parent Component");
      childComponent.attach(attachParentNode, attachBeforeNode);
    }

    return childComponent;
  },
  removeChild: function (key, _allowTransientEmpty) {
    // note: must work if child is destroyed

    key = String(key);

    if (this.stage === Component.DESTROYED)
      throw new Error("parent Component already destroyed");
    if (this.stage === Component.UNADDED)
      throw new Error("parent Component is unadded");

    if (! this.hasChild(key))
      throw new Error("No such child component: " + key);

    var childComponent = this.children[key];
    if (childComponent.stage === Component.BUILT &&
        childComponent.isAttached)
      childComponent.detach(_allowTransientEmpty);

    delete this.children[key];

    if (this._childUpdaters[key]) {
      this._childUpdaters[key].stop();
      delete this._childUpdaters[key];
    }

    childComponent.parent = null;

    childComponent.destroy();
  },
  replaceChild: function (key, newChild, newKey) {
    if (this.stage === Component.DESTROYED)
      throw new Error("parent Component already destroyed");
    if (this.stage === Component.UNADDED)
      throw new Error("parent Component is unadded");

    if (! this.hasChild(key))
      throw new Error("No such child component: " + key);

    if (! (newChild instanceof Component))
      throw new Error("Component required");

    if ((typeof newKey) !== 'string')
      newKey = key;

    var oldChild = this.children[key];

    if (newKey === key &&
        oldChild.constructor === newChild.constructor) {
      oldChild.update(newChild._args);
    } else if (this.stage !== Component.BUILT ||
               oldChild.stage !== Component.BUILT ||
               ! oldChild.isAttached) {
      this.removeChild(key);
      this.addChild(newKey, newChild);
    } else {
      // swap attached child
      var parentNode = oldChild.parentNode();
      var beforeNode = oldChild.lastNode().nextSibling;
      this.removeChild(key, true);
      this.addChild(newKey, newChild, parentNode, beforeNode);
    }
  },
  registerElement: function (elementKey, element) {
    this.elements[elementKey] = element;
  }
});

_.extend(Component.prototype, {
  render: function (buf) {
    var content = this.getArg('content');
    if (content)
      buf.component(content.create(), {key: 'content'});
  }
});

var allCallbacks = {
  constructed: function () {},
  init: function () {},
  updated: function (args, oldArgs) {},
  destroyed: function () {},
  attached: function () {},
  detached: function () {},
  built: function () {},
  rebuilt: function () {}
};

_.extend(Component.prototype, allCallbacks);

_.extend(Component.prototype, {
  lookup: function (id) {
    var self = this;

    var result = null;
    var thisToBind = null;

    // XXX figure out what this should really do,
    // and how custom component classes should
    // hook into this behavior.

    if (! id) {
      result = self.getArg('data') || null;
    } else if (id in self) {
      result = self[id];
      thisToBind = self;
    } else if (id === 'if') {
      result = If;
    } else if (id === 'each') {
      result = Each;
    } else if (id in global) {
      result = global[id];
      thisToBind = self.getArg('data') || null;
    } else if ((result = self.getArg(id))) {
      thisToBind = self;
    } else {
      // look for data arg, maybe in parent.  stop as
      // soon as we find a non-null value.
      var comp = self;
      var data = self.getArg('data');
      // `== null` means null or undefined
      while (data == null && comp.parent) {
        comp = comp.parent;
        data = comp.getArg('data');
      }

      if (data != null) {
        thisToBind = data;
        result = data[id];
      }
    }

    if (thisToBind &&
        typeof result === 'function' &&
        ! UI.isComponentClass(result))
      return _.bind(result, thisToBind);

    return result;
  }
});

// Require ComponentClass.create(...) instead of
// new ComponentClass(...) because a factory method gives
// us more flexibility, and there should be one way to
// make a component.  The `new` syntax is awkward if
// the component class is calculated by a complex expression
// (like a reactive getter).
Component.create = function (args) {
  constructorsLocked = false;
  var comp;
  if (this === Component) {
    comp = new Component(args);
  } else {
    comp = new this;
    Component.call(comp, args);
  }
  return comp;
};


var setSuperClass = function (subClass, superClass) {
  // Establish a prototype link from newClass.prototype to
  // superClass.prototype.  This is similar to making
  // newClass.prototype a `new superClass` but bypasses
  // the constructor.

  var oldProto = subClass.prototype;

  var fakeSuperClass = function () {};
  fakeSuperClass.prototype = superClass.prototype;
  subClass.prototype = new fakeSuperClass;

  // Inherit class (static) properties from parent.
  _.extend(subClass, superClass);

  // Record the (new) superClass for our future use.
  subClass.superClass = superClass;

  // restore old properties on proto (from previous augments
  // or extends)
  for (var k in oldProto)
    if (oldProto.hasOwnProperty(k))
      subClass.prototype[k] = oldProto[k];

  // For browsers that don't support it, fill in `obj.constructor`.
  subClass.prototype.constructor = subClass;

  subClass.create = Component.create;
};

Component.augment = function (options) {
  var cls = this;

  if (! options)
    throw new Error("Options object required to augment object");

  if ('extend' in options) {
    var newSuper = options.extend;
    if (! UI.isComponentClass(newSuper))
      throw new Error("'extend' option must be a Component class");

    if (cls.superClass !== Component)
      throw new Error("Can only set superclass once, on generic Component");

    if (newSuper !== cls.superClass) {
      setSuperClass(cls, newSuper);
    }
    delete options.extend;
  }

  _.each(options, function (propValue, propKey) {
    // (it's important that this loop body is a closure,
    // because local variables are closed over by nested
    // closures and those variables have different values
    // each time through the loop)
    if (allCallbacks.hasOwnProperty(propKey)) {
      // Property is on our list of callbacks.
      // Callbacks chain with previous callbacks
      // and super's callback.
      if (cls.prototype.hasOwnProperty(propKey)) {
        // not the first time this callback has been defined
        // on this class!  Chain with previous, not super.
        var prevFunction = cls.prototype[propKey];
        cls.prototype[propKey] = function (/*arguments*/) {
          prevFunction.apply(this, arguments);
          propValue.apply(this, arguments);
        };
      } else {
        // First time this callback has been defined on this
        // class.  Chain with super.
        cls.prototype[propKey] = function (/*arguments*/) {
          if (cls.superClass)
            cls.superClass.prototype[propKey].apply(this, arguments);
          propValue.apply(this, arguments);
        };
      }
    } else {
      // normal, non-callback method or other property
      cls.prototype[propKey] = propValue;
    }
  });

  return cls;
};

Component.extend = function (options) {
  var superClass = this;
  // all constructors just call the base constructor
  var newClass = function CustomComponent(/*arguments*/) {
    if (! (this instanceof newClass)) {
      // without `new`, `MyComp(...)` is an alias for
      // `MyComp.augment(...)`.
      return newClass.augment.apply(newClass, arguments);
    }

    if (constructorsLocked)
      throw new Error("To create a Component, " +
                      "use ComponentClass.create(...)");
    // (Component.create kicks off construction)
  };

  setSuperClass(newClass, superClass);

  if (options)
    newClass.augment(options);

  return newClass;
};

// @export EmptyComponent
EmptyComponent = Component.extend({});
// (might be some optimizations possible in the future)

// @export TextComponent
TextComponent = Component.extend({
  render: function (buf) {
    buf.text(this.getArg('text'));
  }
});

// @export RawHtmlComponent
RawHtmlComponent = Component.extend({
  render: function (buf) {
    buf.rawHtml(this.getArg('html'));
  }
});

// A RootComponent is the root of its Component tree in terms
// of parent/child relationships.  It's the only kind of
// component that can function without actually being added
// to another component first.

// @export RootComponent
RootComponent = Component.extend({
  constructed: function () {
    // skip the UNADDED phase completely
    this.stage = Component.ADDED;

    this._uid = Random.id();

    // this would normally be called upon "add"
    this.init();
  },
  attached: function () {
    RootComponent._attachedInstances[this._uid] = this;
  },
  detached: function () {
    delete RootComponent._attachedInstances[this._uid];
  },
  destroyed: function () {
    delete RootComponent._attachedInstances[this._uid];
  }
});

RootComponent._attachedInstances = {};