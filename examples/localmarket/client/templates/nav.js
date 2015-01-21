Template.nav.onRendered(function() {
  var $nav = this.$('nav');
  $nav.siblings('.content-scrollable:not(.static-nav)').children().first().waypoint(function(direction) {
    $nav.toggleClass('scrolled', direction === 'down');
  }, {
    context: '.content-scrollable',
    offset: -200
  });
});

Template.nav.helpers({
  // Iron Router stores {initial: true} in history state if this is
  // the first route that we hit in an app. There are a variety of 
  // unexpected ways that this can happen (for example oauth, or 
  // hot code push), but we can't rely on going back in such cases.
  back: function () {
    return this.back && ! history.state.initial;
  }
});
