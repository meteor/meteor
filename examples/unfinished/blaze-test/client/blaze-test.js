Meteor.startup(function () {

Blaze._wrapAutorun = function (c) {
  console.log('Created #' + c._id);
  var callback = function () {
    if (c.stopped) {
      console.log('Stopped #' + c._id);
    } else {
      console.log('Invalidated #' + c._id);
      Deps.afterFlush(function () {
        c.onInvalidate(callback);
      });
    }
  };
  c.onInvalidate(callback);
};

theNumber = Blaze.Var(0);
theColor = Blaze.Var('yellow');

If = function (conditionVar, contentFunc, elseFunc) {
  return Blaze.Isolate(function () {
    return conditionVar.get() ? contentFunc() :
      (elseFunc ? elseFunc() : null);
  });
};

With = function (dataVar, func) {
  if (! (this instanceof With))
    // called without new
    return new With(dataVar, func);

  Blaze.Controller.call(this);

  this.data = dataVar;
  this.func = func;
};
Blaze.__extends(With, Blaze.Controller);
_.extend(With.prototype, {
  render: function () {
    var func = this.func;
    return func();
  }
});

Events = function (eventMap, func) {
  if (! (this instanceof Events))
    // called without new
    return new Events(eventMap, func);

  Blaze.Controller.call(this);

  this.eventMap = eventMap;
  this.func = func;
};
Blaze.__extends(Events, Blaze.Controller);
_.extend(Events.prototype, {
  render: function () {
    var func = this.func;
    return func();
  },
  renderToDOM: function () {
    var range = Blaze.Controller.prototype.renderToDOM.call(this);
    range.addDOMAugmenter(new Blaze.EventAugmenter(this.eventMap));
    return range;
  }
});

Repeat = function (countVar, contentFunc) {
  var seq, count;
  var comp = Deps.autorun(function () {
    if (! seq) {
      count = countVar.get();
      if (typeof count !== 'number')
        throw new Error("Expected number");
      var funcs = new Array(count);
      for (var i = 0; i < count; i++)
        funcs[i] = contentFunc;
      seq = new Blaze.Sequence(funcs);
    } else {
      var targetCount = countVar.get();
      while (count < targetCount) {
        seq.addItem(contentFunc, count);
        count++;
      }
      while (count > targetCount) {
        seq.removeItem(count-1);
        count--;
      }
    }
  });
  Blaze._wrapAutorun(comp);
  return Blaze.List(seq);
};

Ticker = function () {
  var self = this;
  Blaze.Component.call(self);
  self.time = Blaze.Var(new Date);
  self.timer = setInterval(function () {
    self.time.set(new Date);
  }, 1000);
};
Blaze.__extends(Ticker, Blaze.Component);
_.extend(Ticker.prototype, {
  render: function () {
    var self = this;
    return Blaze.Isolate(function () {
      return String(self.time.get());
    });
  },
  finalize: function () {
    clearInterval(this.timer);
  }
});

outerRange = Blaze.render(function () {
  return [HTML.DIV(
    {style: If(Blaze.Var(function () { return theNumber.get() % 3 === 0; }),
               function () { return ['background:', theColor.get()]; })},
    "The number ", Blaze.Isolate(function () { return theNumber.get(); }), " is ",
    If(Blaze.Var(function () {
      return theNumber.get() % 2 === 0;
    }), function () {
      return "even";
    }, function () {
      return "odd";
    }), "."),
          HTML.UL(
            Repeat(theNumber,
                   function () {
                     return With(Blaze.Var(123), function () {
                       return Events(
                         {'click li': function () { console.log('click li'); }},
                         function () {
                           return HTML.LI(
                             Blaze.Isolate(function () {
                               console.log('Context:', Blaze.currentController.parentController.data.get());
                               return theNumber.get(); }),
                             " - ", new Ticker
                           );
                         });
                     });
                   }))];

});
outerRange.attach(document.body);


// Now, run:
//
// ```
// theNumber.set(1);
// theNumber.set(2);
//
// outerRange.stop();
// ```

});
