var url =  null;
if (Meteor.settings &&
    Meteor.settings.public &&
    Meteor.settings.public.runId &&
    Meteor.settings.public.reportTo) {
  url = Meteor.settings.public.reportTo +
      "/report/" +
      Meteor.settings.public.runId;
}

Meteor.methods({
  report: function (reports) {
    // XXX Could do a more precise validation here; reports are complex!
    check(reports, [Object]);
    if (url) {
      Meteor.http.post(url, {
        data: reports
      });
    }
    return null;
  }
});
