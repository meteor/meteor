Items = new Meteor.Collection(null);
Items.insert({ text: 'Foo' });
Items.insert({ text: 'Bar' });
Items.insert({ text: 'Beef' });

Meteor.startup(function () {
  Meteor.setTimeout(function () {
    Items.insert({ text: 'Qux' });
    Items.remove({ text: 'Foo' });
    Items.update({ text: 'Bar' }, { text: 'Coke' });

    //Items.remove({});
    //Items.insert({ text: 'Foo' });
    //Items.insert({ text: 'Bar' });
    //Items.insert({ text: 'Beef' });
  }, 1000);
});

Body({
  items: function () {
    return Items.find({xxx:3}, { sort: { text: 1 }});
  },
  name: 'David',
  containerClass: function () {
    return Session.get('containerClass');
  }
});

Template.item({
  foo: function () { return Session.get('foo'); },
  rand: function () { return Math.random(); },
  itemClick: function (evt) {
    console.log(this.getData());
  }
});


//Meteor.startup(function () {
//  var body = document.body;
//  var table = document.createElement("TABLE");
//  TABLE = table;

  /*var tr = document.createElement("TR");
  var td = document.createElement("TD");
  var hello = document.createTextNode("hello");
  tr.appendChild(td);
  td.appendChild(hello);
  body.appendChild(table);
  table.appendChild(tr);*/

//  var frag = $.parseHTML("<tr><td>hello")[0].parentNode;
//  console.log(frag.firstChild.nodeName);
//  $(table).append(frag);
//
//  console.log(TABLE.rows.length);
//});

Span = UIComponent.extend({
  typeName: 'Span',
  render: function (buf) {
    buf("<span ",
        { attrs: function () {
          return { style:
                   'background: ' + (Session.get('bg') || 'red') + ';' +
                   'margin: 5px;',
                   foo: 'bar'
                 };}},
        "><br ", {
          attrs: function () {
            var x = { 'class': ['brrr', 'cold'] };
            x[Session.get('attrName') || 'boring'] = "";
            return x;
          }
        },
        ">Hello</span>");
  }
});

Div = UIComponent.extend({
  typeName: 'Div',
  render: function (buf) {
    buf("<div style='background:cyan;margin:5px'>World",
        "<input type=checkbox ",
        {attrs: function () {
          return {checked: Session.get('checked') ? 'checked' : null};
        }},
        ">",
        "</div>");
  }
});

Either = UIComponent.extend({
  typeName: 'Either',
  render: function (buf) {
    buf(Div.create(),
        {
          type: function () { return window[Session.get('which')]; },
          args: {
            built: function () {
              var self = this;
              self.$("*").on('click', function (evt) {
                Session.set(
                  'which',
                  Session.get('which') === 'Div' ? 'Span' : 'Div');
              });
            }
          }
        },
        new _UI.If({
          data: function () { return Session.get('which') === 'Div'; },
          content: Div,
          elseContent: Span
        }),
        { type: Span });
    buf(new _UI.Each({
      data: function () {
        return Session.get('nodata') ? null :
          Items.find({}, { sort: { text: 1 }});
      },
      content: UIComponent.extend({
        render: function (buf) {
          buf("<div>Each ", this.data().text, " ", String(Math.random()),
              "</div>");
        }
      })
    }));
  }
});

Meteor.startup(function () {
  Session.set('which', 'Span');

  // leak `x` for fooling around in the console
  x = Either.create({isRoot: true});
  x.attach(document.body);

  // leak `c`
  (c = _UI.Counter.create({isRoot:true})).attach(document.body);
});

Meteor.startup(function () {
  var c = UIComponent.extend({
    render: function(buf) {
      buf(String(this.data()));
    }
  });

  L = _UI.List({elseContent: function () {
    return c(function () { return 'else'; });
  }});

  L.addItemBefore('a', c, 1);
  L.addItemBefore('b', c, 2);
  L.addItemBefore('c', c, 3);
  L.makeRoot();
  L.attach(document.body);
  L.addItemBefore('d', c, 4);
  L.addItemBefore('e', c, 5, 'b');
  L.moveItemBefore('d', 'c');
  L.moveItemBefore('a');
  L.removeItem('b');
  L.removeItem('a');
  L.removeItem('c');
  L.removeItem('d');
  L.removeItem('e');
  L.addItemBefore('a', c, 1);
  L.addItemBefore('b', c, 2, 'a');
  L.addItemBefore('c', c, 3);
  L.moveItemBefore('c', 'a');
});