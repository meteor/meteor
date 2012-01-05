Todos = Meteor.Collection("todos");
Todos.schema({text: String, done: Boolean, order: Number});

Meteor.publish('todos');
