// @export UI
UI = {
  nextGuid: 1
};

var isComponentType = function (x) {
  return (typeof x === 'function') &&
    ((x === Component) ||
     (x.prototype instanceof Component));
};

var MAKING_PROTO = {}; // unique sentinel object

var constrImpl = function (ths, args, type) {
  if (args[0] === MAKING_PROTO)
    return ths;

  if (! (ths instanceof type))
    // invoked without `new`
    return new type(args[0], args[1]);

  // invoked as `new Foo(...)`
  if (! type._superSealed)
    type._superSealed = "instantiated";

  var options = args[0];

  // support `(dataFunc[, options])` args
  var dataFunc = null;
  if (typeof options === 'function') {
    dataFunc = options;
    options = args[1];
  }

  var specialOptions = false;

  if (options) {
    for (var k in options) {
      if (type._extendHooks[k]) {
        specialOptions = true;
        break;
      }
    }
  }

  if (specialOptions) {
    // create a subtype
    return type.extend(options).create(dataFunc);
  } else {
    // don't create a subtype (faster)
    if (options)
      _extend(ths, options);
    if (dataFunc)
      ths.data = dataFunc;
  }

  ths.guid = UI.nextGuid++;
  ths.constructed();

  return ths;
};

var Component = function Component() {
  return constrImpl(this, arguments, Component);
};

_extend = function (tgt, src) {
  for (var k in src)
    if (src.hasOwnProperty(k))
      tgt[k] = src[k];
  return tgt;
};

var setSuperType = function (subType, superType) {
  var oldProto = subType.prototype;

  subType.prototype = new superType(MAKING_PROTO);

  // Make the 'constructor' property of components behave
  // the way you'd think it should in OO, i.e.
  // `Foo.create().constructor === Foo`.
  // Make a non-enumerable property in browsers that allow
  // it, which is all except IE <9.  IE 8 has an
  // Object.defineProperty but it doesn't work.
  try {
    Object.defineProperty(subType.prototype,
                          'constructor',
                          { value: subType });
  } catch (e) {
    subType.prototype.constructor = subType;
  }

  // Inherit static properties from parent.
  _extend(subType, superType);

  // Record the (new) superType for our future use.
  subType.superType = superType;

  // restore old properties on proto (from previous includes
  // or extends)
  _extend(subType.prototype, oldProto);

  subType.create = Component.create;
};

var chainCallback = function (cb, cbName) {
  var prevCb = (
    this.prototype.hasOwnProperty(cbName) ?
      this.prototype[cbName] :
      this.superType && this.superType.prototype[cbName]);

  this.prototype[cbName] = function (/*args*/) {
    prevCb && prevCb.apply(this, arguments);
    cb.apply(this, arguments);
  };
};

_extend(Component, {
  typeName: "Component",
  _extendHooks: {
    extend: function (newSuper) {
      var type = this;
      if (! isComponentType(newSuper))
        throw new Error("'extend' option must be a Component type");

      if (newSuper !== type.superType) {
        if (type.superType !== Component)
          throw new Error("Can only set Component supertype once");

        if (type._superSealed)
          throw new Error("Can't set Component supertype after " + type._superSealed);

        setSuperType(type, newSuper);
      }
    },
    extendHooks: function (hooks) {
      this._extendHooks =
        _extend(_extend({}, this._extendHooks), hooks);
    },
    // make typeName count as a special option for when `create`
    // checks for special options, even though it's not
    // implemented here (but by `extend`)
    typeName: function () {},
    constructed: 'chain'
  },
  toString: function () {
    return this.typeName || '(Component type)';
  },
  // must be exported for absolute access from `extend`
  _constrImpl: constrImpl,
  create: function (dataFunc, options) {
    return new this(dataFunc, options);
  },
  include: function (options) {
    var type = this;

    // Note: We avoid calling `delete options.foo` even if it's
    // convenient so that we don't mutate the `options` object,
    // which might be used more than once.

    if ((!options) || typeof options !== 'object')
      throw new Error("Options object required in 'include'");

    // handle 'extend' first
    if ('extend' in options)
      type._extendHooks.extend(options.extend, 'extend');

    for (var optKey in options) {
      if (optKey === 'extend')
        continue;
      // Don't put typeName on the proto; it goes on the type constructor.
      // When we're called from `extend`, typeName has already been
      // taken care of.  When we're called directly, we silently drop it.
      if (optKey === 'typeName')
        continue;

      var optValue = options[optKey];

      var hook = type._extendHooks[optKey];
      if (hook) {
        if (hook === 'chain')
          hook = chainCallback;
        // Note that it's ok for the hook to recursively
        // invoke `this.include`.
        hook.call(type, optValue, optKey);
        if (! type._superSealed)
          type._superSealed = optKey;
      } else {
        type.prototype[optKey] = optValue;
      }
    }

    return type;
  },
  extend: function (options) {
    var superType = this;

    // Note: We avoid calling `delete options.foo` even if it's
    // convenient so that we don't mutate the `options` object,
    // which might be used more than once.

    if (! superType._superSealed)
      superType._superSealed = "extended";

    var typeName = this.typeName;
    if (options && options.typeName) {
      typeName = String(options.typeName).replace(
          /^[^a-zA-Z_]|[^a-zA-Z_0-9]/g, '') || typeName;
    }

    var newType = Function(
      "return function " + typeName + "() { " +
        "return Package.ui.UIComponent._constrImpl(this, " +
        "arguments, " + typeName + "); };")();

    setSuperType(newType, superType);
    newType.typeName = typeName;
    newType._superSealed = null;

    if (options)
      newType.include(options);

    return newType;
  },
  define: function (props) {
    if ((!props) || typeof props !== 'object')
      throw new Error("Props object required in Component.define");

    _extend(this, props);

    if (! this._superSealed)
      this._superSealed = 'calling define()';
  },
  isType: isComponentType
});

Component.include({
  constructed: function () {},
  data: function () {
    return this.parent ? this.parent.data() : null;
  }
});

UI.Component = Component;