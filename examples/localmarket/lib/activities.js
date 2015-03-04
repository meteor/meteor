Activities = new Mongo.Collection('activities');

Activities.allow({
  insert: function(userId, doc) {
    return doc.userId === userId;
  }
});

Activities.latest = function() {
  return Activities.find({}, {sort: {date: -1}, limit: 1});
}

Meteor.methods({
  createActivity: function(activity, tweet, loc) {
    check(Meteor.userId(), String);
    check(activity, {
      recipeName: String,
      text: String,
      image: String
    });
    check(tweet, Boolean);
    check(loc, Match.OneOf(Object, null));
    
    activity.userId = Meteor.userId();
    activity.userAvatar = Meteor.user().services.twitter.profile_image_url_https;
    activity.userName = Meteor.user().profile.name;
    activity.date = new Date;
    
    if (! this.isSimulation && loc)
      activity.place = getLocationPlace(loc);
    
    var id = Activities.insert(activity);
    
    if (! this.isSimulation && tweet)
      tweetActivity(activity);
    
    return id;
  }
});

if (Meteor.isServer) {
  // Uses the Npm request module directly as provided by the http package

  if (! HTTPInternals.NpmModules.request.version.match(/^2\.(\d+)/)) {
    // maybe it doesn't have the same API any more?
    throw Error("http upgraded request to a new major version");
  }
  var Request = Meteor.wrapAsync(HTTPInternals.NpmModules.request.module);
  
  var callTwitter = function(options) {
    var config = Meteor.settings.twitter
    var userConfig = Meteor.user().services.twitter;

    options.oauth = {
      consumer_key: config.consumerKey,
      consumer_secret: config.secret,
      token: userConfig.accessToken,
      token_secret: userConfig.accessTokenSecret
    };

    return Request(options);
  }
  
  var tweetActivity = function(activity) {
    // creates the tweet text, optionally truncating to fit the appended text
    function appendTweet(text, append) {
      var MAX = 117; // Max size of tweet with image attached
      
      if ((text + append).length > MAX)
        return text.substring(0, (MAX - append.length - 3)) + '...' + append;
      else
        return text + append;
    }
    
    // we need to strip the "data:image/jpeg;base64," bit off the data url
    var image = activity.image.replace(/^data.*base64,/, '');

    var response = callTwitter({
      method: 'post',
      url: 'https://upload.twitter.com/1.1/media/upload.json',
      form: { media: image }
    });
    
    if (response.statusCode !== 200)
      throw new Meteor.Error(500, 'Unable to post image to twitter');

    var attachment = JSON.parse(response.body);
    
    var response = callTwitter({
      method: 'post',
      url: 'https://api.twitter.com/1.1/statuses/update.json',
      form: {
        status: appendTweet(activity.text, ' #localmarket'),
        media_ids: attachment.media_id_string
      }
    });

    if (response.statusCode !== 200)
      throw new Meteor.Error(500, 'Unable to create tweet');
  }
  
  var getLocationPlace = function(loc) {
    var url = 'https://api.twitter.com/1.1/geo/reverse_geocode.json'
      + '?granularity=neighborhood'
      + '&max_results=1'
      + '&accuracy=' + loc.coords.accuracy
      + '&lat=' + loc.coords.latitude
      + '&long=' + loc.coords.longitude;
    
    var response = callTwitter({ method: 'get', url: url });

    if (response.statusCode === 200) {
      var data = JSON.parse(response.body);
      var place = _.find(data.result.places, function(place) {
        return place.place_type === 'neighborhood';
      });
      
      return place && place.full_name;
    }
  }
}

// Initialize a seed activity
Meteor.startup(function() {
  if (Meteor.isServer && Activities.find().count() === 0) {
    Activities.insert({
      recipeName: 'summer-apricots-honey-panna-cotta',
      text: 'I substituted strawberries for apricots - incredible!',
      image: '/img/activity/activity-placeholder-strawberry-640x640.jpg',
      userAvatar: 'https://avatars3.githubusercontent.com/u/204768?v=2&s=400',
      userName: 'Matt Debergalis',
      place: 'SoMA, San Francisco',
      date: new Date
    });
  }
});

