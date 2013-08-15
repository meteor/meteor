Meteor.subscribe('recommendedBooks');

var booksFetched = {};
fetchBook = function (bookName) {
  if (! (bookName in booksFetched)) {
    Meteor.subscribe("book", bookName);
    booksFetched[bookName] = true;
  }
};

var articlesFetched = {};
fetchArticle = function (bookName, articleName) {
  var key = bookName + "/" + articleName
  if (! (key in articlesFetched)) {
    Meteor.subscribe("article", bookName, articleName);
    articlesFetched[key] = true;
  }
};
