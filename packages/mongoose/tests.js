Tinytest.add("Mongoose schema exists", function (test) {
  var BlogPost = new Schema({
    title     : String
    , body      : String
    , date      : Date
  });

  test.instanceOf(BlogPost, Schema);
});


Tinytest.add("Mongoose can save", function (test) {
  var Comment = new Schema({
      name  :  { type: String, default: 'hahaha' }
    , age   :  { type: Number, min: 18, index: true }
    , bio   :  { type: String, match: /[a-z]/ }
    , date  :  { type: Date, default: Date.now }
    , buff  :  Buffer
  });

  var Comments = mongoose.model('Comment', Comment);
  var MyComment = new Comments();
  MyComment.name = 'Jonathan';
  MyComment.save();
  //Add some asserts here
});
