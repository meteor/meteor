

// All right, this is a little crazy, but let's try it for the demo.
//
// `Template.foo({ ... props ... })` sets properties on an underlying
// Component object.  `Template.foo()` (with `arguments.length === 0`)
// returns this underlying object.
//
// We can't easily have the `Template.foo({...})` syntax and have
// `Template.foo` actually *be* a Component, because making Components
// sometimes have typeof function would complicate things a lot.
// However, we can make `Template.foo` just as good in situations where
// a function will do (templates, `buf.write`) and when that doesn't
// work you can write `Template.foo()` instead.
//
// The potential downside is that this is just too confusing.

var chainers = { init: 1, rendered: 1, destroyed: 1 };

var makeGetter = function (obj, propName, initialValue) {
  var getter = function (newValue) {
    if (this !== obj) {
      // if we're being called on a subclass, copy ourselves!
      // XXX lazy copying is probably not the right way to do this.
      this[propName] = makeGetter(this, propName, initialValue);
      return arguments.length ? this[propName](newValue) :
        this[propName]();
    }
    if (arguments.length) {
      // setter doubles as a getter.  that way we have access to `this`
      // both ways.
      getter.$value = newValue;
      getter.$dep.changed();
    } else {
      getter.$dep.depend();
      return getter.$value;
    }
  };
  getter.$value = initialValue;
  getter.$dep = new Deps.Dependency;

  return getter;
};

UI.makeTemplate = function (underlying) {
  return function (options) {
    if (! arguments.length)
      return underlying;

    for (var k in options) {
      if (options.hasOwnProperty(k)) {
        var oldProp = underlying[k];
        var givenProp = options[k];

        if (k === 'fields') {
          // XXX basic fields impl
          // XXX could support functions as initial field values
          _.each(givenProp, function (fieldValue, fieldName) {
            underlying[fieldName] = makeGetter(underlying, fieldName,
                                               fieldValue);
          });

        } else if (k.indexOf(' ') >= 0) {
          // event handler
          // XXX clean this up
          var eventType = k.slice(0, k.indexOf(' '));
          var selector = k.slice(k.indexOf(' ') + 1);

          underlying._events = (underlying._events || []);
          underlying._events.push({
            type: eventType,
            selector: selector,
            handler: (function (handler) {
              return function (evt) {
                // XXX
                var comp = UI.body.findByElement(evt.target);
                evt.component = comp;
                UI.Component.current = comp;
                var data = comp.get();
                handler.call(data, evt);
              };
            })(givenProp)
          });

        } else if (chainers.hasOwnProperty(k)) {
          // init, rendered, destroyed
          if (typeof oldProp === 'function') {
            underlying[k] = (function (oldCb) {
              return function () {
                oldCb.call(this);
                givenProp.call(this);
              };
            })(oldProp);
          } else {
            underlying[k] = givenProp;
          }
        } else if (typeof givenProp === 'function') {
          // helper
          if (k === 'data')
            throw new Error("'data' is reserved and can't be used as a helper name");
          underlying[k] = (function (helper) {
            return function (/**/) {
              // XXX total hack!!  this line:
              UI.Component.current = this;

              var data = this.get();
              return helper.apply(data, arguments);
            };
          })(givenProp);
        } else {
          underlying[k] = givenProp;
        }
      }
    }

    // no use case for this return value, but maybe making it
    // same as no-arg form is less weird.
    return underlying;
  };
};