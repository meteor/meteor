APICollection = new Meteor.Collection(null);

_.each(DocsData, function (val) {
  // XXX only insert things that are actually in the docs
  if (val.kind !== "namespace") {
    APICollection.insert(val);
  }
});

Session.setDefault("searchOpen", false);
Session.set("searchQuery", "");

$(document).on("keydown", function (event) {
  if (event.which === 27) {
    Session.set("searchOpen", false);
  }
});

var doNotOpenSearch = [13, 27, 32];
$(document).on("keydown", function (event) {
  // Don't activate search for special keys or keys with modifiers
  if (event.which && (! _.contains(doNotOpenSearch, event.which)) &&
      (! event.ctrlKey) && (! event.metaKey)) {
    if (! Session.get("searchOpen")) {
      Session.set("searchOpen", true);

      Tracker.flush();
      $(".search-query").val("");
      $(".search-query").focus();
    }
  }
});

var updateQuery = _.throttle(function () {
  Session.set("searchQuery", $(".search-query").val());

  Tracker.afterFlush(function () {
    var currentSelected = $(".search-results .selected");
    if (! currentSelected.length) {
      selectListItem($(".search-results li").first());
    }
  });
}, 200);

var selectListItem = function ($newSelected) {
  var currentSelected = $(".search-results .selected");
  currentSelected.removeClass("selected");

  if ($newSelected.length) {
    $newSelected.addClass("selected");

    // scroll to make sure everything is inside the viewport
    var searchResults = $(".search-results");

    // make sure it's inside the visible area
    var viewportTop = searchResults.offset().top;
    var viewportHeight = searchResults.height();
    var elTop = $newSelected.offset().top;
    var elHeight = $newSelected.height();

    // check if bottom is below visible part
    if (elTop + elHeight > viewportTop + viewportHeight) {
      var amount = searchResults.scrollTop() +
        (elTop + elHeight - (viewportTop + viewportHeight));
      searchResults.scrollTop(amount);
    }

    // check if top is above visible section
    if (elTop < viewportTop) {
      searchResults.scrollTop(searchResults.scrollTop() + elTop - viewportTop);
    }
  }
};

Template.search.events({
  "keyup input": updateQuery,
  "click .close-search": function () {
    Session.set("searchOpen", false);
    return false;
  },
  "keydown": function (event, template) {
    var currentSelected = template.$(".search-results .selected");

    if (event.which === 13) {
      // enter pressed, go to the selected item
      Session.set("searchQuery", $(".search-query").val());

      Tracker.afterFlush(function () {
        if (! currentSelected.length) {
          currentSelected = template.$(".search-results li").first();
        }

        if (currentSelected.length) {
          var selectedName = Blaze.getView(currentSelected.get(0)).dataVar.get().longname;
          var id = nameToId[selectedName] || selectedName.replace(/[.#]/g, "-");
          var url = "#/full/" + id;
          window.location.replace(url);
          Session.set("searchOpen", false);
        }
      });

      // exit function
      return;
    }

    var change = 0;
    if (event.which === 38) {
      // up
      change = -1;
    } else if (event.which === 40) {
      // down
      change = 1;
    }

    if (change !== 0) {
      if (change === 1) {
        if (currentSelected.length) {
          selectListItem(currentSelected.next());
        } else {
          selectListItem(template.$(".search-results li").first());
        }
      } else {
        if (currentSelected.length) {
          selectListItem(currentSelected.prev());
        }
      }

      return false;
    }
  }
});

var dedup = function (arr) {
  var ids = {};
  var output = [];

  _.each(arr, function (innerArray) {
    _.each(innerArray, function (item) {
      if (! ids.hasOwnProperty(item._id)) {
        ids[item._id] = true;
        output.push(item);
      }
    });
  });

  return output;
};

Template.search.helpers({
  searchResults: function () {
    if (Session.get("searchQuery")) {
      var regex = new RegExp(Session.get("searchQuery"), "i");

      var nameMatches = APICollection.find({ longname: {$regex: regex}}).fetch();
      var summaryMatches = APICollection.find({ summary: {$regex: regex}}).fetch();

      return dedup([nameMatches, summaryMatches]);
    }
  },
  searchOpen: function () {
    return Session.get("searchOpen");
  }
});
