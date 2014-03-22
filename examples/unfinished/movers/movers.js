if (Meteor.isClient) {
  var moveCount = 0;
  var MOVE_INTERVAL = 3000;
  var MOVE_DURATION = 2000;

  doMove = function () {
    moveCount++;
    if (moveCount % 2 === 1) {
      animateToBefore($('.green'), $('.yellow'));
      animateToBefore($('.red'), null);
      animateToBefore($('.blue'), null);
    } else {
      animateToBefore($('.red'), null);
      animateToBefore($('.green'), null);
      animateToBefore($('.blue'), null);
      animateToBefore($('.yellow'), null);
    }
  };

  Meteor.startup(function () {
    doMove();
    window.setInterval(doMove, MOVE_INTERVAL);
  });


  animateToBefore = function ($n, $newNext) {
    // we don't use jQuery's `.css()` for these because we want the
    // element's own style, not the computed style
    var oldTop = $n[0].style.top;
    var oldPosition = $n[0].style.position;
    var oldZIndex = $n[0].style.zIndex;
    var oldMarginBottom = $n[0].style.marginBottom;

    var outerHeight = $n.outerHeight(); // not margin
    var marginBottom = parseInt($n.css('margin-bottom'));

    // TODO: test interesting elements like table rows, etc.
    var placeholder = $(document.createElement($n[0].nodeName));
    var placeholderHeight = outerHeight + marginBottom;
    placeholder.css('height', placeholderHeight);
    // insert placeholder
    $n.before(placeholder);

    // move node
    if ($newNext)
      $newNext.before($n);
    else
      $n.parent().append($n);

    // XXX would tracking "left" as well as "top" magically get us
    // horizontal re-ordering?
    $n.css({marginBottom: -outerHeight,
            position: 'relative',
            zIndex: 2,
            top: 0});
    var vOffset = placeholder.offset().top - $n.offset().top;
    $n.css('top', vOffset);

    $({t:0}).animate({t:1}, {
      duration: MOVE_DURATION,
      step: function (t, fx) {
        var curPlaceholderHeight = Math.round(placeholderHeight * (1-t));
        var curMarginBottom = marginBottom - curPlaceholderHeight;
        var curTop = (-curPlaceholderHeight +
                      Math.round((1-t) * (vOffset + placeholderHeight)));
        $n.css({marginBottom: curMarginBottom,
                top: curTop});
        placeholder.css('height', curPlaceholderHeight);
      },
      progress: function (a, t) {
        //          if (t >= 0.5) {
        //            console.log(a);
        //            a.stop();
        //          }
      },
      complete: function () {
        placeholder.remove();
        $n[0].style.top = oldTop;
        $n[0].style.position = oldPosition;
        $n[0].style.zIndex = oldZIndex;
        $n[0].style.marginBottom = oldMarginBottom;
      }
    });
  };

}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // code to run on server at startup
  });
}
