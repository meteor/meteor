Todos = new Meteor.Collection("todos");
//Todos.schema({text: String, done: Boolean, order: Number});

if (Meteor.is_server) {
  Meteor.publish('todos', function () {
    return Todos.find();
  });
}
