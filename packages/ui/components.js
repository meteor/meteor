
UI.Text = Component.extend({
  kind: 'Text',
  _encodeEntities: UI.encodeSpecialEntities,
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.get();
    buf.write(this._encodeEntities(this._stringify(data)));
  }
});

UI.HTML = Component.extend({
  kind: 'HTML',
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.get();
    buf.write(this._stringify(data));
  }
});

UI.If = Component.extend({
  kind: 'If',
  init: function () {
    // XXX this probably deserves a better explanation if this code is
    // going to stay with us.
    this.condition = this.data;

    // content doesn't see the condition as `data`
    delete this.data;
    // XXX I guess this means it's kosher to mutate properties
    // of a Component during init (but presumably not before
    // or after)?
  },
  render: function (buf) {
    var self = this;
    // re-render if and only if condition changes
    var condition = Deps.isolateValue(function () {
      var cond = self.get('condition');

      // empty arrays are treated as falsey values
      if (cond instanceof Array && cond.length === 0)
        return false;
      else
        return !! cond;
    });

    buf.write(condition ? self.content : self.elseContent);
  }
});

UI.Unless = Component.extend({
  kind: 'Unless',
  init: function () {
    this.condition = this.data;
    delete this.data;
  },
  render: function (buf) {
    var self = this;
    // re-render if and only if condition changes
    var condition = Deps.isolateValue(function () {
      var cond = self.get('condition');

      // empty arrays are treated as falsey values
      if (cond instanceof Array && cond.length === 0)
        return false;
      else
        return !! cond;
    });

    buf.write(condition ? self.elseContent : self.content);
  }
});

UI.With = Component.extend({
  kind: 'With',
  render: function (buf) {
    buf.write(this.content);
  }
});

var callIfFunction = function (value) {
  return (typeof value === 'function') ? value() : value;
};

UI.DynamicComponent = Component.extend({
  kind: 'DynamicComponent',
  render: function (buf) {
    var kind = this.compKind;
    var args = this.compArgs;

    var kwArgs = args && args.length && args[0];
    var posArgs = args && args.length > 1 && args.slice(1);

    var props = _.extend({}, kwArgs);
    if (typeof kind === 'function') {
      // Calling a helper function as a template.  Evaluate the
      // arguments and pass them to the function to get back
      // a component.  Completely different use of args than
      // when calling a bare component like `Template.foo` or
      // a "helper" that is a constant component (in which case
      // the args are used to extend the component).
      //
      // `kind` should be already bound with a `this`, so it
      // doesn't matter what we pass in for the first argument
      // to `apply`.  Same with arguments.
      if (posArgs) {
        for (var i = 0; i < posArgs.length; i++)
          posArgs[i] = callIfFunction(posArgs[i]);
      }
      kind = kind.apply(null, posArgs || []);
    } else {
      if (posArgs && posArgs.length) {
        if (posArgs.length > 1)
          throw new Error("Can't have more than one argument to a template");

        if (posArgs.length) {
          props.data = posArgs[0];
        }
      }
    }

    if (kind) {
      buf.write({kind: kind, props: props});
    }
  }
});