
UI.Text = Component.extend({
  kind: 'Text',
  _encodeEntities: UI.encodeSpecialEntities,
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.get();

    if (data instanceof Handlebars.SafeString)
      buf.write(this._stringify(data.toString())); // don't escape
    else
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

    buf.write(condition ? self.__content : self.__elseContent);
  }
});

UI.If2 = Component.extend({
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
    return function () {
      var condition = getCondition(self);

      // `__content` and `__elseContent` are passed by
      // the compiler and are *not* emboxed, they are just
      // Component kinds.
      return condition ? self.__content : self.__elseContent;
    };
  }
});

// Acts like `!! self.condition()` except:
//
// - Empty array is considered falsy
// - The result is Deps.isolated (doesn't trigger invalidation
//   as long as the condition stays truthy or stays falsy
var getCondition = function (self) {
  return Deps.isolateValue(function () {
    // `condition` is emboxed; it is always a function,
    // and it only triggers invalidation if its return
    // value actually changes.  We still need to isolate
    // the calculation of whether it is truthy or falsy
    // in order to not re-render if it changes from one
    // truthy or falsy value to another.
    var cond = self.condition();

    // empty arrays are treated as falsey values
    if (cond instanceof Array && cond.length === 0)
      return false;
    else
      return !! cond;
  });
};

UI.Unless2 = Component.extend({
  kind: 'Unless',
  init: function () {
    this.condition = this.data;
    delete this.data;
  },
  render: function (buf) {
    var self = this;
    return function () {
      var condition = getCondition(self);
      return (! condition) ? self.__content : self.__elseContent;
    };
  }
});

UI.With2 = Component.extend({
  kind: 'With',
  init: function () {
    this.condition = this.data;
  },
  render: function (buf) {
    var self = this;
    return function () {
      var condition = getCondition(self);
      return condition ? self.__content : self.__elseContent;
    };
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

    buf.write(condition ? self.__elseContent : self.__content);
  }
});

UI.With = Component.extend({
  kind: 'With',
  render: function (buf) {
    var self = this;
    var condition = Deps.isolateValue(function () {
      return !! self.get('data');
    });

    buf.write(condition ? self.__content : self.__elseContent);
  }
});

var callIfFunction = function (value) {
  return (typeof value === 'function') ? value() : value;
};
var evalKeywordArgs = function (dict) {
  var ret = {};
  _.each(dict, function (v, k) {
    ret[k] = callIfFunction(v);
  });
  return ret;
};

UI.DynamicComponent = Component.extend({
  kind: 'DynamicComponent',
  render: function (buf) {
    var kind = this.compKind;
    var args = this.compArgs;
    // `isBlock` means this is a block call like `{{#foo}}...{{/foo}}`
    // rather than an insertion like `{{>foo}}`.  Note that we can't
    // tell what kind of call this is otherwise.
    var isBlock = this.isBlock;

    var kwArgs = (args && args.length && args[0]) || {};
    var posArgs = (args && args.length > 1 && args.slice(1)) || [];

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
      var args = _.map(posArgs, callIfFunction);
      // May invalidate this render:
      var evaledKWArgs = evalKeywordArgs(kwArgs);
      args.push(evaledKWArgs);
      props = null;
      if (isBlock) {
        // Prevent the `content` and `elseContent` keyword arguments
        // from going to the function; send them to the returned
        // component instead.  We could send them to the function,
        // but it would have make sure to use them, which is a pain!
        //
        // XXX revisit this when we determine whether `content` and
        // `elseContent` are really treated as keyword args, e.g.
        // whether you can say `{{>if content=... elseContent=...}}`,
        // and when we get rid of DynamicComponent so we don't need
        // this logic.
        delete evaledKWArgs.__content;
        delete evaledKWArgs.__elseContent;
        if (kwArgs.__content || kwArgs.__elseContent) {
          props = { __content: kwArgs.__content,
                    __elseContent: kwArgs.__elseContent };
        }
      }
      // May invalidate this render:
      kind = kind.apply(null, args);
    } else {
      // `kind` is a component (or template). we look at the next argument.
      // * if it is a value, pass it as `data` for the component.
      // * if is a function, wrap it to be called with the subseqeunt
      //   arguments (which could be either a value or a helper, which
      //   gets called)
      if (posArgs && posArgs.length) {
        if (isBlock) {
          // don't pass keyword arguments to the component; they will
          // either go to the function in the first argument or be ignored.
          props = null;
          // see earlier comment about special treatment of `content`
          // and `elseContent` keyword args
          if (kwArgs.__content || kwArgs.__elseContent) {
            props = { __content: kwArgs.__content,
                      __elseContent: kwArgs.__elseContent };
          }
          if (typeof posArgs[0] === 'function') {
            var f = posArgs[0];
            posArgs.shift();
            props.data = function() {
              var args = _.map(posArgs, callIfFunction);
              var evaledKWArgs = evalKeywordArgs(kwArgs);
              // see earlier comment
              delete evaledKWArgs.__content;
              delete evaledKWArgs.__elseContent;
              args.push(evaledKWArgs);
              return f.apply(null, args);
            };
          } else {
            if (posArgs.length > 1) {
              throw new Error("Multiple arguments to block helpers only allowed "
                              + "if the first argument is a helper");
            }
            props.data = posArgs[0];
          }
        } else {
          if (posArgs.length > 1) {
            throw new Error("Can't have more than one argument to a template");
          }

          if (posArgs.length) {
            props.data = posArgs[0];
          }
        }
      }
    }

    if (kind) {
      buf.write({kind: kind, props: props});
    }
  }
});