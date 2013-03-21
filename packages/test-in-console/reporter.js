var url =  null;
if (Meteor.settings &&
    Meteor.settings.public &&
    !_.isEmpty(Meteor.settings.public.runId) &&
    !_.isEmpty(Meteor.settings.public.reportTo)) {
  url = Meteor.settings.public.reportTo +
      "/report/" +
      Meteor.settings.public.runId;
}

Meteor.methods({
  report: function (reports) {
    Meteor.http.post(url, {
      data: reports
    });
    return null;
  }
});
