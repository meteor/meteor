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
