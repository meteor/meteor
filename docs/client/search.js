APICollection = new Meteor.Collection(null);

_.each(DocsData, function (val) {
  APICollection.insert(val);
});

Session.setDefault("searchOpen", false);
Session.set("searchQuery", "");

$(document).on("keydown", function (event) {
  if (event.which === 27) {
    Session.set("searchOpen", false);
  }
});

$(document).on("keypress", function (event) {
  if (event.which && (event.which !== 13) && (event.which !== 32)) {
    if (! Session.get("searchOpen")) {
      Session.set("searchOpen", true);

      Tracker.flush();
      $(".search-query").val("");
      $(".search-query").focus();
    }
  }
});

var updateQuery = _.debounce(function () {
  Session.set("searchQuery", $(".search-query").val());
}, 400);

Template.search.events({
  "keyup input": updateQuery,
  "click .close-search": function () {
    Session.set("searchOpen", false);
  },
  "keydown": function (event, template) {
    if (event.which === 13) {
      // enter pressed, go to the selected item
      var currentSelected = template.$(".search-results .selected");

      if (currentSelected.length) {
        var selectedName = Blaze.getView(currentSelected.get(0)).dataVar.get().longname;
        var id = nameToId[selectedName] || selectedName.replace(/[.#]/g, "-");
        var url = "#/full/" + id;
        window.location.replace(url);
        Session.set("searchOpen", false);
      }

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
      var currentSelected = template.$(".search-results .selected");

      var newSelected;

      if (change === 1) {
        if (currentSelected.length) {
          newSelected = currentSelected.next();
        } else {
          newSelected = template.$(".search-results li").first();
        }
      } else {
        if (currentSelected.length) {
          newSelected = currentSelected.prev();
        }
      }

      currentSelected.removeClass("selected");

      if (newSelected.length) {
        newSelected.addClass("selected");


        // scroll to make sure everything is inside the viewport
        var searchResults = template.$(".search-results");

        // make sure it's inside the visible area
        var viewportTop = searchResults.offset().top;
        var viewportHeight = searchResults.height();
        var elTop = newSelected.offset().top;
        var elHeight = newSelected.height();

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
