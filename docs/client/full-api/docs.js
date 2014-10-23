release = Meteor.release ? "0.9.4" : "(checkout)";

Meteor.startup(function () {
  //mixpanel tracking
  mixpanel.track('docs');

  // returns a jQuery object suitable for setting scrollTop to
  // scroll the page, either directly for via animate()
  var scroller = function() {
    return $("html, body").stop();
  };

  var sections = [];
  _.each($('#main h1, #main h2, #main h3'), function (elt) {
    var classes = (elt.getAttribute('class') || '').split(/\s+/);
    if (_.indexOf(classes, "nosection") === -1)
      sections.push(elt);
  });

  for (var i = 0; i < sections.length; i++) {
    var classes = (sections[i].getAttribute('class') || '').split(/\s+/);
    if (_.indexOf(classes, "nosection") !== -1)
      continue;
    sections[i].prev = sections[i-1] || sections[i];
    sections[i].next = sections[i+1] || sections[i];
    $(sections[i]).waypoint({offset: 30});
  }
  var section = document.location.hash.substr(1) || sections[0].id;
  Session.set('section', section);
  if (section) {
    // WebKit will scroll down to the #id in the URL asynchronously
    // after the page is rendered, but Firefox won't.
    Meteor.setTimeout(function() {
      var elem = $('#'+section);
      if (elem.length)
        scroller().scrollTop(elem.offset().top);
    }, 0);
  }

  var ignore_waypoints = false;
  var lastTimeout = null;
  $('h1, h2, h3').waypoint(function (evt, dir) {
    if (!ignore_waypoints) {
      var active = (dir === "up") ? this.prev : this;
      if (active.id) {
        if (lastTimeout)
          Meteor.clearTimeout(lastTimeout);
        lastTimeout = Meteor.setTimeout(function () {
          Session.set("section", active.id);
        }, 200);
      }
    }
  });

  window.onhashchange = function () {
    scrollToSection(location.hash);
  };

  var scrollToSection = function (section) {
    if (! $(section).length)
      return;

    ignore_waypoints = true;
    Session.set("section", section.substr(1));
    scroller().animate({
      scrollTop: $(section).offset().top
    }, 500, 'swing', function () {
      window.location.hash = section;
      ignore_waypoints = false;
    });
  };

  // Make external links open in a new tab.
  $('a:not([href^="#"])').attr('target', '_blank');
});

var hideMenu = function () {
  $('#nav').removeClass('show');
  $('#menu-ico').removeClass('hidden');
};

Template.registerHelper("fullApi", function () {
  return Session.get("fullApi");
});

UI.registerHelper('dstache', function() {
  return '{{';
});

UI.registerHelper('tstache', function() {
  return '{{{';
});

UI.registerHelper('lt', function () {
  return '<';
});

check_links = function() {
  var body = document.body.innerHTML;

  var id_set = {};

  body.replace(/id\s*=\s*"(.*?)"/g, function(match, id) {
    if (! id) return;
    if (id_set['$'+id]) {
      console.log("ERROR: Duplicate id: "+id);
    } else {
      id_set['$'+id] = true;
    }
  });

  body.replace(/"#(.*?)"/g, function(match, frag) {
    if (! frag) return;
    if (! id_set['$'+frag]) {
      var suggestions = [];
      _.each(_.keys(id_set), function(id) {
        id = id.slice(1);
        if (id.slice(-frag.length) === frag ||
            frag.slice(-id.length) === id) {
          suggestions.push(id);
        }
      });
      var msg = "ERROR: id not found: "+frag;
      if (suggestions.length > 0) {
        msg += " -- suggest "+suggestions.join(', ');
      }
      console.log(msg);
    }
  });

  return "DONE";
};

var basicTypes = ["String", "Number", "Boolean", "Function", "Any", "Object",
  "Array", "null", "undefined", "Integer", "Error"];

// are all types either normal types or links?
check_types = function () {
  $(".new-api-box .type").each(function () {
    var typeSpan = this;

    var typesPipeSeparated =
      $(typeSpan).text().replace(/, or /g, "|").replace(/( or )/g, "|")
        .replace(/, /g, "|");

    _.each(typesPipeSeparated.split("|"), function (text) {
      if (! text) {
        console.log(typeSpan);
        return;
      }

      text = text.replace(/^\s+|\s+$/g, '');

      if (_.contains(basicTypes, text)) {
        return; // all good
      }

      var hasLink = false;
      $(typeSpan).find("a").each(function () {
        if ($(this).text().replace(/^\s+|\s+$/g, '') === text) {
          hasLink = true;
        }
      });

      if (! hasLink) {
        console.log("No link for: " + text);
      }
    });
  });
};
