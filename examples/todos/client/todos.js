Session.set('list_id', null);
Session.set('tag_filter', null);
Session.set('editing_addtag', null);
Session.set('editing_listname', null);
Session.set('editing_itemname', null);

Meteor.subscribe('lists', {}, function () {
  // Once the lists have loaded, select the first one.
  if (!Session.get('list_id')) {
    var lists = Lists.find({}, {sort: {name: 1}, limit: 1});
    if (lists.count() > 0)
      Router.setList(lists.get(0)._id);
  }
});

Meteor.autosubscribe(function () {
  var list_id = Session.get('list_id');
  if (list_id)
    Meteor.subscribe('todos', {list: list_id});
});

////////// Tag Filter //////////

Template.tag_filter.tags = function () {
  // Pick out the unique tags from all tasks.
  var tags = _(Todos.find().fetch())
    .chain().pluck('tags').compact().flatten().sort().uniq(true).value();
  // for some reason, .map can't be chained on IE8. underscore bug?
  tags = _.map(tags, function (tag) { return {tag: tag} });

  tags.unshift({tag: null}); // "show all" button
  return tags;
};

Template.tag_item.selected = function () {
  return Session.equals('tag_filter', this.tag) ? 'selected' : '';
};

Template.tag_item.tag_text = function () {
  return this.tag || "Show all";
};

Template.tag_item.events = {
  'mousedown': function () {
    if (Session.equals('tag_filter', this.tag))
      Session.set('tag_filter', null);
    else
      Session.set('tag_filter', this.tag);
  }
};

////////// Lists //////////

Template.lists.lists = function () {
  return Lists.find({}, {sort: {name: 1}});
};

Template.list_item.selected = function () {
  return Session.equals('list_id', this._id) ? 'selected' : '';
};

Template.list_item.name_class = function () {
  return this.name ? '' : 'empty';
};

Template.list_item.editing = function () {
  return Session.equals('editing_listname', this._id);
};

Template.list_item.events = {
  'mousedown': function (evt) { // select list
    Router.setList(this._id);
  },
  'dblclick': function (evt) { // start editing list name
    var top = $(evt.target).parents('.list');
    Session.set('editing_listname', this._id);
    Meteor.flush();
    top.find('.edit input').val(this.name).focus().select();
  },
  'blur .edit input, keypress .edit input': function (evt) {
    // rename list
    if (evt.type === "blur" || evt.keyCode === 13) {
      var target = $(evt.target);
      var val = target.val();
      if (val)
        Lists.update(this._id, {$set: {name: val}});
      Session.set('editing_listname', null);
    }
  }
};

Template.create_list.events = {
  'keypress #new-list': function (evt) {
    var target = $(evt.target);
    var text = target.val();
    if (evt.keyCode === 13 && text) {
      var list = Lists.insert({name: text});
      Router.setList(list._id);
      target.val('');
    }
  }
};

////////// Todos //////////

Template.todos.any_list_selected = function () {
  return !Session.equals('list_id', null);
};

Template.todos.events = {
  'keypress #new-todo': function (evt) {
    var target = $(evt.target);
    var text = target.val();
    if (evt.keyCode === 13 && text) {
      var tag = Session.get('tag_filter');
      Todos.insert({
        text: text,
        list_id: Session.get('list_id'),
        done: false,
        timestamp: (new Date()).getTime(),
        tags: tag ? [tag] : []
      });
      target.val('');
    }
  }
};

Template.todo_list.todos = function () {
  var list_id = Session.get('list_id');
  if (!list_id)
    return {};

  var sel = {list_id: list_id};
  var tag_filter = Session.get('tag_filter');
  if (tag_filter)
    sel.tags = tag_filter;

  return Todos.find(sel, {sort: {timestamp: 1}});
};

Template.todo_item.tag_objs = function () {
  var todo_id = this._id;
  return _.map(this.tags || [], function (tag) {
    return {todo_id: todo_id, tag: tag};
  });
};

Template.todo_item.done_class = function () {
  return this.done ? 'done' : '';
};

Template.todo_item.done_checkbox = function () {
  return this.done ? 'checked="checked"' : '';
};

Template.todo_item.editing = function () {
  return Session.equals('editing_itemname', this._id);
};

Template.todo_item.adding_tag = function () {
  return Session.equals('editing_addtag', this._id);
};

Template.todo_item.events = {
  'click .check': function () {
    Todos.update(this._id, {$set: {done: !this.done}});
  },

  'click .destroy': function () {
    Todos.remove(this._id);
  },

  'click .addtag': function (evt) {
    var top = $(evt.target).closest('li.todo');
    Session.set('editing_addtag', this._id);
    Meteor.flush();
    top.find('.edittag input').focus();
  },

  'dblclick': function (evt) {
    var top = $(evt.target).closest('li.todo');
    Session.set('editing_itemname', this._id);
    Meteor.flush();
    top.find('.edit input').val(this.text).focus().select();
  },

  'blur .edit input, keypress .edit input': function (evt) {
    if (evt.type === "blur" || evt.keyCode === 13) {
      var target = $(evt.target);
      if (target.val())
        Todos.update(this._id, {$set: {text: target.val()}});
      Session.set('editing_itemname', null);
    }
  },

  'blur .edittag input, keypress .edittag input': function (evt) {
    if (evt.type === "blur" || evt.keyCode === 13) {
      var target = $(evt.target);
      if (target.val())
        Todos.update(this._id, {$addToSet: {tags: target.val()}});
      Session.set('editing_addtag', null);
    }
  }
};

Template.todo_tag.events = {
  'click .remove': function (evt) {
    var tag = this.tag;
    var id = this.todo_id;

    $(evt.target).parent().fadeOut(500, function () {
      Todos.update({_id: id}, {$pull: {tags: tag}});
    });
  }
};

////////// Tracking selected list in URL //////////

var TodosRouter = Backbone.Router.extend({
  routes: {
    ":list_id": "main"
  },
  main: function (list_id) {
    Session.set("list_id", list_id);
  },
  setList: function (list_id) {
    this.navigate(list_id, true);
  }
});

Router = new TodosRouter;

////////// Startup //////////

Meteor.startup(function () {
  $('body').layout({north__minSize: 50,
                    spacing_open: 10,
                    north__fxSettings: { direction: "vertical" }});

  Backbone.history.start({pushState: true});
});
