if (Meteor.isClient) {

  Meteor.startup(function () {
    Meteor.setInterval(function () {
      Session.set('time', new Date);
    }, 1000);
  });

  Template.clock.hours = _.range(0, 12);

  Template.clock.hourData = function () {
    return { i: +this,
             degrees: 30*this };
  };

  Template.clock.handData = function () {
    var time = Session.get('time') || new Date;
    return { hourDegrees: time.getHours() * 30,
             minuteDegrees: time.getMinutes() * 6,
             secondDegrees: time.getSeconds() * 6 };
  };

  Template.clock.radial = function (angleDegrees, startFraction, endFraction) {
    var radius = 100;

    var radians = (angleDegrees - 90) / 180 * Math.PI;
    return {
      x1: radius * startFraction * Math.cos(radians),
      y1: radius * startFraction * Math.sin(radians),
      x2: radius * endFraction * Math.cos(radians),
      y2: radius * endFraction * Math.sin(radians)
    };
  };
}
