


Items = new Meteor.Collection(null);
Items.insert({ text: 'Foo' });
Items.insert({ text: 'Bar' });
Items.insert({ text: 'Baz' });

Body = RootComponent.extend({
  items: function () {
    return Items.find({}, { sort: { text: 1 }});
  }
});

Meteor.startup(function () {
  /*
  RC = RootComponent.create({
    bodyClass: Component.extend({
      render: function (buf) {
        buf.text(Session.get('foo') || '');
      }
    })
  });
 */
  /*RC = RootComponent.create({
    bodyClass: Component.extend({
      render: function (buf) {
        buf.openTag('span', {style: function () {
          return 'background-color:' +
            Session.get('bgcolor');
        }});
        buf.text(function () {
          return Session.get('foo') || '';
        });
        buf.closeTag('span');
      }
    })
  });*/

  /*
  RC = RootComponent.create({
    bodyClass: Component.extend({
      render: function (buf) {
        buf.component(Each.create({
          bodyClass: Component.extend({
            render: function (buf) {
              buf.openTag('div');
              buf.text(this.getArg('data').text || '');
              buf.closeTag('div');
            }
          }),
   list: Items.find({}, { sort: { text: 1 }})
        }), { key: 'body' });
      }
    })
  });

  RC.attach(document.body);*/

  Items.insert({ text: 'Qux' });
  Items.remove({ text: 'Foo' });
  Items.update({ text: 'Bar' }, { text: 'Car' });
});



/*var debug = function (method, component) {
  console.log(method, component.nameInParent);
};

// Utility to HTML-escape a string.
var escapeForHtml = (function() {
  var escape_map = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;", // IE allows backtick-delimited attributes??
    "&": "&amp;"
  };
  var escape_one = function(c) {
    return escape_map[c];
  };

  return function (x) {
    return x.replace(/[&<>"'`]/g, escape_one);
  };
})();

DebugComponent = Component.extend({
  init: function () { debug('init', this); },
  build: function (frag) { debug('build', this); },
  built: function () { debug('built', this); },
  attached: function () { debug('attached', this); },
  detached: function () { debug('detached', this); },
  destroyed: function () { debug('destroyed', this); },
  updated: function (args, oldArgs) { debug('updated', this); }
});

LI = DebugComponent.extend({
  build: function (frag) {
    var li = document.createElement('LI');
    li.appendChild(document.createTextNode(this.getArg('text')));
    frag.appendChild(li);
    this.setBounds(li);
    this.textNode = li.firstChild;
  },
  updated: function (args, oldArgs) {
    if (this.isBuilt)
      this.textNode.nodeValue = args.text;
  },
  toHtml: function () {
    return "<li>" + escapeForHtml(this.getArg('text')) + "</li>";
  }
});

UL = DebugComponent.extend({
  init: function () {
    this.addChild(1, new LI({text: 'One'}));
    this.addChild(2, new LI({text: 'Two'}));
    this.addChild(3, new LI({text: 'Three'}));
    this.numItems = 3;
  },
  build: function (frag) {
    var ul = document.createElement('UL');
    this.children[1].attach(ul);
    this.children[2].attach(ul);
    this.children[3].attach(ul);
    frag.appendChild(ul);
    this.setBounds(ul);

    var self = this;
    self.timer = setInterval(function () {
      if (self.isDestroyed || self.numItems >= 10) {
        debug('stopping timer', self);
        clearInterval(self.timer);
        return;
      }
      var newItem = new LI({text: 'Another'});
      self.addChild(++self.numItems, newItem);
      newItem.attach(ul);

      var hr = document.createElement('HR');
      self.parentNode().insertBefore(
        hr, self.lastNode().nextSibling);
      self.setBounds(ul, hr);
    }, 2000);
  },
  toHtml: function () {
    return "<ul>" +
      this.children[1].toHtml() +
      this.children[2].toHtml() +
      this.children[3].toHtml() +
      "</ul>";
  }
});
*/


/*EmptyComponent = Component.extend({
  build: function (frag) {
    var comment = document.createComment('empty');
    frag.appendChild(comment);
    this.setBounds(comment, comment);
  },
  toHtml: function () {
    return '<!--empty-->';
  }
});*/


/*MyLI = DebugComponent.extend({
  init: function () {
    this.setChild('1', LI, {text: this.getArg('data').text || ''});
  },
  build: function (frag) {
    var c = this.children['1'];
    c.attach(frag);
    this.setBounds(c);
  },
  updated: function (args, oldArgs) {
    this.init(); // XXX not necessarily the right pattern
  },
  toHtml: function () {
    return this.children['1'].toHtml();
  }
});

Meteor.startup(function () {
//  a = new Chunk($("li").get(0));
//  b = new Chunk($("li").get(1));
//  c = new Chunk($("li").get(2));
//  d = new Chunk(a, c);

//  L = new UL().attach(document.body);

  C = new LocalCollection();
  var ul = document.createElement("UL");
  document.body.appendChild(ul);

  C.insert({text: 'Foo'});
  C.insert({text: 'Bar'});
  C.insert({text: 'Baz'});
  LIST = new Each({list: C.find({}, {sort: {text: 1}}),
                   bodyClass: MyLI});

  LIST.attach(ul);
});
*/