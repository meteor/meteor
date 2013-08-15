<h2 id="templates">Templates</h2>

Meteor makes it easy to use your favorite HTML templating language,
such as Handlebars or Jade, along with Meteor's live page update
technology. Just write your template as you normally would, and Meteor
will take care of making it update in realtime.

To use this feature, create a file in your project with the `.html`
extension. In the file, make a `<template>` tag and give it a
`name` attribute. Put the template contents inside the tag. Meteor
will precompile the template, ship it down to the client, and make it
available as a function on the global `Template` object.

{{#note}}
Today, the only templating system that has been packaged for Meteor is
Handlebars. Let us know what templating systems you'd like to use with
Meteor. Meanwhile, see the [Handlebars
documentation](http://www.handlebarsjs.com/) and [Meteor Handlebars
extensions](https://github.com/meteor/meteor/wiki/Handlebars).
{{/note}}

A template with a `name` of `hello` is rendered by calling the
function `Template.hello`, passing any data for the template:

    <!-- in myapp.html -->
    <template name="hello">
      <div class="greeting">Hello there, {{dstache}}first}} {{dstache}}last}}!</div>
    </{{! }}template>

    // in the JavaScript console
    > Template.hello({first: "Alyssa", last: "Hacker"});
     => "<div class="greeting">Hello there, Alyssa Hacker!</div>"

This returns a string. To use the template along with the [`Live
HTML`](#livehtml) system, and get DOM elements that update
automatically in place, use [`Meteor.render`](#meteor_render):

    Meteor.render(function () {
      return Template.hello({first: "Alyssa", last: "Hacker"});
    })
      => automatically updating DOM elements

The easiest way to get data into templates is by defining helper
functions in JavaScript. Just add the helper functions directly on the
`Template.[template name]` object. For example, in this template:

    <template name="players">
      {{dstache}}#each topScorers}}
        <div>{{dstache}}name}}</div>
      {{dstache}}/each}}
    </{{! }}template>

instead of passing in `topScorers` as data when we call the
template function, we could define a function on `Template.players`:

    Template.players.topScorers = function () {
      return Users.find({score: {$gt: 100}}, {sort: {score: -1}});
    };

In this case, the data is coming from a database query. When the
database cursor is passed to `#each`, it will wire up all of the
machinery to efficiently add and move DOM nodes as new results enter
the query.

Helpers can take arguments, and they receive the current template data
in `this`:

    // in a JavaScript file
    Template.players.leagueIs = function (league) {
      return this.league === league;
    };

    <!-- in a HTML file -->
    <template name="players">
      {{dstache}}#each topScorers}}
        {{dstache}}#if leagueIs "junior"}}
          <div>Junior: {{dstache}}name}}</div>
        {{dstache}}/if}}
        {{dstache}}#if leagueIs "senior"}}
          <div>Senior: {{dstache}}name}}</div>
        {{dstache}}/if}}
      {{dstache}}/each}}
    </{{! }}template>

{{#note}}
Handlebars note: `{{dstache}}#if leagueIs "junior"}}` is
allowed because of a Meteor extension that allows nesting a helper
in a block helper. (Both `if` and `leagueIs` are
technically helpers, and stock Handlebars would not invoke
`leagueIs` here.)
{{/note}}

Helpers can also be used to pass in constant data.

    // Works fine with {{dstache}}#each sections}}
    Template.report.sections = ["Situation", "Complication", "Resolution"];

Finally, you can use an `events` declaration on a template function to set up a
table of event handlers. The format is documented at [Event
Maps](#eventmaps). The `this` argument to the event handler will be
the data context of the element that triggered the event.

    <!-- myapp.html -->
    <template name="scores">
      {{dstache}}#each player}}
        {{dstache}}> playerScore}}
      {{dstache}}/each}}
    </{{! }}template>

    <template name="playerScore">
      <div>{{dstache}}name}}: {{dstache}}score}}
        <span class="givePoints">Give points</span>
      </div>
    </{{! }}template>

    <!-- myapp.js -->
    Template.playerScore.events({
      'click .givePoints': function () {
        Users.update(this._id, {$inc: {score: 2}});
      }
    });

Putting it all together, here's an example of how you can inject
arbitrary data into your templates, and have them update automatically
whenever that data changes. See [Live HTML](#livehtml) for further
discussion.

    <!-- in myapp.html -->
    <template name="forecast">
      <div>It'll be {{dstache}}prediction}} tonight</div>
    </{{! }}template>

    <!-- in myapp.js -->
    // JavaScript: reactive helper function
    Template.forecast.prediction = function () {
      return Session.get("weather");
    };

    <!-- in the console -->
    > Session.set("weather", "cloudy");
    > document.body.appendChild(Meteor.render(Template.forecast));
    In DOM:  <div>It'll be cloudy tonight</div>

    > Session.set("weather", "cool and dry");
    In DOM:  <div>It'll be cool and dry tonight</div>
