Lists = new Mongo.Collection("lists");

Todos = new Mongo.Collection("todos");

/* Schema support coming soon!

Lists.schema({text: String});

Todos.schema({text: String,
              done: Boolean,
              tags: [String]});
*/

if (Meteor.isServer) {
  Meteor.publish('lists', function () {
    return Lists.find();
  });

  Meteor.publish('todos', function () {
    return Todos.find();
  });
}
