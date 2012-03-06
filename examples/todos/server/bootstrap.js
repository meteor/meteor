// if the database is empty on server start, create some sample data.
Meteor.startup(function () {
  if (Lists.find().count() === 0) {
    var data = [
      {name: "* Seven Principles *",
       contents: [
         ["Data on the Wire", "Simplicity", "Better UX", "Fun"],
         ["One Language", "Simplicity", "Fun"],
         ["Database Everywhere", "Simplicity"],
         ["Latency Compensation", "Better UX"],
         ["Full Stack Reactivity", "Better UX", "Fun"],
         ["Embrace the Ecosystem", "Fun"],
         ["Simplicity Equals Productivity", "Simplicity", "Fun"]
       ]
      },
      {name: "Next-gen frameworks",
       contents: [
         ["Meteor"],
         ["Derby + Racer"],
         ["Capsule + Thoonk from &yet"],
         ["Flatiron from Nodejitsu"],
         ["Socketstream"],
         ["Sencha.io Data"]
       ]
      },
      {name: "Client-side MVC options",
       contents: [
         ["Backbone", "Minimal"],
         ["Spine", "Minimal", "Coffeescript"],
         ["Angular", "Minimal", "Templating"],
         ["Batman", "Minimal", "Coffeescript"],
         ["Knockout", "Minimal", "Templating"],
         ["Sproutcore", "Widgets", "Templating"],
         ["Sencha", "Widgets", "GUI builder", "Mobile"],
         ["Kendo UI", "Widgets", "Mobile"],
         ["boltjs", "Minimal"]
       ]
      }
    ];

    var timestamp = (new Date()).getTime();
    for (var i = 0; i < data.length; i++) {
      var list_id = Lists.insert({name: data[i].name})._id;
      for (var j = 0; j < data[i].contents.length; j++) {
        var info = data[i].contents[j];
        Todos.insert({list_id: list_id,
                      text: info[0],
                      timestamp: timestamp,
                      tags: info.slice(1)});
        timestamp += 1; // ensure unique timestamp.
      }
    }
  }
});
