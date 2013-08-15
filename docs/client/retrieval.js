Meteor.subscribe('recommendedBooks');

var booksFetched = {};
fetchBook = function (bookName) {
  Deps.nonreactive(function () {
    if (! (bookName in booksFetched)) {
      Meteor.subscribe("book", bookName);
      booksFetched[bookName] = true;
    }
  });
};

var articlesFetched = {};
fetchArticle = function (bookName, articleName) {
  Deps.nonreactive(function () {
    var key = bookName + "/" + articleName
    if (! (key in articlesFetched)) {
      Meteor.subscribe("article", bookName, articleName);
      articlesFetched[key] = true;
    }
  });
};
