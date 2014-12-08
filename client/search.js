APICollection = new Meteor.Collection(null);

_.each(DocsData, function (val) {
  // XXX only insert things that are actually in the docs
  if (val.kind !== "namespace") {
    APICollection.insert(val);
  }
});

Session.setDefault("searchOpen", false);
Session.set("searchQuery", "");

// Close search with ESC
$(document).on("keydown", function (event) {
  if (event.which === 27) {
    Session.set("searchOpen", false);
  }
});

// Open search with any non-special key
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

// scroll searchResults to make sure $result is visible
var ensureVisible = function ($result, searchResults) {
  // make sure it's inside the visible area
  var viewportTop = searchResults.offset().top;
  var viewportHeight = searchResults.height();
  var elTop = $result.offset().top;
  var elHeight = $result.height();

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
};

var selectListItem = function ($newSelected) {
  var currentSelected = $(".search-results .selected");
  currentSelected.removeClass("selected");

  if ($newSelected.length) {
    $newSelected.addClass("selected");
    var searchResults = $(".search-results");

    ensureVisible($newSelected, searchResults);
  }
};

var selectFirstResult = function () {
  var currentSelected = $(".search-results .selected");
  if (! currentSelected.length) {
    selectListItem($(".search-results li").first());
  }
};

Template.search.events({
  "keyup input": function (event) {
    Session.set("searchQuery", event.target.value);
  },
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

// When you have two arrays of search results, use this function to deduplicate
// them
var dedup = function (arrayOfSearchResultsArrays) {
  var ids = {};
  var dedupedResults = [];

  _.each(arrayOfSearchResultsArrays, function (searchResults) {
    _.each(searchResults, function (item) {
      if (! ids.hasOwnProperty(item._id)) {
        ids[item._id] = true;
        dedupedResults.push(item);
      }
    });
  });

  return dedupedResults;
};

// Only update the search results every 200 ms
var updateSearchResults = _.throttle(function (query) {
  var regex = new RegExp(query, "i");

  // We do two separate queries so that we can be sure that the name matches
  // are above the summary matches, since they are probably more relevant
  var nameMatches = APICollection.find({ longname: {$regex: regex}}).fetch();
  var summaryMatches = APICollection.find({ summary: {$regex: regex}}).fetch();

  var deduplicatedResults = dedup([nameMatches, summaryMatches]);

  Session.set("searchResults", deduplicatedResults);

  Tracker.afterFlush(selectFirstResult);
}, 200);

// Call updateSearchResults when the query changes
Tracker.autorun(function () {
  if (Session.get("searchQuery")) {
    updateSearchResults(Session.get("searchQuery"));
  } else {
    Session.set("searchResults", []);
  }
});

Template.search.helpers({
  searchResults: function () {
    return Session.get("searchResults");
  },
  searchOpen: function () {
    return Session.get("searchOpen");
  }
});
