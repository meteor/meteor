if (Meteor.isClient) {
  Meteor.startup(function () {
    var classes = ['app-level', 'app-level-export', 'package-level', 'package-level-local-export', 'package-level-imported-to-app'];
    var colors = ['chocolate', 'cyan', 'salmon', 'red', 'blue'];
    for (var i in classes) {
      var selector = '.' + classes[i];
      Meteor.call('print', getComputedStyle(document.querySelector(selector))['background-color'] === colorToRGBString(colors[i]));
    }
  });

  function colorToRGBString(color) {
    d = document.createElement("div");
    d.style.color = color;
    document.body.appendChild(d);
    var str = getComputedStyle(d).color;
    document.body.removeChild(d);
    return str;
  }
} else {
  Meteor.methods({
    print: function (str) {
      console.log(str);
    }
  });
}

