// TODO: provide an easy way to document member variables:
// 1) that are publically exposed
// 2) that are private implementation details

// TODO: private ctors would be nice, for classes that can be created
// many different ways (and would thus be created through factory
// methods). maybe privateConstructor() instead of constructor, and
// then you must call _create() instead of create()?

// TODO: provide a test for events

// TODO: figure out how we expect GC to work with events

/**
 * Geoff's Javascript class system. Usage:
 *
 * MyClass = Class('MyClass');
 * MyClass.methods({
 *  doSomething : function () {},
 *  doSomethingSpecificToSubclass : null // abstract
 * });
 * MyClass.constructor(function (_super, some_arg) {
 *  _super();
 *  this.some_property = some_arg;
 * });
 * MyClass.events("foohappened", "barhappened");
 *
 * MyDerivedClass = Class('MyDerivedClass', MyClass);
 * MyDerivedClass.methods({
 *  doSomethingSpecificToSubclass : function () {} // make concrete
 * });
 * MyDerivedClass.constructor(function (_super, foo_arg, bar_arg) {
 *  _super(foo_arg + bar_arg);
 *  this.junk = foo_arg * bar_arg);
 * });
 *
 * my_instance = MyDerivedClass.create(foo, bar);
 * my_instance instanceof MyDerivedClass => true
 * my_instance instanceof MyClass => true
 *
 * my_instance.on("foohappened", function (arg1, arg2, arg3) {..} );
 * my_instance.on(["event1","event2"], function (arg1, arg2, arg3) {..} );
 * my_instance.fire("foohappened", arg1, arg2, arg3) => undefined
 *
 * MyClass.create(something) => exception (abstract because of
 *   doSomethingSpecificToSubclass)
 *
 * Constructor is optional, but if given, must call _super (the
 * function passed as its first argument) with whatever arguments it
 * would like to pass to its superclass ctor. If a base class, pass no
 * arguments. (TODO: lame, maybe just don't pass _super, or pass
 * undefined? After all a class has to know its superclass's ctor's
 * signature..)
 *
 * Methods are optional. Methods may be provided multiple times for a
 * given class (whatever is provided in merged.) (However, additional
 * methods may not be added to a class once it has been instantiated
 * or used as a base class.)  Methods in child classes override
 * methods in parent classes with the same name. Set a method to null,
 * rather than a function, to specify an abstract method that must be
 * overridden in a subclass in order for it to be legal to construct
 * the subclass.
 *
 * Events are optional. Events that will listened to by on() or fired
 * by fire() must first be declared on the class with events(). Events
 * may be declared multiple times; the lists are merged. Child classes
 * inherit all of their superclasses's events. The return value of
 * event handler functions is ignored. As a convenience, events are
 * called with 'this' set to the object on which the event is
 * registered. If a class has no events, then its instances will not
 * have on() or fire() methods -- so, you could think of events() as
 * an easy means of declaring on() and fire().
 *
 * There is no explicit support for inherited properties. Instead, set
 * any desired properties in your constructors.
 *
 * If you want static methods, constants, etc, just set them yourself:
 *   MyClass.MY_CONSTANT = 12;
 *   MyClass.doJunk = function() {};
 */

// Starting to think that classes are the wrong direction, and that we
// should have a good interface facility instead. Consider that
// setters and getters are part of a modern JS interface. In the rare
// cases you actually want inheritance, we can make up facilities to
// do it prototypally.

Class = function(name, opt_superclass) {
  // it would be nice if:
  //
  //   MyClass = Class('MyClass');
  //   MyClass instanceof Class => true        [A]
  //   my_instance = MyClass.create()
  //   my_instance instanceof MyClass => true  [B]
  //
  // .. but both A and B can't be true. The right-hand argument to
  // instanceof must be a function, so if B is true, then MyClass must
  // be a function. On the other hand, for A to be true, we must have
  // set MyClass.__proto__ to Class.prototype. But since __proto__
  // can't be set directly, we could have only done that by creating
  // MyClass using the 'new' keyword. But the 'new' keyword doesn't
  // create functions, just plain objects, so if A is true then B
  // cannot be true.
  //
  // So we just ditch A, since it doesn't have much practical
  // value. Anyway it's confusing, since it implies that Class is a
  // class, which it is not.
  var klass = function() {
    throw new Error("Create instances of " + name + " by calling " + name +
                    ".create(), not by calling " + name + "() or new " +
                    name + "()");
  };

  klass.classname = name;
  klass._has_ctor = false;
  klass._has_subclasses = false;
  klass._has_instances = false;
  klass._abstract_method_count = 0;
  klass._events = {};
  klass._event_methods_created = false;
  // In this and other functions, we break out arg0..arg9 because we
  // believe that working with 'arguments' is really slow in
  // current-generation VMs.
  klass._construct = function(obj, arg0, arg1, arg2, arg3, arg4, arg5, arg6,
                              arg7, arg8, arg9, sentinel) {
    if (undefined !== sentinel)
      throw new Error("Too many arguments to _construct. Edit Class.js.");

    var super_called = false;
    var _super = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6,
                          arg7, arg8, arg9, sentinel) {
      if (undefined !== sentinel)
        throw new Error("Too many arguments to _super. Edit Class.js.");
      if (super_called)
        throw new Error(klass.classname + " constructor called superconstructor twice!");
      super_called = true;
      if ('superclass' in klass) {
        klass.superclass._construct(obj, arg0, arg1, arg2, arg3, arg4,
                                    arg5, arg6, arg7, arg8, arg9);
      }
    }
    klass._ctor.call(obj, _super, arg0, arg1, arg2, arg3, arg4, arg5, arg6,
                     arg7, arg8, arg9);
    if (!super_called)
      throw new Error(klass.classname + " constructor failed to call superconstructor");
  };
  klass._ctor = function (_super, arg0, arg1, arg2, arg3, arg4, arg5, arg6,
                          arg7, arg8, arg9, sentinel) {
    if (undefined !== sentinel)
      throw new Error("Too many arguments to default constructor. Edit Class.js.");
    _super(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9);
  };

  if (undefined !== opt_superclass) {
    klass.superclass = opt_superclass;
    klass.superclass._has_subclasses = true;
    klass._abstract_method_count = klass.superclass._abstract_method_count;
    // make our prototype have our superclass's prototype as its
    // prototype -- requires recreating our prototype
    var f = function() {};
    f.prototype = klass.superclass.prototype;
    klass.prototype = new f();
    klass.prototype.constructor = klass;
    // event inheritance
    for (var e in klass.superclass)
      klass._events[e] = true;
  }

  klass.methods = function(obj) {
    if (klass._has_subclasses)
      throw new Error("May not add methods to a class once that class has " +
                      "child classes");
    if (klass._has_instances)
      throw new Error("May not add methods to a class once that class has " +
                      "been instantiated"); // eg, abstract methods

    for (var key in obj) {
      if (klass.prototype.hasOwnProperty(key))
        throw new Error('Class ' + klass.classname + ' already has a method ' +
                        key);
      var value = obj[key];
      if (null !== value && typeof(value) !== 'function')
        throw new Error('Methods must be of type function, or null; but method ' +
                        key + ' is of type ' + typeof(value));
      if (null === value) {
        if (!(key in klass.prototype))
          klass._abstract_method_count++;
        else if (null !== klass.prototype[key])
          throw new Error('Concrete methods may not be made abstract in a ' +
                          'subclass');
      } else {
        if (null === klass.prototype[key])
          klass._abstract_method_count--;
      }
      klass.prototype[key] = obj[key];
    }
  };

  klass.events = function () {
    var idx;
    if (klass._has_subclasses)
      throw new Error("May not add events to a class once that class has " +
                      "child classes"); // could lift if necessary
    if (arguments.length === 0)
      return; // avoid creating event methods
    for (var idx = 0; idx < arguments.length; idx++)
      klass._events[arguments[idx]] = true;
    if (!klass._event_methods_created) {
      klass.prototype.on = function (eventspec, func) {
	var self = this;
	var events;
	if (eventspec instanceof Array)
	  events = eventspec;
	else
	  events = [eventspec];

	events.forEach(function (event) {
          var array = self.__event_listeners[event];
          if (!array) {
            if (!(event in klass._events))
              throw new Error("Class " + klass.classname +
			      " does not have " +
                              "an event called '" + event + "'");
            self.__event_listeners[event] = array = [];
          }
          array.push(func);
	});
      };

      klass.prototype.fire =
        function (event, arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7,
                  arg8, arg9, sentinel) {
          var self = this;
          if (undefined !== sentinel)
            throw new Error("Too many arguments to " + klass.classname +
                            ".fire(" + event + "). Edit Class.js to " +
                            "lift this implementation limit.");
          var array = self.__event_listeners[event];
          if (!array) {
            if (!(event in klass._events))
              throw new Error("Class " + klass.classname + " does not have " +
                              "an event called '" + event + "'");
          } else
            array.forEach(function (f) {
              f.call(self, arg0, arg1, arg2, arg3, arg4, arg5, arg6,
                     arg7, arg8, arg9);
            });
        }
      klass._event_methods_created = true;
    }
  };

  klass.constructor = function(ctor) {
    if (klass._has_ctor)
      throw new Error('A constructor has already been defined for class ' +
                      klass.classname);
    klass._ctor = ctor;
    klass._has_ctor = true;
  };

  klass.create = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7,
                          arg8, arg9, sentinel) {
    if (0 !== klass._abstract_method_count)
      throw new Error("Cannot create an instance of " + klass.classname +
                      " as it has " + klass._abstract_method_count +
                      " abstract methods");
    if (undefined !== sentinel)
      throw new Error("Too many arguments to " + klass.classname + ".create(). " +
                      "Edit Class.js to lift this implementation limit.");

    klass._has_instances = true;
    var f = function() {};
    f.prototype = klass.prototype;
    var obj = new f();
    obj.__event_listeners = {};

    klass._construct(obj, arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7,
                     arg8, arg9);
    return obj;
  };

  return klass;
};

/* TODO: move to separate files ...
assert = function(x) {
  if (!x)
    throw new Error("Assertion failed");
};
assert(true);

assertThrows = function(e, f) {
  var exception;
  try {
    f();
  } catch (e) {
    exception = e;
  }

  if (undefined === exception)
    throw new Error("Expecting an exception, but did not get one");
  if (!(exception instanceof e)) {
    exception.message = "Received unexpected exception (while expecting an " +
      "exception of type " + e.name + "): " + exception.message;
    throw exception;
  }
};

assertThrows(Error, function() { throw new Error("I am Error"); });
assertThrows(TypeError, function() { throw TypeError("I am TypeError"); });
assertThrows(Error, function() { throw TypeError("I am TypeError"); });
assertThrows(Error, function() {
  assertThrows(Error, function() {});
});
assertThrows(Error, function() {
  assertThrows(TypeError, function() { throw ReferenceError("Wrong type"); });
});

MyBaseClass = Class('MyBaseClass');
assert(!(MyBaseClass instanceof Class));
base_inst = MyBaseClass.create();
assert(base_inst instanceof MyBaseClass);
assert(!(base_inst instanceof Class));

MyDerivedClass = Class('MyDerivedClass', MyBaseClass);
derived_inst = MyDerivedClass.create();
assert(derived_inst instanceof MyDerivedClass);
assert(derived_inst instanceof MyBaseClass);

assertThrows(Error, function() {
  MyBaseClass.methods({x : function(){}});
}); // already has subclasses

assertThrows(Error, function() { MyBaseClass(); });
assertThrows(Error, function() { new MyBaseClass(); });

ToothyThing = Class('ToothyThing');
ToothyThing.methods({
  eat : function(n) { this.hunger = this.hunger - n; },
  goToDentist : null
});
ToothyThing.constructor(function (_super, hunger) { 
  _super();
  this.hunger = hunger;
});
assertThrows(Error, function() { ToothyThing.create(12); }); // abstract

Alligator = Class('Alligator', ToothyThing);
Alligator.methods({
  goToDentist : function() { this.hunger = 400; }
});

alli = Alligator.create(20);
assert(20 === alli.hunger);
alli.eat(4);
assert(16 === alli.hunger);
alli.goToDentist();
assert(400 === alli.hunger);

CoolAlligator = Class('CoolAlligator', Alligator);
CoolAlligator.methods({
  eat: function(n) { this.hunger = this.hunger + 1 - n; },
  shades: function() { return this._shades; }
});
CoolAlligator.constructor(function (_super, shades, hunger) {
  _super(hunger * 2);
  this._shades = shades;
});

calli = CoolAlligator.create('armani', 20);
assert(40 === calli.hunger);
assert('armani' === calli._shades);
assert('armani' === calli.shades());
calli.eat(4);
assert(37 === calli.hunger);
calli.goToDentist();
assert(400 === calli.hunger);

assertThrows(Error, function() {
  CoolAlligator.methods({x : function(){}});
}); // already has instances


assertThrows(Error, function() {
  CoolAlligator.constructor(function (_super) {_super(99);});
}); // already has ctor


Broken = Class('Broken');
Broken.methods({breakme: function() {}});
// duplicate method
assertThrows(Error, function() { Broken.methods({breakme: function() {}}) });


Dumb = Class('Dumb', CoolAlligator);
assertThrows(Error, function() {
  Dumb.methods({
    shades: null
  });
}); // can't make a concrete method abstract

Weird = Class('Weird');
assertThrows(Error, function() {
  Weird.methods({
    strange: 27
  });
}); // methods must be functions, or null


NotEnough = Class('NotEnough');
NotEnough.constructor(function (_super) { });
// ctor didn't call _uper
assertThrows(Error, function() { NotEnough.create(); });

TooMuch = Class('TooMuch');
TooMuch.constructor(function (_super) { _super(); _super();});
// ctor called _super more than once
assertThrows(Error, function() { TooMuch.create(); });


Abstract1 = Class('Abstract1');
assert(0 === Abstract1._abstract_method_count);
Abstract1.methods({
  kitten: function() {},
  puppy: null
});
assert(1 === Abstract1._abstract_method_count);
Abstract1.methods({
  darkPuppy: null,
  evilPuppy: null,
});
assert(3 === Abstract1._abstract_method_count);
Abstract2 = Class('Abstract2', Abstract1);
assert(3 === Abstract2._abstract_method_count);
Abstract2.methods({
  darkPuppy: function() {}
});
assert(2 === Abstract2._abstract_method_count);
Abstract2.methods({
  evilPuppy: function() {},
  something: function() {},
  puppy: function() {}
});
assert(0 === Abstract2._abstract_method_count);
Abstract2.methods({
  kitten: function() {},
  wolfish: null
});
assert(1 === Abstract2._abstract_method_count);
Abstract3 = Class('Abstract3', Abstract2);
assert(1 === Abstract3._abstract_method_count);
Abstract3.methods({
  evilPuppy: function() {},
  something: function() {},
  puppy: function() {},
  kitten: function() {}
});
assert(1 === Abstract3._abstract_method_count);
Abstract3.methods({
  wolfish: function() {}
});
assert(0 === Abstract3._abstract_method_count);
Abstract3.create();

*/