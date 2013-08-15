// _id: short (URL-friendly) name of the book
// title: human-readable title of the book
// toc: table of contents, as an array. Each item is an object with:
//  - type: one of 'h1', 'h2', 'h3', 'spacer', 'api', 'property'
//  - title: human readable string
//  - article: name of article to show
//  - anchor: name of anchor in article (string)
//  - formal: if type === 'property', a variable name such as 'this' or
//    'collection'
Books = new Meteor.Collection("books");

// name: short (URL-friendly) name of the article. unique within a book. may
//       be the empty string.
// book: name of the book that contains this article
// contents: contents of the article as better_markdown
Articles = new Meteor.Collection("articles");

// name: name of a book, or null for a spacer
// order: sort order
RecommendedBooks = new Meteor.Collection("recommendedBooks");