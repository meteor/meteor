// While it's not great style to add things to Object.prototype, users sometimes
// do so. So we should be careful to always use _.each or equivalent methods
// when iterating over objects. This will help us catch such issues.
//
// Add a random property to the Object prototype. This helps us catch
// failures caused by iterating incorrectly over keys in an
// object. (See https://github.com/meteor/meteor/issues/3478)
//
// Here are some answers for correctly iterating over keys in an
// object:
// http://stackoverflow.com/questions/684672/loop-through-javascript-object

Object.prototype.extendedObjectPrototype = function extendedObjectPrototype () {
};
