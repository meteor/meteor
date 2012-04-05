Session.set('list_id', null);
Session.set('tag_filter', null);
Session.set('editing_addtag', null);
Session.set('editing_listname', null);
Session.set('editing_itemname', null);

Meteor.subscribe('lists', function () {
  // Once the lists have loaded, select the first one.
  if (!Session.get('list_id')) {
    var list = Lists.findOne({}, {sort: {name: 1}});
    if (list)
      Router.setList(list._id);
  }
});

Meteor.autosubscribe(function () {
  var list_id = Session.get('list_id');
  if (list_id)
    Meteor.subscribe('todos', list_id);
});

////////// Helpers for in-place editing //////////

var okcancel_events = function(selector) {
  return 'keyup %, keydown %, focusout %'.replace(/%/g, selector);
};

var make_okcancel_handler = function(options) {
  var ok = options.ok || function() {};
  var cancel = options.cancel || function() {};

  return function(evt) {
    if (evt.type === "keydown" && evt.which === 27) {
      // escape = cancel
      cancel.call(this, evt);

    } else if (evt.type === "keyup" && evt.which === 13 ||
               evt.type === "focusout") {
      // blur/return/enter = ok/submit if non-empty
      var value = String(evt.target.value || "");
      if (value)
        ok.call(this, value, evt);
      else
        cancel.call(this, evt);
    }
  };
};

var focus_field_by_id = function(id) {
  var input = document.getElementById(id);
  if (input) {
    input.focus();
    input.select();
  }
};

////////// Tag Filter //////////

Template.tag_filter.tags = function () {
  // Pick out the unique tags from all tasks.
  var tags = _(Todos.find({list_id: Session.get('list_id')}).fetch())
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
    Session.set('editing_listname', this._id);
    Meteor.flush();
    focus_field_by_id("list-name-input");
  }
};

Template.list_item.events[ okcancel_events('#list-name-input') ] =
  make_okcancel_handler({
    ok: function(value) {
      Lists.update(this._id, {$set: {name: value}});
      Session.set('editing_listname', null);
    },
    cancel: function() {
      Session.set('editing_listname', null);
    }
  });

Template.create_list.events = {};

Template.create_list.events[ okcancel_events('#new-list') ] =
  make_okcancel_handler({
    ok: function(text, evt) {
      var id = Lists.insert({name: text});
      Router.setList(id);
      evt.target.value = "";
    }
  });

////////// Todos //////////

Template.todos.any_list_selected = function () {
  return !Session.equals('list_id', null);
};

Template.todos.events = {};

Template.todos.events[ okcancel_events('#new-todo') ] =
  make_okcancel_handler({
    ok: function(text, evt) {
      var tag = Session.get('tag_filter');
      Todos.insert({
        text: text,
        list_id: Session.get('list_id'),
        done: false,
        timestamp: (new Date()).getTime(),
        tags: tag ? [tag] : []
      });
      evt.target.value = '';
    }
  });


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
    Session.set('editing_addtag', this._id);
    Meteor.flush();
    focus_field_by_id("edittag-input");
  },

  'dblclick .display .todo-text': function (evt) {
    Session.set('editing_itemname', this._id);
    Meteor.flush();
    focus_field_by_id("todo-input");
  }

};

Template.todo_item.events[ okcancel_events('#todo-input') ] =
  make_okcancel_handler({
    ok: function(value) {
      Todos.update(this._id, {$set: {text: value}});
      Session.set('editing_itemname', null);
    },
    cancel: function() {
      Session.set('editing_itemname', null);
    }
  });


Template.todo_item.events[ okcancel_events('#edittag-input') ] =
  make_okcancel_handler({
    ok: function(value) {
      Todos.update(this._id, {$addToSet: {tags: value}});
      Session.set('editing_addtag', null);
    },
    cancel: function() {
      Session.set('editing_addtag', null);
    }
  });


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
