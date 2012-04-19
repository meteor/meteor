# Mongoose

This is a package that allows Meteor to use the mongoose interface on the server side like this:

    if(is_server) {

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

    }

No connection is required, this uses the standard Mongo database connection
To access this model on the client side, for now you will have to do the following:

    var CommentsModel = Meteor.collection('Comment');


This will allow the client side code to call: `Comments` like it does currently however this skirts the use of Mongoose really.
Ideally you should be connecting to the server with a `Meteor.call` and using the serverside mongoose.mode object to run finds and saves like at the top of this.


For more help with the serverside api see: http://mongoosejs.com/