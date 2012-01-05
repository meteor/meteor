Lists = Meteor.Collection("lists");

Todos = Meteor.Collection("todos");

/* Schema support coming soon!

Lists.schema({text: String});

Todos.schema({text: String,
              done: Boolean,
              tags: [String]});
*/

Meteor.publish('lists');
Meteor.publish('todos');
