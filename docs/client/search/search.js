APICollection = new Mongo.Collection(null);

var searchOpen = false;

Meteor.startup(function () {
  _.each(DocsData, function (val) {
    // XXX only insert things that are actually in the docs
    if (val.kind !== "namespace") {
      APICollection.insert(val);
    }
  });

  // Open search with any non-special key
  var keysToOpenSearch = /[A-Za-z0-9]/;
  $(document).on("keydown", function (event) {
    if (Session.get("openDiscussion")) {
      // Can't search while we have the comment window open
      return;
    }

    // Don't activate search for special keys or keys with modifiers
    if (event.which && keysToOpenSearch.test(String.fromCharCode(event.which)) &&
        (! event.ctrlKey) && (! event.metaKey) && (! searchOpen)) {
      openDrawerWithTemplate("search");
      Tracker.flush();
    }
  });
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

var indexOfByFunction = function (array, truthFunction) {
  for (var i = 0; i < array.length; i++) {
    if(truthFunction(array[i], i, array)) {
      return i;
    }
  }
  return -1;
};

Template.search.onCreated(function () {
  var self = this;

  searchOpen = true;

  self.searchQuery = new ReactiveVar("");
  self.searchResults = new ReactiveVar([]);
  self.selectedResultId = new ReactiveVar("");

  self.autorun(function () {
    if (self.searchQuery.get()) {
      self.updateSearchResults(self.searchQuery.get());
    } else {
      self.searchResults.set([]);
    }
  });

  // Whenever selectedResultId changes, make sure the selected element is visible
  self.autorun(function () {
    if (self.selectedResultId.get()) {
      Tracker.afterFlush(function () {
        ensureVisible(self.$(".search-results .selected"),
          self.$(".search-results"));
      });
    }
  });

  self.updateSearchResults = _.throttle(function (query) {
    var regex = new RegExp(query, "i");

    // We do two separate queries so that we can be sure that the name matches
    // are above the summary matches, since they are probably more relevant
    var nameMatches = APICollection.find({ longname: {$regex: regex}}).fetch();
    var summaryMatches = APICollection.find({ summary: {$regex: regex}}).fetch();

    var deduplicatedResults = dedup([nameMatches, summaryMatches]);

    self.searchResults.set(deduplicatedResults);

    if (deduplicatedResults.length) {
      self.selectedResultId.set(deduplicatedResults[0]._id);
    }
  }, 100, {
    leading: false
  });

  self.selectPrevItem = function () {
    // find currently selected item
    var curIndex = indexOfByFunction(self.searchResults.get(), function (res) {
      return res._id === self.selectedResultId.get();
    });

    // select the previous item
    if (curIndex > 0) {
      self.selectedResultId.set(self.searchResults.get()[curIndex - 1]._id);
    }
  };

  self.selectNextItem = function () {
    // find currently selected item
    var curIndex = indexOfByFunction(self.searchResults.get(), function (res) {
      return res._id === self.selectedResultId.get();
    });

    // select the previous item
    if (curIndex < self.searchResults.get().length - 1) {
      self.selectedResultId.set(self.searchResults.get()[curIndex + 1]._id);
    }
  };
});

Template.search.onDestroyed(function () {
  searchOpen = false;
});

Template.search.onRendered(function () {
  $(".search-query").focus();
});

Template.search.events({
  "keyup input": function (event) {
    Template.instance().searchQuery.set(event.target.value);
  },
  "keydown": function (event) {
    var self = Template.instance();

    if (event.which === 13) {
      Tracker.afterFlush(function () {
        if (self.selectedResultId.get()) {
          // XXX make sure this is completely up to date
          var selectedName = APICollection.findOne(self.selectedResultId.get()).longname;
          var id = nameToId[selectedName] || selectedName.replace(/[.#]/g, "-");
          var url = "#/full/" + id;
          window.location.replace(url);
          closeDrawer();
        }
      });

      // exit function
      return;
    }

    if (event.which === 38) {
      // up
      self.selectPrevItem();
      return false;
    } else if (event.which === 40) {
      // down
      self.selectNextItem();
      return false;
    }
  }
});

Template.search.helpers({
  searchResults: function () {
    return Template.instance().searchResults.get();
  },
  selected: function (_id) {
    return _id === Template.instance().selectedResultId.get();
  }
});
