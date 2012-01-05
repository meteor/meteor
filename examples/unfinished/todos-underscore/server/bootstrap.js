// if the database is empty on server start, create some sample data.
Meteor.startup(function () {
  if (Lists.find().length === 0) {
    var list1 = Lists.insert({name: 'Things to do'});
    Todos.insert({list_id: list1._id,
                  text: 'Write Meteor app', tags: ['fun']});
    Todos.insert({list_id: list1._id,
                  text: 'Drink beer', tags: ['fun', 'yum']});

    var list2 = Lists.insert({name: 'Places to see'});
    Todos.insert({list_id: list2._id, text: 'San Francisco',
                  tags: ['yum']});
    Todos.insert({list_id: list2._id, text: 'Paris',
                  tags: ['fun']});
    Todos.insert({list_id: list2._id, text: 'Tokyo'});

    var list3 = Lists.insert({name: 'People to meet'});
    Todos.insert({list_id: list3._id,
                  text: 'All the cool kids'});
  }
});
