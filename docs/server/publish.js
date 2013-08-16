var path = Npm.require('path');

var booksJson = JSON.parse(Assets.getText('books.json'));
var recommendedBooks = booksJson.recommended;
var prettyBookTitle = function (name) {
  if (name in booksJson.titles)
    return booksJson.titles[name];
  return name;
};

// Should create a pretty string for URLs.
var slugify = function (s) {
  s = s.split('?')[0];
  s = s.replace(/['.]/g, '');
  s = s.replace(/[^a-zA-Z0-9]+/g, '-');
  s = s.replace(/^-/, '');
  s = s.replace(/-$/, '');
  return s.toLowerCase();
};

// Should (reasonably) match what Markdown does to generate ids for
// headers.
var idify = function (s) {
  return  s.toLowerCase().replace(/[^a-z0-9_,.]/g, '').replace(/[,.]/g, '_');
};

var getToc = function (bookName) {
  if (bookName.match(/[\.\\\/]/))
    throw Error("Illegal character in book name"); // paranoia

  try {
    // XXX XXX using eval rather than JSON.parse to allow comments and
    // non-quoted key names ... is that a bad idea?
    var json = eval(Assets.getText(path.join(bookName, 'toc.json')));
  } catch (e) {
    // book not found
    return null;
  }

  // We allow toc.json to use a shorthand form. If you don't need
  // anything special you can just specify nested lists of strings and
  // everything will be inferred. Otherwise, you can pass objects with
  // any subset of the available fields and we will guess the rest.
  var ret = [];
  var lastArticle = '';
  var lastAnchor = undefined;
  var walk = function (items, depth) {
    _.each(items, function (item) {
      if (item instanceof Array)
        walk(item, depth + 1);
      else {
        if (typeof(item) === "string")
          item = {title: item};
        else if (item === null)
          item = {type: "spacer"};

        if (! item.type) {
          if (item.formal)
            item.type = "property";
          else {
            switch (depth) {
            case 1: item.type = "h1"; break;
            case 2: item.type = "h2"; break;
            default: item.type = "h3"; break;
            }
          }
        }

        if (item.article === undefined) {
          if (! item.anchor && ! lastAnchor) {
            if (item.title)
              item.article = slugify(item.title);
          }
          else {
            item.article = lastArticle;
            if (! item.anchor && item.title)
              item.anchor = idify(item.title);
          }
        }

        ret.push(item);

        lastArticle = item.article;
        lastAnchor = item.anchor;
      }
    });
  };

  walk(json, 1);
  return ret;
};

var LegalName = Match.Where(function (x) {
  check(x, String);
  return x.match(/^[a-zA-Z0-9\-]*$/);
});

// recommendedBooks collection, joined with name and title of each
// recommended book.
Meteor.publish('recommendedBooks', function () {
  // List of names of recommended books, with 'null' for spacers.
  var names = recommendedBooks;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    this.added('recommendedBooks', i, { name: name, order: i });
    this.added('books', name, { title: prettyBookTitle(name) });
  }
});

// Full details, including TOC, for an individual book.
Meteor.publish('book', function (bookName) {
  check(bookName, LegalName);
  var toc = getToc(bookName);
  if (! toc)
    throw new Meteor.Error('not-found', 'No such book');
  this.added('books', bookName, {
    title: prettyBookTitle(bookName),
    toc: toc
  });
});

// One article
Meteor.publish('article', function (bookName, articleName) {
  check(bookName, LegalName);
  check(articleName, LegalName);

  var fileName = articleName;
  if (fileName === '')
    fileName = 'index';
  fileName += ".md";

  try {
    var contents = Assets.getText(path.join(bookName, fileName));
  } catch (e) {
    throw new Meteor.Error("not-found", 'No such article');
  }

  this.added('articles', articleName + "/" + bookName, {
    name: articleName,
    book: bookName,
    contents: contents
  });
});
