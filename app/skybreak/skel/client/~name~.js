Sky.subscribe('presses');

Template.button_demo.events = {
  'click input': function () {
    console.log("press");
    Presses.insert({});
  }
};

Template.button_demo.press_count = function () {
  return Presses.find({}).length;
};

Template.button_demo.never_pressed = function (options) {
  return Presses.find({}).length === 0;
};
