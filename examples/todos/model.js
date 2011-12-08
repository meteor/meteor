Lists = Sky.Collection("lists");

Todos = Sky.Collection("todos");

/* Schema support coming soon!

Lists.schema({text: String});

Todos.schema({text: String,
              done: Boolean,
              tags: [String]});
*/

Sky.publish('lists');
Sky.publish('todos', {
  selector: function (params) {
    return {list_id: params.list};
  }
});
