Lists = new Meteor.Collection("lists");

Todos = new Meteor.Collection("todos");

if (Meteor.is_server) {
  Meteor.publish('lists', function () {
    return Lists.find();
  });

  Meteor.publish('todos', function (list) {
    return Todos.find({list_id: list});
  });
}
