// An example Backbone application contributed by
// [Jérôme Gravel-Niquet](http://jgn.me/). This demo uses a simple
// [LocalStorage adapter](backbone-localstorage.html)
// to persist Backbone models within your browser.

// Load the application once the DOM is ready, using `jQuery.ready`:
$(function(){
  // ask for all the todos in my cache
  Meteor.subscribe('todos');

  // helper functions

  function all () {
    return Todos.find();
  };

  function all_done () {
    return Todos.find({done: true});
  };

  function all_remaining () {
    return Todos.find({done: false});
  };

  function nextOrder () {
    var todos = Todos.find({}, {sort: {order: -1}, limit: 1});
    return todos[0] ? todos[0].order + 1 : 1;
  };

  // Todo Item View
  // --------------

  // The DOM element for a todo item...
  window.TodoView = Backbone.View.extend({

    //... is a list tag.
    tagName:  "li",

    // Cache the template function for a single item.
    template: _.template($('#item-template').html()),

    // The DOM events specific to an item.
    events: {
      "click .check"              : "toggleDone",
      "dblclick div.todo-text"    : "edit",
      "click span.todo-destroy"   : "clear",
      "keypress .todo-input"      : "updateOnEnter"
    },

    // Re-render the contents of the todo item.
    render: function() {
      $(this.el).html(this.template(this.model));
      this.setText();
      return this;
    },

    // To avoid XSS (not that it would be harmful in this particular app),
    // we use `jQuery.text` to set the contents of the todo item.
    setText: function() {
      this.$('.todo-text').text(this.model.text);
      this.input = this.$('.todo-input');
      this.input.bind('blur', _.bind(this.close, this)).val(this.model.text);
    },

    // Toggle the `"done"` state of the object.
    toggleDone: function() {
      Todos.update(this.model._id, {$set: {done: !this.model.done}});
    },

    // Switch this view into `"editing"` mode, displaying the input field.
    edit: function() {
      $(this.el).addClass("editing");
      this.input.focus();
    },

    // Close the `"editing"` mode, saving changes to the todo.
    // findLive callback will update this view.
    close: function() {
      Todos.update(this.model._id, {$set: {text: this.input.val()}});
      $(this.el).removeClass("editing");
    },

    // If you hit `enter`, we're through editing the item.
    updateOnEnter: function(e) {
      if (e.keyCode == 13) this.close();
    },

    // Remove this view from the DOM.
    remove: function() {
      $(this.el).remove();
    },

    // destroy the todo object.  the findLive callback will g/c this view.
    clear: function() {
      Todos.remove(this.model._id);
    }
  });

  // The Application
  // ---------------

  // Our overall **AppView** is the top-level piece of UI.
  window.AppView = Backbone.View.extend({

    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#todoapp"),

    // Our template for the line of statistics at the bottom of the app.
    statsTemplate: _.template($('#stats-template').html()),

    // Delegated events for creating new items, and clearing done ones.
    events: {
      "keypress #new-todo":  "createOnEnter",
      "keyup #new-todo":     "showTooltip",
      "click .todo-clear a": "clearCompleted"
    },

    todos: [],

    // At initialization we bind to the relevant events on the `Todos`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting todos that might be saved in *localStorage*.
    initialize: function() {
      var self = this;

      this.input = this.$("#new-todo");

      // spin up the live query.  ignore the return value since we never
      // stop the query.
      Todos.findLive({}, {
        added: function (obj, before_idx) {
          // add a view node to the DOM
          var view = new TodoView({model: obj});
          self.todos.splice(before_idx, 0, view);
          self.$("#todo-list").append(view.render().el);
          self.render();
        },
        removed: function (obj, at_idx) {
          // remove the view node from the DOM
          var view = self.todos.splice(at_idx, 1);
          view[0].remove();
          self.render();
        },
        changed: function (obj, at_idx) {
          // update obj in existing view and rerender
          self.todos[at_idx].model = obj;
          self.todos[at_idx].render();
          self.render();
        },
        moved: function (old_idx, new_idx) {
          // unimplemented -- items don't ever move
        },
        sort: {'order': 1}
      });
    },

    // Re-rendering the App just means refreshing the statistics -- the rest
    // of the app doesn't change.
    render: function() {
      console.log("RENDER", all().length, all_done().length, all_remaining().length);

      this.$('#todo-stats').html(this.statsTemplate({
        total:      all().length,
        done:       all_done().length,
        remaining:  all_remaining().length
      }));
    },

    // If you hit return in the main input field, and there is text to save,
    // create new **Todo** model.
    createOnEnter: function(e) {
      var text = this.input.val();
      if (!text || e.keyCode != 13) return;
      Todos.insert({text: text, done: false, order: nextOrder()});
      this.input.val('');
    },

    // Clear all done todo items, destroying their models.
    clearCompleted: function() {
      _.each(all_done(), function (todo) { Todos.remove(todo._id); });
      return false;
    },

    // Lazily show the tooltip that tells you to press `enter` to save
    // a new todo item, after one second.
    showTooltip: function(e) {
      var tooltip = this.$(".ui-tooltip-top");
      var val = this.input.val();
      tooltip.fadeOut();
      if (this.tooltipTimeout) clearTimeout(this.tooltipTimeout);
      if (val == '' || val == this.input.attr('placeholder')) return;
      var show = function(){ tooltip.show().fadeIn(); };
      this.tooltipTimeout = _.delay(show, 1000);
    }
  });

  // Finally, we kick things off by creating the **App**.
  window.App = new AppView;

});
