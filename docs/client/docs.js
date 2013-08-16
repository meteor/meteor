Page.define('root', '/');
Page.define('book', '/:book');
Page.define('article', '/:book/:article#:section');

// XXX maybe autoruns should automatically be held until after startup?
Meteor.startup(function () {
  // currentBook, currentArticle, currentSection in Session are derived
  // from book, article, section in Page, but have defaults.
  Meteor.autorun(function () {
    var book = Page.get("book") || defaultBook();
    if (! book)
      return;
    fetchBook(book);

    var article = Page.get("article");
    var section = Page.get("section");
    if (! article) {
      var item = defaultItemInBook(book);
      if (item) {
        article = item.article;
        section = item.anchor;
      }
    }

    Session.set('currentBook', book);
    Session.set('currentArticle', article);
    Session.set('currentSection', section);
  });

  // Download the currently selected book and/or article.
  Meteor.autorun(function () {
    var book = Session.get("currentBook");
    if (book)
      fetchBook(book);

    var article = Session.get("currentArticle");
    if (book && article !== undefined)
      fetchArticle(book, article);
  });
});

// Returns a book name, or null if can't be determined (not loaded)
var defaultBook = function () {
  var recs = RecommendedBooks.find().fetch();
  for (var i = 0; i < recs.length; i++)
    if (recs[i] !== null) {
      return recs[i].name;
    }
  return null;
};

// Returns object with 'article' and possibly 'anchor', or null if
// can't be determined (no such book or not loaded).
var defaultItemInBook = function (book) {
  // find the first thing in the TOC
  var book = Books.findOne(book);
  var toc = book && book.toc || [];

  for (var i = 0; i < toc.length; i++)
    if (toc[i].type !== "spacer") {
      return {
        article: toc[i].article,
        anchor: toc.anchor
      };
    }
  return null;
};

///////////////////////////////////////////////////////////////////////////////

// returns a jQuery object suitable for setting scrollTop to
// scroll the page, either directly for via animate()
var scroller = function() {
  return $("html, body").stop();
};

var ignoreWaypoints = false;
var lastScrolledArticle = null;
var lastScrolledSection = null;

Meteor.startup(function () {
  // When the selected section changes, scroll to it. (Or jump to it
  // if we also changed to a different article.)
  Meteor.autorun(function () {
    var article = Session.get("currentArticle");
    var section = Session.get("currentSection");
    if (! section)
      section = "top";

    if (section === lastScrolledSection &&
        article === lastScrolledArticle)
      return;

    var sectionElt = $('#' + section);
    if (! sectionElt.length) {
      console.log("No section '" + section + "' to scroll to");
      return;
    }

    var animate = (lastScrolledArticle === article);
    ignoreWaypoints = true;
    lastScrolledArticle = article;
    lastScrolledSection = section;

    scroller().animate({
      scrollTop: sectionElt.offset().top
    }, animate ? 200 : 0, 'swing', function () {
      ignoreWaypoints = false;
    });
  });

  // When passing a section boundary, update the section
  // selection. (But not when passing it during an animated scroll.)
  $('body').delegate('*', 'waypoint.reached', function (evt, dir) {
    if (ignoreWaypoints)
      return;
    var active = (dir === "up") ? this.prev : this;
    console.log(active && active.id);
    if (active) {
      console.log("SET", active.id);
      Session.set("currentSection", active.id);
      lastScrolledSection = active.id;
      lastScrolledArticle = Session.get("currentArticle");
    }
    evt.stopPropagation();
  });
});



///////////////////////////////////////////////////////////////////////////////

// Mixpanel stats. XXX revamp

Meteor.startup(function () {
  mixpanel.track('docs');
});

Meteor.startup(function () {
  Meteor.autorun(function () {
    var token = "docs_navigate_" +
      Session.get('currentBook') + "_" +
      Session.get('currentArticle') + "_" +
      (Session.get('currentSection') || '');
    mixpanel.track(token);
  });
});

///////////////////////////////////////////////////////////////////////////////


//// topbar ////

Template.topbar.release = function () {
  return Meteor.release || "(checkout)";
};



//// outerNav ////

Template.outerNav.recommendedBookNames = function () {
  return RecommendedBooks.find({}, {sort: {order: 1}});
};

Template.outerNav.thisBook = function () {
  return Books.findOne(this.name);
};


Template.outerNav.bookLink = function () {
  // XXX emit correct anchor
  return Page.url('book', {book: this._id});
};

Template.outerNav.maybeSelected = function () {
  return Session.equals("currentBook", this._id) ? "selected" : "";
};


//// toc ////

Template.toc.sections = function () {
  var book = Books.findOne(Session.get("currentBook"));
  return book && book.toc || [];
};

Template.toc.typeIs = function (what) {
  return this.type === what;
}

Template.toc.maybeCurrent = function () {
  var current =
    Session.equals("currentArticle", this.article) &&
    Session.equals("currentSection", this.anchor);
  return current ? "current" : "";
};

Template.toc.articleLink = function () {
  return Page.url('article', {
    book: Session.get("currentBook"),
    article: this.article,
    section: this.anchor
  });
};




//// main ////

Template.main.currentArticle = function () {
  return Articles.findOne({
    book: Session.get("currentBook"),
    name: Session.get("currentArticle")
  });
};

// After an article has been rendered, set up its waypoints.
Template.main.setUpWaypoints = function () {
  Deps.afterFlush(function () {
    var book = Books.findOne(Session.get("currentBook"));
    var toc = book && book.toc;
    if (! toc) {
      console.log("No toc for article?");
      return;
    }

    var prev = null;
    _.each(toc, function (item) {
      if (item.article !== Session.get("currentArticle") ||
          ! item.anchor)
        return;
      var elt = $('#' + item.anchor)[0];
      if (! elt) {
        console.log("Missing anchor: " + item.anchor);
        return;
      }
      elt.prev = prev;
      prev = elt;
      $(elt).waypoint({offset: 30});
    });

    // XXX we never shipped this because we couldn't find colors we liked
    // prettyPrint();

    // XXX XXX need to revamp (need to check for other host, not anchor)
    // Make external links open in a new tab.
    // $('a:not([href^="#"])').attr('target', '_blank');
  });
};


///////////////////////////////////////////////////////////////////////////////


//// helpers ////

Handlebars.registerHelper('warning', function(fn) {
  return Template.warning_helper(fn(this));
});

Handlebars.registerHelper('note', function(fn) {
  return Template.note_helper(fn(this));
});

// "name" argument may be provided as part of options.hash instead.
Handlebars.registerHelper('dtdd', function(name, options) {
  if (options && options.hash) {
    // {{#dtdd name}}
    options.hash.name = name;
  } else {
    // {{#dtdd name="foo" type="bar"}}
    options = name;
  }

  return Template.dtdd_helper({descr: options.fn(this),
                               name: options.hash.name,
                               type: options.hash.type});
});

Handlebars.registerHelper('better_markdown', function(fn) {
  var converter = new Showdown.converter();
  var input = fn(this);

  ///////
  // Make Markdown *actually* skip over block-level elements when
  // processing a string.
  //
  // Official Markdown doesn't descend into
  // block elements written out as HTML (divs, tables, etc.), BUT
  // it doesn't skip them properly either.  It assumes they are
  // either pretty-printed with their contents indented, or, failing
  // that, it just scans for a close tag with the same name, and takes
  // it regardless of whether it is the right one.  As a hack to work
  // around Markdown's hacks, we find the block-level elements
  // using a proper recursive method and rewrite them to be indented
  // with the final close tag on its own line.
  ///////

  // Open-block tag should be at beginning of line,
  // and not, say, in a string literal in example code, or in a pre block.
  // Tag must be followed by a non-word-char so that we match whole tag, not
  // eg P for PRE.  All regexes we wish to use when scanning must have
  // 'g' flag so that they respect (and set) lastIndex.
  // Assume all tags are lowercase.
  var rOpenBlockTag = /^\s{0,2}<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del)(?=\W)/mg;
  var rTag = /<(\/?\w+)/g;
  var idx = 0;
  var newParts = [];
  var blockBuf = [];
  // helper function to execute regex `r` starting at idx and putting
  // the end index back into idx; accumulate the intervening string
  // into an array; and return the regex's first capturing group.
  var rcall = function(r, inBlock) {
    var lastIndex = idx;
    r.lastIndex = lastIndex;
    var match = r.exec(input);
    var result = null;
    if (! match) {
      idx = input.length;
    } else {
      idx = r.lastIndex;
      result = match[1];
    }
    (inBlock ? blockBuf : newParts).push(input.substring(lastIndex, idx));
    return result;
  };

  // This is a tower of terrible hacks.
  // Replace Spark annotations <$...> ... </$...> with HTML comments, and
  // space out the comments on their own lines.  This keeps them from
  // interfering with Markdown's paragraph parsing.
  // Really, running Markdown multiple times on the same string is just a
  // bad idea.
  input = input.replace(/<(\/?\$.*?)>/g, '<!--$1-->');
  input = input.replace(/<!--.*?-->/g, '\n\n$&\n\n');

  var hashedBlocks = {};
  var numHashedBlocks = 0;

  var nestedTags = [];
  while (idx < input.length) {
    var blockTag = rcall(rOpenBlockTag, false);
    if (blockTag) {
      nestedTags.push(blockTag);
      while (nestedTags.length) {
        var tag = rcall(rTag, true);
        if (! tag) {
          throw new Error("Expected </"+nestedTags[nestedTags.length-1]+
                          "> but found end of string");
        } else if (tag.charAt(0) === '/') {
          // close tag
          var tagToPop = tag.substring(1);
          var tagPopped = nestedTags.pop();
          if (tagPopped !== tagToPop)
            throw new Error(("Mismatched close tag, expected </"+tagPopped+
                             "> but found </"+tagToPop+">: "+
                             input.substr(idx-50,50)+"{HERE}"+
                             input.substr(idx,50)).replace(/\n/g,'\\n'));
        } else {
          // open tag
          nestedTags.push(tag);
        }
      }
      var newBlock = blockBuf.join('');
      var openTagFinish = newBlock.indexOf('>') + 1;
      var closeTagLoc = newBlock.lastIndexOf('<');

      var key = ++numHashedBlocks;
      hashedBlocks[key] = newBlock.slice(openTagFinish, closeTagLoc);
      newParts.push(newBlock.slice(0, openTagFinish),
                    '!!!!HTML:'+key+'!!!!',
                    newBlock.slice(closeTagLoc));
      blockBuf.length = 0;
    }
  }

  var newInput = newParts.join('');
  var output = converter.makeHtml(newInput);

  output = output.replace(/!!!!HTML:(.*?)!!!!/g, function(z, a) {
    return hashedBlocks[a];
  });

  output = output.replace(/<!--(\/?\$.*?)-->/g, '<$1>');

  return output;
});

Handlebars.registerHelper('dstache', function() {
  return '{{';
});

Handlebars.registerHelper('tstache', function() {
  return '{{{';
});

Handlebars.registerHelper('api_section', function(id, nameFn) {
  return Template.api_section_helper(
    {name: nameFn(this), id:id}, true);
});

Handlebars.registerHelper('api_box_inline', function(box, fn) {
  return Template.api_box(_.extend(box, {body: fn(this)}), true);
});

Template.api_box.bare = function() {
  return ((this.descr && this.descr.length) ||
          (this.args && this.args.length) ||
          (this.options && this.options.length)) ? "" : "bareapi";
};

var check_links = function() {
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
