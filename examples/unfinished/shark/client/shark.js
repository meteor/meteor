

IfComponent = Component.extend({
  arguments: {
    positional: ['condition'],
    required: ['bodyClass']
  },
  render: function (buf) {
    if (this.getArg('condition'))
      buf.component(this.getArg('bodyClass').create());
    else if (this.getArg('elseClass'))
      buf.component(this.getArg('elseClass'));
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
  RC = RootComponent.create({
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
  });
  RC.attach(document.body);
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

// Function equal to LocalCollection._idStringify, or the identity
// function if we don't have LiveData.  Converts item keys (i.e. DDP
// keys) to strings for storage in an OrderedDict.
var idStringify;

if (typeof LocalCollection !== 'undefined') {
  idStringify = function (id) {
    if (id === null)
      return id;
    else
      return LocalCollection._idStringify(id);
  };
} else {
  idStringify = function (id) { return id; };
}

// XXX duplicated code from minimongo.js.  It's small though.
var applyChanges = function (doc, changeFields) {
  _.each(changeFields, function (value, key) {
    if (value === undefined)
      delete doc[key];
    else
      doc[key] = value;
  });
};

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

Each = DebugComponent.extend({

  // XXX what is init() good for if render lets you reactively
  // depend on args, but init doesn't?  (you can access them
  // but your code only ever runs once)

  render: function (buf) {
    var self = this;
    // XXX support arrays too.
    // For now, we assume `list` is a database cursor.
    var cursor = self.getArg('list');

    // OrderedDict from id string or object (which is
    // stringified internally by the dict) to untransformed
    // document.
    self.items = new OrderedDict(idStringify);
    var items = self.items;

    // Templates should have access to data and methods added by the
    // transformer, but observeChanges doesn't transform, so we have to do
    // it here.
    //
    // NOTE: this is a little bit of an abstraction violation. Ideally,
    // the only thing we should know about Minimongo is the contract of
    // observeChanges. In theory, we could allow anything that implements
    // observeChanges to be passed to us.
    var transformedDoc = function (doc) {
      if (cursor.getTransform && cursor.getTransform())
        return cursor.getTransform()(EJSON.clone(doc));
      return doc;
    };

    // because we're in render(), rebuild or destroy will
    // stop this handle.
    self.cursorHandle = cursor.observeChanges({
      addedBefore: function (id, item, beforeId) {
        var doc = EJSON.clone(item);
        doc._id = id;
        items.putBefore(id, doc, beforeId);
        //var tdoc = transformedDoc(doc);

        //self.itemAddedBefore(id, tdoc, beforeId);
      },
      removed: function (id) {
        //items.remove(id);

        //self.itemRemoved(id);
      },
      movedBefore: function (id, beforeId) {
        //items.moveBefore(id, beforeId);

        //self.itemMovedBefore(id, beforeId);
      },
      changed: function (id, fields) {
        //var doc = items.get(id);
        //if (! doc)
        //throw new Error("Unknown id for changed: " + idStringify(id));
        //applyChanges(doc, fields);
        //var tdoc = transformedDoc(doc);

        //self.itemChanged(id, tdoc);
      }
    });

    if (items.empty) {
      buf.component(function () {
        return (self.getArg('elseClass') || Component).create(
          { data: this.getArg('data') });
      }, { key: 'else' });
    } else {
      items.forEach(function (doc, id) {
        var tdoc = transformedDoc(doc);

        buf.component(function () {
          return self.getArg('bodyClass').create({ data: tdoc });
        }, { key: this._itemChildId(id) });
      });
    }
  },

  _itemChildId: function (id) {
    return 'item:' + idStringify(id);
  }
  /*
  addItemChild: function (id, comp) {
    this.addChild(this._itemChildId(id), comp);
  },
  removeItemChild: function (id) {
    this.removeChild(this._itemChildId(id));
  },
  getItemChild: function (id) {
    return this.children[this._itemChildId(id)];
  },
  // Utility to attach a child component for an item in its
  // appropriate position in the DOM, after it is already
  // in the correct position in the items dict.
  // Also adjusts the component's bounds.
  attachItemChild: function (id, comp, beforeId) {
    if (! this.isBuilt)
      throw new Error("Component must be built");

    var isFirst = !this.items.prev(id);
    var isLast = !beforeId;
    var beforeNode =
          (beforeId ? this.getItemChild(beforeId).firstNode() :
           this.lastNode().nextSibling);

    comp.attach(this.parentNode(), beforeNode);

    if (isFirst)
      this.setStart(comp);
    if (isLast)
      this.setEnd(comp);
  },

  itemAddedBefore: function (id, doc, beforeId) {
    var bodyClass = this.getArg('bodyClass');
    var comp = new bodyClass({data: doc});
    this.addItemChild(id, comp);

    if (this.isBuilt) {
      this.attachItemChild(id, comp, beforeId);

      if (this.items.size() === 1)
        // was empty
        this.removeChild('else');
    }
  },
  itemRemoved: function (id) {
    if (this.items.size() === 1) {
      // making empty
      var elseClass = this.getArg('elseClass') || EmptyComponent;
      var comp = new elseClass({data: this.getArg('data')});
      this.addChild('else', comp);

      if (this.isBuilt) {
        comp.attach(this.parentNode(), this.firstNode());
        this.setBounds(comp);
      }
    }
    this.removeItemChild(id);
  },
  itemMovedBefore: function (id, beforeId) {
    if (this.items.size() === 1)
      return; // move is meaningless anyway

    if (this.isBuilt) {
      var comp = this.getItemChild(id);
      comp.detach();
      this.attachItemChild(id, comp, beforeId);
    }
  },
  itemChanged: function (id, doc) {
    this.getItemChild(id).update({data: doc});
  },
  initiallyEmpty: function () {
    var elseClass = this.getArg('elseClass') || EmptyComponent;
    this.addChild('else', new elseClass({data: this.getArg('data')}));
  },

  build: function (frag) {
    var self = this;
    if (self.items.empty()) {
      var elseChild = self.children['else'];
      elseChild.attach(frag);
      self.setBounds(elseChild);
    } else {
      self.items.forEach(function (doc, id) {
        self.getItemChild(id).attach(frag);
      });
      self.setBounds(self.getItemChild(self.items.first()),
                     self.getItemChild(self.items.last()));
    }
  }
  // XXX toHtml
*/
});

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