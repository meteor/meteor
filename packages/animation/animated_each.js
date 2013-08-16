// To use this package, there are a few restrictions on your markup
// and css:
//
// - Elements being animated may not have margin-top set. This is
//   because of margin collapsing.
// - Elements are expected to have position "relative" or "static"
//   (the default).
// - Elements must have top "auto" or "0", because "top" is used to
//   animate moves.

var ANIMATION_DURATION = 500;

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
};

var removeScale = function ($n) {
  // jQuery handles the vendor prefix for us
  // (like -webkit-transform)
  // See: http://caniuse.com/#feat=transforms2d
  $n.css({transform: ''});
};

var ANIMATION_STATE_EXPANDO = '_meteorUIAnimateState';

var getAnimationState = function ($n) {
  var n = $n[0];
  var state = n[ANIMATION_STATE_EXPANDO];
  if (! state) {
    state = (n[ANIMATION_STATE_EXPANDO] = {});
    // values in "style" attribute for restoring at end
    state.ownMarginBottom = n.style.marginBottom;
    state.ownOpacity = n.style.opacity;
    // computed styles to animate towards on insert
    state.fullMarginBottom = parseInt($n.css('margin-bottom'), 10);
    state.fullOpacity = parseFloat($n.css('opacity'));
    state.fullHeight = $n.outerHeight(); // border box, w/o margin

    state.currentAnimation = null;
    state.$n = $n;
  }
  return state;
};

var clearAnimationState = function ($n) {
  var n = $n[0];
  try {
    delete n[ANIMATION_STATE_EXPANDO];
  } catch (e) {
    // IE 8 can't delete expandos?
    n[ANIMATION_STATE_EXPANDO] = null;
  }
};

var showHideStep = function (t, fx) {
  var state = fx.elem;
  var fullHeight = state.fullHeight;
  var fullMarginBottom = state.fullMarginBottom;
  var $n = state.$n;
  var fullOpacity = state.fullOpacity;

  var curMarginBottom = -fullHeight + t*fullHeight +
        Math.round(Math.min(MARGIN_ACCEL*t, 1) * fullMarginBottom);
  $n.css({marginBottom: curMarginBottom});
  scaleTowardsTop($n, t);
  $n.css({opacity: t*fullOpacity});
};

var apply = function (el, events) {
  var animateInsert = function (n, parent, next) {
    parent.insertBefore(n, next);

    var $n = $(n);
    var state = getAnimationState($n);

    if (state.currentAnimation)
      state.currentAnimation.stop();
    else
      state.t = 0;

    $n.css({marginBottom: -state.outerHeight,
            opacity: 0});

    $(state).animate({t:1}, {
      duration: ANIMATION_DURATION,
      step: showHideStep,
      // If the animation is queued, then even if stopped it
      // blocks another animation on the same state object.
      // Note: other possibilities here, like a named queue
      queue: false,
      start: function (fx) {
        state.currentAnimation = fx;
      },
      complete: function () {
        n.style.marginBottom = state.ownMarginBottom;
        n.style.opacity = state.ownOpacity;
        removeScale($n);
        clearAnimationState($n);
      }
    });
  };

  var animateRemove = function (n) {
    var $n = $(n);
    var state = getAnimationState($n);

    if (state.currentAnimation)
      state.currentAnimation.stop();
    else
      state.t = 1;

    $(state).animate({t:0}, {
      duration: ANIMATION_DURATION,
      step: showHideStep,
      queue: false,
      start: function (fx) {
        state.currentAnimation = fx;
      },
      complete: function () {
        n.parentNode.removeChild(n);
        clearAnimationState($n);
      }
    });
  };

  var MOVE_QUEUE = "meteor-ui-move";

  var animateMove = function (n, next) {
    var $n = $(n);

    var getFlowHeight = function ($elem) {
      return $elem.outerHeight() +
        parseInt($elem.css('margin-bottom'), 10);
    };

    var addToTop = function ($elem, px) {
      // We use a queue so that `animateMove` can stop only its own
      // animations.  We don't actually enqueue more than one
      // animation at a time.
      $elem.stop(MOVE_QUEUE, true); // clear queue
      var top = parseInt($elem.css('top'), 10) || 0;
      top += px;
      $elem.css({top: top, position: 'relative'});
      // after setting `top`, animate it to 0.
      $elem.animate({top: 0},
                    {duration: ANIMATION_DURATION,
                     queue: MOVE_QUEUE,
                     progress: function (a) {
                       // in case we were nabbed by a Sortable or
                       // Draggable or something, end our animation
                       // early.
                       if ($elem.css('position') === 'absolute')
                         a.stop(true); // skip to end of anim
                     }
                    }).dequeue(MOVE_QUEUE);
      // XXX On complete, we'd like to remove 'position: relative' and
      // 'top: 0', but we have to be careful if there is an "add"
      // animation happening.  Probably need some cross-animation
      // mechanism for restoring elements to a pristine state
      // only when all animations have finished.
    };

    var flowHeight = getFlowHeight($n);

    var nOffset = 0;

    // Determine the vertical displacement that we expect moving
    // `n` to create in `n` and the elements between `n` and
    // `next`, and counteract it by adding appropriate positive
    // or negative amounts to the `top` of each element.

    var mode = 0;
    for (var m = n.parentNode.firstChild; m; m = m.nextSibling) {
      var isElement = (m.nodeType === 1);
      if (mode === 0) {
        if (m === n) {
          mode = 1; // move is downwards
        } else if (m === next) {
          mode = 2; // move is upwards
          if (isElement) {
            var $m = $(m);
            addToTop($m, -flowHeight);
            nOffset += getFlowHeight($m);
          }
        }
      } else if (mode === 1) {
        // move is downwards, have seen n
        if (m === next)
          break;
        if (isElement) {
          var $m = $(m);
          addToTop($m, flowHeight);
          nOffset -= getFlowHeight($m);
        }
      } else if (mode === 2) {
        // move is upwards, have seen next
        if (m === n)
          break;
        if (isElement) {
          var $m = $(m);
          addToTop($m, -flowHeight);
          nOffset += getFlowHeight($m);
        }
      }
    }

    addToTop($n, nOffset);

    // move node
    if (next)
      n.parentNode.insertBefore(n, next);
    else
      n.parentNode.appendChild(n);
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
