// quick jquery extension to bind text inputs to blur and RET.
$.fn.onBlurOrEnter = function (callback) {
  this.bind('blur', callback);
  this.bind('keypress', function (evt) {
    if (evt.keyCode === 13 && $(this).val())
      callback.call(this, evt);
  });
};

// everything else happens after DOM is ready
$(function () {
  $('body').layout({north__minSize: 50,
                    spacing_open: 10,
                    north__fxSettings: { direction: "vertical" }});

  // cache the template function for a single item.
  var item_template = _.template($('#item-template').html());

  // this render function could be replaced with a handlebars
  // template.  underscore template isn't safe for user-entered data
  // like the item text (XSS).
  function renderItem (obj) {
    // generate template for todo
    var elt = $(item_template(obj));

    // set text through jquery for XSS protection
    elt.find('.todo-text').text(obj.text);

    // clicking the checkbox toggles done state
    elt.find('.check').click(function () {
      Todos.update(obj._id, {$set: {done: !obj.done}});
    });

    // clicking destroy button removes the item
    elt.find('.destroy').click(function () {
      Todos.remove(obj._id);
    });

    // wire up tag destruction links
    elt.find('.tag .remove').click(function () {
      var tag = $(this).attr('name');
      $(this).parent().fadeOut(500, function () {
        Todos.update(obj._id, {$pull: {tags: tag}});
      });
    });

    // wire up add tag
    elt.find('.addtag').click(function () {
      $(this).hide();
      elt.find('.edittag').show();
      elt.find('.edittag input').focus();
    });

    // wire up edit tag
    elt.find('.edittag input').onBlurOrEnter(function () {
      elt.find('.edittag').hide();
      elt.find('.addtag').show();
      if ($(this).val() !== '')
        Todos.update(obj._id, {$addToSet: {tags: $(this).val()}});
    });

    // doubleclick on todo text brings up the editor
    elt.find('.todo-text').dblclick(function () {
      elt.addClass('editing');

      var input = elt.find('.todo-input');
      input.val(obj.text);
      input.focus();
      input.select();

      input.onBlurOrEnter(function () {
        elt.removeClass('editing');
        if ($(this).val() !== '')
          Todos.update(obj._id, {$set: {text: elt.find('.todo-input').val()}});
      });
    });

    return elt[0];
  };

  // construct new todo from text box
  $('#new-todo').bind('keypress', function (evt) {
    var list_id = Session.get('list_id');
    var tag = Session.get('tag_filter');

    // prevent creation of a new todo if nothing is selected
    if (!list_id) return;

    var text = $('#new-todo').val();

    if (evt.keyCode === 13 && text) {
      var obj = {text: text,
                 list_id: list_id,
                 done: false,
                 timestamp: (new Date()).getTime()};
      if (tag) obj.tags = [tag];

      Todos.insert(obj);
      $('#new-todo').val('');
    }
  });

  var current_list_stop;
  function setCurrentList (list_id) {
    Session.set('list_id', list_id);

    $('#items-view').show();

    // kill current findLive render
    if (current_list_stop)
      current_list_stop.stop();

    var query = {list_id: list_id};
    if (Session.get('tag_filter'))
      query.tags = Session.get('tag_filter')

    // render individual todo list, stash kill function
    current_list_stop =
      Meteor.ui.renderList(Todos, $('#item-list'), {
        selector: query,
        sort: {timestamp: 1},
        render: renderItem,
        events: {}
      });
  };

  // render list of lists in the left sidebar.
  Meteor.ui.renderList(Lists, $('#lists'), {
    sort: {name: 1},
    template: $('#list-template'),
    events: {
      'click': function (evt) {
        window.History.pushState({list_id: this._id},
                                 "Todos: " + this.name,
                                 "/" + this._id);
      },
      'dblclick': function (evt) {
        var list_elt = $(evt.currentTarget);
        var input = list_elt.find('.list-name-input');

        list_elt.addClass('editing');

        input.val(this.name);
        input.focus();
        input.select();

        var _id = this._id;
        input.onBlurOrEnter(function () {
          list_elt.removeClass('editing');
          if (input.val() !== '')
            Lists.update(_id, {$set: {name: input.val()}});
        });
      }
    }
  });

  // construct new todo list from text box
  $('#new-list').bind('keypress', function (evt) {
    var text = $('#new-list').val();

    if (evt.keyCode === 13 && text) {
      var list = Lists.insert({name: text});
      $('#new-list').val('');
      window.History.pushState({list_id: list._id},
                               "Todos: " + list.name,
                               "/" + list._id);
    }
  });

  // tags and filters

  // the tag filter bar is easy to generate using a simple
  // renderList() against a minimongo query.  since minimongo doesn't
  // support aggregate queries, construct a local collection to serve
  // the same purpose, and drive the renderList() off of it.

  var LocalTags = new Meteor.Collection;
  (function () {
    function updateLocalTags() {
      var real = _(Todos.find()).chain().pluck('tags').compact().flatten().uniq().value();
      real.unshift(null); // XXX fake tag

      var computed = _(LocalTags.find()).pluck('tag');

      _.each(_.difference(real, computed), function (new_tag) {
        LocalTags.insert({tag: new_tag});
      });

      _.each(_.difference(computed, real), function (dead_tag) {
        LocalTags.remove({tag: dead_tag});
      });
    };

    Todos.findLive({}, {
      added: function (obj, before_idx) { _.defer(updateLocalTags); },
      removed: function (id, at_idx) { _.defer(updateLocalTags); },
      changed: function (obj, at_idx) { _.defer(updateLocalTags); },
    });
  })();

  // findLive() against the computed tag table.  since we also want a
  // show-all button, arrange for the computed table to always include
  // a null placeholder tag, and for the template to render that as
  // "Show all".  always begin the user session with a null filter.

  Session.set('tag_filter', null);

  Meteor.ui.renderList(LocalTags, $('#tag-filter'), {
    sort: {tag: 1},
    template: $('#tag-filter-template'),
    events: {
      'click': function (evt) {
        if (Session.equals('tag_filter', this.tag))
          Session.set('tag_filter', null);
        else
          Session.set('tag_filter', this.tag);

        setCurrentList(Session.get('list_id'));
      }
    }
  });

  // load list on statechange (which we drive from several places).
  window.History.Adapter.bind(window, 'statechange', function () {
    var state = window.History.getState();
    var list = Lists.find(state.data.list_id);
    setCurrentList(list._id);
  });

  // subscribe to all available todo lists.  once the inital load
  // completes, navigate to the list specified by URL, if any.
  Meteor.subscribe('lists', function () {
    var initial_list_id = window.location.pathname.split('/')[1];
    var list;

    if (initial_list_id) {
      list = Lists.find(initial_list_id);
    } else {
      var lists = Lists.find({}, {sort: {name: 1}, limit: 1});
      list = lists[0];
    }

    if (list) {
      window.History.replaceState({list_id: list._id},
                                  "Todos: " + list.name,
                                  "/" + list._id);
      // replaceState doesn't always trigger statechange on reload. if
      // you last reloaded the same page and the state is the same, it
      // won't fire. so call this here. double calling is not great, but
      // OK.
      setCurrentList(list._id);
    }
  });

  // subscribe to all the items in each list.  no need for a callback
  // here: todo items are never queried using collection.find().
  Meteor.subscribe('todos');
});
