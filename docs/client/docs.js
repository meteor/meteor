Router.configure({
  layout: 'layout'
});

Router.map(function () {
  this.route('root', {
    path: '/',
    template: 'article',
    data: function () {
      // XXX select first TOC item in first recommended book
      return null;
    }
  });

  this.route('book', {
    path: '/:book',
    template: 'article',
    data: function () {
      fetchBook(this.params.book);
      // select first thing in the TOC
      var book = Books.findOne(this.params.book);
      var toc = book && book.toc || [];

      for (var i = 0; i < toc.length; i++)
        if (toc[i].type !== "spacer") {
          fetchArticle(this.params.book, toc[i].article);
          // XXX set anchor to toc.anchor
          var a = Articles.findOne({book: book._id,
                                   name: toc[i].article});
          return Articles.findOne({book: book._id,
                                   name: toc[i].article});
        }
      return null;
    }
  });

  this.route('article', {
    path: '/:book/:article',
    template: 'article',
    data: function () {
      fetchBook(this.params.book);
      fetchArticle(this.params.book, this.params.article);

      // XXX set anchor
      return Articles.findOne({book: this.params.book,
                               name: this.params.article});
    },
    onBeforeRun: function () {
      console.log("onbeforerun", this);
    }
  });
});

Meteor.startup(function () {
  // XXX this is broken by the new multi-page layout.  Also, it was
  // broken before the multi-page layout because it had illegible
  // colors. Just turn it off for now. We'll fix it and turn it on
  // later.
  // prettyPrint();

  //mixpanel tracking
  mixpanel.track('docs');

  // returns a jQuery object suitable for setting scrollTop to
  // scroll the page, either directly for via animate()
  var scroller = function() {
    return $("html, body").stop();
  };

/*
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
  $('body').delegate('h1, h2, h3', 'waypoint.reached', function (evt, dir) {
    if (!ignore_waypoints) {
      var active = (dir === "up") ? this.prev : this;
      Session.set("section", active.id);
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

  $('#main, #nav2').delegate("a[href^='#']", 'click', function (evt) {
    evt.preventDefault();
    var sel = $(this).attr('href');
    scrollToSection(sel);

    mixpanel.track('docs_navigate_' + sel);
  });

  // Make external links open in a new tab.
  $('a:not([href^="#"])').attr('target', '_blank');
*/
});


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
  return Router.path('book', {book: this._id});
};

Template.outerNav.maybe_selected = function (selectedBookName) {
  return selectedBookName === this._id ? "selected" : "";
};


//// nav ////

Template.nav.sections = function () {
  var book = Books.findOne(this.book);
  return book && book.toc || [];
};

Template.nav.typeIs = function (what) {
  return this.type === what;
}

Template.nav.maybe_current = function () {
//  return Session.equals("section", this.id) ? "current" : "";
// XXX BROKEN
};

Template.nav.articleLinkInBook = function (bookName) {
  // XXX emit correct anchor (this.anchor)
  return Router.path('article', {book: bookName,
                                 article: this.article});
};




//// main ////

Template.main.currentArticle = function () {
  return Articles.findOne({
    book: Session.get("selectedBook"),
    name: Session.get("selectedArticle")
  });
};



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
