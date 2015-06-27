APICollection = new Mongo.Collection(null);

_.each(DocsData, function (val) {
  // XXX only insert things that are actually in the docs
  if (val.kind !== "namespace") {
    APICollection.insert(val);
  }
});

Session.setDefault("searchOpen", false);
Session.setDefault("searchQuery", "");
Session.setDefault("searchResults", []);
Session.setDefault("selectedResultId", null);

// Close search with ESC
$(document).on("keydown", function (event) {
  if (event.which === 27) {
    Session.set("searchOpen", false);
  }
});

// Open search with any non-special key
var keysToOpenSearch = /[A-Za-z0-9]/;
$(document).on("keydown", function (event) {
  // Don't activate search for special keys or keys with modifiers
  if (event.which && keysToOpenSearch.test(String.fromCharCode(event.which)) &&
      (! event.ctrlKey) && (! event.metaKey) && (! Session.get("searchOpen"))) {
    Session.set("searchOpen", true);

    Tracker.flush();
    $(".search-query").val("");
    $(".search-query").focus();
  }
});

// scroll $parent to make sure $child is visible
// XXX doesn't work that well, needs improvement
var ensureVisible = function ($child, $parent) {
  if (! $child) {
    return;
  }

  // make sure it's inside the visible area
  var parentTop = $parent.offset().top;
  var parentHeight = $parent.height();
  var childTop = $child.offset().top;
  var childHeight = $child.height();

  // check if bottom is below visible part
  if (childTop + childHeight > parentTop + parentHeight) {
    var amount = $parent.scrollTop() +
      (childTop + childHeight - (parentTop + parentHeight));
    $parent.scrollTop(amount);
  }

  // check if top is above visible section
  if (childTop < parentTop) {
    $parent.scrollTop($parent.scrollTop() + childTop - parentTop);
  }
};

// Whenever selectedResultId changes, make sure the selected element is visible
Tracker.autorun(function () {
  if (Session.get("selectedResultId")) {
    Tracker.afterFlush(function () {
      ensureVisible($(".search-results .selected"), $(".search-results"));
    });
  }
});

var indexOfByFunction = function (array, truthFunction) {
  for (var i = 0; i < array.length; i++) {
    if(truthFunction(array[i], i, array)) {
      return i;
    }
  }
  return -1;
};

var selectPrevItem = function () {
  // find currently selected item
  var curIndex = indexOfByFunction(Session.get("searchResults"), function (res) {
    return res._id === Session.get("selectedResultId");
  });

  // select the previous item
  if (curIndex > 0) {
    Session.set("selectedResultId",
      Session.get("searchResults")[curIndex - 1]._id);
  }
};

var selectNextItem = function () {
  // find currently selected item
  var curIndex = indexOfByFunction(Session.get("searchResults"), function (res) {
    return res._id === Session.get("selectedResultId");
  });

  // select the previous item
  if (curIndex < Session.get("searchResults").length - 1) {
    Session.set("selectedResultId",
      Session.get("searchResults")[curIndex + 1]._id);
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
  "keydown": function (event) {
    if (event.which === 13) {
      Tracker.afterFlush(function () {
        if (Session.get("selectedResultId")) {
          // XXX make sure this is completely up to date
          var selectedName = APICollection.findOne(Session.get("selectedResultId")).longname;
          var id = nameToId[selectedName] || selectedName.replace(/[.#]/g, "-");
          var url = "#/full/" + id;
          window.location.replace(url);
          Session.set("searchOpen", false);
        }
      });

      // exit function
      return;
    }

    if (event.which === 38) {
      // up
      selectPrevItem();
      return false;
    } else if (event.which === 40) {
      // down
      selectNextItem();
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
  if (deduplicatedResults.length) {
    Session.set("selectedResultId", deduplicatedResults[0]._id);
  }
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
  },
  selected: function (_id) {
    return _id === Session.get("selectedResultId");
  }
});
