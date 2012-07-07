Meteor.startup(function() {
  var canModify = function(userId, tasks) {
    return _.all(tasks, function(task) {
      return !task.privateTo || task.privateTo === userId;
    });
  };

  Todos.allow({
    insert: function () { return true; },
    update: canModify,
    remove: canModify,
    fetch: ['privateTo']
  });

  Lists.allow({
    insert: function () { return true; }
    // can't update or remove
  });
});
