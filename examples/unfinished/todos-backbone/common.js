Todos = new Mongo.Collection("todos");
//Todos.schema({text: String, done: Boolean, order: Number});

if (Meteor.isServer) {
  Meteor.publish('todos', function () {
    return Todos.find();
  });
}
