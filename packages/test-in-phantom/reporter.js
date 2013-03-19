Meteor.methods({
  report: function (url, reports) {
    console.log("reporting to ", url);
    Meteor.http.post(url, {
      data: reports
    });
    return null;
  }
});
