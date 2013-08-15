// To use this package, there are a few restrictions on your markup
// and css:
//
// - Elements being animated may not have margin-top set. This is
//   because of margin collapsing.

var ANIMATION_DURATION = 2000;

// animate margin-bottom more quickly than height
var MARGIN_ACCEL = 4;

// Assumes `$n` represents one element.
var scaleTowardsTop = function ($n, fraction) {
  var t = fraction;

  // Todo: Make this work in IE8.
  // - Use feature detection (see link) to detect whether we
  //   have "transform" (with any vendor prefix),
  //   otherwise whether we have "filter".
  //   https://github.com/louisremi/jquery.transform.js/blob/master/jquery.transform2d.js
  // - For IE 8, set 'filter' to
  //   something like
  //   `"progid:DXImageTransform.Microsoft.Matrix(M11=1, M12=0, M21=0, M22=0.5, SizingMethod='auto expand')"`
  $n.css({transform: 'translateY(' +
          (-(1-t)/2*100) + '%) scaleY(' + t + ')'});
  $n[0]._scaleTowardsTop_fraction = fraction;
};

var removeScale = function ($n) {
  // jQuery handles the vendor prefix for us
  // (like -webkit-transform)
  // See: http://caniuse.com/#feat=transforms2d
  $n.css({transform: ''});
  try {
    delete $n[0]._scaleTowardsTop_fraction;
  } catch (e) {
    // IE 8 doesn't let you delete expandos?
    $n[0]._scaleTowardsTop_fraction = null;
  }
};

var getScale = function ($n) {
  var fraction = $n[0]._scaleTowardsTop_fraction;
  return (typeof fraction === 'number') ? fraction : 1;
};

var apply = function (el, events) {
  var animateInsert = function (n, parent, next) {
    parent.insertBefore(n, next);

    var $n = $(n);
    var ownMarginBottom = n.style.marginBottom;
    var ownOpacity = n.style.opacity;
    var marginBottom = parseInt($n.css('margin-bottom'));
    var opacity = parseFloat($n.css('opacity'));

    var outerHeight = $n.outerHeight(); // without margin
    $n.css({marginBottom: -outerHeight,
            opacity: 0});

    $({t:0}).animate({t:1}, {
      duration: ANIMATION_DURATION,
      step: function (t, fx) {
        var curMarginBottom = -outerHeight + t*outerHeight +
              Math.round(Math.min(MARGIN_ACCEL*t, 1) * marginBottom);
        $n.css({marginBottom: curMarginBottom});
        scaleTowardsTop($n, t);
        $n.css({opacity: t*opacity});
      },
      complete: function () {
        n.style.marginBottom = ownMarginBottom;
        n.style.opacity = ownOpacity;
        removeScale($n);
      }
    });
  };

  var animateRemove = function (n) {
    var $n = $(n);
    var marginBottom = parseInt($n.css('margin-bottom'));
    var outerHeight = $n.outerHeight(); // without margin
    var opacity = parseFloat($n.css('opacity'));
    var scale = getScale($n);

    $({t:0}).animate({t:1}, {
      duration: ANIMATION_DURATION,
      step: function (t, fx) {
        // animate margin-bottom more quickly than height
        var f = 1 - t;
        var curMarginBottom = -outerHeight + f*scale*outerHeight +
              Math.round(Math.min(MARGIN_ACCEL*f, 1) * marginBottom);
        $n.css({marginBottom: curMarginBottom});
        scaleTowardsTop($n, f*scale);
        $n.css({opacity: f*opacity});
      },
      complete: function () {
        n.parentNode.removeChild(n);
      }
    });
  };

  var animateMove = function (n, next) {
    var $n = $(n);

    // we don't use jQuery's `.css()` for these because we want the
    // element's own style, not the computed style
    var ownTop = $n[0].style.top;
    var ownPosition = $n[0].style.position;
    var ownZIndex = $n[0].style.zIndex;
    var ownMarginBottom = $n[0].style.marginBottom;

    var outerHeight = $n.outerHeight(); // without margin
    var marginBottom = parseInt($n.css('margin-bottom'));

    // TODO: test interesting elements like table rows, etc.
    var placeholder = document.createElement($n[0].nodeName);
    var $placeholder = $(placeholder);
    var placeholderHeight = outerHeight + marginBottom;
    $placeholder.css({height: placeholderHeight,
                      border: 0,
                      margin: 0,
                      padding: 0,
                      visibility: 'hidden'});
    // insert placeholder
    n.parentNode.insertBefore(placeholder, n);

    // move node
    if (next)
      n.parentNode.insertBefore(n, next);
    else
      n.parentNode.appendChild(n);

    // XXX would tracking "left" as well as "top" magically get us
    // horizontal re-ordering?
    $n.css({marginBottom: -outerHeight,
            position: 'relative',
            zIndex: 2,
            top: 0});
    var vOffset = $placeholder.offset().top - $n.offset().top;
    $n.css('top', vOffset);

    $({t:0}).animate({t:1}, {
      duration: ANIMATION_DURATION,
      step: function (t, fx) {
        var curPlaceholderHeight = Math.round(placeholderHeight * (1-t));
        var curMarginBottom = marginBottom - curPlaceholderHeight;
        var curTop = (-curPlaceholderHeight +
                      Math.round((1-t) * (vOffset + placeholderHeight)));
        $n.css({marginBottom: curMarginBottom,
                top: curTop});
        $placeholder.css('height', curPlaceholderHeight);
      },
      complete: function () {
        $placeholder.remove();
        n.style.top = ownTop;
        n.style.position = ownPosition;
        n.style.zIndex = ownZIndex;
        n.style.marginBottom = ownMarginBottom;
      }
    });
  };

  if ($(el)[0].$uihooks)
    throw new Error("Can't use #AnimatedEach on an element already decorated with ui hooks");
  $(el)[0].$uihooks = {};

  events = events || ['add', 'remove', 'move'];

  // xcxc make these events accept functions, so that we can not
  // animate initial data but still animate subsequent inserts
  if (_.contains(events, 'add')) {
    $(el)[0].$uihooks.insertElement = function (n, parent, next) {
      animateInsert(n, parent, next);
    };
  }

  if (_.contains(events, 'remove')) {
    $(el)[0].$uihooks.removeElement = function (n) {
      animateRemove(n);
    };
  }


  if (_.contains(events, 'move')) {
    $(el)[0].$uihooks.moveElement = function (n, parent, next) {
      animateMove(n, next);
    };
  }
};

AnimatedList = Package.ui.Component.extend({
  typeName: 'AnimatedList',
  render: function (buf) {
    buf.write(this.content);
  },
  attached: function () {
    var self = this;
    var childEls = _.filter(self.$('*'), function (n) {
      return n.parentNode === self.firstNode().parentNode;
    }); // xcxc we'd like something like jquery's `.children()`
    if (childEls.length !== 1)
      throw new Error("#AnimatedList must have precisely one top-level child element");
    apply(childEls, self.events && self.events.split(' '));
  }
});
