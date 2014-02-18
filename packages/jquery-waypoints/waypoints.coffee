###
jQuery Waypoints - v2.0.4
Copyright (c) 2011-2014 Caleb Troughton
Dual licensed under the MIT license and GPL license.
https://github.com/imakewebthings/jquery-waypoints/blob/master/licenses.txt
###
((root, factory) ->
  if typeof define is 'function' and define.amd
    define 'waypoints', ['jquery'], ($) ->
      factory $, root
  else
    factory root.jQuery, root
) this, ($, window) ->
  $w = $ window

  # Touch support feature test
  isTouch = 'ontouchstart' in window

  # Internal plugin-wide variables:

  # - allWaypoints: A hash containing two hashes, one for vertical waypoints
  #   and one for horizontal waypoints. In each hash they value is a Waypoint
  #   instance and the key is that waypoint's unique ID.

  # - contextCounter: A counter that is incremented with each instantiation
  #   of the Context class, used in its unique ID.

  # - contexts: A hash of all contexts. The value of each entry is a Context
  #   instance and the key is that context's unique ID.

  # - contextKey: The DOM element for each context keeps a reference to the
  #   context's unique ID in the jQuery .data() object. This is the key for
  #   that data entry.

  # - resizeEvent: The namespaced resize event used by contexts.

  # - scrollEvent: The namespaced scroll event used by contexts.

  # - waypointCounter: A counter that is incremented with each instantiation
  #   of the Waypoint class, used in its unique ID.

  # - waypointKey: The DOM element for each waypoint keeps a reference to an
  #   array of the unique IDs of all waypoints attached to that element. This
  #   array is kept in the jQuery .data() object, and this is the key for
  #   that entry.

  # - wp: A variable shortcut for the waypoint method name on the $.fn object.
  #   Using this variable just helps with minification.

  # - wps: A variable shortcut for the waypoints method name on the $ object.
  #   Using this variable just helps with minification.

  allWaypoints = 
    horizontal: {}
    vertical: {}
  contextCounter = 1
  contexts = {}
  contextKey = 'waypoints-context-id'
  resizeEvent = 'resize.waypoints'
  scrollEvent = 'scroll.waypoints'
  waypointCounter = 1
  waypointKey = 'waypoints-waypoint-ids'
  wp = 'waypoint'
  wps = 'waypoints'

  # Context: Represents a single scrolling element in which waypoints live.
  # For most users there will only be one Context, the window, but users can
  # use other scrollable elements as a context using the "context" option
  # when creating waypoints.

  # Properties:

  # - $element: jQuery object containing the context element.

  # - element: The raw HTMLNode of the context element.

  # - didResize: A flag used in throttling the resize event.

  # - didScroll: A flag used in throttling the scroll event.

  # - id: A unique identifier for the context.

  # - oldScroll: A hash containing...
  #   - x: The context's last known horizontal scroll value.
  #   - y: The context's last known vertical scroll value.

  # - waypoints: A hash containing two hashes with all waypoints in the context.
  #   Entries are in the same style as the allWaypoints hashes:
  #   (key = waypoint.id, value = waypoint)
  #   - horizontal: A hash of all horizontal waypoints.
  #   - vertical: A hash of all vertical waypoints.

  class Context
    constructor: ($element) ->
      @$element = $element
      @element = $element[0]
      @didResize = no
      @didScroll = no
      @id = 'context' + contextCounter++
      @oldScroll =
        x: $element.scrollLeft()
        y: $element.scrollTop()
      @waypoints =
        horizontal: {}
        vertical: {}
      
      # We need to keep a reference to this Context instance on the DOM node
      # so we can look it up later based on the node.
      @element[contextKey] = @id

      # To do that look up, we need to have this instance in the global hash.
      contexts[@id] = this

      # Run scroll checks on scroll, but throttle it for performance reasons.
      $element.bind scrollEvent, =>
        unless @didScroll or isTouch
          @didScroll = yes
          scrollHandler = =>
            @doScroll()
            @didScroll = no
          window.setTimeout scrollHandler, $[wps].settings.scrollThrottle

      # Run a refresh on resize, but throttle it for performance reasons.
      $element.bind resizeEvent, =>
        unless @didResize
          @didResize = yes
          resizeHandler = =>
            $[wps] 'refresh'
            @didResize = no
          window.setTimeout resizeHandler, $[wps].settings.resizeThrottle

    # doScroll()

    # Looks at the new scroll values for the context, compares them to the old
    # scroll values, and checks to see if any waypoints should be triggered
    # by that change.
    doScroll: ->

      # We use some hashes with common values for each axis so that we can
      # just iterate over it rather than write the whole thing twice for
      # each axis.
      axes =
        horizontal:
          newScroll: @$element.scrollLeft()
          oldScroll: @oldScroll.x
          forward: 'right'
          backward: 'left'
        vertical:
          newScroll: @$element.scrollTop()
          oldScroll: @oldScroll.y
          forward: 'down'
          backward: 'up'

      # This is a small "hack" for iOS, needed because scrolls in mobile
      # Safari that start or end with the URL bar showing will cause window
      # height changes without firing a resize event.
      if isTouch and (!axes.vertical.oldScroll or !axes.vertical.newScroll)
          $[wps] 'refresh'

      # For each axis, check to see if any waypoints have been crossed.
      # Also determine the direction it's being crossed and sort/reverse all
      # crossed waypoints accordingly. And, of course, trigger the waypoints.
      $.each axes, (aKey, axis) =>
        triggered = []
        isForward = axis.newScroll > axis.oldScroll
        direction = if isForward then axis.forward else axis.backward
        $.each @waypoints[aKey], (wKey, waypoint) ->
          if axis.oldScroll < waypoint.offset <= axis.newScroll
            triggered.push waypoint
          else if axis.newScroll < waypoint.offset <= axis.oldScroll
            triggered.push waypoint
        triggered.sort (a, b) -> a.offset - b.offset
        triggered.reverse() unless isForward
        $.each triggered, (i, waypoint) ->
          if waypoint.options.continuous or i is triggered.length - 1
            waypoint.trigger [direction]

      # Now that we're done with the check, the new scroll values become
      # the old scroll values for the next check.
      @oldScroll =
        x: axes.horizontal.newScroll
        y: axes.vertical.newScroll

    # refresh()
    # Runs through all of the waypoints in the context and recalculates
    # their offsets (the scroll value at which the waypoint is triggered.)
    # If a change in offset also happens to cross the context's current
    # scroll value, the waypoint will be triggered in the appropriate direction
    # unless prevented by the "onlyOnScroll" waypoint option.
    refresh: () ->
      isWin = $.isWindow @element
      cOffset = @$element.offset()

      # Make sure we have the most up-to-date scroll values for our context.
      @doScroll()

      # Each axis recalculation needs to know some things:

      # - contextOffset: The distance between the edge of the document and
      #   the context element.
      
      # - contextScroll: The scroll value of the context. However, if the
      #   context is the window this needs to be 0 because this value only
      #   comes into play when used in adjustment calculations for non-window
      #   context waypoints.

      # - contextDimension: Width or height of the context.

      # - oldScroll: The scroll value of the context. Unlike "contextScroll",
      #   this is the same no matter the type of context, and is used when
      #   determining whether a newly added waypoint should immediately fire
      #   on its first offset calculation.

      # - forward: Direction string passed to forward waypoint triggers.

      # - backward: Direction string passed to backward waypoint triggers.

      # - offsetProp: Key of the .offset() object for this axis.
      axes =
        horizontal:
          contextOffset: if isWin then 0 else cOffset.left
          contextScroll: if isWin then 0 else @oldScroll.x
          contextDimension: @$element.width()
          oldScroll: @oldScroll.x
          forward: 'right'
          backward: 'left'
          offsetProp: 'left'
        vertical:
          contextOffset: if isWin then 0 else cOffset.top
          contextScroll: if isWin then 0 else @oldScroll.y
          contextDimension: if isWin then $[wps]('viewportHeight') else \
            @$element.height()
          oldScroll: @oldScroll.y
          forward: 'down'
          backward: 'up'
          offsetProp: 'top'

      # For each axis, run through the waypoints. Store the old offset.
      # Recalculate the new offset. Check the difference against the context's
      # current scroll value and trigger any crossed waypoints accordingly.
      $.each axes, (aKey, axis) =>
        $.each @waypoints[aKey], (i, waypoint) ->
          adjustment = waypoint.options.offset
          oldOffset = waypoint.offset
          elementOffset = if $.isWindow waypoint.element then 0 else \
            waypoint.$element.offset()[axis.offsetProp]

          # The "offset" waypoint option (which we call "adjustment" here) can
          # be a number, percentage string, keyword string (bottom-in-view),
          # or a function. So we deal with all of these types here.
          if $.isFunction adjustment
            adjustment = adjustment.apply waypoint.element
          else if typeof adjustment is 'string'
            adjustment = parseFloat adjustment
            if waypoint.options.offset.indexOf('%') > -1
              adjustment = Math.ceil(axis.contextDimension * adjustment / 100)

          # We've finally calculated all the crazy little adjustments that
          # can come from using non-window contexts and the "offset" option.
          # Store the damn thing.
          waypoint.offset = elementOffset \
                          - axis.contextOffset \
                          + axis.contextScroll \
                          - adjustment

          # "onlyOnScroll" tells us to not even consider triggering waypoints
          # during refresh, so we can eject early.
          return if (waypoint.options.onlyOnScroll and oldOffset?) or \
                    !waypoint.enabled

          # Case where the refresh causes a backward trigger.
          if oldOffset isnt null and \
            oldOffset < axis.oldScroll <= waypoint.offset
              waypoint.trigger [axis.backward]

          # Now the forward case.
          else if oldOffset isnt null and \
            oldOffset > axis.oldScroll >= waypoint.offset
              waypoint.trigger [axis.forward]

          # "oldOffset" values of null mean this is the first calculation of
          # the waypoint's offset. It's a special time in a waypoint's life.
          else if oldOffset is null and axis.oldScroll >= waypoint.offset
            waypoint.trigger [axis.forward]

    # checkEmpty()

    # Looks at the waypoints hashes. If they are empty, the context removes
    # itself from the global contexts hash.
    checkEmpty: ->
      if $.isEmptyObject(@waypoints.horizontal) and \
        $.isEmptyObject(@waypoints.vertical)
          @$element.unbind [resizeEvent, scrollEvent].join(' ')
          delete contexts[@id]

  # Waypoint: Represents a single callback function tied to an element. An
  # element can have multiple waypoints with multiple offsets.

  # Properties:

  # - $element: jQuery object containing the waypoint element.

  # - element: The raw HTMLNode of the waypoint element.

  # - axis: 'horizontal' || 'vertical' - The axis on which this waypoint lives.

  # - callback: The function that is fired when the waypoint is triggered.

  # - context: A reference to the context this waypoint belongs to.

  # - enabled: Boolean indicating whether this waypoint is enabled or not.
  #   Disabled waypoints are still returned in functions that aggregate
  #   waypoints, but do not fire their callbacks.

  # - id: A unique identifier for the waypoint.

  # - offset: The scroll offset at which the waypoint should trigger.

  # - options: A hash containing the various waypoint options.
  #   See $.fn.waypoint.defaults for more information on those options.
  class Waypoint
    constructor: ($element, context, options) ->
      options = $.extend {}, $.fn[wp].defaults, options
      if options.offset is 'bottom-in-view'
        options.offset = ->
          contextHeight = $[wps] 'viewportHeight'
          unless $.isWindow context.element
            contextHeight = context.$element.height()
          contextHeight - $(this).outerHeight()

      @$element = $element
      @element = $element[0]
      @axis = if options.horizontal then 'horizontal' else 'vertical'
      @callback = options.handler
      @context = context
      @enabled = options.enabled
      @id = 'waypoints' + waypointCounter++
      @offset = null
      @options = options

      # Add our new waypoint to its context.
      context.waypoints[@axis][@id] = this

      # Add it to the global hash.
      allWaypoints[@axis][@id] = this

      # Add the waypoint's id to the element's waypoint id list.
      idList = @element[waypointKey] ? []
      idList.push @id
      @element[waypointKey] = idList
    
    # trigger(array)

    # Calls the waypoint's callback function, passing to it the arguments
    # supplied in the "args" array.
    trigger: (args) ->
      return unless @enabled
      if @callback?
        @callback.apply @element, args
      if @options.triggerOnce
        @destroy()

    # disable()

    # Temporarily disables a waypoint from firing its callback.
    disable: ->
      @enabled = false

    # enable()

    # Breathe life back into the waypoint.
    enable: ->
      @context.refresh()
      @enabled = true

    # destroy()

    # Kills the waypoint for good.
    destroy: ->
      delete allWaypoints[@axis][@id]
      delete @context.waypoints[@axis][@id]
      @context.checkEmpty()

    # Waypoint.getWaypointsByElement(HTMLNode)

    # Returns an array of all Waypoint instances attached to the "element"
    # HTMLNode. Returns an empty array if there are no attached waypoints.
    @getWaypointsByElement: (element) ->
      ids = element[waypointKey]
      return [] unless ids
      all = $.extend {}, allWaypoints.horizontal, allWaypoints.vertical
      $.map ids, (id) ->
        all[id]

  # These methods are available on the $.fn object by using the method
  # name as the first argument to .waypoint. Ex: $('div').waypoint('destroy')
  methods =

    # init(function, object)

    # Creates a new waypoint (and if needed, a new context) using the supplied
    # callback function and options.

    # The "f" function and the "options" object are both optional, but at least
    # one must be supplied. So acceptable signatures are:

    # - .waypoint(f)
    # - .waypoint(options)
    # - .waypoint(f, options)

    # This "init" method should never need to be called explicity by the user.
    # It is the default method that is delegated to when .waypoint is called
    # with one of the above signatures.

    # Ex: $('div').waypoint(function(direction) {
    #   // Do things
    # }, { offset: '100%' });
    init: (f, options) ->
      options ?= {}
      options.handler ?= f

      @each ->
        $this = $ this
        contextElement = options.context ? $.fn[wp].defaults.context
        unless $.isWindow contextElement
          contextElement = $this.closest contextElement
        contextElement = $ contextElement
        context = contexts[contextElement[0][contextKey]]
        context = new Context contextElement unless context
        new Waypoint $this, context, options
      $[wps] 'refresh'
      this

    # Disable, enable, and destroy all just delegate to the instance methods
    # of the waypoints attached to the subject elements.
    disable: -> methods._invoke.call this, 'disable'
    enable: -> methods._invoke.call this, 'enable'
    destroy: -> methods._invoke.call this, 'destroy'

    # .waypoint('prev', string, string|HTMLNode|jQuery)

    # Returns a jQuery object containing previous waypoint elements. This
    # creates a new entry in the jQuery object stack just like jQuery's prev
    # function. "axis" indicates the axis on which to traverse
    # ('horizontal' | 'vertical') and "selector" indicates which context
    # element to use. The defaults are 'vertical' and window respectively.
    prev: (axis, selector) ->
      methods._traverse.call this, axis, selector, (stack, index, waypoints) ->
        stack.push waypoints[index-1] if index > 0

    # .waypoint('next', string, string|HTMLNode|jQuery)

    # Returns a jQuery object containing next waypoint elements. This
    # creates a new entry in the jQuery object stack just like jQuery's next
    # function. "axis" indicates the axis on which to traverse
    # ('horizontal' | 'vertical') and "selector" indicates which context
    # element to use. The defaults are 'vertical' and window respectively.
    next: (axis, selector) ->
      methods._traverse.call this, axis, selector, (stack, index, waypoints) ->
        stack.push waypoints[index+1] if index < waypoints.length-1

    # Internal: Aggregates waypoints on a given axis of a context, and applies
    # a "push" callback for each element in the subject jQuery object. This
    # callback builds the element array to push to the jQuery stack.
    _traverse: (axis = 'vertical', selector = window, push) ->
      waypoints = jQMethods.aggregate selector
      stack = []
      @each ->
        index = $.inArray this, waypoints[axis]
        push stack, index, waypoints[axis]
      @pushStack stack

    # Internal: Finds all waypoints on a given set of "$elements" and invokes
    # "method" on each instance.
    _invoke: (method) ->
      this.each ->
        waypoints = Waypoint.getWaypointsByElement this
        $.each waypoints, (i, waypoint) ->
          waypoint[method]()
          true
      this

  # $.fn.waypoint. Let's just hook this guy up to our methods hash and
  # add some trivial error reporting for bogus calls.
  $.fn[wp] = (method, args...) ->
    if methods[method]
      methods[method].apply this, args
    else if $.isFunction(method)
      methods.init.apply this, arguments
    else if $.isPlainObject(method)
      methods.init.apply this, [null, method]
    else if !method
      $.error "jQuery Waypoints needs a callback function or handler option."
    else
      $.error "The #{method} method does not exist in jQuery Waypoints."

  # The default options object for a waypoint.

  # - context: string|HTMLNode|jQuery - The scrollable element that the
  #   waypoint acts within. The waypoint will look for the closest ancestor
  #   element that matches this selector or node.

  # - continuous: Multiple waypoints may be triggered by a single scroll check.
  #   If you would like a waypoint to only trigger if it is the last waypoint
  #   in a scroll check, set this to false.

  # - enabled: Should this waypoint start enabled (true) or disabled (false)?

  # - handler: This option is not defined by default, but can be used as an
  #   alternate way to pass the waypoint callback function, rather than as
  #   the first argument to .waypoint.

  #   Ex: $('div').waypoint({
  #     handler: function(direction) { ... }
  #   });

  # - horizontal: Set this to true if the waypoint is, well, horizontal.

  # - offset: number|string|function - Determines how far from the top (or left
  #   if the waypoint is horizontal) of the context's viewport to trigger the
  #   waypoint. The default of 0 means that the waypoint is triggered when the
  #   top of the waypoint element hits the top of the window/context-element.
  #   An offset of 50 would mean the waypoint triggers when the top of the
  #   element is 50 pixels from the top of the window.

  #   A % string is translated into a percentage of the width/height of
  #   the context.

  #   If a function is passed, that function should return a number. The "this"
  #   keyword within this function will be set to the raw HTMLNode of the
  #   waypoint element.

  # - triggerOnce: If true, the waypoint will destroy itself after
  #   first trigger.
  $.fn[wp].defaults =
    context: window
    continuous: true
    enabled: true
    horizontal: false
    offset: 0
    triggerOnce: false
    
  # These methods are available on the $ object by using the method name as
  # the first argument to .waypoint. Ex: $.waypoints('refresh')
  jQMethods =

    # $.waypoints('refresh')

    # Forces a refresh on all contexts, recalculating all waypoint offsets.
    # This is done automatically on waypoint addition and during resize events,
    # but if a user does something to change the DOM, CSS, or in some way
    # change the layout of a page and its elements, they might need to call
    # this method manually.
    refresh: ->
      $.each contexts, (i, context) -> context.refresh()
    
    # $.waypoints('viewportHeight')

    # A utility method that returns the window height, but takes into account
    # inconsistencies that come with just using jQuery's .height() on iOS.
    viewportHeight: ->
      window.innerHeight ? $w.height()

    # $.waypoints(['aggregate'], [contextSelector])

    # Returns an object containing two HTMLNode arrays, one for each axis:

    # {
    #   horizontal: [ HTMLNode... ]
    #   vertical: [ HTMLNode... ]
    # }
      
    # This is the default method used when calling $.waypoints(). If
    # "contextSelector" is not supplied, it returns all waypoints. If
    # "contextSelector" is supplied it only returns waypoints for that context.

    # The array of waypoint elements is returned sorted by calculated offset,
    # the order in which they would be triggered on the page.
    aggregate: (contextSelector) ->
      collection = allWaypoints
      if contextSelector
        collection = contexts[$(contextSelector)[0][contextKey]]?.waypoints
      return [] unless collection
      waypoints =
        horizontal: []
        vertical: []
      $.each waypoints, (axis, arr) ->
        $.each collection[axis], (key, waypoint) ->
          arr.push waypoint
        arr.sort (a, b) -> a.offset - b.offset
        waypoints[axis] = $.map arr, (waypoint) -> waypoint.element
        waypoints[axis] = $.unique waypoints[axis]
      waypoints

    # $.waypoints('above', [string|HTMLNode|jQuery])

    # Returns all vertical waypoints that lie above the current scroll position
    # of the context specified by "contextSelector". If no "contextSelector"
    # is supplied, it defaults to the window.
    above: (contextSelector = window) ->
      jQMethods._filter contextSelector, 'vertical', (context, waypoint) ->
        waypoint.offset <= context.oldScroll.y

    # $.waypoints('below', [string|HTMLNode|jQuery])

    # Returns all vertical waypoints that lie below the current scroll position
    # of the context specified by "contextSelector". If no "contextSelector"
    # is supplied, it defaults to the window.
    below: (contextSelector = window) ->
      jQMethods._filter contextSelector, 'vertical', (context, waypoint) ->
        waypoint.offset > context.oldScroll.y

    # $.waypoints('left', [string|HTMLNode|jQuery])

    # Returns all horizontal waypoints left of the current scroll position
    # of the context specified by "contextSelector". If no "contextSelector"
    # is supplied, it defaults to the window.
    left: (contextSelector = window) ->
      jQMethods._filter contextSelector, 'horizontal', (context, waypoint) ->
        waypoint.offset <= context.oldScroll.x

    # $.waypoints('right', [string|HTMLNode|jQuery])

    # Returns all horizontal waypoints right of the current scroll position
    # of the context specified by "contextSelector". If no "contextSelector"
    # is supplied, it defaults to the window.
    right: (contextSelector = window) ->
      jQMethods._filter contextSelector, 'horizontal', (context, waypoint) ->
        waypoint.offset > context.oldScroll.x

    # $.waypoints('enable/disable/destroy')

    # These methods delegate to the enable/disable/destroy instance methods 
    # for all waypoints.
    enable: -> jQMethods._invoke 'enable'
    disable: -> jQMethods._invoke 'disable'
    destroy: -> jQMethods._invoke 'destroy'

    # $.waypoints('extendFn', string, function)

    # Extends the $.fn.waypoint method object with a new method, "f". This
    # just lets other modules piggyback on the .waypoint namespace.
    extendFn: (methodName, f) ->
      methods[methodName] = f

    # Internal: Invokes "method" on all waypoints.
    _invoke: (method) ->
      waypoints = $.extend {}, allWaypoints.vertical, allWaypoints.horizontal
      $.each waypoints, (key, waypoint) ->
        waypoint[method]()
        true

    # Internal: Returns an array of all HTMLNodes for each waypoint that passes
    # the "test" function. Only waypoints within the "selector" context on the
    # "axis" axis are tested. As with .aggregate, the array is sorted by
    # calculated offset (trigger order).
    _filter: (selector, axis, test) ->
      context = contexts[$(selector)[0][contextKey]]
      return [] unless context
      waypoints = []
      $.each context.waypoints[axis], (i, waypoint) ->
        waypoints.push waypoint if test context, waypoint
      waypoints.sort (a, b) -> a.offset - b.offset
      $.map waypoints, (waypoint) -> waypoint.element

  # Hook up jQMethods to the $.waypoints namespace.
  $[wps] = (method, args...) ->
    if jQMethods[method]
      jQMethods[method].apply null, args
    else
      jQMethods.aggregate.call null, method

  # Plugin-wide settings:

  # - resizeThrottle: For performance reasons, the refresh performed during
  #   resizes is throttled. This value is the rate-limit in milliseconds
  #   between resize refreshes. For more information on throttling, check out
  #   Ben Alman’s throttle / debounce plugin.
  #   http://benalman.com/projects/jquery-throttle-debounce-plugin/

  # - scrollThrottle: For performance reasons, checking for any crossed
  #   waypoints during a scroll event is throttled. This value is the
  #   rate-limit in milliseconds between scroll checks. For more information
  #   on throttling, check out Ben Alman’s throttle / debounce plugin.
  #   http://benalman.com/projects/jquery-throttle-debounce-plugin/

  $[wps].settings =
    resizeThrottle: 100
    scrollThrottle: 30

  # Ensure a refresh on page load. Newly loaded images often shift layout.
  $w.load -> $[wps] 'refresh'
