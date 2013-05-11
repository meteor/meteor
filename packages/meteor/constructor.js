var knownConstructors;

// for unit tests
Meteor.__resetConstructors = function () {
  knownConstructors = [Date, Error, Function, RegExp];
};
Meteor.__resetConstructors();

Meteor.isConstructor = function (x) {
  return _.contains(knownConstructors, x);
};

Meteor.declareConstructor = function (constructor) {
  if (! _.contains(knownConstructors, constructor))
    knownConstructors.push(constructor);
};
