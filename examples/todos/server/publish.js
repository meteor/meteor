// Lists -- {name: String}
Lists = new Meteor.Collection("lists");

// Publish complete set of lists to all clients.
Meteor.publish('lists', function () {
  return Lists.find();
});


// Todos_Db -- {text: String,
//           done: Boolean,
//           tags: [String, ...],
//           list_id: String,
//           timestamp: Number}
Todos_Db = new Meteor.Collection("todos");

// Publish all items for requested list_id.
Meteor.publish('todos', function (list_id) {
    check(list_id, String);
    return Todos_Db.find({list_id: list_id});
  }
);

Meteor.methods({
   'Todos_insert' : function (todo) {
       Todos_Db.insert(todo);
   },
   'Todos_update' : function (condition, change) {
        Todos_Db.update(condition, change);
    },
    'Todos_remove' : function (condition) {
        Todos_Db.remove(condition);
    },
    'Todos_find' : function (condition) {
        return Todos_Db.find(condition);
    }

});

