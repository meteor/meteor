Lists = new Meteor.Collection("lists");

Todos = new Meteor.Collection("todos");

if (Meteor.is_server) {
  Meteor.publish('lists', function (sub, params) {
    return Lists.find();
  });

  Meteor.publish('todos', function (sub, params) {
    return Todos.find({list_id: params.list});
  });
}
