(function(Meteor) {
// Add 3 functions to an object to create a reactive variable on it.
//
// For example Router.add_reactive_variable('current_page', initial_value) will create three methods:
//
//   - Router.current_page(not_reactive = false): 
//      reads the value of current_page, reactively?
// 
//   - Router.current_page.equals(value): 
//      is current_page === value ala the session
//
//   - Router.current_page.set(value): 
//      changes the value of current_page, reactively
//       (i.e. invalidates all contexts that have read this variable)

Meteor.deps.add_reactive_variable = function(object, name, value) {
  // the variable is hidden via closures
  var variable = value;
  var contexts = {}, equals_contexts = {};


  object[name] = function(not_reactive) {
    return Meteor.deps.add_reactive_variable.read_variable(not_reactive, variable, contexts);
  };

  object[name].equals = function(value) {
    return Meteor.deps.add_reactive_variable.variable_equals(value, variable, equals_contexts);
  }
   
  object[name].set = function(new_value) {
    variable = Meteor.deps.add_reactive_variable.set_variable(new_value, variable, contexts, equals_contexts);
  }
};

_.extend(Meteor.deps.add_reactive_variable, {
  read_variable: function (not_reactive, variable, contexts) {
    // templates will pass in an object here, so we want to be sure they've passed true
    if (not_reactive === true) 
      return variable;

    var context = Meteor.deps.Context.current;

    if (context && !(context.id in contexts)) {
      contexts[context.id] = context;
      context.on_invalidate(function () {
        delete contexts[contexts.id];
      });
    }

    return variable;
  },

  variable_equals: function(value, variable, equals_contexts) {
    var context = Meteor.deps.Context.current;
    if (context) {
      if (!(value in equals_contexts))
        equals_contexts[value] = {};

      if (!(context.id in equals_contexts[value])) {
        equals_contexts[value][context.id] = context;
        context.on_invalidate(function () {
          delete equals_contexts[value][context.id];

          // clean up [key][value] if it's now empty, so we don't use
          // O(n) memory for n = values seen ever
          for (var x in equals_contexts[value])
            return;
          delete equals_contexts[value];
        });
      }
    }
    return variable === value;
  },

  set_variable: function(new_value, variable, contexts, equals_contexts) {
    var old_value = variable;
    if (new_value === old_value)
      return old_value;

    var invalidate = function (map) {
      if (map)
        for (var id in map)
          map[id].invalidate();
    };

    invalidate(contexts);
    invalidate(equals_contexts[old_value]);
    invalidate(equals_contexts[new_value]);

    return new_value;
  }
});

// listen to a reactive fn and when it returns true call callback.
//
// Example (continuing from above): 
//   Meteor.deps.await(function() { Router.current_page_equals('home'); }, function() { console.log('at home'); });
Meteor.deps.await = function(test_fn, callback, once) {
  var done = false;
  var context = new Meteor.deps.Context();
  context.on_invalidate(function() {
    if (!(done && once))
      Meteor.deps.await(test_fn, callback, once);
  });

  context.run(function() {
    if (test_fn()) {
      done = true;
      callback();
    }
  });
};

// convience function for await(fn, cb, true)
Meteor.deps.await_once = function(fn, cb) { Meteor.deps.await(fn, cb, true) }

}(Meteor));

