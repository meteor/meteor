(function () {

Meteor.FieldSet = Spark.Landmark.extend({
  init: function () {
    this._fieldValues = new ReactiveDict; // XXX get migration data
  },
  get: function (key) {
    return this._fieldValues.get(key);
  },
  set: function (key, value) {
    return this._fieldValues.set(key, value);
  },
  equals: function (key, value) {
    return this._fieldValues.equals(key, value);
  },
  lookup: function (key) {
    // XXX blacklist certain keys
    var fieldValue = this._fieldValues.get(key);
    if (fieldValue !== undefined)
      return fieldValue;
    if (key in this) {
      var val = this[key];
      if (typeof val === "function")
        // XXX HACK -- until the contract for helpers change to take
        // the enclosing controller in 'this', bind functions
        // automagically
        val = _.bind(val, this);
      return val;
    }
  }
});

Meteor.Form = Meteor.FieldSet.extend({
  save: function () {
    this.onSave();
  },
  onSave: function () {
    /* For overriding */
  }
});

// A Component looks like a template in the sense that is just a
// function that you can call with some arguments and get back some
// HTML (possibly with Spark annotations.) It looks like a controller
// in the sense that you can call extend on it (this creates an
// anonymous subcontroller that extends the original controller.) Pass
// 'template' to extend to change the template that is rendered when
// the function is called (it will automatically be wrapped with the
// controller.)
//
// Arguments passed to the component will be passed to its
// controller's init function. It is not possible to set the data
// context for the template.
//
// options is {template: Template.foo, controller: FooController}
//
// XXX would be nicer if the syntax were 'new Meteor.Component'?
Meteor.makeComponent = function (options) {
  var _makeComponent = function (config) {
    var ret = function (/* arguments */) {
      // Call Spark.attachController(config.controller, .. args ..,
      // config.template)

      // XXX right now we're invoking components like:
      //   {{{MyComponent "arg"}}}

      // that means we need to follow Handlebars helper calling
      // convention. that means template data is in 'this' (we discard
      // it for now) and the final argument is block helper info.

      // XXX figure out what our argument convention for controllers
      // is. named arguments seems nice, but what about supporting
      // {{{TextBox "fieldname"}}}? maybe it's an array, but by
      // convention the last argument in the array is an options hash,
      // and for a block helper that's where fn and inverse end up?

      var args = _.toArray(arguments);
      args.unshift(config.controller);
      args.pop(); // lose extra handlebars data for now
      args.push(config.template);
      return Spark.attachController.apply(Spark, args);
    };

    ret.extend = function (extension) {
      var filteredExtension = {};
      for (var k in extension) {
        if (k !== 'template')
          filteredExtension[k] = extension[k];
      }

      return _makeComponent({
        template: extension.template || config.template,
        controller: config.controller.extend(extension)
      });
    };

    return ret;
  };

  return _makeComponent({
    template: options.template,
    controller: options.controller
  });
};

///////////////////////////////////////////////////////////////////////////////

var SaveButtonController = Spark.Landmark.extend({
  init: function (what) {
  },
  events: {
    'click input': function () {
      var form = this.parent(Meteor.Form);
      if (! form)
        throw new Error("Save button not inside a form");
      form.save();
    }
  }
});

SaveButton = Meteor.makeComponent({
  controller: SaveButtonController,
  template: Template.SaveButtonView
});

///////////////////////////////////////////////////////////////////////////////

var TextBoxController = Spark.Landmark.extend({
  init: function (fieldName) {
    this.setup(fieldName);
    // XXX call super
  },
  recycle: function (fieldName) {
    this.setup(fieldName);
    // XXX call super
  },
  setup: function (fieldName) {
    var self = this;
    self.fieldName = fieldName;
    if (self.handle)
      self.handle.stop();
    // XXX defer this if they are currently editing the field?
    self.handle = Meteor.autorun(function () {
      var fieldset = self.parent(Meteor.FieldSet);
      var current = self.toString(fieldset.get(self.fieldName));
      if (self.hasDom()) { // XXX ugly/private?
        self.find('.textbox').value = current;
      }
    });
  },
  rendered: function () {
    // XXX defer this if they are currently editing the field?
    var self = this;
    var fieldset = self.parent(Meteor.FieldSet);
    self.find('.textbox').value = self.toString(fieldset.get(self.fieldName));
  },
  finalize: function () {
    var self = this;
    if (self.handle)
      self.handle.stop();
  },
  syncFieldToDom: function (evt) {
    var fieldset = this.parent(Meteor.FieldSet);
    fieldset.set(this.fieldName, this.fromString(evt.target.value));
  },
  events: {
    'blur .textbox': "syncFieldToDom",
    'keyup .textbox': function (evt) {
      if (this.savePolicy === "continuous")
        this.syncFieldToDom(evt);
    }
  },
  preserve: ['.textbox'],
  toString: function (v) {
    if (typeof v === "string")
      return v;
    if (typeof v === "number")
      return ''+v;
    if (v === undefined || v === null)
      return '';
    throw new Error("Current value can't be shown in a TextBox")
  },
  fromString: function (s) {
    return s; // XXX let me edit numbers as numbers?
  }
});

TextBox = Meteor.makeComponent({
  controller: TextBoxController,
  template: Template.TextBoxView
});


})();