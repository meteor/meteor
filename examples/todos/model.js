Lists = new Meteor.Collection("lists");

Todos = new Meteor.Collection("todos");

/* Schema support coming soon!

Lists.schema({text: String});

Todos.schema({text: String,
              done: Boolean,
              tags: [String]});
*/

if (Meteor.is_server) {
  Meteor.publish('lists');
  Meteor.publish('todos', {
    selector: function (params) {
      return {list_id: params.list};
    }
  });
}
