// This is a quick and dirty access control mechanism. There will be a
// cleaner way to do this soon, along with an easier way to turn off the
// default object mutator methods (insert/update/remove).
//
// A more general way to perform access control is to use custom methods
// for each write operation. Methods can access this.userId() to perform
// any access checking they like.

Meteor.startup(function() {
  // which collections to control.
  var collectionMap = {todos: Todos};

  _.each(collectionMap, function(collection, collectionName) {
    _.each(['update', 'remove'], function(method) {
      var methodName = '/' + collectionName + '/' + method;
      var originalMethodHandler = Meteor.default_server.method_handlers[methodName];

      Meteor.default_server.method_handlers[methodName] = function() {
        var id = arguments[0];

        // Only allow selectors that affect a single object.
        //
        // One way to get multi-object validation (ie accepting complex
        // selectors here) would be to add
        // '$in: {privateTo: [null, this.userId()]}' to the selector.
        // This would restrict any matched documents to only those that
        // could be modified by this user. However, this gets
        // complicated if the selector is more complex.
        if (typeof id !== 'string') {
          throw new Meteor.Error("Access denied. Mutators method must modify an object by id, not selector.");
        }

        var obj = collection.findOne(id);
        if (!obj)
          return;

        if (!obj.privateTo || obj.privateTo === this.userId())
          originalMethodHandler.apply(this, arguments);
        else
          throw new Meteor.Error("Access denied");
      };
    });
  });
});
