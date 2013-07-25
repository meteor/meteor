
UI.Empty = Empty;

UI.Text = Component.extend({
  typeName: 'Text',
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
  typeName: 'HTML',
  _stringify: function (x) {
    return String(x == null ? '' : x);
  },
  render: function (buf) {
    var data = this.get();
    buf.write(this._stringify(data));
  }
});

UI.If = Component.extend({
  typeName: 'If',
  init: function () {
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
      return !! self.get('condition');
    });
    buf.write(condition ? self.content : self.elseContent);
  }
});

UI.Unless = Component.extend({
  typeName: 'Unless',
  init: function () {
    this.condition = this.data;
    delete this.data;
  },
  render: function (buf) {
    var self = this;
    // re-render if and only if condition changes
    var condition = Deps.isolateValue(function () {
      return !! self.get('condition');
    });
    buf.write(condition ? self.elseContent : self.content);
  }
});

// for the demo.....
// @export FadeyIf
FadeyIf = Component.extend({
  typeName: 'If',
  _animationOptions: { duration: 1000, queue: false },
  init: function () {
    this.condition = this.data;
    // content doesn't see the condition as `data`
    delete this.data;
    // XXX I guess this means it's kosher to mutate properties
    // of a Component during init (but presumably not before
    // or after)?
  },
  render: function (buf) {
    var self = this;
    var curCondition;
    // XXXX this exact pattern appears a couple times (the whole
    // autorun).  Should probably be abstracted / is a sign we
    // don't quite have the right abstraction for reactively
    // rearranging components.
    Deps.autorun(function (c) {
      // capture dependencies of this line:
      var condition = Deps.isolateValue(function () {
        return !! self.get('condition');
      });
      if (c.firstRun) {
        // right away
        curCondition = condition;
      } else {
        // later (on subsequent runs)...
        if (! self.isBuilt ||
            self.isDestroyed) {
          c.stop();
        } else {
          curCondition = condition;
          var oldChild = self.curComp;
          var newChild = self.curComp = constructify(
            curCondition ? self.content : self.elseContent);
          if (self.hasChild(oldChild)) {
            $(oldChild.parentNode()).animate(
              {height: 0, opacity: 0},
              self._animationOptions,
              (function (oldChild) {
                return function () {
                  if (self.hasChild(oldChild)) {
                    var div = oldChild.parentNode();
                    oldChild.remove();
                    $(div).remove();
                  }
                };
              })(oldChild));
          }
          var newDiv = $('<div style="display:none"></div>');
          self.append(newDiv);
          self.insertBefore(newChild, null, newDiv.get(0));
          newDiv.animate({height: 'show', opacity: 1},
                         self._animationOptions);
        }
      }
    });
    buf.write("<div>");
    self.curComp = buf.write(
      curCondition ? self.content : self.elseContent);
    buf.write("</div>");
  }
});


/*
UI.Counter = Component.extend({
  typeName: "Counter",
  fields: {
    count: 0
  },
  increment: function () {
    this.set('count', this.count() + 1);
  },
  render: function (buf) {
    var self = this;

    buf("<div style='background:yellow'>",
        new UI.Text(function () {
          return self.count();
        }),
        "</div>");
  },
  built: function () {
    var self = this;
    self.$("div").on('click', function (evt) {
      self.increment();
    });
  }
});
 */