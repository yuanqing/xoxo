/* global YT */
angular.module('youtube-embed', [])
.service ('youtubeEmbedUtils', ['$window', '$rootScope', function ($window, $rootScope) {
    var Service = {}

    // adapted from http://stackoverflow.com/a/5831191/1614967
    var youtubeRegexp = /https?:\/\/(?:[0-9A-Z-]+\.)?(?:youtu\.be\/|youtube(?:-nocookie)?\.com\S*[^\w\s-])([\w-]{11})(?=[^\w-]|$)(?![?=&+%\w.-]*(?:['"][^<>]*>|<\/a>))[?=&+%\w.-]*/ig;
    var timeRegexp = /t=(\d+)[ms]?(\d+)?s?/;

    function contains(str, substr) {
        return (str.indexOf(substr) > -1);
    }

    Service.getIdFromURL = function getIdFromURL(url) {
        var id = url.replace(youtubeRegexp, '$1');

        if (contains(id, ';')) {
            var pieces = id.split(';');

            if (contains(pieces[1], '%')) {
                // links like this:
                // "http://www.youtube.com/attribution_link?a=pxa6goHqzaA&amp;u=%2Fwatch%3Fv%3DdPdgx30w9sU%26feature%3Dshare"
                // have the real query string URI encoded behind a ';'.
                // at this point, `id is 'pxa6goHqzaA;u=%2Fwatch%3Fv%3DdPdgx30w9sU%26feature%3Dshare'
                var uriComponent = decodeURIComponent(pieces[1]);
                id = ('http://youtube.com' + uriComponent)
                        .replace(youtubeRegexp, '$1');
            } else {
                // https://www.youtube.com/watch?v=VbNF9X1waSc&amp;feature=youtu.be
                // `id` looks like 'VbNF9X1waSc;feature=youtu.be' currently.
                // strip the ';feature=youtu.be'
                id = pieces[0];
            }
        } else if (contains(id, '#')) {
            // id might look like '93LvTKF_jW0#t=1'
            // and we want '93LvTKF_jW0'
            id = id.split('#')[0];
        }

        return id;
    };

    Service.getTimeFromURL = function getTimeFromURL(url) {
        url = url || '';

        // t=4m20s
        // returns ['t=4m20s', '4', '20']
        // t=46s
        // returns ['t=46s', '46']
        // t=46
        // returns ['t=46', '46']
        var times = url.match(timeRegexp);

        if (!times) {
            // zero seconds
            return 0;
        }

        // assume the first
        var full = times[0],
            minutes = times[1],
            seconds = times[2];

        // t=4m20s
        if (typeof seconds !== 'undefined') {
            seconds = parseInt(seconds, 10);
            minutes = parseInt(minutes, 10);

        // t=4m
        } else if (contains(full, 'm')) {
            minutes = parseInt(minutes, 10);
            seconds = 0;

        // t=4s
        // t=4
        } else {
            seconds = parseInt(minutes, 10);
            minutes = 0;
        }

        // in seconds
        return seconds + (minutes * 60);
    };

    Service.ready = false;

    function applyServiceIsReady() {
        $rootScope.$apply(function () {
            Service.ready = true;
        });
    };

    // If the library isn't here at all,
    if (typeof YT === "undefined") {
        // ...grab on to global callback, in case it's eventually loaded
        $window.onYouTubeIframeAPIReady = applyServiceIsReady;
        console.log('Unable to find YouTube iframe library on this page.')
    } else if (YT.loaded) {
        Service.ready = true;
    } else {
        YT.ready(applyServiceIsReady);
    }

    return Service;
}])
.directive('youtubeVideo', ['$window', 'youtubeEmbedUtils', function ($window, youtubeEmbedUtils) {
    var uniqId = 1;

    // from YT.PlayerState
    var stateNames = {
        '-1': 'unstarted',
        0: 'ended',
        1: 'playing',
        2: 'paused',
        3: 'buffering',
        5: 'queued'
    };

    var eventPrefix = 'youtube.player.';

    $window.YTConfig = {
        host: 'https://www.youtube.com'
    };

    return {
        restrict: 'EA',
        scope: {
            videoId: '=?',
            videoUrl: '=?',
            player: '=?',
            playerVars: '=?',
            playerHeight: '=?',
            playerWidth: '=?'
        },
        link: function (scope, element, attrs) {
            // allows us to $watch `ready`
            scope.utils = youtubeEmbedUtils;

            // player-id attr > id attr > directive-generated ID
            var playerId = attrs.playerId || element[0].id || 'unique-youtube-embed-id-' + uniqId++;
            element[0].id = playerId;

            // Attach to element
            scope.playerHeight = scope.playerHeight || 390;
            scope.playerWidth = scope.playerWidth || 640;
            scope.playerVars = scope.playerVars || {};

            // YT calls callbacks outside of digest cycle
            function applyBroadcast () {
                var args = Array.prototype.slice.call(arguments);
                scope.$apply(function () {
                    scope.$emit.apply(scope, args);
                });
            }

            function onPlayerStateChange (event) {
                var state = stateNames[event.data];
                if (typeof state !== 'undefined') {
                    applyBroadcast(eventPrefix + state, scope.player, event);
                }
                scope.$apply(function () {
                    scope.player.currentState = state;
                });
            }

            function onPlayerReady (event) {
                applyBroadcast(eventPrefix + 'ready', scope.player, event);
            }

            function onPlayerError (event) {
                applyBroadcast(eventPrefix + 'error', scope.player, event);
            }

            function createPlayer () {
                var playerVars = angular.copy(scope.playerVars);
                playerVars.start = playerVars.start || scope.urlStartTime;
                var player = new YT.Player(playerId, {
                    height: scope.playerHeight,
                    width: scope.playerWidth,
                    videoId: scope.videoId,
                    playerVars: playerVars,
                    events: {
                        onReady: onPlayerReady,
                        onStateChange: onPlayerStateChange,
                        onError: onPlayerError
                    }
                });

                player.id = playerId;
                return player;
            }

            function loadPlayer () {
                if (scope.videoId || scope.playerVars.list) {
                    if (scope.player && typeof scope.player.destroy === 'function') {
                        scope.player.destroy();
                    }

                    scope.player = createPlayer();
                }
            };

            var stopWatchingReady = scope.$watch(
                function () {
                    return scope.utils.ready
                        // Wait until one of them is defined...
                        && (typeof scope.videoUrl !== 'undefined'
                        ||  typeof scope.videoId !== 'undefined'
                        ||  typeof scope.playerVars.list !== 'undefined');
                },
                function (ready) {
                    if (ready) {
                        stopWatchingReady();

                        // URL takes first priority
                        if (typeof scope.videoUrl !== 'undefined') {
                            scope.$watch('videoUrl', function (url) {
                                scope.videoId = scope.utils.getIdFromURL(url);
                                scope.urlStartTime = scope.utils.getTimeFromURL(url);

                                loadPlayer();
                            });

                        // then, a video ID
                        } else if (typeof scope.videoId !== 'undefined') {
                            scope.$watch('videoId', function () {
                                scope.urlStartTime = null;
                                loadPlayer();
                            });

                        // finally, a list
                        } else {
                            scope.$watch('playerVars.list', function () {
                                scope.urlStartTime = null;
                                loadPlayer();
                            });
                        }
                    }
            });

            scope.$watchCollection(['playerHeight', 'playerWidth'], function() {
                if (scope.player) {
                    scope.player.setSize(scope.playerWidth, scope.playerHeight);
                }
            });

            scope.$on('$destroy', function () {
                scope.player && scope.player.destroy();
            });
        }
    };
}]);
;(function () {
  // Compile and cache the needed regular expressions.
  var SPACE = /\s/g
  var LESS_THAN = />/g
  var MORE_THAN = /</g

  // We need to swap out these characters with their character-entity
  // equivalents because we're assigning the resulting string to
  // `ghost.innerHTML`.
  function escape (str) {
    return str.replace(SPACE, '&nbsp;')
              .replace(LESS_THAN, '&lt;')
              .replace(MORE_THAN, '&gt;')
  }

  // Create the `ghost` element, with inline styles to hide it and ensure
  // that the text is all on a single line.
  var GHOST_ELEMENT_ID = '__autosizeInputGhost'
  function createGhostElement () {
    var ghost = document.createElement('div')
    ghost.id = GHOST_ELEMENT_ID
    ghost.style.cssText = 'display:inline-block;height:0;overflow:hidden;position:absolute;top:0;visibility:hidden;white-space:nowrap;'
    document.body.appendChild(ghost)
    return ghost
  }

  // Create the `ghost` element.
  var ghost = createGhostElement()

  function autosizeInput (element, options) {
    // Copy all width-affecting styles to the ghost element
    var elementStyle = window.getComputedStyle(element)
    var elementCssText = 'box-sizing:' + elementStyle.boxSizing +
                        ';border-left:' + elementStyle.borderLeftWidth + ' solid black' +
                        ';border-right:' + elementStyle.borderRightWidth + ' solid black' +
                        ';font-family:' + elementStyle.fontFamily +
                        ';font-feature-settings:' + elementStyle.fontFeatureSettings +
                        ';font-kerning:' + elementStyle.fontKerning +
                        ';font-size:' + elementStyle.fontSize +
                        ';font-stretch:' + elementStyle.fontStretch +
                        ';font-style:' + elementStyle.fontStyle +
                        ';font-variant:' + elementStyle.fontVariant +
                        ';font-variant-caps:' + elementStyle.fontVariantCaps +
                        ';font-variant-ligatures:' + elementStyle.fontVariantLigatures +
                        ';font-variant-numeric:' + elementStyle.fontVariantNumeric +
                        ';font-weight:' + elementStyle.fontWeight +
                        ';letter-spacing:' + elementStyle.letterSpacing +
                        ';margin-left:' + elementStyle.marginLeft +
                        ';margin-right:' + elementStyle.marginRight +
                        ';padding-left:' + elementStyle.paddingLeft +
                        ';padding-right:' + elementStyle.paddingRight +
                        ';text-indent:' + elementStyle.textIndent +
                        ';text-transform:' + elementStyle.textTransform

    // Helper function that:
    // 1. Copies `font-family`, `font-size` and other styles of our `element` onto `ghost`.
    // 2. Sets the contents of `ghost` to the specified `str`.
    // 3. Copies the width of `ghost` onto our `element`.
    function set (str) {
      str = str || element.value || element.getAttribute('placeholder') || ''
      // Check if the `ghost` element still exists. If no, create it.
      if (document.getElementById(GHOST_ELEMENT_ID) === null) {
        ghost = createGhostElement()
      }
      ghost.style.cssText += elementCssText
      ghost.innerHTML = escape(str)
      var width = window.getComputedStyle(ghost).width
      element.style.width = width
      return width
    }

    // Call `set` on every `input` event (IE9+).
    element.addEventListener('input', function () {
      set()
    })

    // Initialise the `element` width.
    var width = set()

    // Set `min-width` if `options.minWidth` was set, and only if the initial
    // width is non-zero.
    if (options && options.minWidth && width !== '0px') {
      element.style.minWidth = width
    }

    // Return the `set` function.
    return set
  }

  if (typeof module === 'object') {
    module.exports = autosizeInput
  } else {
    window.autosizeInput = autosizeInput
  }
})()
;(function(root) {

  'use strict';

  // Sentinel to indicate that the playlist is currently stopped.
  var STOPPED = -1;

  // Sentinel to indicate that shuffling is turned off.
  var NOT_SHUFFLING = false;

  // No-op function.
  var noop = function() {};

  //
  // Swaps `arr[i]` and `arr[j]` in place.
  //
  var swap = function(arr, i, j) {
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
    return arr;
  };

  //
  // Generate an integer in the specified range.
  //
  var rand = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  //
  // Constructor.
  //
  var Jockey = function(items, opts) {

    // Allow `Jockey` to be called without the `new` keyword.
    if (!(this instanceof Jockey)) {
      return new Jockey(items, opts);
    }

    // The items in the playlist.
    this.items = items || [];

    // Callbacks.
    opts = opts || {};
    this.mc = opts.modelChange || noop;
    this.sc = opts.stateChange || noop;

    // If shuffling, this is a merely a shallow copy of the items in
    // `this.items`, but in a shuffled order.
    this.shuffled = NOT_SHUFFLING;

    // If not playing: `this.i` equals `STOPPED`.
    // If playing and shuffling: `this.i` refers to an item in `this.shuffled`,
    // ie. the currently-playing item is `this.shuffled[this.i]`.
    // If playing and not shuffling: `this.i` refers to an item in
    // `this.items`, ie. the currently-playing item is `this.items[this.i]`.
    this.i = STOPPED;

    // This flag will be `true` if we are repeating the playlist.
    this.repeatFlag = false;

    // This flag will be `true` if the playlist is paused.
    this.pauseFlag = false;
  };

  // Store a reference to the Jockey `prototype` to facilitate minification.
  var j = Jockey.prototype;

  //
  // Add `item` to `this.items`.
  //
  j.add = function(item) {

    // Throw if no `item`.
    if (item == null) {
      throw new Error('need an item');
    }

    // Add `item` to `this.items`.
    this.items.push(item);

    // Add `item` to `this.shuffled`.
    if (this.isShuffling()) {
      this.shuffled.push(item);

      // If playing, shuffle the "unplayed" subarray of `this.shuffled`. Else
      // shuffle the entire `this.shuffled` array.
      this._s(this.shuffled, this.isMounted() ? this.i + 1 : 0);
    }

    // Fire the model change callback.
    this.mc('add', this.items);
  };

  //
  // Remove the item at index `i` of `this.items`.
  //
  j.remove = function(i) {

    // Throw for invalid `i`.
    this._c(i);

    // Keep track of the currently-playing item.
    var currentItem = this.getCurrent();

    // Remove `item` from `this.items`.
    var item = this.items[i];
    this.items.splice(i, 1);

    // Remove `item` from `this.shuffled`. Update `i` to refer to an element
    // in `this.shuffled`.
    if (this.isShuffling()) {
      i = this.shuffled.indexOf(item);
      this.shuffled.splice(i, 1);
    }
    if (i < this.i) {

      // Decrement `this.i` if the removed `item` occurs before the
      // current-playing item. If shuffling, `i` refers to an item in
      // `this.shuffled`. Else `i` refers to an item in `this.items`.
      this.i--;
    } else {

      // Stop playing if the removed `item` is the currently-playing item.
      if (item == currentItem) {
        this.stop();
      }
    }

    // Fire the model change callback.
    this.mc('remove', this.items);
  };

  //
  // Set the item at index `i` of `this.items` to the specified `item`.
  //
  j.set = function(i, item) {

    // Throw for invalid `i`.
    this._c(i);

    // Throw if no `item`.
    if (item == null) {
      throw new Error('need an item');
    }

    // Set it in `this.items`.
    var oldItem = this.items[i];
    this.items[i] = item;

    // Update `this.shuffled` if we are shuffling.
    if (this.isShuffling()) {
      i = this.shuffled.indexOf(oldItem);
      this.shuffled[i] = item;
    }

    // Fire the model change callback.
    this.mc('set', this.items);
  };

  //
  // Returns the playlist size.
  //
  j.size = function() {
    return this.items.length;
  };

  //
  // If no `i` specified, returns all the items in the playlist. Else returns
  // the item at index `i` of the playlist.
  //
  j.get = function(i) {

    // Return `this.items`.
    if (i == null) {
      return this.items;
    }

    // Throw for invalid `i`, else returns the item at index `i`.
    this._c(i);
    return this.items[i];
  };

  //
  // If playing, returns the index of the currently-playing item in
  // `this.items`. Else returns `STOPPED`.
  //
  j.getCurrentIndex = function() {
    if (this.isMounted()) {

      // If shuffling, lookup the index of the currently-playing element
      // in `this.items`, else just return `this.i`.
      return this.isShuffling() ?
        this.items.indexOf(this.getCurrent()) :
        this.i;
    }
    return STOPPED;
  };

  //
  // If playing, returns the currently-playing item. Else returns `null`.
  //
  j.getCurrent = function() {
    if (this.isMounted()) {
      return this.isShuffling() ?
        this.shuffled[this.i] :
        this.items[this.i];
    }
    return null;
  };

  //
  // Returns `true` if the playlist is stopped.
  //
  j.isStopped = function() {
    return this.i === STOPPED;
  };

  //
  // Returns `true` if an item is mounted ie. not stopped.
  //
  j.isMounted = function() {
    return !this.isStopped();
  };

  //
  // Returns `true` if the playlist is playing.
  //
  j.isPlaying = function() {
    return !this.isStopped() && !this.pauseFlag;
  };

  //
  // Returns `true` is the playlist is paused.
  //
  j.isPaused = function() {
    return !this.isStopped() && this.pauseFlag;
  };

  //
  // If no `i` specified: If shuffling, plays the item at index 0 of
  // `this.shuffled`, else plays the item at index 0 of `this.items`.
  // If `i` specified: Plays the item at index `i` of `this.items`.
  //
  j.play = function(i) {
    this._c(i || 0);
    if (i == null) {
      if (this.isPaused()) {

        // Resume if paused.
        this.pauseFlag = false;
        this.sc('resume', this.getCurrent());
        return;
      } else if (this.isPlaying()) {

        // Pause if playing.
        this.pauseFlag = true;
        this.sc('pause', this.getCurrent());
        return;
      } else {

        // Otherwise play the first item.
        this.i = 0;
      }
    } else {
      if (this.isShuffling()) {

        // Swap the item to be played to the start of `this.shuffled`, then
        // shuffle the rest of the array.
        this.shuffled = this.items.slice();
        swap(this.shuffled, 0, i);
        this._s(this.shuffled, 1);
        this.i = 0;
      } else {

        // Not shuffling, so just play the item at the specified index.
        this.i = i;
      }
    }

    // Fire the state change callback.
    this.sc('play', this.getCurrent());
  };

  //
  // Stop playing.
  //
  j.stop = function() {

    // Reshuffle `this.shuffled` if we are shuffling.
    if (this.isShuffling()) {
      this._r();
    }
    this.i = STOPPED;

    // Fire the state change callback.
    this.sc('stop');
  };

  //
  // Returns `true` if repeating.
  //
  j.isRepeating = function() {
    return this.repeatFlag;
  };

  //
  // Toggle the `repeatFlag`.
  //
  j.repeat = function() {
    this.repeatFlag = !this.repeatFlag;

    // Fire the state change callback.
    this.sc('repeat');
  };

  //
  // Returns `true` if shuffling.
  //
  j.isShuffling = function() {
    return this.shuffled !== NOT_SHUFFLING;
  };

  //
  // Toggle shuffling.
  //
  j.shuffle = function() {
    if (this.isShuffling()) {

      // Get the index of the currently-playing item in `this.items`, and
      // update `this.i` accordingly. Now, because we are no longer shuffling,
      // `this.i` refers to an index in `this.items`.
      if (this.isMounted()) {
        this.i = this.getCurrentIndex();
      }

      // Clean out `this.shuffled`.
      this.shuffled = NOT_SHUFFLING;
    } else {
      if (this.isMounted()) {

        // Make a shallow copy of `this.items`, and swap the currently-playing
        // item (at index `this.i`) to index 0.
        this.shuffled = this.items.slice();
        var item = this.shuffled[this.i];
        this.shuffled[this.i] = this.shuffled[0];
        this.shuffled[0] = item;

        // Sort `this.shuffled` from index 1 and up.
        this._s(this.shuffled, 1);

        // Set `this.i` to point to the first item in `this.shuffled`.
        this.i = 0;
      } else {

        // Here we are neither shuffling nor playing. So just make a shallow copy
        // of `this.items`, and shuffle it.
        this._r();
      }
    }

    // Fire the state change callback.
    this.sc('shuffle');
  };

  //
  // Decrement `this.i` if playing, wrapping to the end of the playlist if
  // repeating. Else stops.
  //
  j.previous = function() {

    // Do nothing if we are not playing, or if the playlist is empty.
    var len = this.items.length;
    if (!this.isMounted() || !len) {
      return;
    }
    if (this.i > 0) {

      // A previous item exists, so just decrement `this.i`.
      this.i--;
      this._p();
    } else {

      // We are currently at the first item. Stop if not repeating.
      if (!this.isRepeating()) {
        this.stop();
      } else {

        // If shuffling, generate a new shuffle.
        if (this.isShuffling()) {
          var currentItem = this.getCurrent();
          this._r();

          // If the currently-playing item was placed at index `len-1`, we need to
          // swap it with a random item taken from the rest of `this.items`. (This
          // is because `this.i` will be set to `len-1`, and the previous item must
          // be different from the currently-playing item!)
          if (len > 1 && this.shuffled[len-1] === currentItem) {
            var swapIndex = rand(0, this.items.length-2);
            swap(this.shuffled, len-1, swapIndex);
          }
        }

        // Since we're repeating, wraparound to the last element.
        this.i = len - 1;
        this._p();
      }
    }
  };

  //
  // Increment `this.i` if playing, wrapping to the end of the playlist if
  // repeating. Else stops.
  //
  j.next = function() {

    // Do nothing if we are not playing, or if the playlist is empty.
    var len = this.items.length;
    if (!this.isMounted() || !len) {
      return;
    }
    if (this.i < len - 1) {

      // A next item exists, so just increment `this.i`.
      this.i++;
      this._p();
    } else {

      // We are currently at the last item. Stop if not repeating.
      if (!this.isRepeating()) {
        this.stop();
      } else {

        // If shuffling, generate a new shuffle.
        if (this.isShuffling()) {
          var currentItem = this.getCurrent();
          this._r();

          // If the currently-playing item was placed at index 0, we need to swap
          // it with a random item taken from the rest of `this.items`. (This
          // is because `this.i` will be set to 0, and the next item must be
          // different from the currently-playing item!)
          if (len > 1 && this.shuffled[0] === currentItem) {
            var swapIndex = rand(1, this.items.length-1);
            swap(this.shuffled, 0, swapIndex);
          }
        }

        // Since we're repeating, wraparound to the first element.
        this.i = 0;
        this._p();
      }
    }
  };

  //
  // Move the item at `oldIndex` in `this.items` to `newIndex`.
  //
  j.reorder = function(oldIndex, newIndex) {

    // Throw for invalid `oldIndex` or `newIndex`.
    this._c(oldIndex);
    this._c(newIndex);

    // Remove the item, and insert it at the `newIndex`.
    var item = this.items.splice(oldIndex, 1)[0];
    this.items.splice(newIndex, 0, item);

    // We do not need to adjust `this.i` if we are shuffling.
    if (this.isMounted() && !this.isShuffling()) {

      // The item being moved is the currently-playing item.
      if (this.i === oldIndex) {
        this.i = newIndex;
      } else {

        // The item is being moved from after the currently-playing item to
        // before the currently-playing item.
        if (oldIndex <= this.i && newIndex >= this.i) {
          this.i--;
        } else {

          // The item is being moved from before the currently-playing item to
          // after the currently-playing item.
          if (oldIndex >= this.i && newIndex <= this.i) {
            this.i++;
          }
        }
      }
    }

    // Fire the model change callback.
    this.mc('reorder', this.items);
  };

  //
  // Throws if `i` is an invalid index.
  //
  j._c = function(i, len) {
    if (i < 0 || (i >= (len || this.items.length))) {
      throw new Error('invalid index: ' + i);
    }
  };

  //
  // Reshuffle `this.shuffled`.
  //
  j._r = function() {
    this.shuffled = this.items.slice();
    this._s(this.shuffled, 0);
  };

  //
  // Shuffles a subarray of `arr` in place, from the specified `startIndex` up
  // to `arr.length - 1`. Shuffles the entire `arr` if no `startIndex` was
  // specified. This is based on the Knuth shuffle.
  //
  j._s = function(arr, startIndex) {
    startIndex = startIndex || 0;
    var i = arr.length - 1;
    while (i > startIndex) {
      var j = Math.max(startIndex, Math.floor(Math.random() * (i + 1)));
      swap(arr, i, j);
      i--;
    }
    return arr;
  };

  //
  // Convenience method that is called when playing or resuming.
  //
  j._p = function() {
    this.pauseFlag = false;
    this.sc('play', this.getCurrent());
  };

  /* istanbul ignore else */
  if (typeof module === 'object') {
    module.exports = Jockey;
  } else {
    root.jockey = Jockey;
  }

})(this);
;/*
 * $Id: base64.js,v 2.15 2014/04/05 12:58:57 dankogai Exp dankogai $
 *
 *  Licensed under the MIT license.
 *    http://opensource.org/licenses/mit-license
 *
 *  References:
 *    http://en.wikipedia.org/wiki/Base64
 */

(function(global) {
    'use strict';
    // existing version for noConflict()
    var _Base64 = global.Base64;
    var version = "2.1.9";
    // if node.js, we use Buffer
    var buffer;
    if (typeof module !== 'undefined' && module.exports) {
        try {
            buffer = require('buffer').Buffer;
        } catch (err) {}
    }
    // constants
    var b64chars
        = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var b64tab = function(bin) {
        var t = {};
        for (var i = 0, l = bin.length; i < l; i++) t[bin.charAt(i)] = i;
        return t;
    }(b64chars);
    var fromCharCode = String.fromCharCode;
    // encoder stuff
    var cb_utob = function(c) {
        if (c.length < 2) {
            var cc = c.charCodeAt(0);
            return cc < 0x80 ? c
                : cc < 0x800 ? (fromCharCode(0xc0 | (cc >>> 6))
                                + fromCharCode(0x80 | (cc & 0x3f)))
                : (fromCharCode(0xe0 | ((cc >>> 12) & 0x0f))
                   + fromCharCode(0x80 | ((cc >>>  6) & 0x3f))
                   + fromCharCode(0x80 | ( cc         & 0x3f)));
        } else {
            var cc = 0x10000
                + (c.charCodeAt(0) - 0xD800) * 0x400
                + (c.charCodeAt(1) - 0xDC00);
            return (fromCharCode(0xf0 | ((cc >>> 18) & 0x07))
                    + fromCharCode(0x80 | ((cc >>> 12) & 0x3f))
                    + fromCharCode(0x80 | ((cc >>>  6) & 0x3f))
                    + fromCharCode(0x80 | ( cc         & 0x3f)));
        }
    };
    var re_utob = /[\uD800-\uDBFF][\uDC00-\uDFFFF]|[^\x00-\x7F]/g;
    var utob = function(u) {
        return u.replace(re_utob, cb_utob);
    };
    var cb_encode = function(ccc) {
        var padlen = [0, 2, 1][ccc.length % 3],
        ord = ccc.charCodeAt(0) << 16
            | ((ccc.length > 1 ? ccc.charCodeAt(1) : 0) << 8)
            | ((ccc.length > 2 ? ccc.charCodeAt(2) : 0)),
        chars = [
            b64chars.charAt( ord >>> 18),
            b64chars.charAt((ord >>> 12) & 63),
            padlen >= 2 ? '=' : b64chars.charAt((ord >>> 6) & 63),
            padlen >= 1 ? '=' : b64chars.charAt(ord & 63)
        ];
        return chars.join('');
    };
    var btoa = global.btoa ? function(b) {
        return global.btoa(b);
    } : function(b) {
        return b.replace(/[\s\S]{1,3}/g, cb_encode);
    };
    var _encode = buffer ? function (u) {
        return (u.constructor === buffer.constructor ? u : new buffer(u))
        .toString('base64')
    }
    : function (u) { return btoa(utob(u)) }
    ;
    var encode = function(u, urisafe) {
        return !urisafe
            ? _encode(String(u))
            : _encode(String(u)).replace(/[+\/]/g, function(m0) {
                return m0 == '+' ? '-' : '_';
            }).replace(/=/g, '');
    };
    var encodeURI = function(u) { return encode(u, true) };
    // decoder stuff
    var re_btou = new RegExp([
        '[\xC0-\xDF][\x80-\xBF]',
        '[\xE0-\xEF][\x80-\xBF]{2}',
        '[\xF0-\xF7][\x80-\xBF]{3}'
    ].join('|'), 'g');
    var cb_btou = function(cccc) {
        switch(cccc.length) {
        case 4:
            var cp = ((0x07 & cccc.charCodeAt(0)) << 18)
                |    ((0x3f & cccc.charCodeAt(1)) << 12)
                |    ((0x3f & cccc.charCodeAt(2)) <<  6)
                |     (0x3f & cccc.charCodeAt(3)),
            offset = cp - 0x10000;
            return (fromCharCode((offset  >>> 10) + 0xD800)
                    + fromCharCode((offset & 0x3FF) + 0xDC00));
        case 3:
            return fromCharCode(
                ((0x0f & cccc.charCodeAt(0)) << 12)
                    | ((0x3f & cccc.charCodeAt(1)) << 6)
                    |  (0x3f & cccc.charCodeAt(2))
            );
        default:
            return  fromCharCode(
                ((0x1f & cccc.charCodeAt(0)) << 6)
                    |  (0x3f & cccc.charCodeAt(1))
            );
        }
    };
    var btou = function(b) {
        return b.replace(re_btou, cb_btou);
    };
    var cb_decode = function(cccc) {
        var len = cccc.length,
        padlen = len % 4,
        n = (len > 0 ? b64tab[cccc.charAt(0)] << 18 : 0)
            | (len > 1 ? b64tab[cccc.charAt(1)] << 12 : 0)
            | (len > 2 ? b64tab[cccc.charAt(2)] <<  6 : 0)
            | (len > 3 ? b64tab[cccc.charAt(3)]       : 0),
        chars = [
            fromCharCode( n >>> 16),
            fromCharCode((n >>>  8) & 0xff),
            fromCharCode( n         & 0xff)
        ];
        chars.length -= [0, 0, 2, 1][padlen];
        return chars.join('');
    };
    var atob = global.atob ? function(a) {
        return global.atob(a);
    } : function(a){
        return a.replace(/[\s\S]{1,4}/g, cb_decode);
    };
    var _decode = buffer ? function(a) {
        return (a.constructor === buffer.constructor
                ? a : new buffer(a, 'base64')).toString();
    }
    : function(a) { return btou(atob(a)) };
    var decode = function(a){
        return _decode(
            String(a).replace(/[-_]/g, function(m0) { return m0 == '-' ? '+' : '/' })
                .replace(/[^A-Za-z0-9\+\/]/g, '')
        );
    };
    var noConflict = function() {
        var Base64 = global.Base64;
        global.Base64 = _Base64;
        return Base64;
    };
    // export Base64
    global.Base64 = {
        VERSION: version,
        atob: atob,
        btoa: btoa,
        fromBase64: decode,
        toBase64: encode,
        utob: utob,
        encode: encode,
        encodeURI: encodeURI,
        btou: btou,
        decode: decode,
        noConflict: noConflict
    };
    // if ES5 is available, make Base64.extendString() available
    if (typeof Object.defineProperty === 'function') {
        var noEnum = function(v){
            return {value:v,enumerable:false,writable:true,configurable:true};
        };
        global.Base64.extendString = function () {
            Object.defineProperty(
                String.prototype, 'fromBase64', noEnum(function () {
                    return decode(this)
                }));
            Object.defineProperty(
                String.prototype, 'toBase64', noEnum(function (urisafe) {
                    return encode(this, urisafe)
                }));
            Object.defineProperty(
                String.prototype, 'toBase64URI', noEnum(function () {
                    return encode(this, true)
                }));
        };
    }
    // that's it!
    if (global['Meteor']) {
       Base64 = global.Base64; // for normal export in Meteor.js
    }
})(this);
;/**!
 * Sortable
 * @author	RubaXa   <trash@rubaxa.org>
 * @license MIT
 */

(function sortableModule(factory) {
	"use strict";

	if (typeof define === "function" && define.amd) {
		define(factory);
	}
	else if (typeof module != "undefined" && typeof module.exports != "undefined") {
		module.exports = factory();
	}
	else if (typeof Package !== "undefined") {
		//noinspection JSUnresolvedVariable
		Sortable = factory();  // export for Meteor.js
	}
	else {
		/* jshint sub:true */
		window["Sortable"] = factory();
	}
})(function sortableFactory() {
	"use strict";

	if (typeof window == "undefined" || !window.document) {
		return function sortableError() {
			throw new Error("Sortable.js requires a window with a document");
		};
	}

	var dragEl,
		parentEl,
		ghostEl,
		cloneEl,
		rootEl,
		nextEl,

		scrollEl,
		scrollParentEl,
		scrollCustomFn,

		lastEl,
		lastCSS,
		lastParentCSS,

		oldIndex,
		newIndex,

		activeGroup,
		putSortable,

		autoScroll = {},

		tapEvt,
		touchEvt,

		moved,

		/** @const */
		RSPACE = /\s+/g,

		expando = 'Sortable' + (new Date).getTime(),

		win = window,
		document = win.document,
		parseInt = win.parseInt,

		$ = win.jQuery || win.Zepto,
		Polymer = win.Polymer,

		supportDraggable = !!('draggable' in document.createElement('div')),
		supportCssPointerEvents = (function (el) {
			// false when IE11
			if (!!navigator.userAgent.match(/Trident.*rv[ :]?11\./)) {
				return false;
			}
			el = document.createElement('x');
			el.style.cssText = 'pointer-events:auto';
			return el.style.pointerEvents === 'auto';
		})(),

		_silent = false,

		abs = Math.abs,
		min = Math.min,
		slice = [].slice,

		touchDragOverListeners = [],

		_autoScroll = _throttle(function (/**Event*/evt, /**Object*/options, /**HTMLElement*/rootEl) {
			// Bug: https://bugzilla.mozilla.org/show_bug.cgi?id=505521
			if (rootEl && options.scroll) {
				var el,
					rect,
					sens = options.scrollSensitivity,
					speed = options.scrollSpeed,

					x = evt.clientX,
					y = evt.clientY,

					winWidth = window.innerWidth,
					winHeight = window.innerHeight,

					vx,
					vy,

					scrollOffsetX,
					scrollOffsetY
				;

				// Delect scrollEl
				if (scrollParentEl !== rootEl) {
					scrollEl = options.scroll;
					scrollParentEl = rootEl;
					scrollCustomFn = options.scrollFn;

					if (scrollEl === true) {
						scrollEl = rootEl;

						do {
							if ((scrollEl.offsetWidth < scrollEl.scrollWidth) ||
								(scrollEl.offsetHeight < scrollEl.scrollHeight)
							) {
								break;
							}
							/* jshint boss:true */
						} while (scrollEl = scrollEl.parentNode);
					}
				}

				if (scrollEl) {
					el = scrollEl;
					rect = scrollEl.getBoundingClientRect();
					vx = (abs(rect.right - x) <= sens) - (abs(rect.left - x) <= sens);
					vy = (abs(rect.bottom - y) <= sens) - (abs(rect.top - y) <= sens);
				}


				if (!(vx || vy)) {
					vx = (winWidth - x <= sens) - (x <= sens);
					vy = (winHeight - y <= sens) - (y <= sens);

					/* jshint expr:true */
					(vx || vy) && (el = win);
				}


				if (autoScroll.vx !== vx || autoScroll.vy !== vy || autoScroll.el !== el) {
					autoScroll.el = el;
					autoScroll.vx = vx;
					autoScroll.vy = vy;

					clearInterval(autoScroll.pid);

					if (el) {
						autoScroll.pid = setInterval(function () {
							scrollOffsetY = vy ? vy * speed : 0;
							scrollOffsetX = vx ? vx * speed : 0;

							if ('function' === typeof(scrollCustomFn)) {
								return scrollCustomFn.call(_this, scrollOffsetX, scrollOffsetY, evt);
							}

							if (el === win) {
								win.scrollTo(win.pageXOffset + scrollOffsetX, win.pageYOffset + scrollOffsetY);
							} else {
								el.scrollTop += scrollOffsetY;
								el.scrollLeft += scrollOffsetX;
							}
						}, 24);
					}
				}
			}
		}, 30),

		_prepareGroup = function (options) {
			function toFn(value, pull) {
				if (value === void 0 || value === true) {
					value = group.name;
				}

				if (typeof value === 'function') {
					return value;
				} else {
					return function (to, from) {
						var fromGroup = from.options.group.name;

						return pull
							? value
							: value && (value.join
								? value.indexOf(fromGroup) > -1
								: (fromGroup == value)
							);
					};
				}
			}

			var group = {};
			var originalGroup = options.group;

			if (!originalGroup || typeof originalGroup != 'object') {
				originalGroup = {name: originalGroup};
			}

			group.name = originalGroup.name;
			group.checkPull = toFn(originalGroup.pull, true);
			group.checkPut = toFn(originalGroup.put);

			options.group = group;
		}
	;



	/**
	 * @class  Sortable
	 * @param  {HTMLElement}  el
	 * @param  {Object}       [options]
	 */
	function Sortable(el, options) {
		if (!(el && el.nodeType && el.nodeType === 1)) {
			throw 'Sortable: `el` must be HTMLElement, and not ' + {}.toString.call(el);
		}

		this.el = el; // root element
		this.options = options = _extend({}, options);


		// Export instance
		el[expando] = this;


		// Default options
		var defaults = {
			group: Math.random(),
			sort: true,
			disabled: false,
			store: null,
			handle: null,
			scroll: true,
			scrollSensitivity: 30,
			scrollSpeed: 10,
			draggable: /[uo]l/i.test(el.nodeName) ? 'li' : '>*',
			ghostClass: 'sortable-ghost',
			chosenClass: 'sortable-chosen',
			dragClass: 'sortable-drag',
			ignore: 'a, img',
			filter: null,
			animation: 0,
			setData: function (dataTransfer, dragEl) {
				dataTransfer.setData('Text', dragEl.textContent);
			},
			dropBubble: false,
			dragoverBubble: false,
			dataIdAttr: 'data-id',
			delay: 0,
			forceFallback: false,
			fallbackClass: 'sortable-fallback',
			fallbackOnBody: false,
			fallbackTolerance: 0,
			fallbackOffset: {x: 0, y: 0}
		};


		// Set default options
		for (var name in defaults) {
			!(name in options) && (options[name] = defaults[name]);
		}

		_prepareGroup(options);

		// Bind all private methods
		for (var fn in this) {
			if (fn.charAt(0) === '_' && typeof this[fn] === 'function') {
				this[fn] = this[fn].bind(this);
			}
		}

		// Setup drag mode
		this.nativeDraggable = options.forceFallback ? false : supportDraggable;

		// Bind events
		_on(el, 'mousedown', this._onTapStart);
		_on(el, 'touchstart', this._onTapStart);
		_on(el, 'pointerdown', this._onTapStart);

		if (this.nativeDraggable) {
			_on(el, 'dragover', this);
			_on(el, 'dragenter', this);
		}

		touchDragOverListeners.push(this._onDragOver);

		// Restore sorting
		options.store && this.sort(options.store.get(this));
	}


	Sortable.prototype = /** @lends Sortable.prototype */ {
		constructor: Sortable,

		_onTapStart: function (/** Event|TouchEvent */evt) {
			var _this = this,
				el = this.el,
				options = this.options,
				type = evt.type,
				touch = evt.touches && evt.touches[0],
				target = (touch || evt).target,
				originalTarget = evt.target.shadowRoot && evt.path[0] || target,
				filter = options.filter,
				startIndex;

			// Don't trigger start event when an element is been dragged, otherwise the evt.oldindex always wrong when set option.group.
			if (dragEl) {
				return;
			}

			if (type === 'mousedown' && evt.button !== 0 || options.disabled) {
				return; // only left button or enabled
			}

			if (options.handle && !_closest(originalTarget, options.handle, el)) {
				return;
			}

			target = _closest(target, options.draggable, el);

			if (!target) {
				return;
			}

			// Get the index of the dragged element within its parent
			startIndex = _index(target, options.draggable);

			// Check filter
			if (typeof filter === 'function') {
				if (filter.call(this, evt, target, this)) {
					_dispatchEvent(_this, originalTarget, 'filter', target, el, startIndex);
					evt.preventDefault();
					return; // cancel dnd
				}
			}
			else if (filter) {
				filter = filter.split(',').some(function (criteria) {
					criteria = _closest(originalTarget, criteria.trim(), el);

					if (criteria) {
						_dispatchEvent(_this, criteria, 'filter', target, el, startIndex);
						return true;
					}
				});

				if (filter) {
					evt.preventDefault();
					return; // cancel dnd
				}
			}

			// Prepare `dragstart`
			this._prepareDragStart(evt, touch, target, startIndex);
		},

		_prepareDragStart: function (/** Event */evt, /** Touch */touch, /** HTMLElement */target, /** Number */startIndex) {
			var _this = this,
				el = _this.el,
				options = _this.options,
				ownerDocument = el.ownerDocument,
				dragStartFn;

			if (target && !dragEl && (target.parentNode === el)) {
				tapEvt = evt;

				rootEl = el;
				dragEl = target;
				parentEl = dragEl.parentNode;
				nextEl = dragEl.nextSibling;
				activeGroup = options.group;
				oldIndex = startIndex;

				this._lastX = (touch || evt).clientX;
				this._lastY = (touch || evt).clientY;

				dragEl.style['will-change'] = 'transform';

				dragStartFn = function () {
					// Delayed drag has been triggered
					// we can re-enable the events: touchmove/mousemove
					_this._disableDelayedDrag();

					// Make the element draggable
					dragEl.draggable = _this.nativeDraggable;

					// Chosen item
					_toggleClass(dragEl, options.chosenClass, true);

					// Bind the events: dragstart/dragend
					_this._triggerDragStart(evt, touch);

					// Drag start event
					_dispatchEvent(_this, rootEl, 'choose', dragEl, rootEl, oldIndex);
				};

				// Disable "draggable"
				options.ignore.split(',').forEach(function (criteria) {
					_find(dragEl, criteria.trim(), _disableDraggable);
				});

				_on(ownerDocument, 'mouseup', _this._onDrop);
				_on(ownerDocument, 'touchend', _this._onDrop);
				_on(ownerDocument, 'touchcancel', _this._onDrop);
				_on(ownerDocument, 'pointercancel', _this._onDrop);

				if (options.delay) {
					// If the user moves the pointer or let go the click or touch
					// before the delay has been reached:
					// disable the delayed drag
					_on(ownerDocument, 'mouseup', _this._disableDelayedDrag);
					_on(ownerDocument, 'touchend', _this._disableDelayedDrag);
					_on(ownerDocument, 'touchcancel', _this._disableDelayedDrag);
					_on(ownerDocument, 'mousemove', _this._disableDelayedDrag);
					_on(ownerDocument, 'touchmove', _this._disableDelayedDrag);
					_on(ownerDocument, 'pointermove', _this._disableDelayedDrag);

					_this._dragStartTimer = setTimeout(dragStartFn, options.delay);
				} else {
					dragStartFn();
				}
			}
		},

		_disableDelayedDrag: function () {
			var ownerDocument = this.el.ownerDocument;

			clearTimeout(this._dragStartTimer);
			_off(ownerDocument, 'mouseup', this._disableDelayedDrag);
			_off(ownerDocument, 'touchend', this._disableDelayedDrag);
			_off(ownerDocument, 'touchcancel', this._disableDelayedDrag);
			_off(ownerDocument, 'mousemove', this._disableDelayedDrag);
			_off(ownerDocument, 'touchmove', this._disableDelayedDrag);
			_off(ownerDocument, 'pointermove', this._disableDelayedDrag);
		},

		_triggerDragStart: function (/** Event */evt, /** Touch */touch) {
			touch = touch || (evt.pointerType == 'touch' ? evt : null);
			if (touch) {
				// Touch device support
				tapEvt = {
					target: dragEl,
					clientX: touch.clientX,
					clientY: touch.clientY
				};

				this._onDragStart(tapEvt, 'touch');
			}
			else if (!this.nativeDraggable) {
				this._onDragStart(tapEvt, true);
			}
			else {
				_on(dragEl, 'dragend', this);
				_on(rootEl, 'dragstart', this._onDragStart);
			}

			try {
				if (document.selection) {					
					// Timeout neccessary for IE9					
					setTimeout(function () {
						document.selection.empty();
					});					
				} else {
					window.getSelection().removeAllRanges();
				}
			} catch (err) {
			}
		},

		_dragStarted: function () {
			if (rootEl && dragEl) {
				var options = this.options;

				// Apply effect
				_toggleClass(dragEl, options.ghostClass, true);
				_toggleClass(dragEl, options.dragClass, false);

				Sortable.active = this;

				// Drag start event
				_dispatchEvent(this, rootEl, 'start', dragEl, rootEl, oldIndex);
			}
		},

		_emulateDragOver: function () {
			if (touchEvt) {
				if (this._lastX === touchEvt.clientX && this._lastY === touchEvt.clientY) {
					return;
				}

				this._lastX = touchEvt.clientX;
				this._lastY = touchEvt.clientY;

				if (!supportCssPointerEvents) {
					_css(ghostEl, 'display', 'none');
				}

				var target = document.elementFromPoint(touchEvt.clientX, touchEvt.clientY),
					parent = target,
					i = touchDragOverListeners.length;

				if (parent) {
					do {
						if (parent[expando]) {
							while (i--) {
								touchDragOverListeners[i]({
									clientX: touchEvt.clientX,
									clientY: touchEvt.clientY,
									target: target,
									rootEl: parent
								});
							}

							break;
						}

						target = parent; // store last element
					}
					/* jshint boss:true */
					while (parent = parent.parentNode);
				}

				if (!supportCssPointerEvents) {
					_css(ghostEl, 'display', '');
				}
			}
		},


		_onTouchMove: function (/**TouchEvent*/evt) {
			if (tapEvt) {
				var	options = this.options,
					fallbackTolerance = options.fallbackTolerance,
					fallbackOffset = options.fallbackOffset,
					touch = evt.touches ? evt.touches[0] : evt,
					dx = (touch.clientX - tapEvt.clientX) + fallbackOffset.x,
					dy = (touch.clientY - tapEvt.clientY) + fallbackOffset.y,
					translate3d = evt.touches ? 'translate3d(' + dx + 'px,' + dy + 'px,0)' : 'translate(' + dx + 'px,' + dy + 'px)';

				// only set the status to dragging, when we are actually dragging
				if (!Sortable.active) {
					if (fallbackTolerance &&
						min(abs(touch.clientX - this._lastX), abs(touch.clientY - this._lastY)) < fallbackTolerance
					) {
						return;
					}

					this._dragStarted();
				}

				// as well as creating the ghost element on the document body
				this._appendGhost();

				moved = true;
				touchEvt = touch;

				_css(ghostEl, 'webkitTransform', translate3d);
				_css(ghostEl, 'mozTransform', translate3d);
				_css(ghostEl, 'msTransform', translate3d);
				_css(ghostEl, 'transform', translate3d);

				evt.preventDefault();
			}
		},

		_appendGhost: function () {
			if (!ghostEl) {
				var rect = dragEl.getBoundingClientRect(),
					css = _css(dragEl),
					options = this.options,
					ghostRect;

				ghostEl = dragEl.cloneNode(true);

				_toggleClass(ghostEl, options.ghostClass, false);
				_toggleClass(ghostEl, options.fallbackClass, true);
				_toggleClass(ghostEl, options.dragClass, true);

				_css(ghostEl, 'top', rect.top - parseInt(css.marginTop, 10));
				_css(ghostEl, 'left', rect.left - parseInt(css.marginLeft, 10));
				_css(ghostEl, 'width', rect.width);
				_css(ghostEl, 'height', rect.height);
				_css(ghostEl, 'opacity', '0.8');
				_css(ghostEl, 'position', 'fixed');
				_css(ghostEl, 'zIndex', '100000');
				_css(ghostEl, 'pointerEvents', 'none');

				options.fallbackOnBody && document.body.appendChild(ghostEl) || rootEl.appendChild(ghostEl);

				// Fixing dimensions.
				ghostRect = ghostEl.getBoundingClientRect();
				_css(ghostEl, 'width', rect.width * 2 - ghostRect.width);
				_css(ghostEl, 'height', rect.height * 2 - ghostRect.height);
			}
		},

		_onDragStart: function (/**Event*/evt, /**boolean*/useFallback) {
			var dataTransfer = evt.dataTransfer,
				options = this.options;

			this._offUpEvents();

			if (activeGroup.checkPull(this, this, dragEl, evt) == 'clone') {
				cloneEl = _clone(dragEl);
				_css(cloneEl, 'display', 'none');
				rootEl.insertBefore(cloneEl, dragEl);
				_dispatchEvent(this, rootEl, 'clone', dragEl);
			}

			_toggleClass(dragEl, options.dragClass, true);

			if (useFallback) {
				if (useFallback === 'touch') {
					// Bind touch events
					_on(document, 'touchmove', this._onTouchMove);
					_on(document, 'touchend', this._onDrop);
					_on(document, 'touchcancel', this._onDrop);
					_on(document, 'pointermove', this._onTouchMove);
					_on(document, 'pointerup', this._onDrop);
				} else {
					// Old brwoser
					_on(document, 'mousemove', this._onTouchMove);
					_on(document, 'mouseup', this._onDrop);
				}

				this._loopId = setInterval(this._emulateDragOver, 50);
			}
			else {
				if (dataTransfer) {
					dataTransfer.effectAllowed = 'move';
					options.setData && options.setData.call(this, dataTransfer, dragEl);
				}

				_on(document, 'drop', this);
				setTimeout(this._dragStarted, 0);
			}
		},

		_onDragOver: function (/**Event*/evt) {
			var el = this.el,
				target,
				dragRect,
				targetRect,
				revert,
				options = this.options,
				group = options.group,
				activeSortable = Sortable.active,
				isOwner = (activeGroup === group),
				canSort = options.sort;

			if (evt.preventDefault !== void 0) {
				evt.preventDefault();
				!options.dragoverBubble && evt.stopPropagation();
			}

			moved = true;

			if (activeGroup && !options.disabled &&
				(isOwner
					? canSort || (revert = !rootEl.contains(dragEl)) // Reverting item into the original list
					: (
						putSortable === this ||
						activeGroup.checkPull(this, activeSortable, dragEl, evt) && group.checkPut(this, activeSortable, dragEl, evt)
					)
				) &&
				(evt.rootEl === void 0 || evt.rootEl === this.el) // touch fallback
			) {
				// Smart auto-scrolling
				_autoScroll(evt, options, this.el);

				if (_silent) {
					return;
				}

				target = _closest(evt.target, options.draggable, el);
				dragRect = dragEl.getBoundingClientRect();
				putSortable = this;

				if (revert) {
					_cloneHide(true);
					parentEl = rootEl; // actualization

					if (cloneEl || nextEl) {
						rootEl.insertBefore(dragEl, cloneEl || nextEl);
					}
					else if (!canSort) {
						rootEl.appendChild(dragEl);
					}

					return;
				}


				if ((el.children.length === 0) || (el.children[0] === ghostEl) ||
					(el === evt.target) && (target = _ghostIsLast(el, evt))
				) {
					if (target) {
						if (target.animated) {
							return;
						}

						targetRect = target.getBoundingClientRect();
					}

					_cloneHide(isOwner);

					if (_onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt) !== false) {
						if (!dragEl.contains(el)) {
							el.appendChild(dragEl);
							parentEl = el; // actualization
						}

						this._animate(dragRect, dragEl);
						target && this._animate(targetRect, target);
					}
				}
				else if (target && !target.animated && target !== dragEl && (target.parentNode[expando] !== void 0)) {
					if (lastEl !== target) {
						lastEl = target;
						lastCSS = _css(target);
						lastParentCSS = _css(target.parentNode);
					}

					targetRect = target.getBoundingClientRect();

					var width = targetRect.right - targetRect.left,
						height = targetRect.bottom - targetRect.top,
						floating = /left|right|inline/.test(lastCSS.cssFloat + lastCSS.display)
							|| (lastParentCSS.display == 'flex' && lastParentCSS['flex-direction'].indexOf('row') === 0),
						isWide = (target.offsetWidth > dragEl.offsetWidth),
						isLong = (target.offsetHeight > dragEl.offsetHeight),
						halfway = (floating ? (evt.clientX - targetRect.left) / width : (evt.clientY - targetRect.top) / height) > 0.5,
						nextSibling = target.nextElementSibling,
						moveVector = _onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt),
						after
					;

					if (moveVector !== false) {
						_silent = true;
						setTimeout(_unsilent, 30);

						_cloneHide(isOwner);

						if (moveVector === 1 || moveVector === -1) {
							after = (moveVector === 1);
						}
						else if (floating) {
							var elTop = dragEl.offsetTop,
								tgTop = target.offsetTop;

							if (elTop === tgTop) {
								after = (target.previousElementSibling === dragEl) && !isWide || halfway && isWide;
							}
							else if (target.previousElementSibling === dragEl || dragEl.previousElementSibling === target) {
								after = (evt.clientY - targetRect.top) / height > 0.5;
							} else {
								after = tgTop > elTop;
							}
						} else {
							after = (nextSibling !== dragEl) && !isLong || halfway && isLong;
						}

						if (!dragEl.contains(el)) {
							if (after && !nextSibling) {
								el.appendChild(dragEl);
							} else {
								target.parentNode.insertBefore(dragEl, after ? nextSibling : target);
							}
						}

						parentEl = dragEl.parentNode; // actualization

						this._animate(dragRect, dragEl);
						this._animate(targetRect, target);
					}
				}
			}
		},

		_animate: function (prevRect, target) {
			var ms = this.options.animation;

			if (ms) {
				var currentRect = target.getBoundingClientRect();

				_css(target, 'transition', 'none');
				_css(target, 'transform', 'translate3d('
					+ (prevRect.left - currentRect.left) + 'px,'
					+ (prevRect.top - currentRect.top) + 'px,0)'
				);

				target.offsetWidth; // repaint

				_css(target, 'transition', 'all ' + ms + 'ms');
				_css(target, 'transform', 'translate3d(0,0,0)');

				clearTimeout(target.animated);
				target.animated = setTimeout(function () {
					_css(target, 'transition', '');
					_css(target, 'transform', '');
					target.animated = false;
				}, ms);
			}
		},

		_offUpEvents: function () {
			var ownerDocument = this.el.ownerDocument;

			_off(document, 'touchmove', this._onTouchMove);
			_off(document, 'pointermove', this._onTouchMove);
			_off(ownerDocument, 'mouseup', this._onDrop);
			_off(ownerDocument, 'touchend', this._onDrop);
			_off(ownerDocument, 'pointerup', this._onDrop);
			_off(ownerDocument, 'touchcancel', this._onDrop);
		},

		_onDrop: function (/**Event*/evt) {
			var el = this.el,
				options = this.options;

			clearInterval(this._loopId);
			clearInterval(autoScroll.pid);
			clearTimeout(this._dragStartTimer);

			// Unbind events
			_off(document, 'mousemove', this._onTouchMove);

			if (this.nativeDraggable) {
				_off(document, 'drop', this);
				_off(el, 'dragstart', this._onDragStart);
			}

			this._offUpEvents();

			if (evt) {
				if (moved) {
					evt.preventDefault();
					!options.dropBubble && evt.stopPropagation();
				}

				ghostEl && ghostEl.parentNode.removeChild(ghostEl);

				if (dragEl) {
					if (this.nativeDraggable) {
						_off(dragEl, 'dragend', this);
					}

					_disableDraggable(dragEl);
					dragEl.style['will-change'] = '';

					// Remove class's
					_toggleClass(dragEl, this.options.ghostClass, false);
					_toggleClass(dragEl, this.options.chosenClass, false);

					if (rootEl !== parentEl) {
						newIndex = _index(dragEl, options.draggable);

						if (newIndex >= 0) {

							// Add event
							_dispatchEvent(null, parentEl, 'add', dragEl, rootEl, oldIndex, newIndex);

							// Remove event
							_dispatchEvent(this, rootEl, 'remove', dragEl, rootEl, oldIndex, newIndex);

							// drag from one list and drop into another
							_dispatchEvent(null, parentEl, 'sort', dragEl, rootEl, oldIndex, newIndex);
							_dispatchEvent(this, rootEl, 'sort', dragEl, rootEl, oldIndex, newIndex);
						}
					}
					else {
						// Remove clone
						cloneEl && cloneEl.parentNode.removeChild(cloneEl);

						if (dragEl.nextSibling !== nextEl) {
							// Get the index of the dragged element within its parent
							newIndex = _index(dragEl, options.draggable);

							if (newIndex >= 0) {
								// drag & drop within the same list
								_dispatchEvent(this, rootEl, 'update', dragEl, rootEl, oldIndex, newIndex);
								_dispatchEvent(this, rootEl, 'sort', dragEl, rootEl, oldIndex, newIndex);
							}
						}
					}

					if (Sortable.active) {
						/* jshint eqnull:true */
						if (newIndex == null || newIndex === -1) {
							newIndex = oldIndex;
						}

						_dispatchEvent(this, rootEl, 'end', dragEl, rootEl, oldIndex, newIndex);

						// Save sorting
						this.save();
					}
				}

			}

			this._nulling();
		},

		_nulling: function() {
			rootEl =
			dragEl =
			parentEl =
			ghostEl =
			nextEl =
			cloneEl =

			scrollEl =
			scrollParentEl =

			tapEvt =
			touchEvt =

			moved =
			newIndex =

			lastEl =
			lastCSS =

			putSortable =
			activeGroup =
			Sortable.active = null;
		},

		handleEvent: function (/**Event*/evt) {
			var type = evt.type;

			if (type === 'dragover' || type === 'dragenter') {
				if (dragEl) {
					this._onDragOver(evt);
					_globalDragOver(evt);
				}
			}
			else if (type === 'drop' || type === 'dragend') {
				this._onDrop(evt);
			}
		},


		/**
		 * Serializes the item into an array of string.
		 * @returns {String[]}
		 */
		toArray: function () {
			var order = [],
				el,
				children = this.el.children,
				i = 0,
				n = children.length,
				options = this.options;

			for (; i < n; i++) {
				el = children[i];
				if (_closest(el, options.draggable, this.el)) {
					order.push(el.getAttribute(options.dataIdAttr) || _generateId(el));
				}
			}

			return order;
		},


		/**
		 * Sorts the elements according to the array.
		 * @param  {String[]}  order  order of the items
		 */
		sort: function (order) {
			var items = {}, rootEl = this.el;

			this.toArray().forEach(function (id, i) {
				var el = rootEl.children[i];

				if (_closest(el, this.options.draggable, rootEl)) {
					items[id] = el;
				}
			}, this);

			order.forEach(function (id) {
				if (items[id]) {
					rootEl.removeChild(items[id]);
					rootEl.appendChild(items[id]);
				}
			});
		},


		/**
		 * Save the current sorting
		 */
		save: function () {
			var store = this.options.store;
			store && store.set(this);
		},


		/**
		 * For each element in the set, get the first element that matches the selector by testing the element itself and traversing up through its ancestors in the DOM tree.
		 * @param   {HTMLElement}  el
		 * @param   {String}       [selector]  default: `options.draggable`
		 * @returns {HTMLElement|null}
		 */
		closest: function (el, selector) {
			return _closest(el, selector || this.options.draggable, this.el);
		},


		/**
		 * Set/get option
		 * @param   {string} name
		 * @param   {*}      [value]
		 * @returns {*}
		 */
		option: function (name, value) {
			var options = this.options;

			if (value === void 0) {
				return options[name];
			} else {
				options[name] = value;

				if (name === 'group') {
					_prepareGroup(options);
				}
			}
		},


		/**
		 * Destroy
		 */
		destroy: function () {
			var el = this.el;

			el[expando] = null;

			_off(el, 'mousedown', this._onTapStart);
			_off(el, 'touchstart', this._onTapStart);
			_off(el, 'pointerdown', this._onTapStart);

			if (this.nativeDraggable) {
				_off(el, 'dragover', this);
				_off(el, 'dragenter', this);
			}

			// Remove draggable attributes
			Array.prototype.forEach.call(el.querySelectorAll('[draggable]'), function (el) {
				el.removeAttribute('draggable');
			});

			touchDragOverListeners.splice(touchDragOverListeners.indexOf(this._onDragOver), 1);

			this._onDrop();

			this.el = el = null;
		}
	};


	function _cloneHide(state) {
		if (cloneEl && (cloneEl.state !== state)) {
			_css(cloneEl, 'display', state ? 'none' : '');
			!state && cloneEl.state && rootEl.insertBefore(cloneEl, dragEl);
			cloneEl.state = state;
		}
	}


	function _closest(/**HTMLElement*/el, /**String*/selector, /**HTMLElement*/ctx) {
		if (el) {
			ctx = ctx || document;

			do {
				if ((selector === '>*' && el.parentNode === ctx) || _matches(el, selector)) {
					return el;
				}
				/* jshint boss:true */
			} while (el = _getParentOrHost(el));
		}

		return null;
	}


	function _getParentOrHost(el) {
		var parent = el.host;

		return (parent && parent.nodeType) ? parent : el.parentNode;
	}


	function _globalDragOver(/**Event*/evt) {
		if (evt.dataTransfer) {
			evt.dataTransfer.dropEffect = 'move';
		}
		evt.preventDefault();
	}


	function _on(el, event, fn) {
		el.addEventListener(event, fn, false);
	}


	function _off(el, event, fn) {
		el.removeEventListener(event, fn, false);
	}


	function _toggleClass(el, name, state) {
		if (el) {
			if (el.classList) {
				el.classList[state ? 'add' : 'remove'](name);
			}
			else {
				var className = (' ' + el.className + ' ').replace(RSPACE, ' ').replace(' ' + name + ' ', ' ');
				el.className = (className + (state ? ' ' + name : '')).replace(RSPACE, ' ');
			}
		}
	}


	function _css(el, prop, val) {
		var style = el && el.style;

		if (style) {
			if (val === void 0) {
				if (document.defaultView && document.defaultView.getComputedStyle) {
					val = document.defaultView.getComputedStyle(el, '');
				}
				else if (el.currentStyle) {
					val = el.currentStyle;
				}

				return prop === void 0 ? val : val[prop];
			}
			else {
				if (!(prop in style)) {
					prop = '-webkit-' + prop;
				}

				style[prop] = val + (typeof val === 'string' ? '' : 'px');
			}
		}
	}


	function _find(ctx, tagName, iterator) {
		if (ctx) {
			var list = ctx.getElementsByTagName(tagName), i = 0, n = list.length;

			if (iterator) {
				for (; i < n; i++) {
					iterator(list[i], i);
				}
			}

			return list;
		}

		return [];
	}



	function _dispatchEvent(sortable, rootEl, name, targetEl, fromEl, startIndex, newIndex) {
		sortable = (sortable || rootEl[expando]);

		var evt = document.createEvent('Event'),
			options = sortable.options,
			onName = 'on' + name.charAt(0).toUpperCase() + name.substr(1);

		evt.initEvent(name, true, true);

		evt.to = rootEl;
		evt.from = fromEl || rootEl;
		evt.item = targetEl || rootEl;
		evt.clone = cloneEl;

		evt.oldIndex = startIndex;
		evt.newIndex = newIndex;

		rootEl.dispatchEvent(evt);

		if (options[onName]) {
			options[onName].call(sortable, evt);
		}
	}


	function _onMove(fromEl, toEl, dragEl, dragRect, targetEl, targetRect, originalEvt) {
		var evt,
			sortable = fromEl[expando],
			onMoveFn = sortable.options.onMove,
			retVal;

		evt = document.createEvent('Event');
		evt.initEvent('move', true, true);

		evt.to = toEl;
		evt.from = fromEl;
		evt.dragged = dragEl;
		evt.draggedRect = dragRect;
		evt.related = targetEl || toEl;
		evt.relatedRect = targetRect || toEl.getBoundingClientRect();

		fromEl.dispatchEvent(evt);

		if (onMoveFn) {
			retVal = onMoveFn.call(sortable, evt, originalEvt);
		}

		return retVal;
	}


	function _disableDraggable(el) {
		el.draggable = false;
	}


	function _unsilent() {
		_silent = false;
	}


	/** @returns {HTMLElement|false} */
	function _ghostIsLast(el, evt) {
		var lastEl = el.lastElementChild,
			rect = lastEl.getBoundingClientRect();

		// 5 — min delta
		// abs — нельзя добавлять, а то глюки при наведении сверху
		return (
			(evt.clientY - (rect.top + rect.height) > 5) ||
			(evt.clientX - (rect.right + rect.width) > 5)
		) && lastEl;
	}


	/**
	 * Generate id
	 * @param   {HTMLElement} el
	 * @returns {String}
	 * @private
	 */
	function _generateId(el) {
		var str = el.tagName + el.className + el.src + el.href + el.textContent,
			i = str.length,
			sum = 0;

		while (i--) {
			sum += str.charCodeAt(i);
		}

		return sum.toString(36);
	}

	/**
	 * Returns the index of an element within its parent for a selected set of
	 * elements
	 * @param  {HTMLElement} el
	 * @param  {selector} selector
	 * @return {number}
	 */
	function _index(el, selector) {
		var index = 0;

		if (!el || !el.parentNode) {
			return -1;
		}

		while (el && (el = el.previousElementSibling)) {
			if ((el.nodeName.toUpperCase() !== 'TEMPLATE') && (selector === '>*' || _matches(el, selector))) {
				index++;
			}
		}

		return index;
	}

	function _matches(/**HTMLElement*/el, /**String*/selector) {
		if (el) {
			selector = selector.split('.');

			var tag = selector.shift().toUpperCase(),
				re = new RegExp('\\s(' + selector.join('|') + ')(?=\\s)', 'g');

			return (
				(tag === '' || el.nodeName.toUpperCase() == tag) &&
				(!selector.length || ((' ' + el.className + ' ').match(re) || []).length == selector.length)
			);
		}

		return false;
	}

	function _throttle(callback, ms) {
		var args, _this;

		return function () {
			if (args === void 0) {
				args = arguments;
				_this = this;

				setTimeout(function () {
					if (args.length === 1) {
						callback.call(_this, args[0]);
					} else {
						callback.apply(_this, args);
					}

					args = void 0;
				}, ms);
			}
		};
	}

	function _extend(dst, src) {
		if (dst && src) {
			for (var key in src) {
				if (src.hasOwnProperty(key)) {
					dst[key] = src[key];
				}
			}
		}

		return dst;
	}

	function _clone(el) {
		return $
			? $(el).clone(true)[0]
			: (Polymer && Polymer.dom
				? Polymer.dom(el).cloneNode(true)
				: el.cloneNode(true)
			);
	}


	// Export utils
	Sortable.utils = {
		on: _on,
		off: _off,
		css: _css,
		find: _find,
		is: function (el, selector) {
			return !!_closest(el, selector, el);
		},
		extend: _extend,
		throttle: _throttle,
		closest: _closest,
		toggleClass: _toggleClass,
		clone: _clone,
		index: _index
	};


	/**
	 * Create sortable instance
	 * @param {HTMLElement}  el
	 * @param {Object}      [options]
	 */
	Sortable.create = function (el, options) {
		return new Sortable(el, options);
	};


	// Export
	Sortable.version = '1.5.0-rc1';
	return Sortable;
});
;/*
 * $Id: rawdeflate.js,v 0.5 2013/04/09 14:25:38 dankogai Exp $
 *
 * GNU General Public License, version 2 (GPL-2.0)
 *   http://opensource.org/licenses/GPL-2.0
 * Original:
 *  http://www.onicos.com/staff/iz/amuse/javascript/expert/deflate.txt
 */

(function(ctx){

/* Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
 * Version: 1.0.1
 * LastModified: Dec 25 1999
 */

/* Interface:
 * data = zip_deflate(src);
 */

/* constant parameters */
var zip_WSIZE = 32768;		// Sliding Window size
var zip_STORED_BLOCK = 0;
var zip_STATIC_TREES = 1;
var zip_DYN_TREES    = 2;

/* for deflate */
var zip_DEFAULT_LEVEL = 6;
var zip_FULL_SEARCH = true;
var zip_INBUFSIZ = 32768;	// Input buffer size
var zip_INBUF_EXTRA = 64;	// Extra buffer
var zip_OUTBUFSIZ = 1024 * 8;
var zip_window_size = 2 * zip_WSIZE;
var zip_MIN_MATCH = 3;
var zip_MAX_MATCH = 258;
var zip_BITS = 16;
// for SMALL_MEM
var zip_LIT_BUFSIZE = 0x2000;
var zip_HASH_BITS = 13;
// for MEDIUM_MEM
// var zip_LIT_BUFSIZE = 0x4000;
// var zip_HASH_BITS = 14;
// for BIG_MEM
// var zip_LIT_BUFSIZE = 0x8000;
// var zip_HASH_BITS = 15;
if(zip_LIT_BUFSIZE > zip_INBUFSIZ)
    alert("error: zip_INBUFSIZ is too small");
if((zip_WSIZE<<1) > (1<<zip_BITS))
    alert("error: zip_WSIZE is too large");
if(zip_HASH_BITS > zip_BITS-1)
    alert("error: zip_HASH_BITS is too large");
if(zip_HASH_BITS < 8 || zip_MAX_MATCH != 258)
    alert("error: Code too clever");
var zip_DIST_BUFSIZE = zip_LIT_BUFSIZE;
var zip_HASH_SIZE = 1 << zip_HASH_BITS;
var zip_HASH_MASK = zip_HASH_SIZE - 1;
var zip_WMASK = zip_WSIZE - 1;
var zip_NIL = 0; // Tail of hash chains
var zip_TOO_FAR = 4096;
var zip_MIN_LOOKAHEAD = zip_MAX_MATCH + zip_MIN_MATCH + 1;
var zip_MAX_DIST = zip_WSIZE - zip_MIN_LOOKAHEAD;
var zip_SMALLEST = 1;
var zip_MAX_BITS = 15;
var zip_MAX_BL_BITS = 7;
var zip_LENGTH_CODES = 29;
var zip_LITERALS =256;
var zip_END_BLOCK = 256;
var zip_L_CODES = zip_LITERALS + 1 + zip_LENGTH_CODES;
var zip_D_CODES = 30;
var zip_BL_CODES = 19;
var zip_REP_3_6 = 16;
var zip_REPZ_3_10 = 17;
var zip_REPZ_11_138 = 18;
var zip_HEAP_SIZE = 2 * zip_L_CODES + 1;
var zip_H_SHIFT = parseInt((zip_HASH_BITS + zip_MIN_MATCH - 1) /
			   zip_MIN_MATCH);

/* variables */
var zip_free_queue;
var zip_qhead, zip_qtail;
var zip_initflag;
var zip_outbuf = null;
var zip_outcnt, zip_outoff;
var zip_complete;
var zip_window;
var zip_d_buf;
var zip_l_buf;
var zip_prev;
var zip_bi_buf;
var zip_bi_valid;
var zip_block_start;
var zip_ins_h;
var zip_hash_head;
var zip_prev_match;
var zip_match_available;
var zip_match_length;
var zip_prev_length;
var zip_strstart;
var zip_match_start;
var zip_eofile;
var zip_lookahead;
var zip_max_chain_length;
var zip_max_lazy_match;
var zip_compr_level;
var zip_good_match;
var zip_nice_match;
var zip_dyn_ltree;
var zip_dyn_dtree;
var zip_static_ltree;
var zip_static_dtree;
var zip_bl_tree;
var zip_l_desc;
var zip_d_desc;
var zip_bl_desc;
var zip_bl_count;
var zip_heap;
var zip_heap_len;
var zip_heap_max;
var zip_depth;
var zip_length_code;
var zip_dist_code;
var zip_base_length;
var zip_base_dist;
var zip_flag_buf;
var zip_last_lit;
var zip_last_dist;
var zip_last_flags;
var zip_flags;
var zip_flag_bit;
var zip_opt_len;
var zip_static_len;
var zip_deflate_data;
var zip_deflate_pos;

/* objects (deflate) */

var zip_DeflateCT = function() {
    this.fc = 0; // frequency count or bit string
    this.dl = 0; // father node in Huffman tree or length of bit string
}

var zip_DeflateTreeDesc = function() {
    this.dyn_tree = null;	// the dynamic tree
    this.static_tree = null;	// corresponding static tree or NULL
    this.extra_bits = null;	// extra bits for each code or NULL
    this.extra_base = 0;	// base index for extra_bits
    this.elems = 0;		// max number of elements in the tree
    this.max_length = 0;	// max bit length for the codes
    this.max_code = 0;		// largest code with non zero frequency
}

/* Values for max_lazy_match, good_match and max_chain_length, depending on
 * the desired pack level (0..9). The values given below have been tuned to
 * exclude worst case performance for pathological files. Better values may be
 * found for specific files.
 */
var zip_DeflateConfiguration = function(a, b, c, d) {
    this.good_length = a; // reduce lazy search above this match length
    this.max_lazy = b;    // do not perform lazy search above this match length
    this.nice_length = c; // quit search above this match length
    this.max_chain = d;
}

var zip_DeflateBuffer = function() {
    this.next = null;
    this.len = 0;
    this.ptr = new Array(zip_OUTBUFSIZ);
    this.off = 0;
}

/* constant tables */
var zip_extra_lbits = new Array(
    0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0);
var zip_extra_dbits = new Array(
    0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13);
var zip_extra_blbits = new Array(
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7);
var zip_bl_order = new Array(
    16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15);
var zip_configuration_table = new Array(
	new zip_DeflateConfiguration(0,    0,   0,    0),
	new zip_DeflateConfiguration(4,    4,   8,    4),
	new zip_DeflateConfiguration(4,    5,  16,    8),
	new zip_DeflateConfiguration(4,    6,  32,   32),
	new zip_DeflateConfiguration(4,    4,  16,   16),
	new zip_DeflateConfiguration(8,   16,  32,   32),
	new zip_DeflateConfiguration(8,   16, 128,  128),
	new zip_DeflateConfiguration(8,   32, 128,  256),
	new zip_DeflateConfiguration(32, 128, 258, 1024),
	new zip_DeflateConfiguration(32, 258, 258, 4096));


/* routines (deflate) */

var zip_deflate_start = function(level) {
    var i;

    if(!level)
	level = zip_DEFAULT_LEVEL;
    else if(level < 1)
	level = 1;
    else if(level > 9)
	level = 9;

    zip_compr_level = level;
    zip_initflag = false;
    zip_eofile = false;
    if(zip_outbuf != null)
	return;

    zip_free_queue = zip_qhead = zip_qtail = null;
    zip_outbuf = new Array(zip_OUTBUFSIZ);
    zip_window = new Array(zip_window_size);
    zip_d_buf = new Array(zip_DIST_BUFSIZE);
    zip_l_buf = new Array(zip_INBUFSIZ + zip_INBUF_EXTRA);
    zip_prev = new Array(1 << zip_BITS);
    zip_dyn_ltree = new Array(zip_HEAP_SIZE);
    for(i = 0; i < zip_HEAP_SIZE; i++)
	zip_dyn_ltree[i] = new zip_DeflateCT();
    zip_dyn_dtree = new Array(2*zip_D_CODES+1);
    for(i = 0; i < 2*zip_D_CODES+1; i++)
	zip_dyn_dtree[i] = new zip_DeflateCT();
    zip_static_ltree = new Array(zip_L_CODES+2);
    for(i = 0; i < zip_L_CODES+2; i++)
	zip_static_ltree[i] = new zip_DeflateCT();
    zip_static_dtree = new Array(zip_D_CODES);
    for(i = 0; i < zip_D_CODES; i++)
	zip_static_dtree[i] = new zip_DeflateCT();
    zip_bl_tree = new Array(2*zip_BL_CODES+1);
    for(i = 0; i < 2*zip_BL_CODES+1; i++)
	zip_bl_tree[i] = new zip_DeflateCT();
    zip_l_desc = new zip_DeflateTreeDesc();
    zip_d_desc = new zip_DeflateTreeDesc();
    zip_bl_desc = new zip_DeflateTreeDesc();
    zip_bl_count = new Array(zip_MAX_BITS+1);
    zip_heap = new Array(2*zip_L_CODES+1);
    zip_depth = new Array(2*zip_L_CODES+1);
    zip_length_code = new Array(zip_MAX_MATCH-zip_MIN_MATCH+1);
    zip_dist_code = new Array(512);
    zip_base_length = new Array(zip_LENGTH_CODES);
    zip_base_dist = new Array(zip_D_CODES);
    zip_flag_buf = new Array(parseInt(zip_LIT_BUFSIZE / 8));
}

var zip_deflate_end = function() {
    zip_free_queue = zip_qhead = zip_qtail = null;
    zip_outbuf = null;
    zip_window = null;
    zip_d_buf = null;
    zip_l_buf = null;
    zip_prev = null;
    zip_dyn_ltree = null;
    zip_dyn_dtree = null;
    zip_static_ltree = null;
    zip_static_dtree = null;
    zip_bl_tree = null;
    zip_l_desc = null;
    zip_d_desc = null;
    zip_bl_desc = null;
    zip_bl_count = null;
    zip_heap = null;
    zip_depth = null;
    zip_length_code = null;
    zip_dist_code = null;
    zip_base_length = null;
    zip_base_dist = null;
    zip_flag_buf = null;
}

var zip_reuse_queue = function(p) {
    p.next = zip_free_queue;
    zip_free_queue = p;
}

var zip_new_queue = function() {
    var p;

    if(zip_free_queue != null)
    {
	p = zip_free_queue;
	zip_free_queue = zip_free_queue.next;
    }
    else
	p = new zip_DeflateBuffer();
    p.next = null;
    p.len = p.off = 0;

    return p;
}

var zip_head1 = function(i) {
    return zip_prev[zip_WSIZE + i];
}

var zip_head2 = function(i, val) {
    return zip_prev[zip_WSIZE + i] = val;
}

/* put_byte is used for the compressed output, put_ubyte for the
 * uncompressed output. However unlzw() uses window for its
 * suffix table instead of its output buffer, so it does not use put_ubyte
 * (to be cleaned up).
 */
var zip_put_byte = function(c) {
    zip_outbuf[zip_outoff + zip_outcnt++] = c;
    if(zip_outoff + zip_outcnt == zip_OUTBUFSIZ)
	zip_qoutbuf();
}

/* Output a 16 bit value, lsb first */
var zip_put_short = function(w) {
    w &= 0xffff;
    if(zip_outoff + zip_outcnt < zip_OUTBUFSIZ - 2) {
	zip_outbuf[zip_outoff + zip_outcnt++] = (w & 0xff);
	zip_outbuf[zip_outoff + zip_outcnt++] = (w >>> 8);
    } else {
	zip_put_byte(w & 0xff);
	zip_put_byte(w >>> 8);
    }
}

/* ==========================================================================
 * Insert string s in the dictionary and set match_head to the previous head
 * of the hash chain (the most recent string with same hash key). Return
 * the previous length of the hash chain.
 * IN  assertion: all calls to to INSERT_STRING are made with consecutive
 *    input characters and the first MIN_MATCH bytes of s are valid
 *    (except for the last MIN_MATCH-1 bytes of the input file).
 */
var zip_INSERT_STRING = function() {
    zip_ins_h = ((zip_ins_h << zip_H_SHIFT)
		 ^ (zip_window[zip_strstart + zip_MIN_MATCH - 1] & 0xff))
	& zip_HASH_MASK;
    zip_hash_head = zip_head1(zip_ins_h);
    zip_prev[zip_strstart & zip_WMASK] = zip_hash_head;
    zip_head2(zip_ins_h, zip_strstart);
}

/* Send a code of the given tree. c and tree must not have side effects */
var zip_SEND_CODE = function(c, tree) {
    zip_send_bits(tree[c].fc, tree[c].dl);
}

/* Mapping from a distance to a distance code. dist is the distance - 1 and
 * must not have side effects. dist_code[256] and dist_code[257] are never
 * used.
 */
var zip_D_CODE = function(dist) {
    return (dist < 256 ? zip_dist_code[dist]
	    : zip_dist_code[256 + (dist>>7)]) & 0xff;
}

/* ==========================================================================
 * Compares to subtrees, using the tree depth as tie breaker when
 * the subtrees have equal frequency. This minimizes the worst case length.
 */
var zip_SMALLER = function(tree, n, m) {
    return tree[n].fc < tree[m].fc ||
      (tree[n].fc == tree[m].fc && zip_depth[n] <= zip_depth[m]);
}

/* ==========================================================================
 * read string data
 */
var zip_read_buff = function(buff, offset, n) {
    var i;
    for(i = 0; i < n && zip_deflate_pos < zip_deflate_data.length; i++)
	buff[offset + i] =
	    zip_deflate_data.charCodeAt(zip_deflate_pos++) & 0xff;
    return i;
}

/* ==========================================================================
 * Initialize the "longest match" routines for a new file
 */
var zip_lm_init = function() {
    var j;

    /* Initialize the hash table. */
    for(j = 0; j < zip_HASH_SIZE; j++)
//	zip_head2(j, zip_NIL);
	zip_prev[zip_WSIZE + j] = 0;
    /* prev will be initialized on the fly */

    /* Set the default configuration parameters:
     */
    zip_max_lazy_match = zip_configuration_table[zip_compr_level].max_lazy;
    zip_good_match     = zip_configuration_table[zip_compr_level].good_length;
    if(!zip_FULL_SEARCH)
	zip_nice_match = zip_configuration_table[zip_compr_level].nice_length;
    zip_max_chain_length = zip_configuration_table[zip_compr_level].max_chain;

    zip_strstart = 0;
    zip_block_start = 0;

    zip_lookahead = zip_read_buff(zip_window, 0, 2 * zip_WSIZE);
    if(zip_lookahead <= 0) {
	zip_eofile = true;
	zip_lookahead = 0;
	return;
    }
    zip_eofile = false;
    /* Make sure that we always have enough lookahead. This is important
     * if input comes from a device such as a tty.
     */
    while(zip_lookahead < zip_MIN_LOOKAHEAD && !zip_eofile)
	zip_fill_window();

    /* If lookahead < MIN_MATCH, ins_h is garbage, but this is
     * not important since only literal bytes will be emitted.
     */
    zip_ins_h = 0;
    for(j = 0; j < zip_MIN_MATCH - 1; j++) {
//      UPDATE_HASH(ins_h, window[j]);
	zip_ins_h = ((zip_ins_h << zip_H_SHIFT) ^ (zip_window[j] & 0xff)) & zip_HASH_MASK;
    }
}

/* ==========================================================================
 * Set match_start to the longest match starting at the given string and
 * return its length. Matches shorter or equal to prev_length are discarded,
 * in which case the result is equal to prev_length and match_start is
 * garbage.
 * IN assertions: cur_match is the head of the hash chain for the current
 *   string (strstart) and its distance is <= MAX_DIST, and prev_length >= 1
 */
var zip_longest_match = function(cur_match) {
    var chain_length = zip_max_chain_length; // max hash chain length
    var scanp = zip_strstart; // current string
    var matchp;		// matched string
    var len;		// length of current match
    var best_len = zip_prev_length;	// best match length so far

    /* Stop when cur_match becomes <= limit. To simplify the code,
     * we prevent matches with the string of window index 0.
     */
    var limit = (zip_strstart > zip_MAX_DIST ? zip_strstart - zip_MAX_DIST : zip_NIL);

    var strendp = zip_strstart + zip_MAX_MATCH;
    var scan_end1 = zip_window[scanp + best_len - 1];
    var scan_end  = zip_window[scanp + best_len];

    /* Do not waste too much time if we already have a good match: */
    if(zip_prev_length >= zip_good_match)
	chain_length >>= 2;

//  Assert(encoder->strstart <= window_size-MIN_LOOKAHEAD, "insufficient lookahead");

    do {
//    Assert(cur_match < encoder->strstart, "no future");
	matchp = cur_match;

	/* Skip to next match if the match length cannot increase
	    * or if the match length is less than 2:
	*/
	if(zip_window[matchp + best_len]	!= scan_end  ||
	   zip_window[matchp + best_len - 1]	!= scan_end1 ||
	   zip_window[matchp]			!= zip_window[scanp] ||
	   zip_window[++matchp]			!= zip_window[scanp + 1]) {
	    continue;
	}

	/* The check at best_len-1 can be removed because it will be made
         * again later. (This heuristic is not always a win.)
         * It is not necessary to compare scan[2] and match[2] since they
         * are always equal when the other bytes match, given that
         * the hash keys are equal and that HASH_BITS >= 8.
         */
	scanp += 2;
	matchp++;

	/* We check for insufficient lookahead only every 8th comparison;
         * the 256th check will be made at strstart+258.
         */
	do {
	} while(zip_window[++scanp] == zip_window[++matchp] &&
		zip_window[++scanp] == zip_window[++matchp] &&
		zip_window[++scanp] == zip_window[++matchp] &&
		zip_window[++scanp] == zip_window[++matchp] &&
		zip_window[++scanp] == zip_window[++matchp] &&
		zip_window[++scanp] == zip_window[++matchp] &&
		zip_window[++scanp] == zip_window[++matchp] &&
		zip_window[++scanp] == zip_window[++matchp] &&
		scanp < strendp);

      len = zip_MAX_MATCH - (strendp - scanp);
      scanp = strendp - zip_MAX_MATCH;

      if(len > best_len) {
	  zip_match_start = cur_match;
	  best_len = len;
	  if(zip_FULL_SEARCH) {
	      if(len >= zip_MAX_MATCH) break;
	  } else {
	      if(len >= zip_nice_match) break;
	  }

	  scan_end1  = zip_window[scanp + best_len-1];
	  scan_end   = zip_window[scanp + best_len];
      }
    } while((cur_match = zip_prev[cur_match & zip_WMASK]) > limit
	    && --chain_length != 0);

    return best_len;
}

/* ==========================================================================
 * Fill the window when the lookahead becomes insufficient.
 * Updates strstart and lookahead, and sets eofile if end of input file.
 * IN assertion: lookahead < MIN_LOOKAHEAD && strstart + lookahead > 0
 * OUT assertions: at least one byte has been read, or eofile is set;
 *    file reads are performed for at least two bytes (required for the
 *    translate_eol option).
 */
var zip_fill_window = function() {
    var n, m;

    // Amount of free space at the end of the window.
    var more = zip_window_size - zip_lookahead - zip_strstart;

    /* If the window is almost full and there is insufficient lookahead,
     * move the upper half to the lower one to make room in the upper half.
     */
    if(more == -1) {
	/* Very unlikely, but possible on 16 bit machine if strstart == 0
         * and lookahead == 1 (input done one byte at time)
         */
	more--;
    } else if(zip_strstart >= zip_WSIZE + zip_MAX_DIST) {
	/* By the IN assertion, the window is not empty so we can't confuse
         * more == 0 with more == 64K on a 16 bit machine.
         */
//	Assert(window_size == (ulg)2*WSIZE, "no sliding with BIG_MEM");

//	System.arraycopy(window, WSIZE, window, 0, WSIZE);
	for(n = 0; n < zip_WSIZE; n++)
	    zip_window[n] = zip_window[n + zip_WSIZE];
      
	zip_match_start -= zip_WSIZE;
	zip_strstart    -= zip_WSIZE; /* we now have strstart >= MAX_DIST: */
	zip_block_start -= zip_WSIZE;

	for(n = 0; n < zip_HASH_SIZE; n++) {
	    m = zip_head1(n);
	    zip_head2(n, m >= zip_WSIZE ? m - zip_WSIZE : zip_NIL);
	}
	for(n = 0; n < zip_WSIZE; n++) {
	    /* If n is not on any hash chain, prev[n] is garbage but
	     * its value will never be used.
	     */
	    m = zip_prev[n];
	    zip_prev[n] = (m >= zip_WSIZE ? m - zip_WSIZE : zip_NIL);
	}
	more += zip_WSIZE;
    }
    // At this point, more >= 2
    if(!zip_eofile) {
	n = zip_read_buff(zip_window, zip_strstart + zip_lookahead, more);
	if(n <= 0)
	    zip_eofile = true;
	else
	    zip_lookahead += n;
    }
}

/* ==========================================================================
 * Processes a new input file and return its compressed length. This
 * function does not perform lazy evaluationof matches and inserts
 * new strings in the dictionary only for unmatched strings or for short
 * matches. It is used only for the fast compression options.
 */
var zip_deflate_fast = function() {
    while(zip_lookahead != 0 && zip_qhead == null) {
	var flush; // set if current block must be flushed

	/* Insert the string window[strstart .. strstart+2] in the
	 * dictionary, and set hash_head to the head of the hash chain:
	 */
	zip_INSERT_STRING();

	/* Find the longest match, discarding those <= prev_length.
	 * At this point we have always match_length < MIN_MATCH
	 */
	if(zip_hash_head != zip_NIL &&
	   zip_strstart - zip_hash_head <= zip_MAX_DIST) {
	    /* To simplify the code, we prevent matches with the string
	     * of window index 0 (in particular we have to avoid a match
	     * of the string with itself at the start of the input file).
	     */
	    zip_match_length = zip_longest_match(zip_hash_head);
	    /* longest_match() sets match_start */
	    if(zip_match_length > zip_lookahead)
		zip_match_length = zip_lookahead;
	}
	if(zip_match_length >= zip_MIN_MATCH) {
//	    check_match(strstart, match_start, match_length);

	    flush = zip_ct_tally(zip_strstart - zip_match_start,
				 zip_match_length - zip_MIN_MATCH);
	    zip_lookahead -= zip_match_length;

	    /* Insert new strings in the hash table only if the match length
	     * is not too large. This saves time but degrades compression.
	     */
	    if(zip_match_length <= zip_max_lazy_match) {
		zip_match_length--; // string at strstart already in hash table
		do {
		    zip_strstart++;
		    zip_INSERT_STRING();
		    /* strstart never exceeds WSIZE-MAX_MATCH, so there are
		     * always MIN_MATCH bytes ahead. If lookahead < MIN_MATCH
		     * these bytes are garbage, but it does not matter since
		     * the next lookahead bytes will be emitted as literals.
		     */
		} while(--zip_match_length != 0);
		zip_strstart++;
	    } else {
		zip_strstart += zip_match_length;
		zip_match_length = 0;
		zip_ins_h = zip_window[zip_strstart] & 0xff;
//		UPDATE_HASH(ins_h, window[strstart + 1]);
		zip_ins_h = ((zip_ins_h<<zip_H_SHIFT) ^ (zip_window[zip_strstart + 1] & 0xff)) & zip_HASH_MASK;

//#if MIN_MATCH != 3
//		Call UPDATE_HASH() MIN_MATCH-3 more times
//#endif

	    }
	} else {
	    /* No match, output a literal byte */
	    flush = zip_ct_tally(0, zip_window[zip_strstart] & 0xff);
	    zip_lookahead--;
	    zip_strstart++;
	}
	if(flush) {
	    zip_flush_block(0);
	    zip_block_start = zip_strstart;
	}

	/* Make sure that we always have enough lookahead, except
	 * at the end of the input file. We need MAX_MATCH bytes
	 * for the next match, plus MIN_MATCH bytes to insert the
	 * string following the next match.
	 */
	while(zip_lookahead < zip_MIN_LOOKAHEAD && !zip_eofile)
	    zip_fill_window();
    }
}

var zip_deflate_better = function() {
    /* Process the input block. */
    while(zip_lookahead != 0 && zip_qhead == null) {
	/* Insert the string window[strstart .. strstart+2] in the
	 * dictionary, and set hash_head to the head of the hash chain:
	 */
	zip_INSERT_STRING();

	/* Find the longest match, discarding those <= prev_length.
	 */
	zip_prev_length = zip_match_length;
	zip_prev_match = zip_match_start;
	zip_match_length = zip_MIN_MATCH - 1;

	if(zip_hash_head != zip_NIL &&
	   zip_prev_length < zip_max_lazy_match &&
	   zip_strstart - zip_hash_head <= zip_MAX_DIST) {
	    /* To simplify the code, we prevent matches with the string
	     * of window index 0 (in particular we have to avoid a match
	     * of the string with itself at the start of the input file).
	     */
	    zip_match_length = zip_longest_match(zip_hash_head);
	    /* longest_match() sets match_start */
	    if(zip_match_length > zip_lookahead)
		zip_match_length = zip_lookahead;

	    /* Ignore a length 3 match if it is too distant: */
	    if(zip_match_length == zip_MIN_MATCH &&
	       zip_strstart - zip_match_start > zip_TOO_FAR) {
		/* If prev_match is also MIN_MATCH, match_start is garbage
		 * but we will ignore the current match anyway.
		 */
		zip_match_length--;
	    }
	}
	/* If there was a match at the previous step and the current
	 * match is not better, output the previous match:
	 */
	if(zip_prev_length >= zip_MIN_MATCH &&
	   zip_match_length <= zip_prev_length) {
	    var flush; // set if current block must be flushed

//	    check_match(strstart - 1, prev_match, prev_length);
	    flush = zip_ct_tally(zip_strstart - 1 - zip_prev_match,
				 zip_prev_length - zip_MIN_MATCH);

	    /* Insert in hash table all strings up to the end of the match.
	     * strstart-1 and strstart are already inserted.
	     */
	    zip_lookahead -= zip_prev_length - 1;
	    zip_prev_length -= 2;
	    do {
		zip_strstart++;
		zip_INSERT_STRING();
		/* strstart never exceeds WSIZE-MAX_MATCH, so there are
		 * always MIN_MATCH bytes ahead. If lookahead < MIN_MATCH
		 * these bytes are garbage, but it does not matter since the
		 * next lookahead bytes will always be emitted as literals.
		 */
	    } while(--zip_prev_length != 0);
	    zip_match_available = 0;
	    zip_match_length = zip_MIN_MATCH - 1;
	    zip_strstart++;
	    if(flush) {
		zip_flush_block(0);
		zip_block_start = zip_strstart;
	    }
	} else if(zip_match_available != 0) {
	    /* If there was no match at the previous position, output a
	     * single literal. If there was a match but the current match
	     * is longer, truncate the previous match to a single literal.
	     */
	    if(zip_ct_tally(0, zip_window[zip_strstart - 1] & 0xff)) {
		zip_flush_block(0);
		zip_block_start = zip_strstart;
	    }
	    zip_strstart++;
	    zip_lookahead--;
	} else {
	    /* There is no previous match to compare with, wait for
	     * the next step to decide.
	     */
	    zip_match_available = 1;
	    zip_strstart++;
	    zip_lookahead--;
	}

	/* Make sure that we always have enough lookahead, except
	 * at the end of the input file. We need MAX_MATCH bytes
	 * for the next match, plus MIN_MATCH bytes to insert the
	 * string following the next match.
	 */
	while(zip_lookahead < zip_MIN_LOOKAHEAD && !zip_eofile)
	    zip_fill_window();
    }
}

var zip_init_deflate = function() {
    if(zip_eofile)
	return;
    zip_bi_buf = 0;
    zip_bi_valid = 0;
    zip_ct_init();
    zip_lm_init();

    zip_qhead = null;
    zip_outcnt = 0;
    zip_outoff = 0;
    zip_match_available = 0;

    if(zip_compr_level <= 3)
    {
	zip_prev_length = zip_MIN_MATCH - 1;
	zip_match_length = 0;
    }
    else
    {
	zip_match_length = zip_MIN_MATCH - 1;
	zip_match_available = 0;
        zip_match_available = 0;
    }

    zip_complete = false;
}

/* ==========================================================================
 * Same as above, but achieves better compression. We use a lazy
 * evaluation for matches: a match is finally adopted only if there is
 * no better match at the next window position.
 */
var zip_deflate_internal = function(buff, off, buff_size) {
    var n;

    if(!zip_initflag)
    {
	zip_init_deflate();
	zip_initflag = true;
	if(zip_lookahead == 0) { // empty
	    zip_complete = true;
	    return 0;
	}
    }

    if((n = zip_qcopy(buff, off, buff_size)) == buff_size)
	return buff_size;

    if(zip_complete)
	return n;

    if(zip_compr_level <= 3) // optimized for speed
	zip_deflate_fast();
    else
	zip_deflate_better();
    if(zip_lookahead == 0) {
	if(zip_match_available != 0)
	    zip_ct_tally(0, zip_window[zip_strstart - 1] & 0xff);
	zip_flush_block(1);
	zip_complete = true;
    }
    return n + zip_qcopy(buff, n + off, buff_size - n);
}

var zip_qcopy = function(buff, off, buff_size) {
    var n, i, j;

    n = 0;
    while(zip_qhead != null && n < buff_size)
    {
	i = buff_size - n;
	if(i > zip_qhead.len)
	    i = zip_qhead.len;
//      System.arraycopy(qhead.ptr, qhead.off, buff, off + n, i);
	for(j = 0; j < i; j++)
	    buff[off + n + j] = zip_qhead.ptr[zip_qhead.off + j];
	
	zip_qhead.off += i;
	zip_qhead.len -= i;
	n += i;
	if(zip_qhead.len == 0) {
	    var p;
	    p = zip_qhead;
	    zip_qhead = zip_qhead.next;
	    zip_reuse_queue(p);
	}
    }

    if(n == buff_size)
	return n;

    if(zip_outoff < zip_outcnt) {
	i = buff_size - n;
	if(i > zip_outcnt - zip_outoff)
	    i = zip_outcnt - zip_outoff;
	// System.arraycopy(outbuf, outoff, buff, off + n, i);
	for(j = 0; j < i; j++)
	    buff[off + n + j] = zip_outbuf[zip_outoff + j];
	zip_outoff += i;
	n += i;
	if(zip_outcnt == zip_outoff)
	    zip_outcnt = zip_outoff = 0;
    }
    return n;
}

/* ==========================================================================
 * Allocate the match buffer, initialize the various tables and save the
 * location of the internal file attribute (ascii/binary) and method
 * (DEFLATE/STORE).
 */
var zip_ct_init = function() {
    var n;	// iterates over tree elements
    var bits;	// bit counter
    var length;	// length value
    var code;	// code value
    var dist;	// distance index

    if(zip_static_dtree[0].dl != 0) return; // ct_init already called

    zip_l_desc.dyn_tree		= zip_dyn_ltree;
    zip_l_desc.static_tree	= zip_static_ltree;
    zip_l_desc.extra_bits	= zip_extra_lbits;
    zip_l_desc.extra_base	= zip_LITERALS + 1;
    zip_l_desc.elems		= zip_L_CODES;
    zip_l_desc.max_length	= zip_MAX_BITS;
    zip_l_desc.max_code		= 0;

    zip_d_desc.dyn_tree		= zip_dyn_dtree;
    zip_d_desc.static_tree	= zip_static_dtree;
    zip_d_desc.extra_bits	= zip_extra_dbits;
    zip_d_desc.extra_base	= 0;
    zip_d_desc.elems		= zip_D_CODES;
    zip_d_desc.max_length	= zip_MAX_BITS;
    zip_d_desc.max_code		= 0;

    zip_bl_desc.dyn_tree	= zip_bl_tree;
    zip_bl_desc.static_tree	= null;
    zip_bl_desc.extra_bits	= zip_extra_blbits;
    zip_bl_desc.extra_base	= 0;
    zip_bl_desc.elems		= zip_BL_CODES;
    zip_bl_desc.max_length	= zip_MAX_BL_BITS;
    zip_bl_desc.max_code	= 0;

    // Initialize the mapping length (0..255) -> length code (0..28)
    length = 0;
    for(code = 0; code < zip_LENGTH_CODES-1; code++) {
	zip_base_length[code] = length;
	for(n = 0; n < (1<<zip_extra_lbits[code]); n++)
	    zip_length_code[length++] = code;
    }
    // Assert (length == 256, "ct_init: length != 256");

    /* Note that the length 255 (match length 258) can be represented
     * in two different ways: code 284 + 5 bits or code 285, so we
     * overwrite length_code[255] to use the best encoding:
     */
    zip_length_code[length-1] = code;

    /* Initialize the mapping dist (0..32K) -> dist code (0..29) */
    dist = 0;
    for(code = 0 ; code < 16; code++) {
	zip_base_dist[code] = dist;
	for(n = 0; n < (1<<zip_extra_dbits[code]); n++) {
	    zip_dist_code[dist++] = code;
	}
    }
    // Assert (dist == 256, "ct_init: dist != 256");
    dist >>= 7; // from now on, all distances are divided by 128
    for( ; code < zip_D_CODES; code++) {
	zip_base_dist[code] = dist << 7;
	for(n = 0; n < (1<<(zip_extra_dbits[code]-7)); n++)
	    zip_dist_code[256 + dist++] = code;
    }
    // Assert (dist == 256, "ct_init: 256+dist != 512");

    // Construct the codes of the static literal tree
    for(bits = 0; bits <= zip_MAX_BITS; bits++)
	zip_bl_count[bits] = 0;
    n = 0;
    while(n <= 143) { zip_static_ltree[n++].dl = 8; zip_bl_count[8]++; }
    while(n <= 255) { zip_static_ltree[n++].dl = 9; zip_bl_count[9]++; }
    while(n <= 279) { zip_static_ltree[n++].dl = 7; zip_bl_count[7]++; }
    while(n <= 287) { zip_static_ltree[n++].dl = 8; zip_bl_count[8]++; }
    /* Codes 286 and 287 do not exist, but we must include them in the
     * tree construction to get a canonical Huffman tree (longest code
     * all ones)
     */
    zip_gen_codes(zip_static_ltree, zip_L_CODES + 1);

    /* The static distance tree is trivial: */
    for(n = 0; n < zip_D_CODES; n++) {
	zip_static_dtree[n].dl = 5;
	zip_static_dtree[n].fc = zip_bi_reverse(n, 5);
    }

    // Initialize the first block of the first file:
    zip_init_block();
}

/* ==========================================================================
 * Initialize a new block.
 */
var zip_init_block = function() {
    var n; // iterates over tree elements

    // Initialize the trees.
    for(n = 0; n < zip_L_CODES;  n++) zip_dyn_ltree[n].fc = 0;
    for(n = 0; n < zip_D_CODES;  n++) zip_dyn_dtree[n].fc = 0;
    for(n = 0; n < zip_BL_CODES; n++) zip_bl_tree[n].fc = 0;

    zip_dyn_ltree[zip_END_BLOCK].fc = 1;
    zip_opt_len = zip_static_len = 0;
    zip_last_lit = zip_last_dist = zip_last_flags = 0;
    zip_flags = 0;
    zip_flag_bit = 1;
}

/* ==========================================================================
 * Restore the heap property by moving down the tree starting at node k,
 * exchanging a node with the smallest of its two sons if necessary, stopping
 * when the heap property is re-established (each father smaller than its
 * two sons).
 */
var zip_pqdownheap = function(
    tree,	// the tree to restore
    k) {	// node to move down
    var v = zip_heap[k];
    var j = k << 1;	// left son of k

    while(j <= zip_heap_len) {
	// Set j to the smallest of the two sons:
	if(j < zip_heap_len &&
	   zip_SMALLER(tree, zip_heap[j + 1], zip_heap[j]))
	    j++;

	// Exit if v is smaller than both sons
	if(zip_SMALLER(tree, v, zip_heap[j]))
	    break;

	// Exchange v with the smallest son
	zip_heap[k] = zip_heap[j];
	k = j;

	// And continue down the tree, setting j to the left son of k
	j <<= 1;
    }
    zip_heap[k] = v;
}

/* ==========================================================================
 * Compute the optimal bit lengths for a tree and update the total bit length
 * for the current block.
 * IN assertion: the fields freq and dad are set, heap[heap_max] and
 *    above are the tree nodes sorted by increasing frequency.
 * OUT assertions: the field len is set to the optimal bit length, the
 *     array bl_count contains the frequencies for each bit length.
 *     The length opt_len is updated; static_len is also updated if stree is
 *     not null.
 */
var zip_gen_bitlen = function(desc) { // the tree descriptor
    var tree		= desc.dyn_tree;
    var extra		= desc.extra_bits;
    var base		= desc.extra_base;
    var max_code	= desc.max_code;
    var max_length	= desc.max_length;
    var stree		= desc.static_tree;
    var h;		// heap index
    var n, m;		// iterate over the tree elements
    var bits;		// bit length
    var xbits;		// extra bits
    var f;		// frequency
    var overflow = 0;	// number of elements with bit length too large

    for(bits = 0; bits <= zip_MAX_BITS; bits++)
	zip_bl_count[bits] = 0;

    /* In a first pass, compute the optimal bit lengths (which may
     * overflow in the case of the bit length tree).
     */
    tree[zip_heap[zip_heap_max]].dl = 0; // root of the heap

    for(h = zip_heap_max + 1; h < zip_HEAP_SIZE; h++) {
	n = zip_heap[h];
	bits = tree[tree[n].dl].dl + 1;
	if(bits > max_length) {
	    bits = max_length;
	    overflow++;
	}
	tree[n].dl = bits;
	// We overwrite tree[n].dl which is no longer needed

	if(n > max_code)
	    continue; // not a leaf node

	zip_bl_count[bits]++;
	xbits = 0;
	if(n >= base)
	    xbits = extra[n - base];
	f = tree[n].fc;
	zip_opt_len += f * (bits + xbits);
	if(stree != null)
	    zip_static_len += f * (stree[n].dl + xbits);
    }
    if(overflow == 0)
	return;

    // This happens for example on obj2 and pic of the Calgary corpus

    // Find the first bit length which could increase:
    do {
	bits = max_length - 1;
	while(zip_bl_count[bits] == 0)
	    bits--;
	zip_bl_count[bits]--;		// move one leaf down the tree
	zip_bl_count[bits + 1] += 2;	// move one overflow item as its brother
	zip_bl_count[max_length]--;
	/* The brother of the overflow item also moves one step up,
	 * but this does not affect bl_count[max_length]
	 */
	overflow -= 2;
    } while(overflow > 0);

    /* Now recompute all bit lengths, scanning in increasing frequency.
     * h is still equal to HEAP_SIZE. (It is simpler to reconstruct all
     * lengths instead of fixing only the wrong ones. This idea is taken
     * from 'ar' written by Haruhiko Okumura.)
     */
    for(bits = max_length; bits != 0; bits--) {
	n = zip_bl_count[bits];
	while(n != 0) {
	    m = zip_heap[--h];
	    if(m > max_code)
		continue;
	    if(tree[m].dl != bits) {
		zip_opt_len += (bits - tree[m].dl) * tree[m].fc;
		tree[m].fc = bits;
	    }
	    n--;
	}
    }
}

  /* ==========================================================================
   * Generate the codes for a given tree and bit counts (which need not be
   * optimal).
   * IN assertion: the array bl_count contains the bit length statistics for
   * the given tree and the field len is set for all tree elements.
   * OUT assertion: the field code is set for all tree elements of non
   *     zero code length.
   */
var zip_gen_codes = function(tree,	// the tree to decorate
		   max_code) {	// largest code with non zero frequency
    var next_code = new Array(zip_MAX_BITS+1); // next code value for each bit length
    var code = 0;		// running code value
    var bits;			// bit index
    var n;			// code index

    /* The distribution counts are first used to generate the code values
     * without bit reversal.
     */
    for(bits = 1; bits <= zip_MAX_BITS; bits++) {
	code = ((code + zip_bl_count[bits-1]) << 1);
	next_code[bits] = code;
    }

    /* Check that the bit counts in bl_count are consistent. The last code
     * must be all ones.
     */
//    Assert (code + encoder->bl_count[MAX_BITS]-1 == (1<<MAX_BITS)-1,
//	    "inconsistent bit counts");
//    Tracev((stderr,"\ngen_codes: max_code %d ", max_code));

    for(n = 0; n <= max_code; n++) {
	var len = tree[n].dl;
	if(len == 0)
	    continue;
	// Now reverse the bits
	tree[n].fc = zip_bi_reverse(next_code[len]++, len);

//      Tracec(tree != static_ltree, (stderr,"\nn %3d %c l %2d c %4x (%x) ",
//	  n, (isgraph(n) ? n : ' '), len, tree[n].fc, next_code[len]-1));
    }
}

/* ==========================================================================
 * Construct one Huffman tree and assigns the code bit strings and lengths.
 * Update the total bit length for the current block.
 * IN assertion: the field freq is set for all tree elements.
 * OUT assertions: the fields len and code are set to the optimal bit length
 *     and corresponding code. The length opt_len is updated; static_len is
 *     also updated if stree is not null. The field max_code is set.
 */
var zip_build_tree = function(desc) { // the tree descriptor
    var tree	= desc.dyn_tree;
    var stree	= desc.static_tree;
    var elems	= desc.elems;
    var n, m;		// iterate over heap elements
    var max_code = -1;	// largest code with non zero frequency
    var node = elems;	// next internal node of the tree

    /* Construct the initial heap, with least frequent element in
     * heap[SMALLEST]. The sons of heap[n] are heap[2*n] and heap[2*n+1].
     * heap[0] is not used.
     */
    zip_heap_len = 0;
    zip_heap_max = zip_HEAP_SIZE;

    for(n = 0; n < elems; n++) {
	if(tree[n].fc != 0) {
	    zip_heap[++zip_heap_len] = max_code = n;
	    zip_depth[n] = 0;
	} else
	    tree[n].dl = 0;
    }

    /* The pkzip format requires that at least one distance code exists,
     * and that at least one bit should be sent even if there is only one
     * possible code. So to avoid special checks later on we force at least
     * two codes of non zero frequency.
     */
    while(zip_heap_len < 2) {
	var xnew = zip_heap[++zip_heap_len] = (max_code < 2 ? ++max_code : 0);
	tree[xnew].fc = 1;
	zip_depth[xnew] = 0;
	zip_opt_len--;
	if(stree != null)
	    zip_static_len -= stree[xnew].dl;
	// new is 0 or 1 so it does not have extra bits
    }
    desc.max_code = max_code;

    /* The elements heap[heap_len/2+1 .. heap_len] are leaves of the tree,
     * establish sub-heaps of increasing lengths:
     */
    for(n = zip_heap_len >> 1; n >= 1; n--)
	zip_pqdownheap(tree, n);

    /* Construct the Huffman tree by repeatedly combining the least two
     * frequent nodes.
     */
    do {
	n = zip_heap[zip_SMALLEST];
	zip_heap[zip_SMALLEST] = zip_heap[zip_heap_len--];
	zip_pqdownheap(tree, zip_SMALLEST);

	m = zip_heap[zip_SMALLEST];  // m = node of next least frequency

	// keep the nodes sorted by frequency
	zip_heap[--zip_heap_max] = n;
	zip_heap[--zip_heap_max] = m;

	// Create a new node father of n and m
	tree[node].fc = tree[n].fc + tree[m].fc;
//	depth[node] = (char)(MAX(depth[n], depth[m]) + 1);
	if(zip_depth[n] > zip_depth[m] + 1)
	    zip_depth[node] = zip_depth[n];
	else
	    zip_depth[node] = zip_depth[m] + 1;
	tree[n].dl = tree[m].dl = node;

	// and insert the new node in the heap
	zip_heap[zip_SMALLEST] = node++;
	zip_pqdownheap(tree, zip_SMALLEST);

    } while(zip_heap_len >= 2);

    zip_heap[--zip_heap_max] = zip_heap[zip_SMALLEST];

    /* At this point, the fields freq and dad are set. We can now
     * generate the bit lengths.
     */
    zip_gen_bitlen(desc);

    // The field len is now set, we can generate the bit codes
    zip_gen_codes(tree, max_code);
}

/* ==========================================================================
 * Scan a literal or distance tree to determine the frequencies of the codes
 * in the bit length tree. Updates opt_len to take into account the repeat
 * counts. (The contribution of the bit length codes will be added later
 * during the construction of bl_tree.)
 */
var zip_scan_tree = function(tree,// the tree to be scanned
		       max_code) {  // and its largest code of non zero frequency
    var n;			// iterates over all tree elements
    var prevlen = -1;		// last emitted length
    var curlen;			// length of current code
    var nextlen = tree[0].dl;	// length of next code
    var count = 0;		// repeat count of the current code
    var max_count = 7;		// max repeat count
    var min_count = 4;		// min repeat count

    if(nextlen == 0) {
	max_count = 138;
	min_count = 3;
    }
    tree[max_code + 1].dl = 0xffff; // guard

    for(n = 0; n <= max_code; n++) {
	curlen = nextlen;
	nextlen = tree[n + 1].dl;
	if(++count < max_count && curlen == nextlen)
	    continue;
	else if(count < min_count)
	    zip_bl_tree[curlen].fc += count;
	else if(curlen != 0) {
	    if(curlen != prevlen)
		zip_bl_tree[curlen].fc++;
	    zip_bl_tree[zip_REP_3_6].fc++;
	} else if(count <= 10)
	    zip_bl_tree[zip_REPZ_3_10].fc++;
	else
	    zip_bl_tree[zip_REPZ_11_138].fc++;
	count = 0; prevlen = curlen;
	if(nextlen == 0) {
	    max_count = 138;
	    min_count = 3;
	} else if(curlen == nextlen) {
	    max_count = 6;
	    min_count = 3;
	} else {
	    max_count = 7;
	    min_count = 4;
	}
    }
}

  /* ==========================================================================
   * Send a literal or distance tree in compressed form, using the codes in
   * bl_tree.
   */
var zip_send_tree = function(tree, // the tree to be scanned
		   max_code) { // and its largest code of non zero frequency
    var n;			// iterates over all tree elements
    var prevlen = -1;		// last emitted length
    var curlen;			// length of current code
    var nextlen = tree[0].dl;	// length of next code
    var count = 0;		// repeat count of the current code
    var max_count = 7;		// max repeat count
    var min_count = 4;		// min repeat count

    /* tree[max_code+1].dl = -1; */  /* guard already set */
    if(nextlen == 0) {
      max_count = 138;
      min_count = 3;
    }

    for(n = 0; n <= max_code; n++) {
	curlen = nextlen;
	nextlen = tree[n+1].dl;
	if(++count < max_count && curlen == nextlen) {
	    continue;
	} else if(count < min_count) {
	    do { zip_SEND_CODE(curlen, zip_bl_tree); } while(--count != 0);
	} else if(curlen != 0) {
	    if(curlen != prevlen) {
		zip_SEND_CODE(curlen, zip_bl_tree);
		count--;
	    }
	    // Assert(count >= 3 && count <= 6, " 3_6?");
	    zip_SEND_CODE(zip_REP_3_6, zip_bl_tree);
	    zip_send_bits(count - 3, 2);
	} else if(count <= 10) {
	    zip_SEND_CODE(zip_REPZ_3_10, zip_bl_tree);
	    zip_send_bits(count-3, 3);
	} else {
	    zip_SEND_CODE(zip_REPZ_11_138, zip_bl_tree);
	    zip_send_bits(count-11, 7);
	}
	count = 0;
	prevlen = curlen;
	if(nextlen == 0) {
	    max_count = 138;
	    min_count = 3;
	} else if(curlen == nextlen) {
	    max_count = 6;
	    min_count = 3;
	} else {
	    max_count = 7;
	    min_count = 4;
	}
    }
}

/* ==========================================================================
 * Construct the Huffman tree for the bit lengths and return the index in
 * bl_order of the last bit length code to send.
 */
var zip_build_bl_tree = function() {
    var max_blindex;  // index of last bit length code of non zero freq

    // Determine the bit length frequencies for literal and distance trees
    zip_scan_tree(zip_dyn_ltree, zip_l_desc.max_code);
    zip_scan_tree(zip_dyn_dtree, zip_d_desc.max_code);

    // Build the bit length tree:
    zip_build_tree(zip_bl_desc);
    /* opt_len now includes the length of the tree representations, except
     * the lengths of the bit lengths codes and the 5+5+4 bits for the counts.
     */

    /* Determine the number of bit length codes to send. The pkzip format
     * requires that at least 4 bit length codes be sent. (appnote.txt says
     * 3 but the actual value used is 4.)
     */
    for(max_blindex = zip_BL_CODES-1; max_blindex >= 3; max_blindex--) {
	if(zip_bl_tree[zip_bl_order[max_blindex]].dl != 0) break;
    }
    /* Update opt_len to include the bit length tree and counts */
    zip_opt_len += 3*(max_blindex+1) + 5+5+4;
//    Tracev((stderr, "\ndyn trees: dyn %ld, stat %ld",
//	    encoder->opt_len, encoder->static_len));

    return max_blindex;
}

/* ==========================================================================
 * Send the header for a block using dynamic Huffman trees: the counts, the
 * lengths of the bit length codes, the literal tree and the distance tree.
 * IN assertion: lcodes >= 257, dcodes >= 1, blcodes >= 4.
 */
var zip_send_all_trees = function(lcodes, dcodes, blcodes) { // number of codes for each tree
    var rank; // index in bl_order

//    Assert (lcodes >= 257 && dcodes >= 1 && blcodes >= 4, "not enough codes");
//    Assert (lcodes <= L_CODES && dcodes <= D_CODES && blcodes <= BL_CODES,
//	    "too many codes");
//    Tracev((stderr, "\nbl counts: "));
    zip_send_bits(lcodes-257, 5); // not +255 as stated in appnote.txt
    zip_send_bits(dcodes-1,   5);
    zip_send_bits(blcodes-4,  4); // not -3 as stated in appnote.txt
    for(rank = 0; rank < blcodes; rank++) {
//      Tracev((stderr, "\nbl code %2d ", bl_order[rank]));
	zip_send_bits(zip_bl_tree[zip_bl_order[rank]].dl, 3);
    }

    // send the literal tree
    zip_send_tree(zip_dyn_ltree,lcodes-1);

    // send the distance tree
    zip_send_tree(zip_dyn_dtree,dcodes-1);
}

/* ==========================================================================
 * Determine the best encoding for the current block: dynamic trees, static
 * trees or store, and output the encoded block to the zip file.
 */
var zip_flush_block = function(eof) { // true if this is the last block for a file
    var opt_lenb, static_lenb; // opt_len and static_len in bytes
    var max_blindex;	// index of last bit length code of non zero freq
    var stored_len;	// length of input block

    stored_len = zip_strstart - zip_block_start;
    zip_flag_buf[zip_last_flags] = zip_flags; // Save the flags for the last 8 items

    // Construct the literal and distance trees
    zip_build_tree(zip_l_desc);
//    Tracev((stderr, "\nlit data: dyn %ld, stat %ld",
//	    encoder->opt_len, encoder->static_len));

    zip_build_tree(zip_d_desc);
//    Tracev((stderr, "\ndist data: dyn %ld, stat %ld",
//	    encoder->opt_len, encoder->static_len));
    /* At this point, opt_len and static_len are the total bit lengths of
     * the compressed block data, excluding the tree representations.
     */

    /* Build the bit length tree for the above two trees, and get the index
     * in bl_order of the last bit length code to send.
     */
    max_blindex = zip_build_bl_tree();

    // Determine the best encoding. Compute first the block length in bytes
    opt_lenb	= (zip_opt_len   +3+7)>>3;
    static_lenb = (zip_static_len+3+7)>>3;

//    Trace((stderr, "\nopt %lu(%lu) stat %lu(%lu) stored %lu lit %u dist %u ",
//	   opt_lenb, encoder->opt_len,
//	   static_lenb, encoder->static_len, stored_len,
//	   encoder->last_lit, encoder->last_dist));

    if(static_lenb <= opt_lenb)
	opt_lenb = static_lenb;
    if(stored_len + 4 <= opt_lenb // 4: two words for the lengths
       && zip_block_start >= 0) {
	var i;

	/* The test buf != NULL is only necessary if LIT_BUFSIZE > WSIZE.
	 * Otherwise we can't have processed more than WSIZE input bytes since
	 * the last block flush, because compression would have been
	 * successful. If LIT_BUFSIZE <= WSIZE, it is never too late to
	 * transform a block into a stored block.
	 */
	zip_send_bits((zip_STORED_BLOCK<<1)+eof, 3);  /* send block type */
	zip_bi_windup();		 /* align on byte boundary */
	zip_put_short(stored_len);
	zip_put_short(~stored_len);

      // copy block
/*
      p = &window[block_start];
      for(i = 0; i < stored_len; i++)
	put_byte(p[i]);
*/
	for(i = 0; i < stored_len; i++)
	    zip_put_byte(zip_window[zip_block_start + i]);

    } else if(static_lenb == opt_lenb) {
	zip_send_bits((zip_STATIC_TREES<<1)+eof, 3);
	zip_compress_block(zip_static_ltree, zip_static_dtree);
    } else {
	zip_send_bits((zip_DYN_TREES<<1)+eof, 3);
	zip_send_all_trees(zip_l_desc.max_code+1,
			   zip_d_desc.max_code+1,
			   max_blindex+1);
	zip_compress_block(zip_dyn_ltree, zip_dyn_dtree);
    }

    zip_init_block();

    if(eof != 0)
	zip_bi_windup();
}

/* ==========================================================================
 * Save the match info and tally the frequency counts. Return true if
 * the current block must be flushed.
 */
var zip_ct_tally = function(
	dist, // distance of matched string
	lc) { // match length-MIN_MATCH or unmatched char (if dist==0)
    zip_l_buf[zip_last_lit++] = lc;
    if(dist == 0) {
	// lc is the unmatched char
	zip_dyn_ltree[lc].fc++;
    } else {
	// Here, lc is the match length - MIN_MATCH
	dist--;		    // dist = match distance - 1
//      Assert((ush)dist < (ush)MAX_DIST &&
//	     (ush)lc <= (ush)(MAX_MATCH-MIN_MATCH) &&
//	     (ush)D_CODE(dist) < (ush)D_CODES,  "ct_tally: bad match");

	zip_dyn_ltree[zip_length_code[lc]+zip_LITERALS+1].fc++;
	zip_dyn_dtree[zip_D_CODE(dist)].fc++;

	zip_d_buf[zip_last_dist++] = dist;
	zip_flags |= zip_flag_bit;
    }
    zip_flag_bit <<= 1;

    // Output the flags if they fill a byte
    if((zip_last_lit & 7) == 0) {
	zip_flag_buf[zip_last_flags++] = zip_flags;
	zip_flags = 0;
	zip_flag_bit = 1;
    }
    // Try to guess if it is profitable to stop the current block here
    if(zip_compr_level > 2 && (zip_last_lit & 0xfff) == 0) {
	// Compute an upper bound for the compressed length
	var out_length = zip_last_lit * 8;
	var in_length = zip_strstart - zip_block_start;
	var dcode;

	for(dcode = 0; dcode < zip_D_CODES; dcode++) {
	    out_length += zip_dyn_dtree[dcode].fc * (5 + zip_extra_dbits[dcode]);
	}
	out_length >>= 3;
//      Trace((stderr,"\nlast_lit %u, last_dist %u, in %ld, out ~%ld(%ld%%) ",
//	     encoder->last_lit, encoder->last_dist, in_length, out_length,
//	     100L - out_length*100L/in_length));
	if(zip_last_dist < parseInt(zip_last_lit/2) &&
	   out_length < parseInt(in_length/2))
	    return true;
    }
    return (zip_last_lit == zip_LIT_BUFSIZE-1 ||
	    zip_last_dist == zip_DIST_BUFSIZE);
    /* We avoid equality with LIT_BUFSIZE because of wraparound at 64K
     * on 16 bit machines and because stored blocks are restricted to
     * 64K-1 bytes.
     */
}

  /* ==========================================================================
   * Send the block data compressed using the given Huffman trees
   */
var zip_compress_block = function(
	ltree,	// literal tree
	dtree) {	// distance tree
    var dist;		// distance of matched string
    var lc;		// match length or unmatched char (if dist == 0)
    var lx = 0;		// running index in l_buf
    var dx = 0;		// running index in d_buf
    var fx = 0;		// running index in flag_buf
    var flag = 0;	// current flags
    var code;		// the code to send
    var extra;		// number of extra bits to send

    if(zip_last_lit != 0) do {
	if((lx & 7) == 0)
	    flag = zip_flag_buf[fx++];
	lc = zip_l_buf[lx++] & 0xff;
	if((flag & 1) == 0) {
	    zip_SEND_CODE(lc, ltree); /* send a literal byte */
//	Tracecv(isgraph(lc), (stderr," '%c' ", lc));
	} else {
	    // Here, lc is the match length - MIN_MATCH
	    code = zip_length_code[lc];
	    zip_SEND_CODE(code+zip_LITERALS+1, ltree); // send the length code
	    extra = zip_extra_lbits[code];
	    if(extra != 0) {
		lc -= zip_base_length[code];
		zip_send_bits(lc, extra); // send the extra length bits
	    }
	    dist = zip_d_buf[dx++];
	    // Here, dist is the match distance - 1
	    code = zip_D_CODE(dist);
//	Assert (code < D_CODES, "bad d_code");

	    zip_SEND_CODE(code, dtree);	  // send the distance code
	    extra = zip_extra_dbits[code];
	    if(extra != 0) {
		dist -= zip_base_dist[code];
		zip_send_bits(dist, extra);   // send the extra distance bits
	    }
	} // literal or match pair ?
	flag >>= 1;
    } while(lx < zip_last_lit);

    zip_SEND_CODE(zip_END_BLOCK, ltree);
}

/* ==========================================================================
 * Send a value on a given number of bits.
 * IN assertion: length <= 16 and value fits in length bits.
 */
var zip_Buf_size = 16; // bit size of bi_buf
var zip_send_bits = function(
	value,	// value to send
	length) {	// number of bits
    /* If not enough room in bi_buf, use (valid) bits from bi_buf and
     * (16 - bi_valid) bits from value, leaving (width - (16-bi_valid))
     * unused bits in value.
     */
    if(zip_bi_valid > zip_Buf_size - length) {
	zip_bi_buf |= (value << zip_bi_valid);
	zip_put_short(zip_bi_buf);
	zip_bi_buf = (value >> (zip_Buf_size - zip_bi_valid));
	zip_bi_valid += length - zip_Buf_size;
    } else {
	zip_bi_buf |= value << zip_bi_valid;
	zip_bi_valid += length;
    }
}

/* ==========================================================================
 * Reverse the first len bits of a code, using straightforward code (a faster
 * method would use a table)
 * IN assertion: 1 <= len <= 15
 */
var zip_bi_reverse = function(
	code,	// the value to invert
	len) {	// its bit length
    var res = 0;
    do {
	res |= code & 1;
	code >>= 1;
	res <<= 1;
    } while(--len > 0);
    return res >> 1;
}

/* ==========================================================================
 * Write out any remaining bits in an incomplete byte.
 */
var zip_bi_windup = function() {
    if(zip_bi_valid > 8) {
	zip_put_short(zip_bi_buf);
    } else if(zip_bi_valid > 0) {
	zip_put_byte(zip_bi_buf);
    }
    zip_bi_buf = 0;
    zip_bi_valid = 0;
}

var zip_qoutbuf = function() {
    if(zip_outcnt != 0) {
	var q, i;
	q = zip_new_queue();
	if(zip_qhead == null)
	    zip_qhead = zip_qtail = q;
	else
	    zip_qtail = zip_qtail.next = q;
	q.len = zip_outcnt - zip_outoff;
//      System.arraycopy(zip_outbuf, zip_outoff, q.ptr, 0, q.len);
	for(i = 0; i < q.len; i++)
	    q.ptr[i] = zip_outbuf[zip_outoff + i];
	zip_outcnt = zip_outoff = 0;
    }
}

var zip_deflate = function(str, level) {
    var i, j;

    zip_deflate_data = str;
    zip_deflate_pos = 0;
    if(typeof level == "undefined")
	level = zip_DEFAULT_LEVEL;
    zip_deflate_start(level);

    var buff = new Array(1024);
    var aout = [];
    while((i = zip_deflate_internal(buff, 0, buff.length)) > 0) {
	var cbuf = new Array(i);
	for(j = 0; j < i; j++){
	    cbuf[j] = String.fromCharCode(buff[j]);
	}
	aout[aout.length] = cbuf.join("");
    }
    zip_deflate_data = null; // G.C.
    return aout.join("");
}

if (! ctx.RawDeflate) ctx.RawDeflate = {};
ctx.RawDeflate.deflate = zip_deflate;

})(this);
;/*
 * $Id: rawinflate.js,v 0.4 2014/03/01 21:59:08 dankogai Exp dankogai $
 *
 * GNU General Public License, version 2 (GPL-2.0)
 *   http://opensource.org/licenses/GPL-2.0
 * original:
 *   http://www.onicos.com/staff/iz/amuse/javascript/expert/inflate.txt
 */

(function(ctx){

/* Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
 * Version: 1.0.0.1
 * LastModified: Dec 25 1999
 */

/* Interface:
 * data = zip_inflate(src);
 */

/* constant parameters */
var zip_WSIZE = 32768;		// Sliding Window size
var zip_STORED_BLOCK = 0;
var zip_STATIC_TREES = 1;
var zip_DYN_TREES    = 2;

/* for inflate */
var zip_lbits = 9; 		// bits in base literal/length lookup table
var zip_dbits = 6; 		// bits in base distance lookup table
var zip_INBUFSIZ = 32768;	// Input buffer size
var zip_INBUF_EXTRA = 64;	// Extra buffer

/* variables (inflate) */
var zip_slide;
var zip_wp;			// current position in slide
var zip_fixed_tl = null;	// inflate static
var zip_fixed_td;		// inflate static
var zip_fixed_bl, zip_fixed_bd;	// inflate static
var zip_bit_buf;		// bit buffer
var zip_bit_len;		// bits in bit buffer
var zip_method;
var zip_eof;
var zip_copy_leng;
var zip_copy_dist;
var zip_tl, zip_td;	// literal/length and distance decoder tables
var zip_bl, zip_bd;	// number of bits decoded by tl and td

var zip_inflate_data;
var zip_inflate_pos;


/* constant tables (inflate) */
var zip_MASK_BITS = new Array(
    0x0000,
    0x0001, 0x0003, 0x0007, 0x000f, 0x001f, 0x003f, 0x007f, 0x00ff,
    0x01ff, 0x03ff, 0x07ff, 0x0fff, 0x1fff, 0x3fff, 0x7fff, 0xffff);
// Tables for deflate from PKZIP's appnote.txt.
var zip_cplens = new Array( // Copy lengths for literal codes 257..285
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0);
/* note: see note #13 above about the 258 in this list. */
var zip_cplext = new Array( // Extra bits for literal codes 257..285
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 99, 99); // 99==invalid
var zip_cpdist = new Array( // Copy offsets for distance codes 0..29
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
    8193, 12289, 16385, 24577);
var zip_cpdext = new Array( // Extra bits for distance codes
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11,
    12, 12, 13, 13);
var zip_border = new Array(  // Order of the bit length code lengths
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15);
/* objects (inflate) */

var zip_HuftList = function() {
    this.next = null;
    this.list = null;
}

var zip_HuftNode = function() {
    this.e = 0; // number of extra bits or operation
    this.b = 0; // number of bits in this code or subcode

    // union
    this.n = 0; // literal, length base, or distance base
    this.t = null; // (zip_HuftNode) pointer to next level of table
}

var zip_HuftBuild = function(b,	// code lengths in bits (all assumed <= BMAX)
		       n,	// number of codes (assumed <= N_MAX)
		       s,	// number of simple-valued codes (0..s-1)
		       d,	// list of base values for non-simple codes
		       e,	// list of extra bits for non-simple codes
		       mm	// maximum lookup bits
		   ) {
    this.BMAX = 16;   // maximum bit length of any code
    this.N_MAX = 288; // maximum number of codes in any set
    this.status = 0;	// 0: success, 1: incomplete table, 2: bad input
    this.root = null;	// (zip_HuftList) starting table
    this.m = 0;		// maximum lookup bits, returns actual

/* Given a list of code lengths and a maximum table size, make a set of
   tables to decode that set of codes.	Return zero on success, one if
   the given code set is incomplete (the tables are still built in this
   case), two if the input is invalid (all zero length codes or an
   oversubscribed set of lengths), and three if not enough memory.
   The code with value 256 is special, and the tables are constructed
   so that no bits beyond that code are fetched when that code is
   decoded. */
    {
	var a;			// counter for codes of length k
	var c = new Array(this.BMAX+1);	// bit length count table
	var el;			// length of EOB code (value 256)
	var f;			// i repeats in table every f entries
	var g;			// maximum code length
	var h;			// table level
	var i;			// counter, current code
	var j;			// counter
	var k;			// number of bits in current code
	var lx = new Array(this.BMAX+1);	// stack of bits per table
	var p;			// pointer into c[], b[], or v[]
	var pidx;		// index of p
	var q;			// (zip_HuftNode) points to current table
	var r = new zip_HuftNode(); // table entry for structure assignment
	var u = new Array(this.BMAX); // zip_HuftNode[BMAX][]  table stack
	var v = new Array(this.N_MAX); // values in order of bit length
	var w;
	var x = new Array(this.BMAX+1);// bit offsets, then code stack
	var xp;			// pointer into x or c
	var y;			// number of dummy codes added
	var z;			// number of entries in current table
	var o;
	var tail;		// (zip_HuftList)

	tail = this.root = null;
	for(i = 0; i < c.length; i++)
	    c[i] = 0;
	for(i = 0; i < lx.length; i++)
	    lx[i] = 0;
	for(i = 0; i < u.length; i++)
	    u[i] = null;
	for(i = 0; i < v.length; i++)
	    v[i] = 0;
	for(i = 0; i < x.length; i++)
	    x[i] = 0;

	// Generate counts for each bit length
	el = n > 256 ? b[256] : this.BMAX; // set length of EOB code, if any
	p = b; pidx = 0;
	i = n;
	do {
	    c[p[pidx]]++;	// assume all entries <= BMAX
	    pidx++;
	} while(--i > 0);
	if(c[0] == n) {	// null input--all zero length codes
	    this.root = null;
	    this.m = 0;
	    this.status = 0;
	    return;
	}

	// Find minimum and maximum length, bound *m by those
	for(j = 1; j <= this.BMAX; j++)
	    if(c[j] != 0)
		break;
	k = j;			// minimum code length
	if(mm < j)
	    mm = j;
	for(i = this.BMAX; i != 0; i--)
	    if(c[i] != 0)
		break;
	g = i;			// maximum code length
	if(mm > i)
	    mm = i;

	// Adjust last length count to fill out codes, if needed
	for(y = 1 << j; j < i; j++, y <<= 1)
	    if((y -= c[j]) < 0) {
		this.status = 2;	// bad input: more codes than bits
		this.m = mm;
		return;
	    }
	if((y -= c[i]) < 0) {
	    this.status = 2;
	    this.m = mm;
	    return;
	}
	c[i] += y;

	// Generate starting offsets into the value table for each length
	x[1] = j = 0;
	p = c;
	pidx = 1;
	xp = 2;
	while(--i > 0)		// note that i == g from above
	    x[xp++] = (j += p[pidx++]);

	// Make a table of values in order of bit lengths
	p = b; pidx = 0;
	i = 0;
	do {
	    if((j = p[pidx++]) != 0)
		v[x[j]++] = i;
	} while(++i < n);
	n = x[g];			// set n to length of v

	// Generate the Huffman codes and for each, make the table entries
	x[0] = i = 0;		// first Huffman code is zero
	p = v; pidx = 0;		// grab values in bit order
	h = -1;			// no tables yet--level -1
	w = lx[0] = 0;		// no bits decoded yet
	q = null;			// ditto
	z = 0;			// ditto

	// go through the bit lengths (k already is bits in shortest code)
	for(; k <= g; k++) {
	    a = c[k];
	    while(a-- > 0) {
		// here i is the Huffman code of length k bits for value p[pidx]
		// make tables up to required level
		while(k > w + lx[1 + h]) {
		    w += lx[1 + h]; // add bits already decoded
		    h++;

		    // compute minimum size table less than or equal to *m bits
		    z = (z = g - w) > mm ? mm : z; // upper limit
		    if((f = 1 << (j = k - w)) > a + 1) { // try a k-w bit table
			// too few codes for k-w bit table
			f -= a + 1;	// deduct codes from patterns left
			xp = k;
			while(++j < z) { // try smaller tables up to z bits
			    if((f <<= 1) <= c[++xp])
				break;	// enough codes to use up j bits
			    f -= c[xp];	// else deduct codes from patterns
			}
		    }
		    if(w + j > el && w < el)
			j = el - w;	// make EOB code end at table
		    z = 1 << j;	// table entries for j-bit table
		    lx[1 + h] = j; // set table size in stack

		    // allocate and link in new table
		    q = new Array(z);
		    for(o = 0; o < z; o++) {
			q[o] = new zip_HuftNode();
		    }

		    if(tail == null)
			tail = this.root = new zip_HuftList();
		    else
			tail = tail.next = new zip_HuftList();
		    tail.next = null;
		    tail.list = q;
		    u[h] = q;	// table starts after link

		    /* connect to last table, if there is one */
		    if(h > 0) {
			x[h] = i;		// save pattern for backing up
			r.b = lx[h];	// bits to dump before this table
			r.e = 16 + j;	// bits in this table
			r.t = q;		// pointer to this table
			j = (i & ((1 << w) - 1)) >> (w - lx[h]);
			u[h-1][j].e = r.e;
			u[h-1][j].b = r.b;
			u[h-1][j].n = r.n;
			u[h-1][j].t = r.t;
		    }
		}

		// set up table entry in r
		r.b = k - w;
		if(pidx >= n)
		    r.e = 99;		// out of values--invalid code
		else if(p[pidx] < s) {
		    r.e = (p[pidx] < 256 ? 16 : 15); // 256 is end-of-block code
		    r.n = p[pidx++];	// simple code is just the value
		} else {
		    r.e = e[p[pidx] - s];	// non-simple--look up in lists
		    r.n = d[p[pidx++] - s];
		}

		// fill code-like entries with r //
		f = 1 << (k - w);
		for(j = i >> w; j < z; j += f) {
		    q[j].e = r.e;
		    q[j].b = r.b;
		    q[j].n = r.n;
		    q[j].t = r.t;
		}

		// backwards increment the k-bit code i
		for(j = 1 << (k - 1); (i & j) != 0; j >>= 1)
		    i ^= j;
		i ^= j;

		// backup over finished tables
		while((i & ((1 << w) - 1)) != x[h]) {
		    w -= lx[h];		// don't need to update q
		    h--;
		}
	    }
	}

	/* return actual size of base table */
	this.m = lx[1];

	/* Return true (1) if we were given an incomplete table */
	this.status = ((y != 0 && g != 1) ? 1 : 0);
    } /* end of constructor */
}


/* routines (inflate) */

var zip_GET_BYTE = function() {
    if(zip_inflate_data.length == zip_inflate_pos)
	return -1;
    return zip_inflate_data.charCodeAt(zip_inflate_pos++) & 0xff;
}

var zip_NEEDBITS = function(n) {
    while(zip_bit_len < n) {
	zip_bit_buf |= zip_GET_BYTE() << zip_bit_len;
	zip_bit_len += 8;
    }
}

var zip_GETBITS = function(n) {
    return zip_bit_buf & zip_MASK_BITS[n];
}

var zip_DUMPBITS = function(n) {
    zip_bit_buf >>= n;
    zip_bit_len -= n;
}

var zip_inflate_codes = function(buff, off, size) {
    /* inflate (decompress) the codes in a deflated (compressed) block.
       Return an error code or zero if it all goes ok. */
    var e;		// table entry flag/number of extra bits
    var t;		// (zip_HuftNode) pointer to table entry
    var n;

    if(size == 0)
      return 0;

    // inflate the coded data
    n = 0;
    for(;;) {			// do until end of block
	zip_NEEDBITS(zip_bl);
	t = zip_tl.list[zip_GETBITS(zip_bl)];
	e = t.e;
	while(e > 16) {
	    if(e == 99)
		return -1;
	    zip_DUMPBITS(t.b);
	    e -= 16;
	    zip_NEEDBITS(e);
	    t = t.t[zip_GETBITS(e)];
	    e = t.e;
	}
	zip_DUMPBITS(t.b);

	if(e == 16) {		// then it's a literal
	    zip_wp &= zip_WSIZE - 1;
	    buff[off + n++] = zip_slide[zip_wp++] = t.n;
	    if(n == size)
		return size;
	    continue;
	}

	// exit if end of block
	if(e == 15)
	    break;

	// it's an EOB or a length

	// get length of block to copy
	zip_NEEDBITS(e);
	zip_copy_leng = t.n + zip_GETBITS(e);
	zip_DUMPBITS(e);

	// decode distance of block to copy
	zip_NEEDBITS(zip_bd);
	t = zip_td.list[zip_GETBITS(zip_bd)];
	e = t.e;

	while(e > 16) {
	    if(e == 99)
		return -1;
	    zip_DUMPBITS(t.b);
	    e -= 16;
	    zip_NEEDBITS(e);
	    t = t.t[zip_GETBITS(e)];
	    e = t.e;
	}
	zip_DUMPBITS(t.b);
	zip_NEEDBITS(e);
	zip_copy_dist = zip_wp - t.n - zip_GETBITS(e);
	zip_DUMPBITS(e);

	// do the copy
	while(zip_copy_leng > 0 && n < size) {
	    zip_copy_leng--;
	    zip_copy_dist &= zip_WSIZE - 1;
	    zip_wp &= zip_WSIZE - 1;
	    buff[off + n++] = zip_slide[zip_wp++]
		= zip_slide[zip_copy_dist++];
	}

	if(n == size)
	    return size;
    }

    zip_method = -1; // done
    return n;
}

var zip_inflate_stored = function(buff, off, size) {
    /* "decompress" an inflated type 0 (stored) block. */
    var n;

    // go to byte boundary
    n = zip_bit_len & 7;
    zip_DUMPBITS(n);

    // get the length and its complement
    zip_NEEDBITS(16);
    n = zip_GETBITS(16);
    zip_DUMPBITS(16);
    zip_NEEDBITS(16);
    if(n != ((~zip_bit_buf) & 0xffff))
	return -1;			// error in compressed data
    zip_DUMPBITS(16);

    // read and output the compressed data
    zip_copy_leng = n;

    n = 0;
    while(zip_copy_leng > 0 && n < size) {
	zip_copy_leng--;
	zip_wp &= zip_WSIZE - 1;
	zip_NEEDBITS(8);
	buff[off + n++] = zip_slide[zip_wp++] =
	    zip_GETBITS(8);
	zip_DUMPBITS(8);
    }

    if(zip_copy_leng == 0)
      zip_method = -1; // done
    return n;
}

var zip_inflate_fixed = function(buff, off, size) {
    /* decompress an inflated type 1 (fixed Huffman codes) block.  We should
       either replace this with a custom decoder, or at least precompute the
       Huffman tables. */

    // if first time, set up tables for fixed blocks
    if(zip_fixed_tl == null) {
	var i;			// temporary variable
	var l = new Array(288);	// length list for huft_build
	var h;	// zip_HuftBuild

	// literal table
	for(i = 0; i < 144; i++)
	    l[i] = 8;
	for(; i < 256; i++)
	    l[i] = 9;
	for(; i < 280; i++)
	    l[i] = 7;
	for(; i < 288; i++)	// make a complete, but wrong code set
	    l[i] = 8;
	zip_fixed_bl = 7;

	h = new zip_HuftBuild(l, 288, 257, zip_cplens, zip_cplext,
			      zip_fixed_bl);
	if(h.status != 0) {
	    alert("HufBuild error: "+h.status);
	    return -1;
	}
	zip_fixed_tl = h.root;
	zip_fixed_bl = h.m;

	// distance table
	for(i = 0; i < 30; i++)	// make an incomplete code set
	    l[i] = 5;
	zip_fixed_bd = 5;

	h = new zip_HuftBuild(l, 30, 0, zip_cpdist, zip_cpdext, zip_fixed_bd);
	if(h.status > 1) {
	    zip_fixed_tl = null;
	    alert("HufBuild error: "+h.status);
	    return -1;
	}
	zip_fixed_td = h.root;
	zip_fixed_bd = h.m;
    }

    zip_tl = zip_fixed_tl;
    zip_td = zip_fixed_td;
    zip_bl = zip_fixed_bl;
    zip_bd = zip_fixed_bd;
    return zip_inflate_codes(buff, off, size);
}

var zip_inflate_dynamic = function(buff, off, size) {
    // decompress an inflated type 2 (dynamic Huffman codes) block.
    var i;		// temporary variables
    var j;
    var l;		// last length
    var n;		// number of lengths to get
    var t;		// (zip_HuftNode) literal/length code table
    var nb;		// number of bit length codes
    var nl;		// number of literal/length codes
    var nd;		// number of distance codes
    var ll = new Array(286+30); // literal/length and distance code lengths
    var h;		// (zip_HuftBuild)

    for(i = 0; i < ll.length; i++)
	ll[i] = 0;

    // read in table lengths
    zip_NEEDBITS(5);
    nl = 257 + zip_GETBITS(5);	// number of literal/length codes
    zip_DUMPBITS(5);
    zip_NEEDBITS(5);
    nd = 1 + zip_GETBITS(5);	// number of distance codes
    zip_DUMPBITS(5);
    zip_NEEDBITS(4);
    nb = 4 + zip_GETBITS(4);	// number of bit length codes
    zip_DUMPBITS(4);
    if(nl > 286 || nd > 30)
      return -1;		// bad lengths

    // read in bit-length-code lengths
    for(j = 0; j < nb; j++)
    {
	zip_NEEDBITS(3);
	ll[zip_border[j]] = zip_GETBITS(3);
	zip_DUMPBITS(3);
    }
    for(; j < 19; j++)
	ll[zip_border[j]] = 0;

    // build decoding table for trees--single level, 7 bit lookup
    zip_bl = 7;
    h = new zip_HuftBuild(ll, 19, 19, null, null, zip_bl);
    if(h.status != 0)
	return -1;	// incomplete code set

    zip_tl = h.root;
    zip_bl = h.m;

    // read in literal and distance code lengths
    n = nl + nd;
    i = l = 0;
    while(i < n) {
	zip_NEEDBITS(zip_bl);
	t = zip_tl.list[zip_GETBITS(zip_bl)];
	j = t.b;
	zip_DUMPBITS(j);
	j = t.n;
	if(j < 16)		// length of code in bits (0..15)
	    ll[i++] = l = j;	// save last length in l
	else if(j == 16) {	// repeat last length 3 to 6 times
	    zip_NEEDBITS(2);
	    j = 3 + zip_GETBITS(2);
	    zip_DUMPBITS(2);
	    if(i + j > n)
		return -1;
	    while(j-- > 0)
		ll[i++] = l;
	} else if(j == 17) {	// 3 to 10 zero length codes
	    zip_NEEDBITS(3);
	    j = 3 + zip_GETBITS(3);
	    zip_DUMPBITS(3);
	    if(i + j > n)
		return -1;
	    while(j-- > 0)
		ll[i++] = 0;
	    l = 0;
	} else {		// j == 18: 11 to 138 zero length codes
	    zip_NEEDBITS(7);
	    j = 11 + zip_GETBITS(7);
	    zip_DUMPBITS(7);
	    if(i + j > n)
		return -1;
	    while(j-- > 0)
		ll[i++] = 0;
	    l = 0;
	}
    }

    // build the decoding tables for literal/length and distance codes
    zip_bl = zip_lbits;
    h = new zip_HuftBuild(ll, nl, 257, zip_cplens, zip_cplext, zip_bl);
    if(zip_bl == 0)	// no literals or lengths
	h.status = 1;
    if(h.status != 0) {
	if(h.status == 1)
	    ;// **incomplete literal tree**
	return -1;		// incomplete code set
    }
    zip_tl = h.root;
    zip_bl = h.m;

    for(i = 0; i < nd; i++)
	ll[i] = ll[i + nl];
    zip_bd = zip_dbits;
    h = new zip_HuftBuild(ll, nd, 0, zip_cpdist, zip_cpdext, zip_bd);
    zip_td = h.root;
    zip_bd = h.m;

    if(zip_bd == 0 && nl > 257) {   // lengths but no distances
	// **incomplete distance tree**
	return -1;
    }

    if(h.status == 1) {
	;// **incomplete distance tree**
    }
    if(h.status != 0)
	return -1;

    // decompress until an end-of-block code
    return zip_inflate_codes(buff, off, size);
}

var zip_inflate_start = function() {
    var i;

    if(zip_slide == null)
	zip_slide = new Array(2 * zip_WSIZE);
    zip_wp = 0;
    zip_bit_buf = 0;
    zip_bit_len = 0;
    zip_method = -1;
    zip_eof = false;
    zip_copy_leng = zip_copy_dist = 0;
    zip_tl = null;
}

var zip_inflate_internal = function(buff, off, size) {
    // decompress an inflated entry
    var n, i;

    n = 0;
    while(n < size) {
	if(zip_eof && zip_method == -1)
	    return n;

	if(zip_copy_leng > 0) {
	    if(zip_method != zip_STORED_BLOCK) {
		// STATIC_TREES or DYN_TREES
		while(zip_copy_leng > 0 && n < size) {
		    zip_copy_leng--;
		    zip_copy_dist &= zip_WSIZE - 1;
		    zip_wp &= zip_WSIZE - 1;
		    buff[off + n++] = zip_slide[zip_wp++] =
			zip_slide[zip_copy_dist++];
		}
	    } else {
		while(zip_copy_leng > 0 && n < size) {
		    zip_copy_leng--;
		    zip_wp &= zip_WSIZE - 1;
		    zip_NEEDBITS(8);
		    buff[off + n++] = zip_slide[zip_wp++] = zip_GETBITS(8);
		    zip_DUMPBITS(8);
		}
		if(zip_copy_leng == 0)
		    zip_method = -1; // done
	    }
	    if(n == size)
		return n;
	}

	if(zip_method == -1) {
	    if(zip_eof)
		break;

	    // read in last block bit
	    zip_NEEDBITS(1);
	    if(zip_GETBITS(1) != 0)
		zip_eof = true;
	    zip_DUMPBITS(1);

	    // read in block type
	    zip_NEEDBITS(2);
	    zip_method = zip_GETBITS(2);
	    zip_DUMPBITS(2);
	    zip_tl = null;
	    zip_copy_leng = 0;
	}

	switch(zip_method) {
	  case 0: // zip_STORED_BLOCK
	    i = zip_inflate_stored(buff, off + n, size - n);
	    break;

	  case 1: // zip_STATIC_TREES
	    if(zip_tl != null)
		i = zip_inflate_codes(buff, off + n, size - n);
	    else
		i = zip_inflate_fixed(buff, off + n, size - n);
	    break;

	  case 2: // zip_DYN_TREES
	    if(zip_tl != null)
		i = zip_inflate_codes(buff, off + n, size - n);
	    else
		i = zip_inflate_dynamic(buff, off + n, size - n);
	    break;

	  default: // error
	    i = -1;
	    break;
	}

	if(i == -1) {
	    if(zip_eof)
		return 0;
	    return -1;
	}
	n += i;
    }
    return n;
}

var zip_inflate = function(str) {
    var i, j;

    zip_inflate_start();
    zip_inflate_data = str;
    zip_inflate_pos = 0;

    var buff = new Array(1024);
    var aout = [];
    while((i = zip_inflate_internal(buff, 0, buff.length)) > 0) {
	var cbuf = new Array(i);
	for(j = 0; j < i; j++){
	    cbuf[j] = String.fromCharCode(buff[j]);
	}
	aout[aout.length] = cbuf.join("");
    }
    zip_inflate_data = null; // G.C.
    return aout.join("");
}

if (! ctx.RawDeflate) ctx.RawDeflate = {};
ctx.RawDeflate.inflate = zip_inflate;

})(this);
;(function() {

  'use strict';

  angular.module('app', ['youtube-embed']);

})();
;/* globals Base64, RawDeflate */
(function() {

  'use strict';

  var Hash = function($window) {

    return {

      get: function() {
        var hash = decodeURIComponent($window.location.hash.substring(1));
        if (hash.length === 0) {
          return [];
        }
        return angular.fromJson(Base64.btou(RawDeflate.inflate(Base64.fromBase64(hash))));
      },

      set: function(arr) {
        $window.location.hash = arr.length === 0 ? '' : encodeURIComponent(Base64.toBase64(RawDeflate.deflate(Base64.utob(angular.toJson(arr)))));
      },

    };

  };

  angular.module('app').factory('Hash', ['$window', Hash]);

})();
;/* globals jockey */

(function() {

  'use strict';

  var PlaylistModel = function($rootScope, Hash) {

    var items = Hash.get();
    var opts = {
      modelChange: function(_, items) {
        Hash.set(items);
      },
      stateChange: function(state, currentItem) {
        $rootScope.$broadcast(state, currentItem);
      }
    };
    return jockey(items, opts);

  };

  angular.module('app').factory('PlaylistModel', ['$rootScope', 'Hash', PlaylistModel]);

})();
;(function() {

  'use strict';

  var API_KEY = 'AIzaSyCi67ETi8yPdyOclj8T70PrI3z8WEoe9fo';

  var map = function(arr, cb) {
    var result = [];
    var i = -1;
    var len = arr.length;
    while (++i < len) {
      result.push(cb(arr[i], i));
    }
    return result;
  };

  var zeroPad = function(n) {
    n = n ? n + '' : '';
    return n.length >= 2 ? n : new Array(2 - n.length + 1).join('0') + n;
  };

  var formatDuration = function(str, delimeter) {
    var matches = str.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/).slice(1, 4);
    var i = -1;
    var result = [];
    while (++i < 3) {
      if (i === 0 && angular.isUndefined(matches[i])) {
        // skip hours if undefined
        continue;
      }
      result.push(zeroPad(matches[i] || '00')); // minutes and seconds
    }
    return result.join(delimeter);
  };

  var YouTubeAPI = function($http) {

    return {
      search: function(query) {
        query = encodeURIComponent(query).replace(/%20/g, '+');
        var endpoint = 'https://www.googleapis.com/youtube/v3/search?part=snippet&fields=items(id%2Csnippet)&maxResults=50&order=viewCount&q=' + query + '&type=video&videoEmbeddable=true&videoSyndicated=true&key=' + API_KEY;
        return $http.get(endpoint)
          .then(function(response) {
            if (response.status !== 200) {
              return [];
            }
            return map(response.data.items, function(item) {
              return item.id.videoId;
            });
          })
          .then(function(ids) {
            var endpoint = 'https://www.googleapis.com/youtube/v3/videos?part=id%2CcontentDetails%2Csnippet&id=' + ids.join('%2C') + '&fields=items(id%2CcontentDetails%2Csnippet)&key=' + API_KEY;
            return $http.get(endpoint);
          })
          .then(function(response) {
            if (response.status !== 200) {
              return [];
            }
            return map(response.data.items, function(item) {
              return {
                id: item.id,
                title: item.snippet.title,
                duration: formatDuration(item.contentDetails.duration, ':')
              };
            });
          });
      }
    };

  };

  angular.module('app').factory('YouTubeAPI', ['$http', YouTubeAPI]);

})();
;/* globals autosizeInput */
(function() {

  'use strict';

  var ENTER = 13;
  var ESCAPE = 27;

  var yqAutosizeInput = function($timeout) {

    var link = function(scope, element) {

      var set;
      $timeout(function() {
        set = autosizeInput(element[0]);
      });

      scope.$on('setAutosize', function() {
        $timeout(function() {
          set();
        });
      });

      element.on('keyup', function(e) {
        if (e.keyCode === ENTER || e.keyCode === ESCAPE) {
          e.target.blur();
        }
      });

    };

    return {
      restrict: 'A',
      link: link
    };

  };

  angular.module('app').directive('yqAutosizeInput', ['$timeout', yqAutosizeInput]);

})();
;/* globals Sortable */
(function() {

  'use strict';

  var slice = [].slice;

  var yqSortable = function() {

    var scope = {
      callback: '=yqSortable',
      handle: '@yqSortableHandle',
      sortedClass: '@yqSortableSortedClass',
      ghostClass: '@yqSortableGhostClass'
    };

    var link = function(scope, element) {
      var onUpdate = function(e) {
        var items = slice.call(element.children());
        var movedItem = e.item;
        var oldIndex = angular.element(movedItem).scope().$index;
        var newIndex = items.indexOf(movedItem);
        scope.callback(oldIndex, newIndex);
        element.addClass(scope.sortedClass);
        document.addEventListener('mousemove', function mousemove() {
          element.removeClass(scope.sortedClass);
          document.removeEventListener('mousemove', mousemove);
        });
      };
      new Sortable(element[0], {
        handle: scope.handle,
        ghostClass: scope.ghostClass,
        onUpdate: onUpdate
      });
    };

    return {
      restrict: 'A',
      scope: scope,
      link: link
    };

  };

  angular.module('app').directive('yqSortable', [yqSortable]);

})();
;(function() {

  'use strict';

  var yqSyncFocus = function() {

    var scope = {
      val: '=yqSyncFocus'
    };

    var link = function($scope, $element) {
      $scope.$watch('val', function(currentVal, previousVal) {
        if (currentVal && !previousVal) {
          $element[0].focus();
          return;
        }
        if (!currentVal && previousVal) {
          $element[0].blur();
        }
      });
    };

    return {
      restrict: 'A',
      scope: scope,
      link: link
    };

  };

  angular.module('app').directive('yqSyncFocus', [yqSyncFocus]);

})();
;(function() {

  'use strict';

  var TITLE = 'XOXO';
  var PLAY = '\u25B6';

  var MainCtrl = function($scope, PlaylistModel) {

    $scope.isSearchOpen = false;
    $scope.isVideoVisible = false;

    $scope.title = function() {
      if (PlaylistModel.isPlaying()) {
        return PLAY + ' ' + PlaylistModel.getCurrent().title;
      }
      return TITLE;
    };

    $scope.isStopped = function() {
      return PlaylistModel.isStopped();
    };

    $scope.toggleSearch = function() {
      $scope.isSearchOpen = !$scope.isSearchOpen;
    };
    $scope.toggleVideo = function() {
      $scope.isVideoVisible = !$scope.isVideoVisible;
    };

  };

  angular.module('app').controller('MainCtrl', ['$scope', 'PlaylistModel', MainCtrl]);

})();
;(function() {

  'use strict';

  // https://developers.google.com/youtube/iframe_api_reference#Playback_status
  var PLAYING = 1;

  var PlayerCtrl = function($scope, PlaylistModel) {

    $scope.id = null;
    $scope.player = null;

    $scope.$on('play', function(_, item) {
      var id = item.id;
      $scope.id = id;
      if ($scope.player !== null) {
        $scope.player.loadVideoById(id);
      }
    });

    var pause = function() {
      if ($scope.player === null) {
        return;
      }
      $scope.player.pauseVideo();
    };

    $scope.$on('stop', pause);

    $scope.$on('pause', pause);

    $scope.$on('resume', function() {
      if ($scope.player.getPlayerState() !== PLAYING) {
        $scope.player.playVideo();
      }
    });

    $scope.$on('youtube.player.playing', function() {
      if (PlaylistModel.isPaused()) {
        PlaylistModel.play();
      }
    });

    $scope.$on('youtube.player.paused', function() {
      if (PlaylistModel.isPlaying()) {
        PlaylistModel.play();
      }
    });

    $scope.$on('youtube.player.ready', function(_, player) {
      player.setVolume(100);
      player.playVideo();
      $scope.player = player;
    });

    $scope.$on('youtube.player.ended', function() {
      PlaylistModel.next();
    });

  };

  angular.module('app').controller('PlayerCtrl', ['$scope', 'PlaylistModel', PlayerCtrl]);

})();
;(function() {

  'use strict';

  var PlaylistCtrl = function($scope, $timeout, PlaylistModel) {

    // Getters.
    $scope.get = function() {
      return PlaylistModel.get();
    };
    $scope.getCurrentIndex = function() {
      return PlaylistModel.getCurrentIndex();
    };

    // Check the playlist state.
    $scope.isStopped = function() {
      return !PlaylistModel.isPlaying();
    };
    $scope.isPlaying = function() {
      return PlaylistModel.isPlaying();
    };
    $scope.isPaused = function() {
      return PlaylistModel.isPaused();
    };
    $scope.isRepeating = function() {
      return PlaylistModel.isRepeating();
    };
    $scope.isShuffling = function() {
      return PlaylistModel.isShuffling();
    };

    // Change the playlist state.
    $scope.play = function(index) {
      PlaylistModel.play(index);
    };
    $scope.previous = function() {
      PlaylistModel.previous();
    };
    $scope.next = function() {
      PlaylistModel.next();
    };
    $scope.repeat = function() {
      PlaylistModel.repeat();
    };
    $scope.shuffle = function() {
      PlaylistModel.shuffle();
    };

    // Change the playlist model.
    var setAutosize = function() {
      // For adjusting the text input widths.
      $scope.$evalAsync(function() {
        $scope.$broadcast('setAutosize');
      });
    };
    $scope.remove = function(index) {
      PlaylistModel.remove(index);
      setAutosize();
    };
    $scope.sortableCallback = function(oldIndex, newIndex) {
      PlaylistModel.reorder(oldIndex, newIndex);
      setAutosize();
    };
    $scope.set = function(index, newTitle) {
      var item = PlaylistModel.get(index);
      item.title = newTitle;
      PlaylistModel.set(index, item);
    };

  };

  angular.module('app').controller('PlaylistCtrl', ['$scope', '$timeout', 'PlaylistModel', PlaylistCtrl]);

})();
;(function() {

  'use strict';

  var SearchCtrl = function($scope, PlaylistModel, YouTubeAPI) {

    var results = [];

    $scope.query = '';
    $scope.loading = false;

    $scope.addToPlaylist = function(item) {
      PlaylistModel.add(angular.copy(item));
    };

    $scope.search = function() {
      results = []; // clear `results`
      if ($scope.query === '') {
        $scope.loading = false;
        return;
      }
      $scope.loading = true;
      YouTubeAPI.search($scope.query).then(function(r) {
        $scope.loading = false;
        results = r;
      });
    };

    $scope.getResults = function() {
      return results;
    };

  };

  angular.module('app').controller('SearchCtrl', ['$scope', 'PlaylistModel', 'YouTubeAPI', SearchCtrl]);

})();

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFuZ3VsYXIteW91dHViZS1lbWJlZC5qcyIsImF1dG9zaXplLWlucHV0LmpzIiwiam9ja2V5LmpzIiwiYmFzZTY0LmpzIiwiU29ydGFibGUuanMiLCJyYXdkZWZsYXRlLmpzIiwicmF3aW5mbGF0ZS5qcyIsImFwcC5qcyIsIkhhc2guanMiLCJQbGF5bGlzdE1vZGVsLmpzIiwiWW91VHViZUFQSS5qcyIsInlxQXV0b3NpemVJbnB1dC5qcyIsInlxU29ydGFibGUuanMiLCJ5cVN5bmNGb2N1cy5qcyIsIk1haW5DdHJsLmpzIiwiUGxheWVyQ3RybC5qcyIsIlBsYXlsaXN0Q3RybC5qcyIsIlNlYXJjaEN0cmwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0M1UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENDL0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQ2ppQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENDbE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0N4MkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0Mzb0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQ252QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0M1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0N4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0MvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0NqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0NoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyogZ2xvYmFsIFlUICovXG5hbmd1bGFyLm1vZHVsZSgneW91dHViZS1lbWJlZCcsIFtdKVxuLnNlcnZpY2UgKCd5b3V0dWJlRW1iZWRVdGlscycsIFsnJHdpbmRvdycsICckcm9vdFNjb3BlJywgZnVuY3Rpb24gKCR3aW5kb3csICRyb290U2NvcGUpIHtcbiAgICB2YXIgU2VydmljZSA9IHt9XG5cbiAgICAvLyBhZGFwdGVkIGZyb20gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvNTgzMTE5MS8xNjE0OTY3XG4gICAgdmFyIHlvdXR1YmVSZWdleHAgPSAvaHR0cHM/OlxcL1xcLyg/OlswLTlBLVotXStcXC4pPyg/OnlvdXR1XFwuYmVcXC98eW91dHViZSg/Oi1ub2Nvb2tpZSk/XFwuY29tXFxTKlteXFx3XFxzLV0pKFtcXHctXXsxMX0pKD89W15cXHctXXwkKSg/IVs/PSYrJVxcdy4tXSooPzpbJ1wiXVtePD5dKj58PFxcL2E+KSlbPz0mKyVcXHcuLV0qL2lnO1xuICAgIHZhciB0aW1lUmVnZXhwID0gL3Q9KFxcZCspW21zXT8oXFxkKyk/cz8vO1xuXG4gICAgZnVuY3Rpb24gY29udGFpbnMoc3RyLCBzdWJzdHIpIHtcbiAgICAgICAgcmV0dXJuIChzdHIuaW5kZXhPZihzdWJzdHIpID4gLTEpO1xuICAgIH1cblxuICAgIFNlcnZpY2UuZ2V0SWRGcm9tVVJMID0gZnVuY3Rpb24gZ2V0SWRGcm9tVVJMKHVybCkge1xuICAgICAgICB2YXIgaWQgPSB1cmwucmVwbGFjZSh5b3V0dWJlUmVnZXhwLCAnJDEnKTtcblxuICAgICAgICBpZiAoY29udGFpbnMoaWQsICc7JykpIHtcbiAgICAgICAgICAgIHZhciBwaWVjZXMgPSBpZC5zcGxpdCgnOycpO1xuXG4gICAgICAgICAgICBpZiAoY29udGFpbnMocGllY2VzWzFdLCAnJScpKSB7XG4gICAgICAgICAgICAgICAgLy8gbGlua3MgbGlrZSB0aGlzOlxuICAgICAgICAgICAgICAgIC8vIFwiaHR0cDovL3d3dy55b3V0dWJlLmNvbS9hdHRyaWJ1dGlvbl9saW5rP2E9cHhhNmdvSHF6YUEmYW1wO3U9JTJGd2F0Y2glM0Z2JTNEZFBkZ3gzMHc5c1UlMjZmZWF0dXJlJTNEc2hhcmVcIlxuICAgICAgICAgICAgICAgIC8vIGhhdmUgdGhlIHJlYWwgcXVlcnkgc3RyaW5nIFVSSSBlbmNvZGVkIGJlaGluZCBhICc7Jy5cbiAgICAgICAgICAgICAgICAvLyBhdCB0aGlzIHBvaW50LCBgaWQgaXMgJ3B4YTZnb0hxemFBO3U9JTJGd2F0Y2glM0Z2JTNEZFBkZ3gzMHc5c1UlMjZmZWF0dXJlJTNEc2hhcmUnXG4gICAgICAgICAgICAgICAgdmFyIHVyaUNvbXBvbmVudCA9IGRlY29kZVVSSUNvbXBvbmVudChwaWVjZXNbMV0pO1xuICAgICAgICAgICAgICAgIGlkID0gKCdodHRwOi8veW91dHViZS5jb20nICsgdXJpQ29tcG9uZW50KVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoeW91dHViZVJlZ2V4cCwgJyQxJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9VmJORjlYMXdhU2MmYW1wO2ZlYXR1cmU9eW91dHUuYmVcbiAgICAgICAgICAgICAgICAvLyBgaWRgIGxvb2tzIGxpa2UgJ1ZiTkY5WDF3YVNjO2ZlYXR1cmU9eW91dHUuYmUnIGN1cnJlbnRseS5cbiAgICAgICAgICAgICAgICAvLyBzdHJpcCB0aGUgJztmZWF0dXJlPXlvdXR1LmJlJ1xuICAgICAgICAgICAgICAgIGlkID0gcGllY2VzWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGNvbnRhaW5zKGlkLCAnIycpKSB7XG4gICAgICAgICAgICAvLyBpZCBtaWdodCBsb29rIGxpa2UgJzkzTHZUS0ZfalcwI3Q9MSdcbiAgICAgICAgICAgIC8vIGFuZCB3ZSB3YW50ICc5M0x2VEtGX2pXMCdcbiAgICAgICAgICAgIGlkID0gaWQuc3BsaXQoJyMnKVswXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9O1xuXG4gICAgU2VydmljZS5nZXRUaW1lRnJvbVVSTCA9IGZ1bmN0aW9uIGdldFRpbWVGcm9tVVJMKHVybCkge1xuICAgICAgICB1cmwgPSB1cmwgfHwgJyc7XG5cbiAgICAgICAgLy8gdD00bTIwc1xuICAgICAgICAvLyByZXR1cm5zIFsndD00bTIwcycsICc0JywgJzIwJ11cbiAgICAgICAgLy8gdD00NnNcbiAgICAgICAgLy8gcmV0dXJucyBbJ3Q9NDZzJywgJzQ2J11cbiAgICAgICAgLy8gdD00NlxuICAgICAgICAvLyByZXR1cm5zIFsndD00NicsICc0NiddXG4gICAgICAgIHZhciB0aW1lcyA9IHVybC5tYXRjaCh0aW1lUmVnZXhwKTtcblxuICAgICAgICBpZiAoIXRpbWVzKSB7XG4gICAgICAgICAgICAvLyB6ZXJvIHNlY29uZHNcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gYXNzdW1lIHRoZSBmaXJzdFxuICAgICAgICB2YXIgZnVsbCA9IHRpbWVzWzBdLFxuICAgICAgICAgICAgbWludXRlcyA9IHRpbWVzWzFdLFxuICAgICAgICAgICAgc2Vjb25kcyA9IHRpbWVzWzJdO1xuXG4gICAgICAgIC8vIHQ9NG0yMHNcbiAgICAgICAgaWYgKHR5cGVvZiBzZWNvbmRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgc2Vjb25kcyA9IHBhcnNlSW50KHNlY29uZHMsIDEwKTtcbiAgICAgICAgICAgIG1pbnV0ZXMgPSBwYXJzZUludChtaW51dGVzLCAxMCk7XG5cbiAgICAgICAgLy8gdD00bVxuICAgICAgICB9IGVsc2UgaWYgKGNvbnRhaW5zKGZ1bGwsICdtJykpIHtcbiAgICAgICAgICAgIG1pbnV0ZXMgPSBwYXJzZUludChtaW51dGVzLCAxMCk7XG4gICAgICAgICAgICBzZWNvbmRzID0gMDtcblxuICAgICAgICAvLyB0PTRzXG4gICAgICAgIC8vIHQ9NFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2Vjb25kcyA9IHBhcnNlSW50KG1pbnV0ZXMsIDEwKTtcbiAgICAgICAgICAgIG1pbnV0ZXMgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaW4gc2Vjb25kc1xuICAgICAgICByZXR1cm4gc2Vjb25kcyArIChtaW51dGVzICogNjApO1xuICAgIH07XG5cbiAgICBTZXJ2aWNlLnJlYWR5ID0gZmFsc2U7XG5cbiAgICBmdW5jdGlvbiBhcHBseVNlcnZpY2VJc1JlYWR5KCkge1xuICAgICAgICAkcm9vdFNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBTZXJ2aWNlLnJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIElmIHRoZSBsaWJyYXJ5IGlzbid0IGhlcmUgYXQgYWxsLFxuICAgIGlmICh0eXBlb2YgWVQgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgLy8gLi4uZ3JhYiBvbiB0byBnbG9iYWwgY2FsbGJhY2ssIGluIGNhc2UgaXQncyBldmVudHVhbGx5IGxvYWRlZFxuICAgICAgICAkd2luZG93Lm9uWW91VHViZUlmcmFtZUFQSVJlYWR5ID0gYXBwbHlTZXJ2aWNlSXNSZWFkeTtcbiAgICAgICAgY29uc29sZS5sb2coJ1VuYWJsZSB0byBmaW5kIFlvdVR1YmUgaWZyYW1lIGxpYnJhcnkgb24gdGhpcyBwYWdlLicpXG4gICAgfSBlbHNlIGlmIChZVC5sb2FkZWQpIHtcbiAgICAgICAgU2VydmljZS5yZWFkeSA9IHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgWVQucmVhZHkoYXBwbHlTZXJ2aWNlSXNSZWFkeSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFNlcnZpY2U7XG59XSlcbi5kaXJlY3RpdmUoJ3lvdXR1YmVWaWRlbycsIFsnJHdpbmRvdycsICd5b3V0dWJlRW1iZWRVdGlscycsIGZ1bmN0aW9uICgkd2luZG93LCB5b3V0dWJlRW1iZWRVdGlscykge1xuICAgIHZhciB1bmlxSWQgPSAxO1xuXG4gICAgLy8gZnJvbSBZVC5QbGF5ZXJTdGF0ZVxuICAgIHZhciBzdGF0ZU5hbWVzID0ge1xuICAgICAgICAnLTEnOiAndW5zdGFydGVkJyxcbiAgICAgICAgMDogJ2VuZGVkJyxcbiAgICAgICAgMTogJ3BsYXlpbmcnLFxuICAgICAgICAyOiAncGF1c2VkJyxcbiAgICAgICAgMzogJ2J1ZmZlcmluZycsXG4gICAgICAgIDU6ICdxdWV1ZWQnXG4gICAgfTtcblxuICAgIHZhciBldmVudFByZWZpeCA9ICd5b3V0dWJlLnBsYXllci4nO1xuXG4gICAgJHdpbmRvdy5ZVENvbmZpZyA9IHtcbiAgICAgICAgaG9zdDogJ2h0dHBzOi8vd3d3LnlvdXR1YmUuY29tJ1xuICAgIH07XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0VBJyxcbiAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgIHZpZGVvSWQ6ICc9PycsXG4gICAgICAgICAgICB2aWRlb1VybDogJz0/JyxcbiAgICAgICAgICAgIHBsYXllcjogJz0/JyxcbiAgICAgICAgICAgIHBsYXllclZhcnM6ICc9PycsXG4gICAgICAgICAgICBwbGF5ZXJIZWlnaHQ6ICc9PycsXG4gICAgICAgICAgICBwbGF5ZXJXaWR0aDogJz0/J1xuICAgICAgICB9LFxuICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSB7XG4gICAgICAgICAgICAvLyBhbGxvd3MgdXMgdG8gJHdhdGNoIGByZWFkeWBcbiAgICAgICAgICAgIHNjb3BlLnV0aWxzID0geW91dHViZUVtYmVkVXRpbHM7XG5cbiAgICAgICAgICAgIC8vIHBsYXllci1pZCBhdHRyID4gaWQgYXR0ciA+IGRpcmVjdGl2ZS1nZW5lcmF0ZWQgSURcbiAgICAgICAgICAgIHZhciBwbGF5ZXJJZCA9IGF0dHJzLnBsYXllcklkIHx8IGVsZW1lbnRbMF0uaWQgfHwgJ3VuaXF1ZS15b3V0dWJlLWVtYmVkLWlkLScgKyB1bmlxSWQrKztcbiAgICAgICAgICAgIGVsZW1lbnRbMF0uaWQgPSBwbGF5ZXJJZDtcblxuICAgICAgICAgICAgLy8gQXR0YWNoIHRvIGVsZW1lbnRcbiAgICAgICAgICAgIHNjb3BlLnBsYXllckhlaWdodCA9IHNjb3BlLnBsYXllckhlaWdodCB8fCAzOTA7XG4gICAgICAgICAgICBzY29wZS5wbGF5ZXJXaWR0aCA9IHNjb3BlLnBsYXllcldpZHRoIHx8IDY0MDtcbiAgICAgICAgICAgIHNjb3BlLnBsYXllclZhcnMgPSBzY29wZS5wbGF5ZXJWYXJzIHx8IHt9O1xuXG4gICAgICAgICAgICAvLyBZVCBjYWxscyBjYWxsYmFja3Mgb3V0c2lkZSBvZiBkaWdlc3QgY3ljbGVcbiAgICAgICAgICAgIGZ1bmN0aW9uIGFwcGx5QnJvYWRjYXN0ICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJGVtaXQuYXBwbHkoc2NvcGUsIGFyZ3MpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBvblBsYXllclN0YXRlQ2hhbmdlIChldmVudCkge1xuICAgICAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0YXRlTmFtZXNbZXZlbnQuZGF0YV07XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBzdGF0ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlCcm9hZGNhc3QoZXZlbnRQcmVmaXggKyBzdGF0ZSwgc2NvcGUucGxheWVyLCBldmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnBsYXllci5jdXJyZW50U3RhdGUgPSBzdGF0ZTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gb25QbGF5ZXJSZWFkeSAoZXZlbnQpIHtcbiAgICAgICAgICAgICAgICBhcHBseUJyb2FkY2FzdChldmVudFByZWZpeCArICdyZWFkeScsIHNjb3BlLnBsYXllciwgZXZlbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBvblBsYXllckVycm9yIChldmVudCkge1xuICAgICAgICAgICAgICAgIGFwcGx5QnJvYWRjYXN0KGV2ZW50UHJlZml4ICsgJ2Vycm9yJywgc2NvcGUucGxheWVyLCBldmVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVBsYXllciAoKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBsYXllclZhcnMgPSBhbmd1bGFyLmNvcHkoc2NvcGUucGxheWVyVmFycyk7XG4gICAgICAgICAgICAgICAgcGxheWVyVmFycy5zdGFydCA9IHBsYXllclZhcnMuc3RhcnQgfHwgc2NvcGUudXJsU3RhcnRUaW1lO1xuICAgICAgICAgICAgICAgIHZhciBwbGF5ZXIgPSBuZXcgWVQuUGxheWVyKHBsYXllcklkLCB7XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogc2NvcGUucGxheWVySGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogc2NvcGUucGxheWVyV2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIHZpZGVvSWQ6IHNjb3BlLnZpZGVvSWQsXG4gICAgICAgICAgICAgICAgICAgIHBsYXllclZhcnM6IHBsYXllclZhcnMsXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50czoge1xuICAgICAgICAgICAgICAgICAgICAgICAgb25SZWFkeTogb25QbGF5ZXJSZWFkeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uU3RhdGVDaGFuZ2U6IG9uUGxheWVyU3RhdGVDaGFuZ2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBvbkVycm9yOiBvblBsYXllckVycm9yXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHBsYXllci5pZCA9IHBsYXllcklkO1xuICAgICAgICAgICAgICAgIHJldHVybiBwbGF5ZXI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGxvYWRQbGF5ZXIgKCkge1xuICAgICAgICAgICAgICAgIGlmIChzY29wZS52aWRlb0lkIHx8IHNjb3BlLnBsYXllclZhcnMubGlzdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2NvcGUucGxheWVyICYmIHR5cGVvZiBzY29wZS5wbGF5ZXIuZGVzdHJveSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUucGxheWVyLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnBsYXllciA9IGNyZWF0ZVBsYXllcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBzdG9wV2F0Y2hpbmdSZWFkeSA9IHNjb3BlLiR3YXRjaChcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS51dGlscy5yZWFkeVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2FpdCB1bnRpbCBvbmUgb2YgdGhlbSBpcyBkZWZpbmVkLi4uXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAodHlwZW9mIHNjb3BlLnZpZGVvVXJsICE9PSAndW5kZWZpbmVkJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfHwgIHR5cGVvZiBzY29wZS52aWRlb0lkICE9PSAndW5kZWZpbmVkJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfHwgIHR5cGVvZiBzY29wZS5wbGF5ZXJWYXJzLmxpc3QgIT09ICd1bmRlZmluZWQnKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChyZWFkeSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVhZHkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0b3BXYXRjaGluZ1JlYWR5KCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFVSTCB0YWtlcyBmaXJzdCBwcmlvcml0eVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBzY29wZS52aWRlb1VybCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS4kd2F0Y2goJ3ZpZGVvVXJsJywgZnVuY3Rpb24gKHVybCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS52aWRlb0lkID0gc2NvcGUudXRpbHMuZ2V0SWRGcm9tVVJMKHVybCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLnVybFN0YXJ0VGltZSA9IHNjb3BlLnV0aWxzLmdldFRpbWVGcm9tVVJMKHVybCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9hZFBsYXllcigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGVuLCBhIHZpZGVvIElEXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBzY29wZS52aWRlb0lkICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLiR3YXRjaCgndmlkZW9JZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUudXJsU3RhcnRUaW1lID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9hZFBsYXllcigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBmaW5hbGx5LCBhIGxpc3RcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuJHdhdGNoKCdwbGF5ZXJWYXJzLmxpc3QnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLnVybFN0YXJ0VGltZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvYWRQbGF5ZXIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHNjb3BlLiR3YXRjaENvbGxlY3Rpb24oWydwbGF5ZXJIZWlnaHQnLCAncGxheWVyV2lkdGgnXSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNjb3BlLnBsYXllcikge1xuICAgICAgICAgICAgICAgICAgICBzY29wZS5wbGF5ZXIuc2V0U2l6ZShzY29wZS5wbGF5ZXJXaWR0aCwgc2NvcGUucGxheWVySGVpZ2h0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzY29wZS5wbGF5ZXIgJiYgc2NvcGUucGxheWVyLmRlc3Ryb3koKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcbn1dKTtcbiIsIihmdW5jdGlvbiAoKSB7XG4gIC8vIENvbXBpbGUgYW5kIGNhY2hlIHRoZSBuZWVkZWQgcmVndWxhciBleHByZXNzaW9ucy5cbiAgdmFyIFNQQUNFID0gL1xccy9nXG4gIHZhciBMRVNTX1RIQU4gPSAvPi9nXG4gIHZhciBNT1JFX1RIQU4gPSAvPC9nXG5cbiAgLy8gV2UgbmVlZCB0byBzd2FwIG91dCB0aGVzZSBjaGFyYWN0ZXJzIHdpdGggdGhlaXIgY2hhcmFjdGVyLWVudGl0eVxuICAvLyBlcXVpdmFsZW50cyBiZWNhdXNlIHdlJ3JlIGFzc2lnbmluZyB0aGUgcmVzdWx0aW5nIHN0cmluZyB0b1xuICAvLyBgZ2hvc3QuaW5uZXJIVE1MYC5cbiAgZnVuY3Rpb24gZXNjYXBlIChzdHIpIHtcbiAgICByZXR1cm4gc3RyLnJlcGxhY2UoU1BBQ0UsICcmbmJzcDsnKVxuICAgICAgICAgICAgICAucmVwbGFjZShMRVNTX1RIQU4sICcmbHQ7JylcbiAgICAgICAgICAgICAgLnJlcGxhY2UoTU9SRV9USEFOLCAnJmd0OycpXG4gIH1cblxuICAvLyBDcmVhdGUgdGhlIGBnaG9zdGAgZWxlbWVudCwgd2l0aCBpbmxpbmUgc3R5bGVzIHRvIGhpZGUgaXQgYW5kIGVuc3VyZVxuICAvLyB0aGF0IHRoZSB0ZXh0IGlzIGFsbCBvbiBhIHNpbmdsZSBsaW5lLlxuICB2YXIgR0hPU1RfRUxFTUVOVF9JRCA9ICdfX2F1dG9zaXplSW5wdXRHaG9zdCdcbiAgZnVuY3Rpb24gY3JlYXRlR2hvc3RFbGVtZW50ICgpIHtcbiAgICB2YXIgZ2hvc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuICAgIGdob3N0LmlkID0gR0hPU1RfRUxFTUVOVF9JRFxuICAgIGdob3N0LnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTppbmxpbmUtYmxvY2s7aGVpZ2h0OjA7b3ZlcmZsb3c6aGlkZGVuO3Bvc2l0aW9uOmFic29sdXRlO3RvcDowO3Zpc2liaWxpdHk6aGlkZGVuO3doaXRlLXNwYWNlOm5vd3JhcDsnXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChnaG9zdClcbiAgICByZXR1cm4gZ2hvc3RcbiAgfVxuXG4gIC8vIENyZWF0ZSB0aGUgYGdob3N0YCBlbGVtZW50LlxuICB2YXIgZ2hvc3QgPSBjcmVhdGVHaG9zdEVsZW1lbnQoKVxuXG4gIGZ1bmN0aW9uIGF1dG9zaXplSW5wdXQgKGVsZW1lbnQsIG9wdGlvbnMpIHtcbiAgICAvLyBDb3B5IGFsbCB3aWR0aC1hZmZlY3Rpbmcgc3R5bGVzIHRvIHRoZSBnaG9zdCBlbGVtZW50XG4gICAgdmFyIGVsZW1lbnRTdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpXG4gICAgdmFyIGVsZW1lbnRDc3NUZXh0ID0gJ2JveC1zaXppbmc6JyArIGVsZW1lbnRTdHlsZS5ib3hTaXppbmcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJztib3JkZXItbGVmdDonICsgZWxlbWVudFN0eWxlLmJvcmRlckxlZnRXaWR0aCArICcgc29saWQgYmxhY2snICtcbiAgICAgICAgICAgICAgICAgICAgICAgICc7Ym9yZGVyLXJpZ2h0OicgKyBlbGVtZW50U3R5bGUuYm9yZGVyUmlnaHRXaWR0aCArICcgc29saWQgYmxhY2snICtcbiAgICAgICAgICAgICAgICAgICAgICAgICc7Zm9udC1mYW1pbHk6JyArIGVsZW1lbnRTdHlsZS5mb250RmFtaWx5ICtcbiAgICAgICAgICAgICAgICAgICAgICAgICc7Zm9udC1mZWF0dXJlLXNldHRpbmdzOicgKyBlbGVtZW50U3R5bGUuZm9udEZlYXR1cmVTZXR0aW5ncyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnO2ZvbnQta2VybmluZzonICsgZWxlbWVudFN0eWxlLmZvbnRLZXJuaW5nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICc7Zm9udC1zaXplOicgKyBlbGVtZW50U3R5bGUuZm9udFNpemUgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJztmb250LXN0cmV0Y2g6JyArIGVsZW1lbnRTdHlsZS5mb250U3RyZXRjaCArXG4gICAgICAgICAgICAgICAgICAgICAgICAnO2ZvbnQtc3R5bGU6JyArIGVsZW1lbnRTdHlsZS5mb250U3R5bGUgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJztmb250LXZhcmlhbnQ6JyArIGVsZW1lbnRTdHlsZS5mb250VmFyaWFudCArXG4gICAgICAgICAgICAgICAgICAgICAgICAnO2ZvbnQtdmFyaWFudC1jYXBzOicgKyBlbGVtZW50U3R5bGUuZm9udFZhcmlhbnRDYXBzICtcbiAgICAgICAgICAgICAgICAgICAgICAgICc7Zm9udC12YXJpYW50LWxpZ2F0dXJlczonICsgZWxlbWVudFN0eWxlLmZvbnRWYXJpYW50TGlnYXR1cmVzICtcbiAgICAgICAgICAgICAgICAgICAgICAgICc7Zm9udC12YXJpYW50LW51bWVyaWM6JyArIGVsZW1lbnRTdHlsZS5mb250VmFyaWFudE51bWVyaWMgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJztmb250LXdlaWdodDonICsgZWxlbWVudFN0eWxlLmZvbnRXZWlnaHQgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJztsZXR0ZXItc3BhY2luZzonICsgZWxlbWVudFN0eWxlLmxldHRlclNwYWNpbmcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJzttYXJnaW4tbGVmdDonICsgZWxlbWVudFN0eWxlLm1hcmdpbkxlZnQgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJzttYXJnaW4tcmlnaHQ6JyArIGVsZW1lbnRTdHlsZS5tYXJnaW5SaWdodCArXG4gICAgICAgICAgICAgICAgICAgICAgICAnO3BhZGRpbmctbGVmdDonICsgZWxlbWVudFN0eWxlLnBhZGRpbmdMZWZ0ICtcbiAgICAgICAgICAgICAgICAgICAgICAgICc7cGFkZGluZy1yaWdodDonICsgZWxlbWVudFN0eWxlLnBhZGRpbmdSaWdodCArXG4gICAgICAgICAgICAgICAgICAgICAgICAnO3RleHQtaW5kZW50OicgKyBlbGVtZW50U3R5bGUudGV4dEluZGVudCArXG4gICAgICAgICAgICAgICAgICAgICAgICAnO3RleHQtdHJhbnNmb3JtOicgKyBlbGVtZW50U3R5bGUudGV4dFRyYW5zZm9ybVxuXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIHRoYXQ6XG4gICAgLy8gMS4gQ29waWVzIGBmb250LWZhbWlseWAsIGBmb250LXNpemVgIGFuZCBvdGhlciBzdHlsZXMgb2Ygb3VyIGBlbGVtZW50YCBvbnRvIGBnaG9zdGAuXG4gICAgLy8gMi4gU2V0cyB0aGUgY29udGVudHMgb2YgYGdob3N0YCB0byB0aGUgc3BlY2lmaWVkIGBzdHJgLlxuICAgIC8vIDMuIENvcGllcyB0aGUgd2lkdGggb2YgYGdob3N0YCBvbnRvIG91ciBgZWxlbWVudGAuXG4gICAgZnVuY3Rpb24gc2V0IChzdHIpIHtcbiAgICAgIHN0ciA9IHN0ciB8fCBlbGVtZW50LnZhbHVlIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdwbGFjZWhvbGRlcicpIHx8ICcnXG4gICAgICAvLyBDaGVjayBpZiB0aGUgYGdob3N0YCBlbGVtZW50IHN0aWxsIGV4aXN0cy4gSWYgbm8sIGNyZWF0ZSBpdC5cbiAgICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChHSE9TVF9FTEVNRU5UX0lEKSA9PT0gbnVsbCkge1xuICAgICAgICBnaG9zdCA9IGNyZWF0ZUdob3N0RWxlbWVudCgpXG4gICAgICB9XG4gICAgICBnaG9zdC5zdHlsZS5jc3NUZXh0ICs9IGVsZW1lbnRDc3NUZXh0XG4gICAgICBnaG9zdC5pbm5lckhUTUwgPSBlc2NhcGUoc3RyKVxuICAgICAgdmFyIHdpZHRoID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZ2hvc3QpLndpZHRoXG4gICAgICBlbGVtZW50LnN0eWxlLndpZHRoID0gd2lkdGhcbiAgICAgIHJldHVybiB3aWR0aFxuICAgIH1cblxuICAgIC8vIENhbGwgYHNldGAgb24gZXZlcnkgYGlucHV0YCBldmVudCAoSUU5KykuXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHNldCgpXG4gICAgfSlcblxuICAgIC8vIEluaXRpYWxpc2UgdGhlIGBlbGVtZW50YCB3aWR0aC5cbiAgICB2YXIgd2lkdGggPSBzZXQoKVxuXG4gICAgLy8gU2V0IGBtaW4td2lkdGhgIGlmIGBvcHRpb25zLm1pbldpZHRoYCB3YXMgc2V0LCBhbmQgb25seSBpZiB0aGUgaW5pdGlhbFxuICAgIC8vIHdpZHRoIGlzIG5vbi16ZXJvLlxuICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMubWluV2lkdGggJiYgd2lkdGggIT09ICcwcHgnKSB7XG4gICAgICBlbGVtZW50LnN0eWxlLm1pbldpZHRoID0gd2lkdGhcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gdGhlIGBzZXRgIGZ1bmN0aW9uLlxuICAgIHJldHVybiBzZXRcbiAgfVxuXG4gIGlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0Jykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gYXV0b3NpemVJbnB1dFxuICB9IGVsc2Uge1xuICAgIHdpbmRvdy5hdXRvc2l6ZUlucHV0ID0gYXV0b3NpemVJbnB1dFxuICB9XG59KSgpXG4iLCIoZnVuY3Rpb24ocm9vdCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICAvLyBTZW50aW5lbCB0byBpbmRpY2F0ZSB0aGF0IHRoZSBwbGF5bGlzdCBpcyBjdXJyZW50bHkgc3RvcHBlZC5cbiAgdmFyIFNUT1BQRUQgPSAtMTtcblxuICAvLyBTZW50aW5lbCB0byBpbmRpY2F0ZSB0aGF0IHNodWZmbGluZyBpcyB0dXJuZWQgb2ZmLlxuICB2YXIgTk9UX1NIVUZGTElORyA9IGZhbHNlO1xuXG4gIC8vIE5vLW9wIGZ1bmN0aW9uLlxuICB2YXIgbm9vcCA9IGZ1bmN0aW9uKCkge307XG5cbiAgLy9cbiAgLy8gU3dhcHMgYGFycltpXWAgYW5kIGBhcnJbal1gIGluIHBsYWNlLlxuICAvL1xuICB2YXIgc3dhcCA9IGZ1bmN0aW9uKGFyciwgaSwgaikge1xuICAgIHZhciB0ZW1wID0gYXJyW2ldO1xuICAgIGFycltpXSA9IGFycltqXTtcbiAgICBhcnJbal0gPSB0ZW1wO1xuICAgIHJldHVybiBhcnI7XG4gIH07XG5cbiAgLy9cbiAgLy8gR2VuZXJhdGUgYW4gaW50ZWdlciBpbiB0aGUgc3BlY2lmaWVkIHJhbmdlLlxuICAvL1xuICB2YXIgcmFuZCA9IGZ1bmN0aW9uKG1pbiwgbWF4KSB7XG4gICAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSkgKyBtaW47XG4gIH07XG5cbiAgLy9cbiAgLy8gQ29uc3RydWN0b3IuXG4gIC8vXG4gIHZhciBKb2NrZXkgPSBmdW5jdGlvbihpdGVtcywgb3B0cykge1xuXG4gICAgLy8gQWxsb3cgYEpvY2tleWAgdG8gYmUgY2FsbGVkIHdpdGhvdXQgdGhlIGBuZXdgIGtleXdvcmQuXG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEpvY2tleSkpIHtcbiAgICAgIHJldHVybiBuZXcgSm9ja2V5KGl0ZW1zLCBvcHRzKTtcbiAgICB9XG5cbiAgICAvLyBUaGUgaXRlbXMgaW4gdGhlIHBsYXlsaXN0LlxuICAgIHRoaXMuaXRlbXMgPSBpdGVtcyB8fCBbXTtcblxuICAgIC8vIENhbGxiYWNrcy5cbiAgICBvcHRzID0gb3B0cyB8fCB7fTtcbiAgICB0aGlzLm1jID0gb3B0cy5tb2RlbENoYW5nZSB8fCBub29wO1xuICAgIHRoaXMuc2MgPSBvcHRzLnN0YXRlQ2hhbmdlIHx8IG5vb3A7XG5cbiAgICAvLyBJZiBzaHVmZmxpbmcsIHRoaXMgaXMgYSBtZXJlbHkgYSBzaGFsbG93IGNvcHkgb2YgdGhlIGl0ZW1zIGluXG4gICAgLy8gYHRoaXMuaXRlbXNgLCBidXQgaW4gYSBzaHVmZmxlZCBvcmRlci5cbiAgICB0aGlzLnNodWZmbGVkID0gTk9UX1NIVUZGTElORztcblxuICAgIC8vIElmIG5vdCBwbGF5aW5nOiBgdGhpcy5pYCBlcXVhbHMgYFNUT1BQRURgLlxuICAgIC8vIElmIHBsYXlpbmcgYW5kIHNodWZmbGluZzogYHRoaXMuaWAgcmVmZXJzIHRvIGFuIGl0ZW0gaW4gYHRoaXMuc2h1ZmZsZWRgLFxuICAgIC8vIGllLiB0aGUgY3VycmVudGx5LXBsYXlpbmcgaXRlbSBpcyBgdGhpcy5zaHVmZmxlZFt0aGlzLmldYC5cbiAgICAvLyBJZiBwbGF5aW5nIGFuZCBub3Qgc2h1ZmZsaW5nOiBgdGhpcy5pYCByZWZlcnMgdG8gYW4gaXRlbSBpblxuICAgIC8vIGB0aGlzLml0ZW1zYCwgaWUuIHRoZSBjdXJyZW50bHktcGxheWluZyBpdGVtIGlzIGB0aGlzLml0ZW1zW3RoaXMuaV1gLlxuICAgIHRoaXMuaSA9IFNUT1BQRUQ7XG5cbiAgICAvLyBUaGlzIGZsYWcgd2lsbCBiZSBgdHJ1ZWAgaWYgd2UgYXJlIHJlcGVhdGluZyB0aGUgcGxheWxpc3QuXG4gICAgdGhpcy5yZXBlYXRGbGFnID0gZmFsc2U7XG5cbiAgICAvLyBUaGlzIGZsYWcgd2lsbCBiZSBgdHJ1ZWAgaWYgdGhlIHBsYXlsaXN0IGlzIHBhdXNlZC5cbiAgICB0aGlzLnBhdXNlRmxhZyA9IGZhbHNlO1xuICB9O1xuXG4gIC8vIFN0b3JlIGEgcmVmZXJlbmNlIHRvIHRoZSBKb2NrZXkgYHByb3RvdHlwZWAgdG8gZmFjaWxpdGF0ZSBtaW5pZmljYXRpb24uXG4gIHZhciBqID0gSm9ja2V5LnByb3RvdHlwZTtcblxuICAvL1xuICAvLyBBZGQgYGl0ZW1gIHRvIGB0aGlzLml0ZW1zYC5cbiAgLy9cbiAgai5hZGQgPSBmdW5jdGlvbihpdGVtKSB7XG5cbiAgICAvLyBUaHJvdyBpZiBubyBgaXRlbWAuXG4gICAgaWYgKGl0ZW0gPT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCduZWVkIGFuIGl0ZW0nKTtcbiAgICB9XG5cbiAgICAvLyBBZGQgYGl0ZW1gIHRvIGB0aGlzLml0ZW1zYC5cbiAgICB0aGlzLml0ZW1zLnB1c2goaXRlbSk7XG5cbiAgICAvLyBBZGQgYGl0ZW1gIHRvIGB0aGlzLnNodWZmbGVkYC5cbiAgICBpZiAodGhpcy5pc1NodWZmbGluZygpKSB7XG4gICAgICB0aGlzLnNodWZmbGVkLnB1c2goaXRlbSk7XG5cbiAgICAgIC8vIElmIHBsYXlpbmcsIHNodWZmbGUgdGhlIFwidW5wbGF5ZWRcIiBzdWJhcnJheSBvZiBgdGhpcy5zaHVmZmxlZGAuIEVsc2VcbiAgICAgIC8vIHNodWZmbGUgdGhlIGVudGlyZSBgdGhpcy5zaHVmZmxlZGAgYXJyYXkuXG4gICAgICB0aGlzLl9zKHRoaXMuc2h1ZmZsZWQsIHRoaXMuaXNNb3VudGVkKCkgPyB0aGlzLmkgKyAxIDogMCk7XG4gICAgfVxuXG4gICAgLy8gRmlyZSB0aGUgbW9kZWwgY2hhbmdlIGNhbGxiYWNrLlxuICAgIHRoaXMubWMoJ2FkZCcsIHRoaXMuaXRlbXMpO1xuICB9O1xuXG4gIC8vXG4gIC8vIFJlbW92ZSB0aGUgaXRlbSBhdCBpbmRleCBgaWAgb2YgYHRoaXMuaXRlbXNgLlxuICAvL1xuICBqLnJlbW92ZSA9IGZ1bmN0aW9uKGkpIHtcblxuICAgIC8vIFRocm93IGZvciBpbnZhbGlkIGBpYC5cbiAgICB0aGlzLl9jKGkpO1xuXG4gICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgY3VycmVudGx5LXBsYXlpbmcgaXRlbS5cbiAgICB2YXIgY3VycmVudEl0ZW0gPSB0aGlzLmdldEN1cnJlbnQoKTtcblxuICAgIC8vIFJlbW92ZSBgaXRlbWAgZnJvbSBgdGhpcy5pdGVtc2AuXG4gICAgdmFyIGl0ZW0gPSB0aGlzLml0ZW1zW2ldO1xuICAgIHRoaXMuaXRlbXMuc3BsaWNlKGksIDEpO1xuXG4gICAgLy8gUmVtb3ZlIGBpdGVtYCBmcm9tIGB0aGlzLnNodWZmbGVkYC4gVXBkYXRlIGBpYCB0byByZWZlciB0byBhbiBlbGVtZW50XG4gICAgLy8gaW4gYHRoaXMuc2h1ZmZsZWRgLlxuICAgIGlmICh0aGlzLmlzU2h1ZmZsaW5nKCkpIHtcbiAgICAgIGkgPSB0aGlzLnNodWZmbGVkLmluZGV4T2YoaXRlbSk7XG4gICAgICB0aGlzLnNodWZmbGVkLnNwbGljZShpLCAxKTtcbiAgICB9XG4gICAgaWYgKGkgPCB0aGlzLmkpIHtcblxuICAgICAgLy8gRGVjcmVtZW50IGB0aGlzLmlgIGlmIHRoZSByZW1vdmVkIGBpdGVtYCBvY2N1cnMgYmVmb3JlIHRoZVxuICAgICAgLy8gY3VycmVudC1wbGF5aW5nIGl0ZW0uIElmIHNodWZmbGluZywgYGlgIHJlZmVycyB0byBhbiBpdGVtIGluXG4gICAgICAvLyBgdGhpcy5zaHVmZmxlZGAuIEVsc2UgYGlgIHJlZmVycyB0byBhbiBpdGVtIGluIGB0aGlzLml0ZW1zYC5cbiAgICAgIHRoaXMuaS0tO1xuICAgIH0gZWxzZSB7XG5cbiAgICAgIC8vIFN0b3AgcGxheWluZyBpZiB0aGUgcmVtb3ZlZCBgaXRlbWAgaXMgdGhlIGN1cnJlbnRseS1wbGF5aW5nIGl0ZW0uXG4gICAgICBpZiAoaXRlbSA9PSBjdXJyZW50SXRlbSkge1xuICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBGaXJlIHRoZSBtb2RlbCBjaGFuZ2UgY2FsbGJhY2suXG4gICAgdGhpcy5tYygncmVtb3ZlJywgdGhpcy5pdGVtcyk7XG4gIH07XG5cbiAgLy9cbiAgLy8gU2V0IHRoZSBpdGVtIGF0IGluZGV4IGBpYCBvZiBgdGhpcy5pdGVtc2AgdG8gdGhlIHNwZWNpZmllZCBgaXRlbWAuXG4gIC8vXG4gIGouc2V0ID0gZnVuY3Rpb24oaSwgaXRlbSkge1xuXG4gICAgLy8gVGhyb3cgZm9yIGludmFsaWQgYGlgLlxuICAgIHRoaXMuX2MoaSk7XG5cbiAgICAvLyBUaHJvdyBpZiBubyBgaXRlbWAuXG4gICAgaWYgKGl0ZW0gPT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCduZWVkIGFuIGl0ZW0nKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgaXQgaW4gYHRoaXMuaXRlbXNgLlxuICAgIHZhciBvbGRJdGVtID0gdGhpcy5pdGVtc1tpXTtcbiAgICB0aGlzLml0ZW1zW2ldID0gaXRlbTtcblxuICAgIC8vIFVwZGF0ZSBgdGhpcy5zaHVmZmxlZGAgaWYgd2UgYXJlIHNodWZmbGluZy5cbiAgICBpZiAodGhpcy5pc1NodWZmbGluZygpKSB7XG4gICAgICBpID0gdGhpcy5zaHVmZmxlZC5pbmRleE9mKG9sZEl0ZW0pO1xuICAgICAgdGhpcy5zaHVmZmxlZFtpXSA9IGl0ZW07XG4gICAgfVxuXG4gICAgLy8gRmlyZSB0aGUgbW9kZWwgY2hhbmdlIGNhbGxiYWNrLlxuICAgIHRoaXMubWMoJ3NldCcsIHRoaXMuaXRlbXMpO1xuICB9O1xuXG4gIC8vXG4gIC8vIFJldHVybnMgdGhlIHBsYXlsaXN0IHNpemUuXG4gIC8vXG4gIGouc2l6ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aDtcbiAgfTtcblxuICAvL1xuICAvLyBJZiBubyBgaWAgc3BlY2lmaWVkLCByZXR1cm5zIGFsbCB0aGUgaXRlbXMgaW4gdGhlIHBsYXlsaXN0LiBFbHNlIHJldHVybnNcbiAgLy8gdGhlIGl0ZW0gYXQgaW5kZXggYGlgIG9mIHRoZSBwbGF5bGlzdC5cbiAgLy9cbiAgai5nZXQgPSBmdW5jdGlvbihpKSB7XG5cbiAgICAvLyBSZXR1cm4gYHRoaXMuaXRlbXNgLlxuICAgIGlmIChpID09IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLml0ZW1zO1xuICAgIH1cblxuICAgIC8vIFRocm93IGZvciBpbnZhbGlkIGBpYCwgZWxzZSByZXR1cm5zIHRoZSBpdGVtIGF0IGluZGV4IGBpYC5cbiAgICB0aGlzLl9jKGkpO1xuICAgIHJldHVybiB0aGlzLml0ZW1zW2ldO1xuICB9O1xuXG4gIC8vXG4gIC8vIElmIHBsYXlpbmcsIHJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBjdXJyZW50bHktcGxheWluZyBpdGVtIGluXG4gIC8vIGB0aGlzLml0ZW1zYC4gRWxzZSByZXR1cm5zIGBTVE9QUEVEYC5cbiAgLy9cbiAgai5nZXRDdXJyZW50SW5kZXggPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5pc01vdW50ZWQoKSkge1xuXG4gICAgICAvLyBJZiBzaHVmZmxpbmcsIGxvb2t1cCB0aGUgaW5kZXggb2YgdGhlIGN1cnJlbnRseS1wbGF5aW5nIGVsZW1lbnRcbiAgICAgIC8vIGluIGB0aGlzLml0ZW1zYCwgZWxzZSBqdXN0IHJldHVybiBgdGhpcy5pYC5cbiAgICAgIHJldHVybiB0aGlzLmlzU2h1ZmZsaW5nKCkgP1xuICAgICAgICB0aGlzLml0ZW1zLmluZGV4T2YodGhpcy5nZXRDdXJyZW50KCkpIDpcbiAgICAgICAgdGhpcy5pO1xuICAgIH1cbiAgICByZXR1cm4gU1RPUFBFRDtcbiAgfTtcblxuICAvL1xuICAvLyBJZiBwbGF5aW5nLCByZXR1cm5zIHRoZSBjdXJyZW50bHktcGxheWluZyBpdGVtLiBFbHNlIHJldHVybnMgYG51bGxgLlxuICAvL1xuICBqLmdldEN1cnJlbnQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5pc01vdW50ZWQoKSkge1xuICAgICAgcmV0dXJuIHRoaXMuaXNTaHVmZmxpbmcoKSA/XG4gICAgICAgIHRoaXMuc2h1ZmZsZWRbdGhpcy5pXSA6XG4gICAgICAgIHRoaXMuaXRlbXNbdGhpcy5pXTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH07XG5cbiAgLy9cbiAgLy8gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHBsYXlsaXN0IGlzIHN0b3BwZWQuXG4gIC8vXG4gIGouaXNTdG9wcGVkID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuaSA9PT0gU1RPUFBFRDtcbiAgfTtcblxuICAvL1xuICAvLyBSZXR1cm5zIGB0cnVlYCBpZiBhbiBpdGVtIGlzIG1vdW50ZWQgaWUuIG5vdCBzdG9wcGVkLlxuICAvL1xuICBqLmlzTW91bnRlZCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAhdGhpcy5pc1N0b3BwZWQoKTtcbiAgfTtcblxuICAvL1xuICAvLyBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgcGxheWxpc3QgaXMgcGxheWluZy5cbiAgLy9cbiAgai5pc1BsYXlpbmcgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNTdG9wcGVkKCkgJiYgIXRoaXMucGF1c2VGbGFnO1xuICB9O1xuXG4gIC8vXG4gIC8vIFJldHVybnMgYHRydWVgIGlzIHRoZSBwbGF5bGlzdCBpcyBwYXVzZWQuXG4gIC8vXG4gIGouaXNQYXVzZWQgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNTdG9wcGVkKCkgJiYgdGhpcy5wYXVzZUZsYWc7XG4gIH07XG5cbiAgLy9cbiAgLy8gSWYgbm8gYGlgIHNwZWNpZmllZDogSWYgc2h1ZmZsaW5nLCBwbGF5cyB0aGUgaXRlbSBhdCBpbmRleCAwIG9mXG4gIC8vIGB0aGlzLnNodWZmbGVkYCwgZWxzZSBwbGF5cyB0aGUgaXRlbSBhdCBpbmRleCAwIG9mIGB0aGlzLml0ZW1zYC5cbiAgLy8gSWYgYGlgIHNwZWNpZmllZDogUGxheXMgdGhlIGl0ZW0gYXQgaW5kZXggYGlgIG9mIGB0aGlzLml0ZW1zYC5cbiAgLy9cbiAgai5wbGF5ID0gZnVuY3Rpb24oaSkge1xuICAgIHRoaXMuX2MoaSB8fCAwKTtcbiAgICBpZiAoaSA9PSBudWxsKSB7XG4gICAgICBpZiAodGhpcy5pc1BhdXNlZCgpKSB7XG5cbiAgICAgICAgLy8gUmVzdW1lIGlmIHBhdXNlZC5cbiAgICAgICAgdGhpcy5wYXVzZUZsYWcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5zYygncmVzdW1lJywgdGhpcy5nZXRDdXJyZW50KCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuaXNQbGF5aW5nKCkpIHtcblxuICAgICAgICAvLyBQYXVzZSBpZiBwbGF5aW5nLlxuICAgICAgICB0aGlzLnBhdXNlRmxhZyA9IHRydWU7XG4gICAgICAgIHRoaXMuc2MoJ3BhdXNlJywgdGhpcy5nZXRDdXJyZW50KCkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIC8vIE90aGVyd2lzZSBwbGF5IHRoZSBmaXJzdCBpdGVtLlxuICAgICAgICB0aGlzLmkgPSAwO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodGhpcy5pc1NodWZmbGluZygpKSB7XG5cbiAgICAgICAgLy8gU3dhcCB0aGUgaXRlbSB0byBiZSBwbGF5ZWQgdG8gdGhlIHN0YXJ0IG9mIGB0aGlzLnNodWZmbGVkYCwgdGhlblxuICAgICAgICAvLyBzaHVmZmxlIHRoZSByZXN0IG9mIHRoZSBhcnJheS5cbiAgICAgICAgdGhpcy5zaHVmZmxlZCA9IHRoaXMuaXRlbXMuc2xpY2UoKTtcbiAgICAgICAgc3dhcCh0aGlzLnNodWZmbGVkLCAwLCBpKTtcbiAgICAgICAgdGhpcy5fcyh0aGlzLnNodWZmbGVkLCAxKTtcbiAgICAgICAgdGhpcy5pID0gMDtcbiAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgLy8gTm90IHNodWZmbGluZywgc28ganVzdCBwbGF5IHRoZSBpdGVtIGF0IHRoZSBzcGVjaWZpZWQgaW5kZXguXG4gICAgICAgIHRoaXMuaSA9IGk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRmlyZSB0aGUgc3RhdGUgY2hhbmdlIGNhbGxiYWNrLlxuICAgIHRoaXMuc2MoJ3BsYXknLCB0aGlzLmdldEN1cnJlbnQoKSk7XG4gIH07XG5cbiAgLy9cbiAgLy8gU3RvcCBwbGF5aW5nLlxuICAvL1xuICBqLnN0b3AgPSBmdW5jdGlvbigpIHtcblxuICAgIC8vIFJlc2h1ZmZsZSBgdGhpcy5zaHVmZmxlZGAgaWYgd2UgYXJlIHNodWZmbGluZy5cbiAgICBpZiAodGhpcy5pc1NodWZmbGluZygpKSB7XG4gICAgICB0aGlzLl9yKCk7XG4gICAgfVxuICAgIHRoaXMuaSA9IFNUT1BQRUQ7XG5cbiAgICAvLyBGaXJlIHRoZSBzdGF0ZSBjaGFuZ2UgY2FsbGJhY2suXG4gICAgdGhpcy5zYygnc3RvcCcpO1xuICB9O1xuXG4gIC8vXG4gIC8vIFJldHVybnMgYHRydWVgIGlmIHJlcGVhdGluZy5cbiAgLy9cbiAgai5pc1JlcGVhdGluZyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnJlcGVhdEZsYWc7XG4gIH07XG5cbiAgLy9cbiAgLy8gVG9nZ2xlIHRoZSBgcmVwZWF0RmxhZ2AuXG4gIC8vXG4gIGoucmVwZWF0ID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5yZXBlYXRGbGFnID0gIXRoaXMucmVwZWF0RmxhZztcblxuICAgIC8vIEZpcmUgdGhlIHN0YXRlIGNoYW5nZSBjYWxsYmFjay5cbiAgICB0aGlzLnNjKCdyZXBlYXQnKTtcbiAgfTtcblxuICAvL1xuICAvLyBSZXR1cm5zIGB0cnVlYCBpZiBzaHVmZmxpbmcuXG4gIC8vXG4gIGouaXNTaHVmZmxpbmcgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zaHVmZmxlZCAhPT0gTk9UX1NIVUZGTElORztcbiAgfTtcblxuICAvL1xuICAvLyBUb2dnbGUgc2h1ZmZsaW5nLlxuICAvL1xuICBqLnNodWZmbGUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5pc1NodWZmbGluZygpKSB7XG5cbiAgICAgIC8vIEdldCB0aGUgaW5kZXggb2YgdGhlIGN1cnJlbnRseS1wbGF5aW5nIGl0ZW0gaW4gYHRoaXMuaXRlbXNgLCBhbmRcbiAgICAgIC8vIHVwZGF0ZSBgdGhpcy5pYCBhY2NvcmRpbmdseS4gTm93LCBiZWNhdXNlIHdlIGFyZSBubyBsb25nZXIgc2h1ZmZsaW5nLFxuICAgICAgLy8gYHRoaXMuaWAgcmVmZXJzIHRvIGFuIGluZGV4IGluIGB0aGlzLml0ZW1zYC5cbiAgICAgIGlmICh0aGlzLmlzTW91bnRlZCgpKSB7XG4gICAgICAgIHRoaXMuaSA9IHRoaXMuZ2V0Q3VycmVudEluZGV4KCk7XG4gICAgICB9XG5cbiAgICAgIC8vIENsZWFuIG91dCBgdGhpcy5zaHVmZmxlZGAuXG4gICAgICB0aGlzLnNodWZmbGVkID0gTk9UX1NIVUZGTElORztcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHRoaXMuaXNNb3VudGVkKCkpIHtcblxuICAgICAgICAvLyBNYWtlIGEgc2hhbGxvdyBjb3B5IG9mIGB0aGlzLml0ZW1zYCwgYW5kIHN3YXAgdGhlIGN1cnJlbnRseS1wbGF5aW5nXG4gICAgICAgIC8vIGl0ZW0gKGF0IGluZGV4IGB0aGlzLmlgKSB0byBpbmRleCAwLlxuICAgICAgICB0aGlzLnNodWZmbGVkID0gdGhpcy5pdGVtcy5zbGljZSgpO1xuICAgICAgICB2YXIgaXRlbSA9IHRoaXMuc2h1ZmZsZWRbdGhpcy5pXTtcbiAgICAgICAgdGhpcy5zaHVmZmxlZFt0aGlzLmldID0gdGhpcy5zaHVmZmxlZFswXTtcbiAgICAgICAgdGhpcy5zaHVmZmxlZFswXSA9IGl0ZW07XG5cbiAgICAgICAgLy8gU29ydCBgdGhpcy5zaHVmZmxlZGAgZnJvbSBpbmRleCAxIGFuZCB1cC5cbiAgICAgICAgdGhpcy5fcyh0aGlzLnNodWZmbGVkLCAxKTtcblxuICAgICAgICAvLyBTZXQgYHRoaXMuaWAgdG8gcG9pbnQgdG8gdGhlIGZpcnN0IGl0ZW0gaW4gYHRoaXMuc2h1ZmZsZWRgLlxuICAgICAgICB0aGlzLmkgPSAwO1xuICAgICAgfSBlbHNlIHtcblxuICAgICAgICAvLyBIZXJlIHdlIGFyZSBuZWl0aGVyIHNodWZmbGluZyBub3IgcGxheWluZy4gU28ganVzdCBtYWtlIGEgc2hhbGxvdyBjb3B5XG4gICAgICAgIC8vIG9mIGB0aGlzLml0ZW1zYCwgYW5kIHNodWZmbGUgaXQuXG4gICAgICAgIHRoaXMuX3IoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBGaXJlIHRoZSBzdGF0ZSBjaGFuZ2UgY2FsbGJhY2suXG4gICAgdGhpcy5zYygnc2h1ZmZsZScpO1xuICB9O1xuXG4gIC8vXG4gIC8vIERlY3JlbWVudCBgdGhpcy5pYCBpZiBwbGF5aW5nLCB3cmFwcGluZyB0byB0aGUgZW5kIG9mIHRoZSBwbGF5bGlzdCBpZlxuICAvLyByZXBlYXRpbmcuIEVsc2Ugc3RvcHMuXG4gIC8vXG4gIGoucHJldmlvdXMgPSBmdW5jdGlvbigpIHtcblxuICAgIC8vIERvIG5vdGhpbmcgaWYgd2UgYXJlIG5vdCBwbGF5aW5nLCBvciBpZiB0aGUgcGxheWxpc3QgaXMgZW1wdHkuXG4gICAgdmFyIGxlbiA9IHRoaXMuaXRlbXMubGVuZ3RoO1xuICAgIGlmICghdGhpcy5pc01vdW50ZWQoKSB8fCAhbGVuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0aGlzLmkgPiAwKSB7XG5cbiAgICAgIC8vIEEgcHJldmlvdXMgaXRlbSBleGlzdHMsIHNvIGp1c3QgZGVjcmVtZW50IGB0aGlzLmlgLlxuICAgICAgdGhpcy5pLS07XG4gICAgICB0aGlzLl9wKCk7XG4gICAgfSBlbHNlIHtcblxuICAgICAgLy8gV2UgYXJlIGN1cnJlbnRseSBhdCB0aGUgZmlyc3QgaXRlbS4gU3RvcCBpZiBub3QgcmVwZWF0aW5nLlxuICAgICAgaWYgKCF0aGlzLmlzUmVwZWF0aW5nKCkpIHtcbiAgICAgICAgdGhpcy5zdG9wKCk7XG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIC8vIElmIHNodWZmbGluZywgZ2VuZXJhdGUgYSBuZXcgc2h1ZmZsZS5cbiAgICAgICAgaWYgKHRoaXMuaXNTaHVmZmxpbmcoKSkge1xuICAgICAgICAgIHZhciBjdXJyZW50SXRlbSA9IHRoaXMuZ2V0Q3VycmVudCgpO1xuICAgICAgICAgIHRoaXMuX3IoKTtcblxuICAgICAgICAgIC8vIElmIHRoZSBjdXJyZW50bHktcGxheWluZyBpdGVtIHdhcyBwbGFjZWQgYXQgaW5kZXggYGxlbi0xYCwgd2UgbmVlZCB0b1xuICAgICAgICAgIC8vIHN3YXAgaXQgd2l0aCBhIHJhbmRvbSBpdGVtIHRha2VuIGZyb20gdGhlIHJlc3Qgb2YgYHRoaXMuaXRlbXNgLiAoVGhpc1xuICAgICAgICAgIC8vIGlzIGJlY2F1c2UgYHRoaXMuaWAgd2lsbCBiZSBzZXQgdG8gYGxlbi0xYCwgYW5kIHRoZSBwcmV2aW91cyBpdGVtIG11c3RcbiAgICAgICAgICAvLyBiZSBkaWZmZXJlbnQgZnJvbSB0aGUgY3VycmVudGx5LXBsYXlpbmcgaXRlbSEpXG4gICAgICAgICAgaWYgKGxlbiA+IDEgJiYgdGhpcy5zaHVmZmxlZFtsZW4tMV0gPT09IGN1cnJlbnRJdGVtKSB7XG4gICAgICAgICAgICB2YXIgc3dhcEluZGV4ID0gcmFuZCgwLCB0aGlzLml0ZW1zLmxlbmd0aC0yKTtcbiAgICAgICAgICAgIHN3YXAodGhpcy5zaHVmZmxlZCwgbGVuLTEsIHN3YXBJbmRleCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2luY2Ugd2UncmUgcmVwZWF0aW5nLCB3cmFwYXJvdW5kIHRvIHRoZSBsYXN0IGVsZW1lbnQuXG4gICAgICAgIHRoaXMuaSA9IGxlbiAtIDE7XG4gICAgICAgIHRoaXMuX3AoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgLy9cbiAgLy8gSW5jcmVtZW50IGB0aGlzLmlgIGlmIHBsYXlpbmcsIHdyYXBwaW5nIHRvIHRoZSBlbmQgb2YgdGhlIHBsYXlsaXN0IGlmXG4gIC8vIHJlcGVhdGluZy4gRWxzZSBzdG9wcy5cbiAgLy9cbiAgai5uZXh0ID0gZnVuY3Rpb24oKSB7XG5cbiAgICAvLyBEbyBub3RoaW5nIGlmIHdlIGFyZSBub3QgcGxheWluZywgb3IgaWYgdGhlIHBsYXlsaXN0IGlzIGVtcHR5LlxuICAgIHZhciBsZW4gPSB0aGlzLml0ZW1zLmxlbmd0aDtcbiAgICBpZiAoIXRoaXMuaXNNb3VudGVkKCkgfHwgIWxlbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodGhpcy5pIDwgbGVuIC0gMSkge1xuXG4gICAgICAvLyBBIG5leHQgaXRlbSBleGlzdHMsIHNvIGp1c3QgaW5jcmVtZW50IGB0aGlzLmlgLlxuICAgICAgdGhpcy5pKys7XG4gICAgICB0aGlzLl9wKCk7XG4gICAgfSBlbHNlIHtcblxuICAgICAgLy8gV2UgYXJlIGN1cnJlbnRseSBhdCB0aGUgbGFzdCBpdGVtLiBTdG9wIGlmIG5vdCByZXBlYXRpbmcuXG4gICAgICBpZiAoIXRoaXMuaXNSZXBlYXRpbmcoKSkge1xuICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgLy8gSWYgc2h1ZmZsaW5nLCBnZW5lcmF0ZSBhIG5ldyBzaHVmZmxlLlxuICAgICAgICBpZiAodGhpcy5pc1NodWZmbGluZygpKSB7XG4gICAgICAgICAgdmFyIGN1cnJlbnRJdGVtID0gdGhpcy5nZXRDdXJyZW50KCk7XG4gICAgICAgICAgdGhpcy5fcigpO1xuXG4gICAgICAgICAgLy8gSWYgdGhlIGN1cnJlbnRseS1wbGF5aW5nIGl0ZW0gd2FzIHBsYWNlZCBhdCBpbmRleCAwLCB3ZSBuZWVkIHRvIHN3YXBcbiAgICAgICAgICAvLyBpdCB3aXRoIGEgcmFuZG9tIGl0ZW0gdGFrZW4gZnJvbSB0aGUgcmVzdCBvZiBgdGhpcy5pdGVtc2AuIChUaGlzXG4gICAgICAgICAgLy8gaXMgYmVjYXVzZSBgdGhpcy5pYCB3aWxsIGJlIHNldCB0byAwLCBhbmQgdGhlIG5leHQgaXRlbSBtdXN0IGJlXG4gICAgICAgICAgLy8gZGlmZmVyZW50IGZyb20gdGhlIGN1cnJlbnRseS1wbGF5aW5nIGl0ZW0hKVxuICAgICAgICAgIGlmIChsZW4gPiAxICYmIHRoaXMuc2h1ZmZsZWRbMF0gPT09IGN1cnJlbnRJdGVtKSB7XG4gICAgICAgICAgICB2YXIgc3dhcEluZGV4ID0gcmFuZCgxLCB0aGlzLml0ZW1zLmxlbmd0aC0xKTtcbiAgICAgICAgICAgIHN3YXAodGhpcy5zaHVmZmxlZCwgMCwgc3dhcEluZGV4KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTaW5jZSB3ZSdyZSByZXBlYXRpbmcsIHdyYXBhcm91bmQgdG8gdGhlIGZpcnN0IGVsZW1lbnQuXG4gICAgICAgIHRoaXMuaSA9IDA7XG4gICAgICAgIHRoaXMuX3AoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgLy9cbiAgLy8gTW92ZSB0aGUgaXRlbSBhdCBgb2xkSW5kZXhgIGluIGB0aGlzLml0ZW1zYCB0byBgbmV3SW5kZXhgLlxuICAvL1xuICBqLnJlb3JkZXIgPSBmdW5jdGlvbihvbGRJbmRleCwgbmV3SW5kZXgpIHtcblxuICAgIC8vIFRocm93IGZvciBpbnZhbGlkIGBvbGRJbmRleGAgb3IgYG5ld0luZGV4YC5cbiAgICB0aGlzLl9jKG9sZEluZGV4KTtcbiAgICB0aGlzLl9jKG5ld0luZGV4KTtcblxuICAgIC8vIFJlbW92ZSB0aGUgaXRlbSwgYW5kIGluc2VydCBpdCBhdCB0aGUgYG5ld0luZGV4YC5cbiAgICB2YXIgaXRlbSA9IHRoaXMuaXRlbXMuc3BsaWNlKG9sZEluZGV4LCAxKVswXTtcbiAgICB0aGlzLml0ZW1zLnNwbGljZShuZXdJbmRleCwgMCwgaXRlbSk7XG5cbiAgICAvLyBXZSBkbyBub3QgbmVlZCB0byBhZGp1c3QgYHRoaXMuaWAgaWYgd2UgYXJlIHNodWZmbGluZy5cbiAgICBpZiAodGhpcy5pc01vdW50ZWQoKSAmJiAhdGhpcy5pc1NodWZmbGluZygpKSB7XG5cbiAgICAgIC8vIFRoZSBpdGVtIGJlaW5nIG1vdmVkIGlzIHRoZSBjdXJyZW50bHktcGxheWluZyBpdGVtLlxuICAgICAgaWYgKHRoaXMuaSA9PT0gb2xkSW5kZXgpIHtcbiAgICAgICAgdGhpcy5pID0gbmV3SW5kZXg7XG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIC8vIFRoZSBpdGVtIGlzIGJlaW5nIG1vdmVkIGZyb20gYWZ0ZXIgdGhlIGN1cnJlbnRseS1wbGF5aW5nIGl0ZW0gdG9cbiAgICAgICAgLy8gYmVmb3JlIHRoZSBjdXJyZW50bHktcGxheWluZyBpdGVtLlxuICAgICAgICBpZiAob2xkSW5kZXggPD0gdGhpcy5pICYmIG5ld0luZGV4ID49IHRoaXMuaSkge1xuICAgICAgICAgIHRoaXMuaS0tO1xuICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgLy8gVGhlIGl0ZW0gaXMgYmVpbmcgbW92ZWQgZnJvbSBiZWZvcmUgdGhlIGN1cnJlbnRseS1wbGF5aW5nIGl0ZW0gdG9cbiAgICAgICAgICAvLyBhZnRlciB0aGUgY3VycmVudGx5LXBsYXlpbmcgaXRlbS5cbiAgICAgICAgICBpZiAob2xkSW5kZXggPj0gdGhpcy5pICYmIG5ld0luZGV4IDw9IHRoaXMuaSkge1xuICAgICAgICAgICAgdGhpcy5pKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRmlyZSB0aGUgbW9kZWwgY2hhbmdlIGNhbGxiYWNrLlxuICAgIHRoaXMubWMoJ3Jlb3JkZXInLCB0aGlzLml0ZW1zKTtcbiAgfTtcblxuICAvL1xuICAvLyBUaHJvd3MgaWYgYGlgIGlzIGFuIGludmFsaWQgaW5kZXguXG4gIC8vXG4gIGouX2MgPSBmdW5jdGlvbihpLCBsZW4pIHtcbiAgICBpZiAoaSA8IDAgfHwgKGkgPj0gKGxlbiB8fCB0aGlzLml0ZW1zLmxlbmd0aCkpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgaW5kZXg6ICcgKyBpKTtcbiAgICB9XG4gIH07XG5cbiAgLy9cbiAgLy8gUmVzaHVmZmxlIGB0aGlzLnNodWZmbGVkYC5cbiAgLy9cbiAgai5fciA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc2h1ZmZsZWQgPSB0aGlzLml0ZW1zLnNsaWNlKCk7XG4gICAgdGhpcy5fcyh0aGlzLnNodWZmbGVkLCAwKTtcbiAgfTtcblxuICAvL1xuICAvLyBTaHVmZmxlcyBhIHN1YmFycmF5IG9mIGBhcnJgIGluIHBsYWNlLCBmcm9tIHRoZSBzcGVjaWZpZWQgYHN0YXJ0SW5kZXhgIHVwXG4gIC8vIHRvIGBhcnIubGVuZ3RoIC0gMWAuIFNodWZmbGVzIHRoZSBlbnRpcmUgYGFycmAgaWYgbm8gYHN0YXJ0SW5kZXhgIHdhc1xuICAvLyBzcGVjaWZpZWQuIFRoaXMgaXMgYmFzZWQgb24gdGhlIEtudXRoIHNodWZmbGUuXG4gIC8vXG4gIGouX3MgPSBmdW5jdGlvbihhcnIsIHN0YXJ0SW5kZXgpIHtcbiAgICBzdGFydEluZGV4ID0gc3RhcnRJbmRleCB8fCAwO1xuICAgIHZhciBpID0gYXJyLmxlbmd0aCAtIDE7XG4gICAgd2hpbGUgKGkgPiBzdGFydEluZGV4KSB7XG4gICAgICB2YXIgaiA9IE1hdGgubWF4KHN0YXJ0SW5kZXgsIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChpICsgMSkpKTtcbiAgICAgIHN3YXAoYXJyLCBpLCBqKTtcbiAgICAgIGktLTtcbiAgICB9XG4gICAgcmV0dXJuIGFycjtcbiAgfTtcblxuICAvL1xuICAvLyBDb252ZW5pZW5jZSBtZXRob2QgdGhhdCBpcyBjYWxsZWQgd2hlbiBwbGF5aW5nIG9yIHJlc3VtaW5nLlxuICAvL1xuICBqLl9wID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5wYXVzZUZsYWcgPSBmYWxzZTtcbiAgICB0aGlzLnNjKCdwbGF5JywgdGhpcy5nZXRDdXJyZW50KCkpO1xuICB9O1xuXG4gIC8qIGlzdGFuYnVsIGlnbm9yZSBlbHNlICovXG4gIGlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0Jykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gSm9ja2V5O1xuICB9IGVsc2Uge1xuICAgIHJvb3Quam9ja2V5ID0gSm9ja2V5O1xuICB9XG5cbn0pKHRoaXMpO1xuIiwiLypcbiAqICRJZDogYmFzZTY0LmpzLHYgMi4xNSAyMDE0LzA0LzA1IDEyOjU4OjU3IGRhbmtvZ2FpIEV4cCBkYW5rb2dhaSAkXG4gKlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cbiAqICAgIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZVxuICpcbiAqICBSZWZlcmVuY2VzOlxuICogICAgaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9CYXNlNjRcbiAqL1xuXG4oZnVuY3Rpb24oZ2xvYmFsKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuICAgIC8vIGV4aXN0aW5nIHZlcnNpb24gZm9yIG5vQ29uZmxpY3QoKVxuICAgIHZhciBfQmFzZTY0ID0gZ2xvYmFsLkJhc2U2NDtcbiAgICB2YXIgdmVyc2lvbiA9IFwiMi4xLjlcIjtcbiAgICAvLyBpZiBub2RlLmpzLCB3ZSB1c2UgQnVmZmVyXG4gICAgdmFyIGJ1ZmZlcjtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlcjtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7fVxuICAgIH1cbiAgICAvLyBjb25zdGFudHNcbiAgICB2YXIgYjY0Y2hhcnNcbiAgICAgICAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG4gICAgdmFyIGI2NHRhYiA9IGZ1bmN0aW9uKGJpbikge1xuICAgICAgICB2YXIgdCA9IHt9O1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IGJpbi5sZW5ndGg7IGkgPCBsOyBpKyspIHRbYmluLmNoYXJBdChpKV0gPSBpO1xuICAgICAgICByZXR1cm4gdDtcbiAgICB9KGI2NGNoYXJzKTtcbiAgICB2YXIgZnJvbUNoYXJDb2RlID0gU3RyaW5nLmZyb21DaGFyQ29kZTtcbiAgICAvLyBlbmNvZGVyIHN0dWZmXG4gICAgdmFyIGNiX3V0b2IgPSBmdW5jdGlvbihjKSB7XG4gICAgICAgIGlmIChjLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIHZhciBjYyA9IGMuY2hhckNvZGVBdCgwKTtcbiAgICAgICAgICAgIHJldHVybiBjYyA8IDB4ODAgPyBjXG4gICAgICAgICAgICAgICAgOiBjYyA8IDB4ODAwID8gKGZyb21DaGFyQ29kZSgweGMwIHwgKGNjID4+PiA2KSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyBmcm9tQ2hhckNvZGUoMHg4MCB8IChjYyAmIDB4M2YpKSlcbiAgICAgICAgICAgICAgICA6IChmcm9tQ2hhckNvZGUoMHhlMCB8ICgoY2MgPj4+IDEyKSAmIDB4MGYpKVxuICAgICAgICAgICAgICAgICAgICsgZnJvbUNoYXJDb2RlKDB4ODAgfCAoKGNjID4+PiAgNikgJiAweDNmKSlcbiAgICAgICAgICAgICAgICAgICArIGZyb21DaGFyQ29kZSgweDgwIHwgKCBjYyAgICAgICAgICYgMHgzZikpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBjYyA9IDB4MTAwMDBcbiAgICAgICAgICAgICAgICArIChjLmNoYXJDb2RlQXQoMCkgLSAweEQ4MDApICogMHg0MDBcbiAgICAgICAgICAgICAgICArIChjLmNoYXJDb2RlQXQoMSkgLSAweERDMDApO1xuICAgICAgICAgICAgcmV0dXJuIChmcm9tQ2hhckNvZGUoMHhmMCB8ICgoY2MgPj4+IDE4KSAmIDB4MDcpKVxuICAgICAgICAgICAgICAgICAgICArIGZyb21DaGFyQ29kZSgweDgwIHwgKChjYyA+Pj4gMTIpICYgMHgzZikpXG4gICAgICAgICAgICAgICAgICAgICsgZnJvbUNoYXJDb2RlKDB4ODAgfCAoKGNjID4+PiAgNikgJiAweDNmKSlcbiAgICAgICAgICAgICAgICAgICAgKyBmcm9tQ2hhckNvZGUoMHg4MCB8ICggY2MgICAgICAgICAmIDB4M2YpKSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHZhciByZV91dG9iID0gL1tcXHVEODAwLVxcdURCRkZdW1xcdURDMDAtXFx1REZGRkZdfFteXFx4MDAtXFx4N0ZdL2c7XG4gICAgdmFyIHV0b2IgPSBmdW5jdGlvbih1KSB7XG4gICAgICAgIHJldHVybiB1LnJlcGxhY2UocmVfdXRvYiwgY2JfdXRvYik7XG4gICAgfTtcbiAgICB2YXIgY2JfZW5jb2RlID0gZnVuY3Rpb24oY2NjKSB7XG4gICAgICAgIHZhciBwYWRsZW4gPSBbMCwgMiwgMV1bY2NjLmxlbmd0aCAlIDNdLFxuICAgICAgICBvcmQgPSBjY2MuY2hhckNvZGVBdCgwKSA8PCAxNlxuICAgICAgICAgICAgfCAoKGNjYy5sZW5ndGggPiAxID8gY2NjLmNoYXJDb2RlQXQoMSkgOiAwKSA8PCA4KVxuICAgICAgICAgICAgfCAoKGNjYy5sZW5ndGggPiAyID8gY2NjLmNoYXJDb2RlQXQoMikgOiAwKSksXG4gICAgICAgIGNoYXJzID0gW1xuICAgICAgICAgICAgYjY0Y2hhcnMuY2hhckF0KCBvcmQgPj4+IDE4KSxcbiAgICAgICAgICAgIGI2NGNoYXJzLmNoYXJBdCgob3JkID4+PiAxMikgJiA2MyksXG4gICAgICAgICAgICBwYWRsZW4gPj0gMiA/ICc9JyA6IGI2NGNoYXJzLmNoYXJBdCgob3JkID4+PiA2KSAmIDYzKSxcbiAgICAgICAgICAgIHBhZGxlbiA+PSAxID8gJz0nIDogYjY0Y2hhcnMuY2hhckF0KG9yZCAmIDYzKVxuICAgICAgICBdO1xuICAgICAgICByZXR1cm4gY2hhcnMuam9pbignJyk7XG4gICAgfTtcbiAgICB2YXIgYnRvYSA9IGdsb2JhbC5idG9hID8gZnVuY3Rpb24oYikge1xuICAgICAgICByZXR1cm4gZ2xvYmFsLmJ0b2EoYik7XG4gICAgfSA6IGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgcmV0dXJuIGIucmVwbGFjZSgvW1xcc1xcU117MSwzfS9nLCBjYl9lbmNvZGUpO1xuICAgIH07XG4gICAgdmFyIF9lbmNvZGUgPSBidWZmZXIgPyBmdW5jdGlvbiAodSkge1xuICAgICAgICByZXR1cm4gKHUuY29uc3RydWN0b3IgPT09IGJ1ZmZlci5jb25zdHJ1Y3RvciA/IHUgOiBuZXcgYnVmZmVyKHUpKVxuICAgICAgICAudG9TdHJpbmcoJ2Jhc2U2NCcpXG4gICAgfVxuICAgIDogZnVuY3Rpb24gKHUpIHsgcmV0dXJuIGJ0b2EodXRvYih1KSkgfVxuICAgIDtcbiAgICB2YXIgZW5jb2RlID0gZnVuY3Rpb24odSwgdXJpc2FmZSkge1xuICAgICAgICByZXR1cm4gIXVyaXNhZmVcbiAgICAgICAgICAgID8gX2VuY29kZShTdHJpbmcodSkpXG4gICAgICAgICAgICA6IF9lbmNvZGUoU3RyaW5nKHUpKS5yZXBsYWNlKC9bK1xcL10vZywgZnVuY3Rpb24obTApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbTAgPT0gJysnID8gJy0nIDogJ18nO1xuICAgICAgICAgICAgfSkucmVwbGFjZSgvPS9nLCAnJyk7XG4gICAgfTtcbiAgICB2YXIgZW5jb2RlVVJJID0gZnVuY3Rpb24odSkgeyByZXR1cm4gZW5jb2RlKHUsIHRydWUpIH07XG4gICAgLy8gZGVjb2RlciBzdHVmZlxuICAgIHZhciByZV9idG91ID0gbmV3IFJlZ0V4cChbXG4gICAgICAgICdbXFx4QzAtXFx4REZdW1xceDgwLVxceEJGXScsXG4gICAgICAgICdbXFx4RTAtXFx4RUZdW1xceDgwLVxceEJGXXsyfScsXG4gICAgICAgICdbXFx4RjAtXFx4RjddW1xceDgwLVxceEJGXXszfSdcbiAgICBdLmpvaW4oJ3wnKSwgJ2cnKTtcbiAgICB2YXIgY2JfYnRvdSA9IGZ1bmN0aW9uKGNjY2MpIHtcbiAgICAgICAgc3dpdGNoKGNjY2MubGVuZ3RoKSB7XG4gICAgICAgIGNhc2UgNDpcbiAgICAgICAgICAgIHZhciBjcCA9ICgoMHgwNyAmIGNjY2MuY2hhckNvZGVBdCgwKSkgPDwgMTgpXG4gICAgICAgICAgICAgICAgfCAgICAoKDB4M2YgJiBjY2NjLmNoYXJDb2RlQXQoMSkpIDw8IDEyKVxuICAgICAgICAgICAgICAgIHwgICAgKCgweDNmICYgY2NjYy5jaGFyQ29kZUF0KDIpKSA8PCAgNilcbiAgICAgICAgICAgICAgICB8ICAgICAoMHgzZiAmIGNjY2MuY2hhckNvZGVBdCgzKSksXG4gICAgICAgICAgICBvZmZzZXQgPSBjcCAtIDB4MTAwMDA7XG4gICAgICAgICAgICByZXR1cm4gKGZyb21DaGFyQ29kZSgob2Zmc2V0ICA+Pj4gMTApICsgMHhEODAwKVxuICAgICAgICAgICAgICAgICAgICArIGZyb21DaGFyQ29kZSgob2Zmc2V0ICYgMHgzRkYpICsgMHhEQzAwKSk7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgIHJldHVybiBmcm9tQ2hhckNvZGUoXG4gICAgICAgICAgICAgICAgKCgweDBmICYgY2NjYy5jaGFyQ29kZUF0KDApKSA8PCAxMilcbiAgICAgICAgICAgICAgICAgICAgfCAoKDB4M2YgJiBjY2NjLmNoYXJDb2RlQXQoMSkpIDw8IDYpXG4gICAgICAgICAgICAgICAgICAgIHwgICgweDNmICYgY2NjYy5jaGFyQ29kZUF0KDIpKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiAgZnJvbUNoYXJDb2RlKFxuICAgICAgICAgICAgICAgICgoMHgxZiAmIGNjY2MuY2hhckNvZGVBdCgwKSkgPDwgNilcbiAgICAgICAgICAgICAgICAgICAgfCAgKDB4M2YgJiBjY2NjLmNoYXJDb2RlQXQoMSkpXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgfTtcbiAgICB2YXIgYnRvdSA9IGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgcmV0dXJuIGIucmVwbGFjZShyZV9idG91LCBjYl9idG91KTtcbiAgICB9O1xuICAgIHZhciBjYl9kZWNvZGUgPSBmdW5jdGlvbihjY2NjKSB7XG4gICAgICAgIHZhciBsZW4gPSBjY2NjLmxlbmd0aCxcbiAgICAgICAgcGFkbGVuID0gbGVuICUgNCxcbiAgICAgICAgbiA9IChsZW4gPiAwID8gYjY0dGFiW2NjY2MuY2hhckF0KDApXSA8PCAxOCA6IDApXG4gICAgICAgICAgICB8IChsZW4gPiAxID8gYjY0dGFiW2NjY2MuY2hhckF0KDEpXSA8PCAxMiA6IDApXG4gICAgICAgICAgICB8IChsZW4gPiAyID8gYjY0dGFiW2NjY2MuY2hhckF0KDIpXSA8PCAgNiA6IDApXG4gICAgICAgICAgICB8IChsZW4gPiAzID8gYjY0dGFiW2NjY2MuY2hhckF0KDMpXSAgICAgICA6IDApLFxuICAgICAgICBjaGFycyA9IFtcbiAgICAgICAgICAgIGZyb21DaGFyQ29kZSggbiA+Pj4gMTYpLFxuICAgICAgICAgICAgZnJvbUNoYXJDb2RlKChuID4+PiAgOCkgJiAweGZmKSxcbiAgICAgICAgICAgIGZyb21DaGFyQ29kZSggbiAgICAgICAgICYgMHhmZilcbiAgICAgICAgXTtcbiAgICAgICAgY2hhcnMubGVuZ3RoIC09IFswLCAwLCAyLCAxXVtwYWRsZW5dO1xuICAgICAgICByZXR1cm4gY2hhcnMuam9pbignJyk7XG4gICAgfTtcbiAgICB2YXIgYXRvYiA9IGdsb2JhbC5hdG9iID8gZnVuY3Rpb24oYSkge1xuICAgICAgICByZXR1cm4gZ2xvYmFsLmF0b2IoYSk7XG4gICAgfSA6IGZ1bmN0aW9uKGEpe1xuICAgICAgICByZXR1cm4gYS5yZXBsYWNlKC9bXFxzXFxTXXsxLDR9L2csIGNiX2RlY29kZSk7XG4gICAgfTtcbiAgICB2YXIgX2RlY29kZSA9IGJ1ZmZlciA/IGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgcmV0dXJuIChhLmNvbnN0cnVjdG9yID09PSBidWZmZXIuY29uc3RydWN0b3JcbiAgICAgICAgICAgICAgICA/IGEgOiBuZXcgYnVmZmVyKGEsICdiYXNlNjQnKSkudG9TdHJpbmcoKTtcbiAgICB9XG4gICAgOiBmdW5jdGlvbihhKSB7IHJldHVybiBidG91KGF0b2IoYSkpIH07XG4gICAgdmFyIGRlY29kZSA9IGZ1bmN0aW9uKGEpe1xuICAgICAgICByZXR1cm4gX2RlY29kZShcbiAgICAgICAgICAgIFN0cmluZyhhKS5yZXBsYWNlKC9bLV9dL2csIGZ1bmN0aW9uKG0wKSB7IHJldHVybiBtMCA9PSAnLScgPyAnKycgOiAnLycgfSlcbiAgICAgICAgICAgICAgICAucmVwbGFjZSgvW15BLVphLXowLTlcXCtcXC9dL2csICcnKVxuICAgICAgICApO1xuICAgIH07XG4gICAgdmFyIG5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIEJhc2U2NCA9IGdsb2JhbC5CYXNlNjQ7XG4gICAgICAgIGdsb2JhbC5CYXNlNjQgPSBfQmFzZTY0O1xuICAgICAgICByZXR1cm4gQmFzZTY0O1xuICAgIH07XG4gICAgLy8gZXhwb3J0IEJhc2U2NFxuICAgIGdsb2JhbC5CYXNlNjQgPSB7XG4gICAgICAgIFZFUlNJT046IHZlcnNpb24sXG4gICAgICAgIGF0b2I6IGF0b2IsXG4gICAgICAgIGJ0b2E6IGJ0b2EsXG4gICAgICAgIGZyb21CYXNlNjQ6IGRlY29kZSxcbiAgICAgICAgdG9CYXNlNjQ6IGVuY29kZSxcbiAgICAgICAgdXRvYjogdXRvYixcbiAgICAgICAgZW5jb2RlOiBlbmNvZGUsXG4gICAgICAgIGVuY29kZVVSSTogZW5jb2RlVVJJLFxuICAgICAgICBidG91OiBidG91LFxuICAgICAgICBkZWNvZGU6IGRlY29kZSxcbiAgICAgICAgbm9Db25mbGljdDogbm9Db25mbGljdFxuICAgIH07XG4gICAgLy8gaWYgRVM1IGlzIGF2YWlsYWJsZSwgbWFrZSBCYXNlNjQuZXh0ZW5kU3RyaW5nKCkgYXZhaWxhYmxlXG4gICAgaWYgKHR5cGVvZiBPYmplY3QuZGVmaW5lUHJvcGVydHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdmFyIG5vRW51bSA9IGZ1bmN0aW9uKHYpe1xuICAgICAgICAgICAgcmV0dXJuIHt2YWx1ZTp2LGVudW1lcmFibGU6ZmFsc2Usd3JpdGFibGU6dHJ1ZSxjb25maWd1cmFibGU6dHJ1ZX07XG4gICAgICAgIH07XG4gICAgICAgIGdsb2JhbC5CYXNlNjQuZXh0ZW5kU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFxuICAgICAgICAgICAgICAgIFN0cmluZy5wcm90b3R5cGUsICdmcm9tQmFzZTY0Jywgbm9FbnVtKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRlY29kZSh0aGlzKVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShcbiAgICAgICAgICAgICAgICBTdHJpbmcucHJvdG90eXBlLCAndG9CYXNlNjQnLCBub0VudW0oZnVuY3Rpb24gKHVyaXNhZmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVuY29kZSh0aGlzLCB1cmlzYWZlKVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShcbiAgICAgICAgICAgICAgICBTdHJpbmcucHJvdG90eXBlLCAndG9CYXNlNjRVUkknLCBub0VudW0oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZW5jb2RlKHRoaXMsIHRydWUpXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICAvLyB0aGF0J3MgaXQhXG4gICAgaWYgKGdsb2JhbFsnTWV0ZW9yJ10pIHtcbiAgICAgICBCYXNlNjQgPSBnbG9iYWwuQmFzZTY0OyAvLyBmb3Igbm9ybWFsIGV4cG9ydCBpbiBNZXRlb3IuanNcbiAgICB9XG59KSh0aGlzKTtcbiIsIi8qKiFcbiAqIFNvcnRhYmxlXG4gKiBAYXV0aG9yXHRSdWJhWGEgICA8dHJhc2hAcnViYXhhLm9yZz5cbiAqIEBsaWNlbnNlIE1JVFxuICovXG5cbihmdW5jdGlvbiBzb3J0YWJsZU1vZHVsZShmYWN0b3J5KSB7XG5cdFwidXNlIHN0cmljdFwiO1xuXG5cdGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuXHRcdGRlZmluZShmYWN0b3J5KTtcblx0fVxuXHRlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzICE9IFwidW5kZWZpbmVkXCIpIHtcblx0XHRtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcblx0fVxuXHRlbHNlIGlmICh0eXBlb2YgUGFja2FnZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuXHRcdC8vbm9pbnNwZWN0aW9uIEpTVW5yZXNvbHZlZFZhcmlhYmxlXG5cdFx0U29ydGFibGUgPSBmYWN0b3J5KCk7ICAvLyBleHBvcnQgZm9yIE1ldGVvci5qc1xuXHR9XG5cdGVsc2Uge1xuXHRcdC8qIGpzaGludCBzdWI6dHJ1ZSAqL1xuXHRcdHdpbmRvd1tcIlNvcnRhYmxlXCJdID0gZmFjdG9yeSgpO1xuXHR9XG59KShmdW5jdGlvbiBzb3J0YWJsZUZhY3RvcnkoKSB7XG5cdFwidXNlIHN0cmljdFwiO1xuXG5cdGlmICh0eXBlb2Ygd2luZG93ID09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5kb2N1bWVudCkge1xuXHRcdHJldHVybiBmdW5jdGlvbiBzb3J0YWJsZUVycm9yKCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiU29ydGFibGUuanMgcmVxdWlyZXMgYSB3aW5kb3cgd2l0aCBhIGRvY3VtZW50XCIpO1xuXHRcdH07XG5cdH1cblxuXHR2YXIgZHJhZ0VsLFxuXHRcdHBhcmVudEVsLFxuXHRcdGdob3N0RWwsXG5cdFx0Y2xvbmVFbCxcblx0XHRyb290RWwsXG5cdFx0bmV4dEVsLFxuXG5cdFx0c2Nyb2xsRWwsXG5cdFx0c2Nyb2xsUGFyZW50RWwsXG5cdFx0c2Nyb2xsQ3VzdG9tRm4sXG5cblx0XHRsYXN0RWwsXG5cdFx0bGFzdENTUyxcblx0XHRsYXN0UGFyZW50Q1NTLFxuXG5cdFx0b2xkSW5kZXgsXG5cdFx0bmV3SW5kZXgsXG5cblx0XHRhY3RpdmVHcm91cCxcblx0XHRwdXRTb3J0YWJsZSxcblxuXHRcdGF1dG9TY3JvbGwgPSB7fSxcblxuXHRcdHRhcEV2dCxcblx0XHR0b3VjaEV2dCxcblxuXHRcdG1vdmVkLFxuXG5cdFx0LyoqIEBjb25zdCAqL1xuXHRcdFJTUEFDRSA9IC9cXHMrL2csXG5cblx0XHRleHBhbmRvID0gJ1NvcnRhYmxlJyArIChuZXcgRGF0ZSkuZ2V0VGltZSgpLFxuXG5cdFx0d2luID0gd2luZG93LFxuXHRcdGRvY3VtZW50ID0gd2luLmRvY3VtZW50LFxuXHRcdHBhcnNlSW50ID0gd2luLnBhcnNlSW50LFxuXG5cdFx0JCA9IHdpbi5qUXVlcnkgfHwgd2luLlplcHRvLFxuXHRcdFBvbHltZXIgPSB3aW4uUG9seW1lcixcblxuXHRcdHN1cHBvcnREcmFnZ2FibGUgPSAhISgnZHJhZ2dhYmxlJyBpbiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSksXG5cdFx0c3VwcG9ydENzc1BvaW50ZXJFdmVudHMgPSAoZnVuY3Rpb24gKGVsKSB7XG5cdFx0XHQvLyBmYWxzZSB3aGVuIElFMTFcblx0XHRcdGlmICghIW5hdmlnYXRvci51c2VyQWdlbnQubWF0Y2goL1RyaWRlbnQuKnJ2WyA6XT8xMVxcLi8pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgneCcpO1xuXHRcdFx0ZWwuc3R5bGUuY3NzVGV4dCA9ICdwb2ludGVyLWV2ZW50czphdXRvJztcblx0XHRcdHJldHVybiBlbC5zdHlsZS5wb2ludGVyRXZlbnRzID09PSAnYXV0byc7XG5cdFx0fSkoKSxcblxuXHRcdF9zaWxlbnQgPSBmYWxzZSxcblxuXHRcdGFicyA9IE1hdGguYWJzLFxuXHRcdG1pbiA9IE1hdGgubWluLFxuXHRcdHNsaWNlID0gW10uc2xpY2UsXG5cblx0XHR0b3VjaERyYWdPdmVyTGlzdGVuZXJzID0gW10sXG5cblx0XHRfYXV0b1Njcm9sbCA9IF90aHJvdHRsZShmdW5jdGlvbiAoLyoqRXZlbnQqL2V2dCwgLyoqT2JqZWN0Ki9vcHRpb25zLCAvKipIVE1MRWxlbWVudCovcm9vdEVsKSB7XG5cdFx0XHQvLyBCdWc6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTUwNTUyMVxuXHRcdFx0aWYgKHJvb3RFbCAmJiBvcHRpb25zLnNjcm9sbCkge1xuXHRcdFx0XHR2YXIgZWwsXG5cdFx0XHRcdFx0cmVjdCxcblx0XHRcdFx0XHRzZW5zID0gb3B0aW9ucy5zY3JvbGxTZW5zaXRpdml0eSxcblx0XHRcdFx0XHRzcGVlZCA9IG9wdGlvbnMuc2Nyb2xsU3BlZWQsXG5cblx0XHRcdFx0XHR4ID0gZXZ0LmNsaWVudFgsXG5cdFx0XHRcdFx0eSA9IGV2dC5jbGllbnRZLFxuXG5cdFx0XHRcdFx0d2luV2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCxcblx0XHRcdFx0XHR3aW5IZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQsXG5cblx0XHRcdFx0XHR2eCxcblx0XHRcdFx0XHR2eSxcblxuXHRcdFx0XHRcdHNjcm9sbE9mZnNldFgsXG5cdFx0XHRcdFx0c2Nyb2xsT2Zmc2V0WVxuXHRcdFx0XHQ7XG5cblx0XHRcdFx0Ly8gRGVsZWN0IHNjcm9sbEVsXG5cdFx0XHRcdGlmIChzY3JvbGxQYXJlbnRFbCAhPT0gcm9vdEVsKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRWwgPSBvcHRpb25zLnNjcm9sbDtcblx0XHRcdFx0XHRzY3JvbGxQYXJlbnRFbCA9IHJvb3RFbDtcblx0XHRcdFx0XHRzY3JvbGxDdXN0b21GbiA9IG9wdGlvbnMuc2Nyb2xsRm47XG5cblx0XHRcdFx0XHRpZiAoc2Nyb2xsRWwgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdHNjcm9sbEVsID0gcm9vdEVsO1xuXG5cdFx0XHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0XHRcdGlmICgoc2Nyb2xsRWwub2Zmc2V0V2lkdGggPCBzY3JvbGxFbC5zY3JvbGxXaWR0aCkgfHxcblx0XHRcdFx0XHRcdFx0XHQoc2Nyb2xsRWwub2Zmc2V0SGVpZ2h0IDwgc2Nyb2xsRWwuc2Nyb2xsSGVpZ2h0KVxuXHRcdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHQvKiBqc2hpbnQgYm9zczp0cnVlICovXG5cdFx0XHRcdFx0XHR9IHdoaWxlIChzY3JvbGxFbCA9IHNjcm9sbEVsLnBhcmVudE5vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzY3JvbGxFbCkge1xuXHRcdFx0XHRcdGVsID0gc2Nyb2xsRWw7XG5cdFx0XHRcdFx0cmVjdCA9IHNjcm9sbEVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRcdHZ4ID0gKGFicyhyZWN0LnJpZ2h0IC0geCkgPD0gc2VucykgLSAoYWJzKHJlY3QubGVmdCAtIHgpIDw9IHNlbnMpO1xuXHRcdFx0XHRcdHZ5ID0gKGFicyhyZWN0LmJvdHRvbSAtIHkpIDw9IHNlbnMpIC0gKGFicyhyZWN0LnRvcCAtIHkpIDw9IHNlbnMpO1xuXHRcdFx0XHR9XG5cblxuXHRcdFx0XHRpZiAoISh2eCB8fCB2eSkpIHtcblx0XHRcdFx0XHR2eCA9ICh3aW5XaWR0aCAtIHggPD0gc2VucykgLSAoeCA8PSBzZW5zKTtcblx0XHRcdFx0XHR2eSA9ICh3aW5IZWlnaHQgLSB5IDw9IHNlbnMpIC0gKHkgPD0gc2Vucyk7XG5cblx0XHRcdFx0XHQvKiBqc2hpbnQgZXhwcjp0cnVlICovXG5cdFx0XHRcdFx0KHZ4IHx8IHZ5KSAmJiAoZWwgPSB3aW4pO1xuXHRcdFx0XHR9XG5cblxuXHRcdFx0XHRpZiAoYXV0b1Njcm9sbC52eCAhPT0gdnggfHwgYXV0b1Njcm9sbC52eSAhPT0gdnkgfHwgYXV0b1Njcm9sbC5lbCAhPT0gZWwpIHtcblx0XHRcdFx0XHRhdXRvU2Nyb2xsLmVsID0gZWw7XG5cdFx0XHRcdFx0YXV0b1Njcm9sbC52eCA9IHZ4O1xuXHRcdFx0XHRcdGF1dG9TY3JvbGwudnkgPSB2eTtcblxuXHRcdFx0XHRcdGNsZWFySW50ZXJ2YWwoYXV0b1Njcm9sbC5waWQpO1xuXG5cdFx0XHRcdFx0aWYgKGVsKSB7XG5cdFx0XHRcdFx0XHRhdXRvU2Nyb2xsLnBpZCA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHRcdFx0c2Nyb2xsT2Zmc2V0WSA9IHZ5ID8gdnkgKiBzcGVlZCA6IDA7XG5cdFx0XHRcdFx0XHRcdHNjcm9sbE9mZnNldFggPSB2eCA/IHZ4ICogc3BlZWQgOiAwO1xuXG5cdFx0XHRcdFx0XHRcdGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2Yoc2Nyb2xsQ3VzdG9tRm4pKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHNjcm9sbEN1c3RvbUZuLmNhbGwoX3RoaXMsIHNjcm9sbE9mZnNldFgsIHNjcm9sbE9mZnNldFksIGV2dCk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAoZWwgPT09IHdpbikge1xuXHRcdFx0XHRcdFx0XHRcdHdpbi5zY3JvbGxUbyh3aW4ucGFnZVhPZmZzZXQgKyBzY3JvbGxPZmZzZXRYLCB3aW4ucGFnZVlPZmZzZXQgKyBzY3JvbGxPZmZzZXRZKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRlbC5zY3JvbGxUb3AgKz0gc2Nyb2xsT2Zmc2V0WTtcblx0XHRcdFx0XHRcdFx0XHRlbC5zY3JvbGxMZWZ0ICs9IHNjcm9sbE9mZnNldFg7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sIDI0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCAzMCksXG5cblx0XHRfcHJlcGFyZUdyb3VwID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcblx0XHRcdGZ1bmN0aW9uIHRvRm4odmFsdWUsIHB1bGwpIHtcblx0XHRcdFx0aWYgKHZhbHVlID09PSB2b2lkIDAgfHwgdmFsdWUgPT09IHRydWUpIHtcblx0XHRcdFx0XHR2YWx1ZSA9IGdyb3VwLm5hbWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBmdW5jdGlvbiAodG8sIGZyb20pIHtcblx0XHRcdFx0XHRcdHZhciBmcm9tR3JvdXAgPSBmcm9tLm9wdGlvbnMuZ3JvdXAubmFtZTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIHB1bGxcblx0XHRcdFx0XHRcdFx0PyB2YWx1ZVxuXHRcdFx0XHRcdFx0XHQ6IHZhbHVlICYmICh2YWx1ZS5qb2luXG5cdFx0XHRcdFx0XHRcdFx0PyB2YWx1ZS5pbmRleE9mKGZyb21Hcm91cCkgPiAtMVxuXHRcdFx0XHRcdFx0XHRcdDogKGZyb21Hcm91cCA9PSB2YWx1ZSlcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHZhciBncm91cCA9IHt9O1xuXHRcdFx0dmFyIG9yaWdpbmFsR3JvdXAgPSBvcHRpb25zLmdyb3VwO1xuXG5cdFx0XHRpZiAoIW9yaWdpbmFsR3JvdXAgfHwgdHlwZW9mIG9yaWdpbmFsR3JvdXAgIT0gJ29iamVjdCcpIHtcblx0XHRcdFx0b3JpZ2luYWxHcm91cCA9IHtuYW1lOiBvcmlnaW5hbEdyb3VwfTtcblx0XHRcdH1cblxuXHRcdFx0Z3JvdXAubmFtZSA9IG9yaWdpbmFsR3JvdXAubmFtZTtcblx0XHRcdGdyb3VwLmNoZWNrUHVsbCA9IHRvRm4ob3JpZ2luYWxHcm91cC5wdWxsLCB0cnVlKTtcblx0XHRcdGdyb3VwLmNoZWNrUHV0ID0gdG9GbihvcmlnaW5hbEdyb3VwLnB1dCk7XG5cblx0XHRcdG9wdGlvbnMuZ3JvdXAgPSBncm91cDtcblx0XHR9XG5cdDtcblxuXG5cblx0LyoqXG5cdCAqIEBjbGFzcyAgU29ydGFibGVcblx0ICogQHBhcmFtICB7SFRNTEVsZW1lbnR9ICBlbFxuXHQgKiBAcGFyYW0gIHtPYmplY3R9ICAgICAgIFtvcHRpb25zXVxuXHQgKi9cblx0ZnVuY3Rpb24gU29ydGFibGUoZWwsIG9wdGlvbnMpIHtcblx0XHRpZiAoIShlbCAmJiBlbC5ub2RlVHlwZSAmJiBlbC5ub2RlVHlwZSA9PT0gMSkpIHtcblx0XHRcdHRocm93ICdTb3J0YWJsZTogYGVsYCBtdXN0IGJlIEhUTUxFbGVtZW50LCBhbmQgbm90ICcgKyB7fS50b1N0cmluZy5jYWxsKGVsKTtcblx0XHR9XG5cblx0XHR0aGlzLmVsID0gZWw7IC8vIHJvb3QgZWxlbWVudFxuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgPSBfZXh0ZW5kKHt9LCBvcHRpb25zKTtcblxuXG5cdFx0Ly8gRXhwb3J0IGluc3RhbmNlXG5cdFx0ZWxbZXhwYW5kb10gPSB0aGlzO1xuXG5cblx0XHQvLyBEZWZhdWx0IG9wdGlvbnNcblx0XHR2YXIgZGVmYXVsdHMgPSB7XG5cdFx0XHRncm91cDogTWF0aC5yYW5kb20oKSxcblx0XHRcdHNvcnQ6IHRydWUsXG5cdFx0XHRkaXNhYmxlZDogZmFsc2UsXG5cdFx0XHRzdG9yZTogbnVsbCxcblx0XHRcdGhhbmRsZTogbnVsbCxcblx0XHRcdHNjcm9sbDogdHJ1ZSxcblx0XHRcdHNjcm9sbFNlbnNpdGl2aXR5OiAzMCxcblx0XHRcdHNjcm9sbFNwZWVkOiAxMCxcblx0XHRcdGRyYWdnYWJsZTogL1t1b11sL2kudGVzdChlbC5ub2RlTmFtZSkgPyAnbGknIDogJz4qJyxcblx0XHRcdGdob3N0Q2xhc3M6ICdzb3J0YWJsZS1naG9zdCcsXG5cdFx0XHRjaG9zZW5DbGFzczogJ3NvcnRhYmxlLWNob3NlbicsXG5cdFx0XHRkcmFnQ2xhc3M6ICdzb3J0YWJsZS1kcmFnJyxcblx0XHRcdGlnbm9yZTogJ2EsIGltZycsXG5cdFx0XHRmaWx0ZXI6IG51bGwsXG5cdFx0XHRhbmltYXRpb246IDAsXG5cdFx0XHRzZXREYXRhOiBmdW5jdGlvbiAoZGF0YVRyYW5zZmVyLCBkcmFnRWwpIHtcblx0XHRcdFx0ZGF0YVRyYW5zZmVyLnNldERhdGEoJ1RleHQnLCBkcmFnRWwudGV4dENvbnRlbnQpO1xuXHRcdFx0fSxcblx0XHRcdGRyb3BCdWJibGU6IGZhbHNlLFxuXHRcdFx0ZHJhZ292ZXJCdWJibGU6IGZhbHNlLFxuXHRcdFx0ZGF0YUlkQXR0cjogJ2RhdGEtaWQnLFxuXHRcdFx0ZGVsYXk6IDAsXG5cdFx0XHRmb3JjZUZhbGxiYWNrOiBmYWxzZSxcblx0XHRcdGZhbGxiYWNrQ2xhc3M6ICdzb3J0YWJsZS1mYWxsYmFjaycsXG5cdFx0XHRmYWxsYmFja09uQm9keTogZmFsc2UsXG5cdFx0XHRmYWxsYmFja1RvbGVyYW5jZTogMCxcblx0XHRcdGZhbGxiYWNrT2Zmc2V0OiB7eDogMCwgeTogMH1cblx0XHR9O1xuXG5cblx0XHQvLyBTZXQgZGVmYXVsdCBvcHRpb25zXG5cdFx0Zm9yICh2YXIgbmFtZSBpbiBkZWZhdWx0cykge1xuXHRcdFx0IShuYW1lIGluIG9wdGlvbnMpICYmIChvcHRpb25zW25hbWVdID0gZGVmYXVsdHNbbmFtZV0pO1xuXHRcdH1cblxuXHRcdF9wcmVwYXJlR3JvdXAob3B0aW9ucyk7XG5cblx0XHQvLyBCaW5kIGFsbCBwcml2YXRlIG1ldGhvZHNcblx0XHRmb3IgKHZhciBmbiBpbiB0aGlzKSB7XG5cdFx0XHRpZiAoZm4uY2hhckF0KDApID09PSAnXycgJiYgdHlwZW9mIHRoaXNbZm5dID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHRoaXNbZm5dID0gdGhpc1tmbl0uYmluZCh0aGlzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXR1cCBkcmFnIG1vZGVcblx0XHR0aGlzLm5hdGl2ZURyYWdnYWJsZSA9IG9wdGlvbnMuZm9yY2VGYWxsYmFjayA/IGZhbHNlIDogc3VwcG9ydERyYWdnYWJsZTtcblxuXHRcdC8vIEJpbmQgZXZlbnRzXG5cdFx0X29uKGVsLCAnbW91c2Vkb3duJywgdGhpcy5fb25UYXBTdGFydCk7XG5cdFx0X29uKGVsLCAndG91Y2hzdGFydCcsIHRoaXMuX29uVGFwU3RhcnQpO1xuXHRcdF9vbihlbCwgJ3BvaW50ZXJkb3duJywgdGhpcy5fb25UYXBTdGFydCk7XG5cblx0XHRpZiAodGhpcy5uYXRpdmVEcmFnZ2FibGUpIHtcblx0XHRcdF9vbihlbCwgJ2RyYWdvdmVyJywgdGhpcyk7XG5cdFx0XHRfb24oZWwsICdkcmFnZW50ZXInLCB0aGlzKTtcblx0XHR9XG5cblx0XHR0b3VjaERyYWdPdmVyTGlzdGVuZXJzLnB1c2godGhpcy5fb25EcmFnT3Zlcik7XG5cblx0XHQvLyBSZXN0b3JlIHNvcnRpbmdcblx0XHRvcHRpb25zLnN0b3JlICYmIHRoaXMuc29ydChvcHRpb25zLnN0b3JlLmdldCh0aGlzKSk7XG5cdH1cblxuXG5cdFNvcnRhYmxlLnByb3RvdHlwZSA9IC8qKiBAbGVuZHMgU29ydGFibGUucHJvdG90eXBlICovIHtcblx0XHRjb25zdHJ1Y3RvcjogU29ydGFibGUsXG5cblx0XHRfb25UYXBTdGFydDogZnVuY3Rpb24gKC8qKiBFdmVudHxUb3VjaEV2ZW50ICovZXZ0KSB7XG5cdFx0XHR2YXIgX3RoaXMgPSB0aGlzLFxuXHRcdFx0XHRlbCA9IHRoaXMuZWwsXG5cdFx0XHRcdG9wdGlvbnMgPSB0aGlzLm9wdGlvbnMsXG5cdFx0XHRcdHR5cGUgPSBldnQudHlwZSxcblx0XHRcdFx0dG91Y2ggPSBldnQudG91Y2hlcyAmJiBldnQudG91Y2hlc1swXSxcblx0XHRcdFx0dGFyZ2V0ID0gKHRvdWNoIHx8IGV2dCkudGFyZ2V0LFxuXHRcdFx0XHRvcmlnaW5hbFRhcmdldCA9IGV2dC50YXJnZXQuc2hhZG93Um9vdCAmJiBldnQucGF0aFswXSB8fCB0YXJnZXQsXG5cdFx0XHRcdGZpbHRlciA9IG9wdGlvbnMuZmlsdGVyLFxuXHRcdFx0XHRzdGFydEluZGV4O1xuXG5cdFx0XHQvLyBEb24ndCB0cmlnZ2VyIHN0YXJ0IGV2ZW50IHdoZW4gYW4gZWxlbWVudCBpcyBiZWVuIGRyYWdnZWQsIG90aGVyd2lzZSB0aGUgZXZ0Lm9sZGluZGV4IGFsd2F5cyB3cm9uZyB3aGVuIHNldCBvcHRpb24uZ3JvdXAuXG5cdFx0XHRpZiAoZHJhZ0VsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHR5cGUgPT09ICdtb3VzZWRvd24nICYmIGV2dC5idXR0b24gIT09IDAgfHwgb3B0aW9ucy5kaXNhYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG9ubHkgbGVmdCBidXR0b24gb3IgZW5hYmxlZFxuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3B0aW9ucy5oYW5kbGUgJiYgIV9jbG9zZXN0KG9yaWdpbmFsVGFyZ2V0LCBvcHRpb25zLmhhbmRsZSwgZWwpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGFyZ2V0ID0gX2Nsb3Nlc3QodGFyZ2V0LCBvcHRpb25zLmRyYWdnYWJsZSwgZWwpO1xuXG5cdFx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEdldCB0aGUgaW5kZXggb2YgdGhlIGRyYWdnZWQgZWxlbWVudCB3aXRoaW4gaXRzIHBhcmVudFxuXHRcdFx0c3RhcnRJbmRleCA9IF9pbmRleCh0YXJnZXQsIG9wdGlvbnMuZHJhZ2dhYmxlKTtcblxuXHRcdFx0Ly8gQ2hlY2sgZmlsdGVyXG5cdFx0XHRpZiAodHlwZW9mIGZpbHRlciA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRpZiAoZmlsdGVyLmNhbGwodGhpcywgZXZ0LCB0YXJnZXQsIHRoaXMpKSB7XG5cdFx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQoX3RoaXMsIG9yaWdpbmFsVGFyZ2V0LCAnZmlsdGVyJywgdGFyZ2V0LCBlbCwgc3RhcnRJbmRleCk7XG5cdFx0XHRcdFx0ZXZ0LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBjYW5jZWwgZG5kXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGVsc2UgaWYgKGZpbHRlcikge1xuXHRcdFx0XHRmaWx0ZXIgPSBmaWx0ZXIuc3BsaXQoJywnKS5zb21lKGZ1bmN0aW9uIChjcml0ZXJpYSkge1xuXHRcdFx0XHRcdGNyaXRlcmlhID0gX2Nsb3Nlc3Qob3JpZ2luYWxUYXJnZXQsIGNyaXRlcmlhLnRyaW0oKSwgZWwpO1xuXG5cdFx0XHRcdFx0aWYgKGNyaXRlcmlhKSB7XG5cdFx0XHRcdFx0XHRfZGlzcGF0Y2hFdmVudChfdGhpcywgY3JpdGVyaWEsICdmaWx0ZXInLCB0YXJnZXQsIGVsLCBzdGFydEluZGV4KTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKGZpbHRlcikge1xuXHRcdFx0XHRcdGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHJldHVybjsgLy8gY2FuY2VsIGRuZFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByZXBhcmUgYGRyYWdzdGFydGBcblx0XHRcdHRoaXMuX3ByZXBhcmVEcmFnU3RhcnQoZXZ0LCB0b3VjaCwgdGFyZ2V0LCBzdGFydEluZGV4KTtcblx0XHR9LFxuXG5cdFx0X3ByZXBhcmVEcmFnU3RhcnQ6IGZ1bmN0aW9uICgvKiogRXZlbnQgKi9ldnQsIC8qKiBUb3VjaCAqL3RvdWNoLCAvKiogSFRNTEVsZW1lbnQgKi90YXJnZXQsIC8qKiBOdW1iZXIgKi9zdGFydEluZGV4KSB7XG5cdFx0XHR2YXIgX3RoaXMgPSB0aGlzLFxuXHRcdFx0XHRlbCA9IF90aGlzLmVsLFxuXHRcdFx0XHRvcHRpb25zID0gX3RoaXMub3B0aW9ucyxcblx0XHRcdFx0b3duZXJEb2N1bWVudCA9IGVsLm93bmVyRG9jdW1lbnQsXG5cdFx0XHRcdGRyYWdTdGFydEZuO1xuXG5cdFx0XHRpZiAodGFyZ2V0ICYmICFkcmFnRWwgJiYgKHRhcmdldC5wYXJlbnROb2RlID09PSBlbCkpIHtcblx0XHRcdFx0dGFwRXZ0ID0gZXZ0O1xuXG5cdFx0XHRcdHJvb3RFbCA9IGVsO1xuXHRcdFx0XHRkcmFnRWwgPSB0YXJnZXQ7XG5cdFx0XHRcdHBhcmVudEVsID0gZHJhZ0VsLnBhcmVudE5vZGU7XG5cdFx0XHRcdG5leHRFbCA9IGRyYWdFbC5uZXh0U2libGluZztcblx0XHRcdFx0YWN0aXZlR3JvdXAgPSBvcHRpb25zLmdyb3VwO1xuXHRcdFx0XHRvbGRJbmRleCA9IHN0YXJ0SW5kZXg7XG5cblx0XHRcdFx0dGhpcy5fbGFzdFggPSAodG91Y2ggfHwgZXZ0KS5jbGllbnRYO1xuXHRcdFx0XHR0aGlzLl9sYXN0WSA9ICh0b3VjaCB8fCBldnQpLmNsaWVudFk7XG5cblx0XHRcdFx0ZHJhZ0VsLnN0eWxlWyd3aWxsLWNoYW5nZSddID0gJ3RyYW5zZm9ybSc7XG5cblx0XHRcdFx0ZHJhZ1N0YXJ0Rm4gPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFx0Ly8gRGVsYXllZCBkcmFnIGhhcyBiZWVuIHRyaWdnZXJlZFxuXHRcdFx0XHRcdC8vIHdlIGNhbiByZS1lbmFibGUgdGhlIGV2ZW50czogdG91Y2htb3ZlL21vdXNlbW92ZVxuXHRcdFx0XHRcdF90aGlzLl9kaXNhYmxlRGVsYXllZERyYWcoKTtcblxuXHRcdFx0XHRcdC8vIE1ha2UgdGhlIGVsZW1lbnQgZHJhZ2dhYmxlXG5cdFx0XHRcdFx0ZHJhZ0VsLmRyYWdnYWJsZSA9IF90aGlzLm5hdGl2ZURyYWdnYWJsZTtcblxuXHRcdFx0XHRcdC8vIENob3NlbiBpdGVtXG5cdFx0XHRcdFx0X3RvZ2dsZUNsYXNzKGRyYWdFbCwgb3B0aW9ucy5jaG9zZW5DbGFzcywgdHJ1ZSk7XG5cblx0XHRcdFx0XHQvLyBCaW5kIHRoZSBldmVudHM6IGRyYWdzdGFydC9kcmFnZW5kXG5cdFx0XHRcdFx0X3RoaXMuX3RyaWdnZXJEcmFnU3RhcnQoZXZ0LCB0b3VjaCk7XG5cblx0XHRcdFx0XHQvLyBEcmFnIHN0YXJ0IGV2ZW50XG5cdFx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQoX3RoaXMsIHJvb3RFbCwgJ2Nob29zZScsIGRyYWdFbCwgcm9vdEVsLCBvbGRJbmRleCk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Ly8gRGlzYWJsZSBcImRyYWdnYWJsZVwiXG5cdFx0XHRcdG9wdGlvbnMuaWdub3JlLnNwbGl0KCcsJykuZm9yRWFjaChmdW5jdGlvbiAoY3JpdGVyaWEpIHtcblx0XHRcdFx0XHRfZmluZChkcmFnRWwsIGNyaXRlcmlhLnRyaW0oKSwgX2Rpc2FibGVEcmFnZ2FibGUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRfb24ob3duZXJEb2N1bWVudCwgJ21vdXNldXAnLCBfdGhpcy5fb25Ecm9wKTtcblx0XHRcdFx0X29uKG93bmVyRG9jdW1lbnQsICd0b3VjaGVuZCcsIF90aGlzLl9vbkRyb3ApO1xuXHRcdFx0XHRfb24ob3duZXJEb2N1bWVudCwgJ3RvdWNoY2FuY2VsJywgX3RoaXMuX29uRHJvcCk7XG5cdFx0XHRcdF9vbihvd25lckRvY3VtZW50LCAncG9pbnRlcmNhbmNlbCcsIF90aGlzLl9vbkRyb3ApO1xuXG5cdFx0XHRcdGlmIChvcHRpb25zLmRlbGF5KSB7XG5cdFx0XHRcdFx0Ly8gSWYgdGhlIHVzZXIgbW92ZXMgdGhlIHBvaW50ZXIgb3IgbGV0IGdvIHRoZSBjbGljayBvciB0b3VjaFxuXHRcdFx0XHRcdC8vIGJlZm9yZSB0aGUgZGVsYXkgaGFzIGJlZW4gcmVhY2hlZDpcblx0XHRcdFx0XHQvLyBkaXNhYmxlIHRoZSBkZWxheWVkIGRyYWdcblx0XHRcdFx0XHRfb24ob3duZXJEb2N1bWVudCwgJ21vdXNldXAnLCBfdGhpcy5fZGlzYWJsZURlbGF5ZWREcmFnKTtcblx0XHRcdFx0XHRfb24ob3duZXJEb2N1bWVudCwgJ3RvdWNoZW5kJywgX3RoaXMuX2Rpc2FibGVEZWxheWVkRHJhZyk7XG5cdFx0XHRcdFx0X29uKG93bmVyRG9jdW1lbnQsICd0b3VjaGNhbmNlbCcsIF90aGlzLl9kaXNhYmxlRGVsYXllZERyYWcpO1xuXHRcdFx0XHRcdF9vbihvd25lckRvY3VtZW50LCAnbW91c2Vtb3ZlJywgX3RoaXMuX2Rpc2FibGVEZWxheWVkRHJhZyk7XG5cdFx0XHRcdFx0X29uKG93bmVyRG9jdW1lbnQsICd0b3VjaG1vdmUnLCBfdGhpcy5fZGlzYWJsZURlbGF5ZWREcmFnKTtcblx0XHRcdFx0XHRfb24ob3duZXJEb2N1bWVudCwgJ3BvaW50ZXJtb3ZlJywgX3RoaXMuX2Rpc2FibGVEZWxheWVkRHJhZyk7XG5cblx0XHRcdFx0XHRfdGhpcy5fZHJhZ1N0YXJ0VGltZXIgPSBzZXRUaW1lb3V0KGRyYWdTdGFydEZuLCBvcHRpb25zLmRlbGF5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkcmFnU3RhcnRGbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9kaXNhYmxlRGVsYXllZERyYWc6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBvd25lckRvY3VtZW50ID0gdGhpcy5lbC5vd25lckRvY3VtZW50O1xuXG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fZHJhZ1N0YXJ0VGltZXIpO1xuXHRcdFx0X29mZihvd25lckRvY3VtZW50LCAnbW91c2V1cCcsIHRoaXMuX2Rpc2FibGVEZWxheWVkRHJhZyk7XG5cdFx0XHRfb2ZmKG93bmVyRG9jdW1lbnQsICd0b3VjaGVuZCcsIHRoaXMuX2Rpc2FibGVEZWxheWVkRHJhZyk7XG5cdFx0XHRfb2ZmKG93bmVyRG9jdW1lbnQsICd0b3VjaGNhbmNlbCcsIHRoaXMuX2Rpc2FibGVEZWxheWVkRHJhZyk7XG5cdFx0XHRfb2ZmKG93bmVyRG9jdW1lbnQsICdtb3VzZW1vdmUnLCB0aGlzLl9kaXNhYmxlRGVsYXllZERyYWcpO1xuXHRcdFx0X29mZihvd25lckRvY3VtZW50LCAndG91Y2htb3ZlJywgdGhpcy5fZGlzYWJsZURlbGF5ZWREcmFnKTtcblx0XHRcdF9vZmYob3duZXJEb2N1bWVudCwgJ3BvaW50ZXJtb3ZlJywgdGhpcy5fZGlzYWJsZURlbGF5ZWREcmFnKTtcblx0XHR9LFxuXG5cdFx0X3RyaWdnZXJEcmFnU3RhcnQ6IGZ1bmN0aW9uICgvKiogRXZlbnQgKi9ldnQsIC8qKiBUb3VjaCAqL3RvdWNoKSB7XG5cdFx0XHR0b3VjaCA9IHRvdWNoIHx8IChldnQucG9pbnRlclR5cGUgPT0gJ3RvdWNoJyA/IGV2dCA6IG51bGwpO1xuXHRcdFx0aWYgKHRvdWNoKSB7XG5cdFx0XHRcdC8vIFRvdWNoIGRldmljZSBzdXBwb3J0XG5cdFx0XHRcdHRhcEV2dCA9IHtcblx0XHRcdFx0XHR0YXJnZXQ6IGRyYWdFbCxcblx0XHRcdFx0XHRjbGllbnRYOiB0b3VjaC5jbGllbnRYLFxuXHRcdFx0XHRcdGNsaWVudFk6IHRvdWNoLmNsaWVudFlcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR0aGlzLl9vbkRyYWdTdGFydCh0YXBFdnQsICd0b3VjaCcpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoIXRoaXMubmF0aXZlRHJhZ2dhYmxlKSB7XG5cdFx0XHRcdHRoaXMuX29uRHJhZ1N0YXJ0KHRhcEV2dCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0X29uKGRyYWdFbCwgJ2RyYWdlbmQnLCB0aGlzKTtcblx0XHRcdFx0X29uKHJvb3RFbCwgJ2RyYWdzdGFydCcsIHRoaXMuX29uRHJhZ1N0YXJ0KTtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGRvY3VtZW50LnNlbGVjdGlvbikge1x0XHRcdFx0XHRcblx0XHRcdFx0XHQvLyBUaW1lb3V0IG5lY2Nlc3NhcnkgZm9yIElFOVx0XHRcdFx0XHRcblx0XHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHRcdGRvY3VtZW50LnNlbGVjdGlvbi5lbXB0eSgpO1xuXHRcdFx0XHRcdH0pO1x0XHRcdFx0XHRcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR3aW5kb3cuZ2V0U2VsZWN0aW9uKCkucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfZHJhZ1N0YXJ0ZWQ6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmIChyb290RWwgJiYgZHJhZ0VsKSB7XG5cdFx0XHRcdHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuXG5cdFx0XHRcdC8vIEFwcGx5IGVmZmVjdFxuXHRcdFx0XHRfdG9nZ2xlQ2xhc3MoZHJhZ0VsLCBvcHRpb25zLmdob3N0Q2xhc3MsIHRydWUpO1xuXHRcdFx0XHRfdG9nZ2xlQ2xhc3MoZHJhZ0VsLCBvcHRpb25zLmRyYWdDbGFzcywgZmFsc2UpO1xuXG5cdFx0XHRcdFNvcnRhYmxlLmFjdGl2ZSA9IHRoaXM7XG5cblx0XHRcdFx0Ly8gRHJhZyBzdGFydCBldmVudFxuXHRcdFx0XHRfZGlzcGF0Y2hFdmVudCh0aGlzLCByb290RWwsICdzdGFydCcsIGRyYWdFbCwgcm9vdEVsLCBvbGRJbmRleCk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9lbXVsYXRlRHJhZ092ZXI6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0b3VjaEV2dCkge1xuXHRcdFx0XHRpZiAodGhpcy5fbGFzdFggPT09IHRvdWNoRXZ0LmNsaWVudFggJiYgdGhpcy5fbGFzdFkgPT09IHRvdWNoRXZ0LmNsaWVudFkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9sYXN0WCA9IHRvdWNoRXZ0LmNsaWVudFg7XG5cdFx0XHRcdHRoaXMuX2xhc3RZID0gdG91Y2hFdnQuY2xpZW50WTtcblxuXHRcdFx0XHRpZiAoIXN1cHBvcnRDc3NQb2ludGVyRXZlbnRzKSB7XG5cdFx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnZGlzcGxheScsICdub25lJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR2YXIgdGFyZ2V0ID0gZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludCh0b3VjaEV2dC5jbGllbnRYLCB0b3VjaEV2dC5jbGllbnRZKSxcblx0XHRcdFx0XHRwYXJlbnQgPSB0YXJnZXQsXG5cdFx0XHRcdFx0aSA9IHRvdWNoRHJhZ092ZXJMaXN0ZW5lcnMubGVuZ3RoO1xuXG5cdFx0XHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0XHRpZiAocGFyZW50W2V4cGFuZG9dKSB7XG5cdFx0XHRcdFx0XHRcdHdoaWxlIChpLS0pIHtcblx0XHRcdFx0XHRcdFx0XHR0b3VjaERyYWdPdmVyTGlzdGVuZXJzW2ldKHtcblx0XHRcdFx0XHRcdFx0XHRcdGNsaWVudFg6IHRvdWNoRXZ0LmNsaWVudFgsXG5cdFx0XHRcdFx0XHRcdFx0XHRjbGllbnRZOiB0b3VjaEV2dC5jbGllbnRZLFxuXHRcdFx0XHRcdFx0XHRcdFx0dGFyZ2V0OiB0YXJnZXQsXG5cdFx0XHRcdFx0XHRcdFx0XHRyb290RWw6IHBhcmVudFxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRhcmdldCA9IHBhcmVudDsgLy8gc3RvcmUgbGFzdCBlbGVtZW50XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8qIGpzaGludCBib3NzOnRydWUgKi9cblx0XHRcdFx0XHR3aGlsZSAocGFyZW50ID0gcGFyZW50LnBhcmVudE5vZGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFzdXBwb3J0Q3NzUG9pbnRlckV2ZW50cykge1xuXHRcdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ2Rpc3BsYXknLCAnJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cblx0XHRfb25Ub3VjaE1vdmU6IGZ1bmN0aW9uICgvKipUb3VjaEV2ZW50Ki9ldnQpIHtcblx0XHRcdGlmICh0YXBFdnQpIHtcblx0XHRcdFx0dmFyXHRvcHRpb25zID0gdGhpcy5vcHRpb25zLFxuXHRcdFx0XHRcdGZhbGxiYWNrVG9sZXJhbmNlID0gb3B0aW9ucy5mYWxsYmFja1RvbGVyYW5jZSxcblx0XHRcdFx0XHRmYWxsYmFja09mZnNldCA9IG9wdGlvbnMuZmFsbGJhY2tPZmZzZXQsXG5cdFx0XHRcdFx0dG91Y2ggPSBldnQudG91Y2hlcyA/IGV2dC50b3VjaGVzWzBdIDogZXZ0LFxuXHRcdFx0XHRcdGR4ID0gKHRvdWNoLmNsaWVudFggLSB0YXBFdnQuY2xpZW50WCkgKyBmYWxsYmFja09mZnNldC54LFxuXHRcdFx0XHRcdGR5ID0gKHRvdWNoLmNsaWVudFkgLSB0YXBFdnQuY2xpZW50WSkgKyBmYWxsYmFja09mZnNldC55LFxuXHRcdFx0XHRcdHRyYW5zbGF0ZTNkID0gZXZ0LnRvdWNoZXMgPyAndHJhbnNsYXRlM2QoJyArIGR4ICsgJ3B4LCcgKyBkeSArICdweCwwKScgOiAndHJhbnNsYXRlKCcgKyBkeCArICdweCwnICsgZHkgKyAncHgpJztcblxuXHRcdFx0XHQvLyBvbmx5IHNldCB0aGUgc3RhdHVzIHRvIGRyYWdnaW5nLCB3aGVuIHdlIGFyZSBhY3R1YWxseSBkcmFnZ2luZ1xuXHRcdFx0XHRpZiAoIVNvcnRhYmxlLmFjdGl2ZSkge1xuXHRcdFx0XHRcdGlmIChmYWxsYmFja1RvbGVyYW5jZSAmJlxuXHRcdFx0XHRcdFx0bWluKGFicyh0b3VjaC5jbGllbnRYIC0gdGhpcy5fbGFzdFgpLCBhYnModG91Y2guY2xpZW50WSAtIHRoaXMuX2xhc3RZKSkgPCBmYWxsYmFja1RvbGVyYW5jZVxuXHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX2RyYWdTdGFydGVkKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBhcyB3ZWxsIGFzIGNyZWF0aW5nIHRoZSBnaG9zdCBlbGVtZW50IG9uIHRoZSBkb2N1bWVudCBib2R5XG5cdFx0XHRcdHRoaXMuX2FwcGVuZEdob3N0KCk7XG5cblx0XHRcdFx0bW92ZWQgPSB0cnVlO1xuXHRcdFx0XHR0b3VjaEV2dCA9IHRvdWNoO1xuXG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ3dlYmtpdFRyYW5zZm9ybScsIHRyYW5zbGF0ZTNkKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnbW96VHJhbnNmb3JtJywgdHJhbnNsYXRlM2QpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdtc1RyYW5zZm9ybScsIHRyYW5zbGF0ZTNkKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAndHJhbnNmb3JtJywgdHJhbnNsYXRlM2QpO1xuXG5cdFx0XHRcdGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfYXBwZW5kR2hvc3Q6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICghZ2hvc3RFbCkge1xuXHRcdFx0XHR2YXIgcmVjdCA9IGRyYWdFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcblx0XHRcdFx0XHRjc3MgPSBfY3NzKGRyYWdFbCksXG5cdFx0XHRcdFx0b3B0aW9ucyA9IHRoaXMub3B0aW9ucyxcblx0XHRcdFx0XHRnaG9zdFJlY3Q7XG5cblx0XHRcdFx0Z2hvc3RFbCA9IGRyYWdFbC5jbG9uZU5vZGUodHJ1ZSk7XG5cblx0XHRcdFx0X3RvZ2dsZUNsYXNzKGdob3N0RWwsIG9wdGlvbnMuZ2hvc3RDbGFzcywgZmFsc2UpO1xuXHRcdFx0XHRfdG9nZ2xlQ2xhc3MoZ2hvc3RFbCwgb3B0aW9ucy5mYWxsYmFja0NsYXNzLCB0cnVlKTtcblx0XHRcdFx0X3RvZ2dsZUNsYXNzKGdob3N0RWwsIG9wdGlvbnMuZHJhZ0NsYXNzLCB0cnVlKTtcblxuXHRcdFx0XHRfY3NzKGdob3N0RWwsICd0b3AnLCByZWN0LnRvcCAtIHBhcnNlSW50KGNzcy5tYXJnaW5Ub3AsIDEwKSk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ2xlZnQnLCByZWN0LmxlZnQgLSBwYXJzZUludChjc3MubWFyZ2luTGVmdCwgMTApKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnd2lkdGgnLCByZWN0LndpZHRoKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnaGVpZ2h0JywgcmVjdC5oZWlnaHQpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdvcGFjaXR5JywgJzAuOCcpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdwb3NpdGlvbicsICdmaXhlZCcpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICd6SW5kZXgnLCAnMTAwMDAwJyk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ3BvaW50ZXJFdmVudHMnLCAnbm9uZScpO1xuXG5cdFx0XHRcdG9wdGlvbnMuZmFsbGJhY2tPbkJvZHkgJiYgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChnaG9zdEVsKSB8fCByb290RWwuYXBwZW5kQ2hpbGQoZ2hvc3RFbCk7XG5cblx0XHRcdFx0Ly8gRml4aW5nIGRpbWVuc2lvbnMuXG5cdFx0XHRcdGdob3N0UmVjdCA9IGdob3N0RWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ3dpZHRoJywgcmVjdC53aWR0aCAqIDIgLSBnaG9zdFJlY3Qud2lkdGgpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdoZWlnaHQnLCByZWN0LmhlaWdodCAqIDIgLSBnaG9zdFJlY3QuaGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X29uRHJhZ1N0YXJ0OiBmdW5jdGlvbiAoLyoqRXZlbnQqL2V2dCwgLyoqYm9vbGVhbiovdXNlRmFsbGJhY2spIHtcblx0XHRcdHZhciBkYXRhVHJhbnNmZXIgPSBldnQuZGF0YVRyYW5zZmVyLFxuXHRcdFx0XHRvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuXG5cdFx0XHR0aGlzLl9vZmZVcEV2ZW50cygpO1xuXG5cdFx0XHRpZiAoYWN0aXZlR3JvdXAuY2hlY2tQdWxsKHRoaXMsIHRoaXMsIGRyYWdFbCwgZXZ0KSA9PSAnY2xvbmUnKSB7XG5cdFx0XHRcdGNsb25lRWwgPSBfY2xvbmUoZHJhZ0VsKTtcblx0XHRcdFx0X2NzcyhjbG9uZUVsLCAnZGlzcGxheScsICdub25lJyk7XG5cdFx0XHRcdHJvb3RFbC5pbnNlcnRCZWZvcmUoY2xvbmVFbCwgZHJhZ0VsKTtcblx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQodGhpcywgcm9vdEVsLCAnY2xvbmUnLCBkcmFnRWwpO1xuXHRcdFx0fVxuXG5cdFx0XHRfdG9nZ2xlQ2xhc3MoZHJhZ0VsLCBvcHRpb25zLmRyYWdDbGFzcywgdHJ1ZSk7XG5cblx0XHRcdGlmICh1c2VGYWxsYmFjaykge1xuXHRcdFx0XHRpZiAodXNlRmFsbGJhY2sgPT09ICd0b3VjaCcpIHtcblx0XHRcdFx0XHQvLyBCaW5kIHRvdWNoIGV2ZW50c1xuXHRcdFx0XHRcdF9vbihkb2N1bWVudCwgJ3RvdWNobW92ZScsIHRoaXMuX29uVG91Y2hNb3ZlKTtcblx0XHRcdFx0XHRfb24oZG9jdW1lbnQsICd0b3VjaGVuZCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHRcdFx0X29uKGRvY3VtZW50LCAndG91Y2hjYW5jZWwnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdFx0XHRcdF9vbihkb2N1bWVudCwgJ3BvaW50ZXJtb3ZlJywgdGhpcy5fb25Ub3VjaE1vdmUpO1xuXHRcdFx0XHRcdF9vbihkb2N1bWVudCwgJ3BvaW50ZXJ1cCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gT2xkIGJyd29zZXJcblx0XHRcdFx0XHRfb24oZG9jdW1lbnQsICdtb3VzZW1vdmUnLCB0aGlzLl9vblRvdWNoTW92ZSk7XG5cdFx0XHRcdFx0X29uKGRvY3VtZW50LCAnbW91c2V1cCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9sb29wSWQgPSBzZXRJbnRlcnZhbCh0aGlzLl9lbXVsYXRlRHJhZ092ZXIsIDUwKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRpZiAoZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdFx0ZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG5cdFx0XHRcdFx0b3B0aW9ucy5zZXREYXRhICYmIG9wdGlvbnMuc2V0RGF0YS5jYWxsKHRoaXMsIGRhdGFUcmFuc2ZlciwgZHJhZ0VsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF9vbihkb2N1bWVudCwgJ2Ryb3AnLCB0aGlzKTtcblx0XHRcdFx0c2V0VGltZW91dCh0aGlzLl9kcmFnU3RhcnRlZCwgMCk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9vbkRyYWdPdmVyOiBmdW5jdGlvbiAoLyoqRXZlbnQqL2V2dCkge1xuXHRcdFx0dmFyIGVsID0gdGhpcy5lbCxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRkcmFnUmVjdCxcblx0XHRcdFx0dGFyZ2V0UmVjdCxcblx0XHRcdFx0cmV2ZXJ0LFxuXHRcdFx0XHRvcHRpb25zID0gdGhpcy5vcHRpb25zLFxuXHRcdFx0XHRncm91cCA9IG9wdGlvbnMuZ3JvdXAsXG5cdFx0XHRcdGFjdGl2ZVNvcnRhYmxlID0gU29ydGFibGUuYWN0aXZlLFxuXHRcdFx0XHRpc093bmVyID0gKGFjdGl2ZUdyb3VwID09PSBncm91cCksXG5cdFx0XHRcdGNhblNvcnQgPSBvcHRpb25zLnNvcnQ7XG5cblx0XHRcdGlmIChldnQucHJldmVudERlZmF1bHQgIT09IHZvaWQgMCkge1xuXHRcdFx0XHRldnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0IW9wdGlvbnMuZHJhZ292ZXJCdWJibGUgJiYgZXZ0LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXG5cdFx0XHRtb3ZlZCA9IHRydWU7XG5cblx0XHRcdGlmIChhY3RpdmVHcm91cCAmJiAhb3B0aW9ucy5kaXNhYmxlZCAmJlxuXHRcdFx0XHQoaXNPd25lclxuXHRcdFx0XHRcdD8gY2FuU29ydCB8fCAocmV2ZXJ0ID0gIXJvb3RFbC5jb250YWlucyhkcmFnRWwpKSAvLyBSZXZlcnRpbmcgaXRlbSBpbnRvIHRoZSBvcmlnaW5hbCBsaXN0XG5cdFx0XHRcdFx0OiAoXG5cdFx0XHRcdFx0XHRwdXRTb3J0YWJsZSA9PT0gdGhpcyB8fFxuXHRcdFx0XHRcdFx0YWN0aXZlR3JvdXAuY2hlY2tQdWxsKHRoaXMsIGFjdGl2ZVNvcnRhYmxlLCBkcmFnRWwsIGV2dCkgJiYgZ3JvdXAuY2hlY2tQdXQodGhpcywgYWN0aXZlU29ydGFibGUsIGRyYWdFbCwgZXZ0KVxuXHRcdFx0XHRcdClcblx0XHRcdFx0KSAmJlxuXHRcdFx0XHQoZXZ0LnJvb3RFbCA9PT0gdm9pZCAwIHx8IGV2dC5yb290RWwgPT09IHRoaXMuZWwpIC8vIHRvdWNoIGZhbGxiYWNrXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gU21hcnQgYXV0by1zY3JvbGxpbmdcblx0XHRcdFx0X2F1dG9TY3JvbGwoZXZ0LCBvcHRpb25zLCB0aGlzLmVsKTtcblxuXHRcdFx0XHRpZiAoX3NpbGVudCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRhcmdldCA9IF9jbG9zZXN0KGV2dC50YXJnZXQsIG9wdGlvbnMuZHJhZ2dhYmxlLCBlbCk7XG5cdFx0XHRcdGRyYWdSZWN0ID0gZHJhZ0VsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRwdXRTb3J0YWJsZSA9IHRoaXM7XG5cblx0XHRcdFx0aWYgKHJldmVydCkge1xuXHRcdFx0XHRcdF9jbG9uZUhpZGUodHJ1ZSk7XG5cdFx0XHRcdFx0cGFyZW50RWwgPSByb290RWw7IC8vIGFjdHVhbGl6YXRpb25cblxuXHRcdFx0XHRcdGlmIChjbG9uZUVsIHx8IG5leHRFbCkge1xuXHRcdFx0XHRcdFx0cm9vdEVsLmluc2VydEJlZm9yZShkcmFnRWwsIGNsb25lRWwgfHwgbmV4dEVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSBpZiAoIWNhblNvcnQpIHtcblx0XHRcdFx0XHRcdHJvb3RFbC5hcHBlbmRDaGlsZChkcmFnRWwpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0aWYgKChlbC5jaGlsZHJlbi5sZW5ndGggPT09IDApIHx8IChlbC5jaGlsZHJlblswXSA9PT0gZ2hvc3RFbCkgfHxcblx0XHRcdFx0XHQoZWwgPT09IGV2dC50YXJnZXQpICYmICh0YXJnZXQgPSBfZ2hvc3RJc0xhc3QoZWwsIGV2dCkpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdFx0XHRcdGlmICh0YXJnZXQuYW5pbWF0ZWQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0YXJnZXRSZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdF9jbG9uZUhpZGUoaXNPd25lcik7XG5cblx0XHRcdFx0XHRpZiAoX29uTW92ZShyb290RWwsIGVsLCBkcmFnRWwsIGRyYWdSZWN0LCB0YXJnZXQsIHRhcmdldFJlY3QsIGV2dCkgIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWRyYWdFbC5jb250YWlucyhlbCkpIHtcblx0XHRcdFx0XHRcdFx0ZWwuYXBwZW5kQ2hpbGQoZHJhZ0VsKTtcblx0XHRcdFx0XHRcdFx0cGFyZW50RWwgPSBlbDsgLy8gYWN0dWFsaXphdGlvblxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLl9hbmltYXRlKGRyYWdSZWN0LCBkcmFnRWwpO1xuXHRcdFx0XHRcdFx0dGFyZ2V0ICYmIHRoaXMuX2FuaW1hdGUodGFyZ2V0UmVjdCwgdGFyZ2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAodGFyZ2V0ICYmICF0YXJnZXQuYW5pbWF0ZWQgJiYgdGFyZ2V0ICE9PSBkcmFnRWwgJiYgKHRhcmdldC5wYXJlbnROb2RlW2V4cGFuZG9dICE9PSB2b2lkIDApKSB7XG5cdFx0XHRcdFx0aWYgKGxhc3RFbCAhPT0gdGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHRsYXN0RWwgPSB0YXJnZXQ7XG5cdFx0XHRcdFx0XHRsYXN0Q1NTID0gX2Nzcyh0YXJnZXQpO1xuXHRcdFx0XHRcdFx0bGFzdFBhcmVudENTUyA9IF9jc3ModGFyZ2V0LnBhcmVudE5vZGUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRhcmdldFJlY3QgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cblx0XHRcdFx0XHR2YXIgd2lkdGggPSB0YXJnZXRSZWN0LnJpZ2h0IC0gdGFyZ2V0UmVjdC5sZWZ0LFxuXHRcdFx0XHRcdFx0aGVpZ2h0ID0gdGFyZ2V0UmVjdC5ib3R0b20gLSB0YXJnZXRSZWN0LnRvcCxcblx0XHRcdFx0XHRcdGZsb2F0aW5nID0gL2xlZnR8cmlnaHR8aW5saW5lLy50ZXN0KGxhc3RDU1MuY3NzRmxvYXQgKyBsYXN0Q1NTLmRpc3BsYXkpXG5cdFx0XHRcdFx0XHRcdHx8IChsYXN0UGFyZW50Q1NTLmRpc3BsYXkgPT0gJ2ZsZXgnICYmIGxhc3RQYXJlbnRDU1NbJ2ZsZXgtZGlyZWN0aW9uJ10uaW5kZXhPZigncm93JykgPT09IDApLFxuXHRcdFx0XHRcdFx0aXNXaWRlID0gKHRhcmdldC5vZmZzZXRXaWR0aCA+IGRyYWdFbC5vZmZzZXRXaWR0aCksXG5cdFx0XHRcdFx0XHRpc0xvbmcgPSAodGFyZ2V0Lm9mZnNldEhlaWdodCA+IGRyYWdFbC5vZmZzZXRIZWlnaHQpLFxuXHRcdFx0XHRcdFx0aGFsZndheSA9IChmbG9hdGluZyA/IChldnQuY2xpZW50WCAtIHRhcmdldFJlY3QubGVmdCkgLyB3aWR0aCA6IChldnQuY2xpZW50WSAtIHRhcmdldFJlY3QudG9wKSAvIGhlaWdodCkgPiAwLjUsXG5cdFx0XHRcdFx0XHRuZXh0U2libGluZyA9IHRhcmdldC5uZXh0RWxlbWVudFNpYmxpbmcsXG5cdFx0XHRcdFx0XHRtb3ZlVmVjdG9yID0gX29uTW92ZShyb290RWwsIGVsLCBkcmFnRWwsIGRyYWdSZWN0LCB0YXJnZXQsIHRhcmdldFJlY3QsIGV2dCksXG5cdFx0XHRcdFx0XHRhZnRlclxuXHRcdFx0XHRcdDtcblxuXHRcdFx0XHRcdGlmIChtb3ZlVmVjdG9yICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0X3NpbGVudCA9IHRydWU7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KF91bnNpbGVudCwgMzApO1xuXG5cdFx0XHRcdFx0XHRfY2xvbmVIaWRlKGlzT3duZXIpO1xuXG5cdFx0XHRcdFx0XHRpZiAobW92ZVZlY3RvciA9PT0gMSB8fCBtb3ZlVmVjdG9yID09PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRhZnRlciA9IChtb3ZlVmVjdG9yID09PSAxKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKGZsb2F0aW5nKSB7XG5cdFx0XHRcdFx0XHRcdHZhciBlbFRvcCA9IGRyYWdFbC5vZmZzZXRUb3AsXG5cdFx0XHRcdFx0XHRcdFx0dGdUb3AgPSB0YXJnZXQub2Zmc2V0VG9wO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChlbFRvcCA9PT0gdGdUb3ApIHtcblx0XHRcdFx0XHRcdFx0XHRhZnRlciA9ICh0YXJnZXQucHJldmlvdXNFbGVtZW50U2libGluZyA9PT0gZHJhZ0VsKSAmJiAhaXNXaWRlIHx8IGhhbGZ3YXkgJiYgaXNXaWRlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGVsc2UgaWYgKHRhcmdldC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nID09PSBkcmFnRWwgfHwgZHJhZ0VsLnByZXZpb3VzRWxlbWVudFNpYmxpbmcgPT09IHRhcmdldCkge1xuXHRcdFx0XHRcdFx0XHRcdGFmdGVyID0gKGV2dC5jbGllbnRZIC0gdGFyZ2V0UmVjdC50b3ApIC8gaGVpZ2h0ID4gMC41O1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGFmdGVyID0gdGdUb3AgPiBlbFRvcDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YWZ0ZXIgPSAobmV4dFNpYmxpbmcgIT09IGRyYWdFbCkgJiYgIWlzTG9uZyB8fCBoYWxmd2F5ICYmIGlzTG9uZztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKCFkcmFnRWwuY29udGFpbnMoZWwpKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChhZnRlciAmJiAhbmV4dFNpYmxpbmcpIHtcblx0XHRcdFx0XHRcdFx0XHRlbC5hcHBlbmRDaGlsZChkcmFnRWwpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHRhcmdldC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShkcmFnRWwsIGFmdGVyID8gbmV4dFNpYmxpbmcgOiB0YXJnZXQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHBhcmVudEVsID0gZHJhZ0VsLnBhcmVudE5vZGU7IC8vIGFjdHVhbGl6YXRpb25cblxuXHRcdFx0XHRcdFx0dGhpcy5fYW5pbWF0ZShkcmFnUmVjdCwgZHJhZ0VsKTtcblx0XHRcdFx0XHRcdHRoaXMuX2FuaW1hdGUodGFyZ2V0UmVjdCwgdGFyZ2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X2FuaW1hdGU6IGZ1bmN0aW9uIChwcmV2UmVjdCwgdGFyZ2V0KSB7XG5cdFx0XHR2YXIgbXMgPSB0aGlzLm9wdGlvbnMuYW5pbWF0aW9uO1xuXG5cdFx0XHRpZiAobXMpIHtcblx0XHRcdFx0dmFyIGN1cnJlbnRSZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG5cdFx0XHRcdF9jc3ModGFyZ2V0LCAndHJhbnNpdGlvbicsICdub25lJyk7XG5cdFx0XHRcdF9jc3ModGFyZ2V0LCAndHJhbnNmb3JtJywgJ3RyYW5zbGF0ZTNkKCdcblx0XHRcdFx0XHQrIChwcmV2UmVjdC5sZWZ0IC0gY3VycmVudFJlY3QubGVmdCkgKyAncHgsJ1xuXHRcdFx0XHRcdCsgKHByZXZSZWN0LnRvcCAtIGN1cnJlbnRSZWN0LnRvcCkgKyAncHgsMCknXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0dGFyZ2V0Lm9mZnNldFdpZHRoOyAvLyByZXBhaW50XG5cblx0XHRcdFx0X2Nzcyh0YXJnZXQsICd0cmFuc2l0aW9uJywgJ2FsbCAnICsgbXMgKyAnbXMnKTtcblx0XHRcdFx0X2Nzcyh0YXJnZXQsICd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlM2QoMCwwLDApJyk7XG5cblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRhcmdldC5hbmltYXRlZCk7XG5cdFx0XHRcdHRhcmdldC5hbmltYXRlZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRcdF9jc3ModGFyZ2V0LCAndHJhbnNpdGlvbicsICcnKTtcblx0XHRcdFx0XHRfY3NzKHRhcmdldCwgJ3RyYW5zZm9ybScsICcnKTtcblx0XHRcdFx0XHR0YXJnZXQuYW5pbWF0ZWQgPSBmYWxzZTtcblx0XHRcdFx0fSwgbXMpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfb2ZmVXBFdmVudHM6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBvd25lckRvY3VtZW50ID0gdGhpcy5lbC5vd25lckRvY3VtZW50O1xuXG5cdFx0XHRfb2ZmKGRvY3VtZW50LCAndG91Y2htb3ZlJywgdGhpcy5fb25Ub3VjaE1vdmUpO1xuXHRcdFx0X29mZihkb2N1bWVudCwgJ3BvaW50ZXJtb3ZlJywgdGhpcy5fb25Ub3VjaE1vdmUpO1xuXHRcdFx0X29mZihvd25lckRvY3VtZW50LCAnbW91c2V1cCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHRfb2ZmKG93bmVyRG9jdW1lbnQsICd0b3VjaGVuZCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHRfb2ZmKG93bmVyRG9jdW1lbnQsICdwb2ludGVydXAnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdFx0X29mZihvd25lckRvY3VtZW50LCAndG91Y2hjYW5jZWwnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdH0sXG5cblx0XHRfb25Ecm9wOiBmdW5jdGlvbiAoLyoqRXZlbnQqL2V2dCkge1xuXHRcdFx0dmFyIGVsID0gdGhpcy5lbCxcblx0XHRcdFx0b3B0aW9ucyA9IHRoaXMub3B0aW9ucztcblxuXHRcdFx0Y2xlYXJJbnRlcnZhbCh0aGlzLl9sb29wSWQpO1xuXHRcdFx0Y2xlYXJJbnRlcnZhbChhdXRvU2Nyb2xsLnBpZCk7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fZHJhZ1N0YXJ0VGltZXIpO1xuXG5cdFx0XHQvLyBVbmJpbmQgZXZlbnRzXG5cdFx0XHRfb2ZmKGRvY3VtZW50LCAnbW91c2Vtb3ZlJywgdGhpcy5fb25Ub3VjaE1vdmUpO1xuXG5cdFx0XHRpZiAodGhpcy5uYXRpdmVEcmFnZ2FibGUpIHtcblx0XHRcdFx0X29mZihkb2N1bWVudCwgJ2Ryb3AnLCB0aGlzKTtcblx0XHRcdFx0X29mZihlbCwgJ2RyYWdzdGFydCcsIHRoaXMuX29uRHJhZ1N0YXJ0KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb2ZmVXBFdmVudHMoKTtcblxuXHRcdFx0aWYgKGV2dCkge1xuXHRcdFx0XHRpZiAobW92ZWQpIHtcblx0XHRcdFx0XHRldnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHQhb3B0aW9ucy5kcm9wQnViYmxlICYmIGV2dC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGdob3N0RWwgJiYgZ2hvc3RFbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGdob3N0RWwpO1xuXG5cdFx0XHRcdGlmIChkcmFnRWwpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5uYXRpdmVEcmFnZ2FibGUpIHtcblx0XHRcdFx0XHRcdF9vZmYoZHJhZ0VsLCAnZHJhZ2VuZCcsIHRoaXMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdF9kaXNhYmxlRHJhZ2dhYmxlKGRyYWdFbCk7XG5cdFx0XHRcdFx0ZHJhZ0VsLnN0eWxlWyd3aWxsLWNoYW5nZSddID0gJyc7XG5cblx0XHRcdFx0XHQvLyBSZW1vdmUgY2xhc3Mnc1xuXHRcdFx0XHRcdF90b2dnbGVDbGFzcyhkcmFnRWwsIHRoaXMub3B0aW9ucy5naG9zdENsYXNzLCBmYWxzZSk7XG5cdFx0XHRcdFx0X3RvZ2dsZUNsYXNzKGRyYWdFbCwgdGhpcy5vcHRpb25zLmNob3NlbkNsYXNzLCBmYWxzZSk7XG5cblx0XHRcdFx0XHRpZiAocm9vdEVsICE9PSBwYXJlbnRFbCkge1xuXHRcdFx0XHRcdFx0bmV3SW5kZXggPSBfaW5kZXgoZHJhZ0VsLCBvcHRpb25zLmRyYWdnYWJsZSk7XG5cblx0XHRcdFx0XHRcdGlmIChuZXdJbmRleCA+PSAwKSB7XG5cblx0XHRcdFx0XHRcdFx0Ly8gQWRkIGV2ZW50XG5cdFx0XHRcdFx0XHRcdF9kaXNwYXRjaEV2ZW50KG51bGwsIHBhcmVudEVsLCAnYWRkJywgZHJhZ0VsLCByb290RWwsIG9sZEluZGV4LCBuZXdJbmRleCk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gUmVtb3ZlIGV2ZW50XG5cdFx0XHRcdFx0XHRcdF9kaXNwYXRjaEV2ZW50KHRoaXMsIHJvb3RFbCwgJ3JlbW92ZScsIGRyYWdFbCwgcm9vdEVsLCBvbGRJbmRleCwgbmV3SW5kZXgpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIGRyYWcgZnJvbSBvbmUgbGlzdCBhbmQgZHJvcCBpbnRvIGFub3RoZXJcblx0XHRcdFx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQobnVsbCwgcGFyZW50RWwsICdzb3J0JywgZHJhZ0VsLCByb290RWwsIG9sZEluZGV4LCBuZXdJbmRleCk7XG5cdFx0XHRcdFx0XHRcdF9kaXNwYXRjaEV2ZW50KHRoaXMsIHJvb3RFbCwgJ3NvcnQnLCBkcmFnRWwsIHJvb3RFbCwgb2xkSW5kZXgsIG5ld0luZGV4KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBSZW1vdmUgY2xvbmVcblx0XHRcdFx0XHRcdGNsb25lRWwgJiYgY2xvbmVFbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGNsb25lRWwpO1xuXG5cdFx0XHRcdFx0XHRpZiAoZHJhZ0VsLm5leHRTaWJsaW5nICE9PSBuZXh0RWwpIHtcblx0XHRcdFx0XHRcdFx0Ly8gR2V0IHRoZSBpbmRleCBvZiB0aGUgZHJhZ2dlZCBlbGVtZW50IHdpdGhpbiBpdHMgcGFyZW50XG5cdFx0XHRcdFx0XHRcdG5ld0luZGV4ID0gX2luZGV4KGRyYWdFbCwgb3B0aW9ucy5kcmFnZ2FibGUpO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChuZXdJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gZHJhZyAmIGRyb3Agd2l0aGluIHRoZSBzYW1lIGxpc3Rcblx0XHRcdFx0XHRcdFx0XHRfZGlzcGF0Y2hFdmVudCh0aGlzLCByb290RWwsICd1cGRhdGUnLCBkcmFnRWwsIHJvb3RFbCwgb2xkSW5kZXgsIG5ld0luZGV4KTtcblx0XHRcdFx0XHRcdFx0XHRfZGlzcGF0Y2hFdmVudCh0aGlzLCByb290RWwsICdzb3J0JywgZHJhZ0VsLCByb290RWwsIG9sZEluZGV4LCBuZXdJbmRleCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoU29ydGFibGUuYWN0aXZlKSB7XG5cdFx0XHRcdFx0XHQvKiBqc2hpbnQgZXFudWxsOnRydWUgKi9cblx0XHRcdFx0XHRcdGlmIChuZXdJbmRleCA9PSBudWxsIHx8IG5ld0luZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRuZXdJbmRleCA9IG9sZEluZGV4O1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRfZGlzcGF0Y2hFdmVudCh0aGlzLCByb290RWwsICdlbmQnLCBkcmFnRWwsIHJvb3RFbCwgb2xkSW5kZXgsIG5ld0luZGV4KTtcblxuXHRcdFx0XHRcdFx0Ly8gU2F2ZSBzb3J0aW5nXG5cdFx0XHRcdFx0XHR0aGlzLnNhdmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9udWxsaW5nKCk7XG5cdFx0fSxcblxuXHRcdF9udWxsaW5nOiBmdW5jdGlvbigpIHtcblx0XHRcdHJvb3RFbCA9XG5cdFx0XHRkcmFnRWwgPVxuXHRcdFx0cGFyZW50RWwgPVxuXHRcdFx0Z2hvc3RFbCA9XG5cdFx0XHRuZXh0RWwgPVxuXHRcdFx0Y2xvbmVFbCA9XG5cblx0XHRcdHNjcm9sbEVsID1cblx0XHRcdHNjcm9sbFBhcmVudEVsID1cblxuXHRcdFx0dGFwRXZ0ID1cblx0XHRcdHRvdWNoRXZ0ID1cblxuXHRcdFx0bW92ZWQgPVxuXHRcdFx0bmV3SW5kZXggPVxuXG5cdFx0XHRsYXN0RWwgPVxuXHRcdFx0bGFzdENTUyA9XG5cblx0XHRcdHB1dFNvcnRhYmxlID1cblx0XHRcdGFjdGl2ZUdyb3VwID1cblx0XHRcdFNvcnRhYmxlLmFjdGl2ZSA9IG51bGw7XG5cdFx0fSxcblxuXHRcdGhhbmRsZUV2ZW50OiBmdW5jdGlvbiAoLyoqRXZlbnQqL2V2dCkge1xuXHRcdFx0dmFyIHR5cGUgPSBldnQudHlwZTtcblxuXHRcdFx0aWYgKHR5cGUgPT09ICdkcmFnb3ZlcicgfHwgdHlwZSA9PT0gJ2RyYWdlbnRlcicpIHtcblx0XHRcdFx0aWYgKGRyYWdFbCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRHJhZ092ZXIoZXZ0KTtcblx0XHRcdFx0XHRfZ2xvYmFsRHJhZ092ZXIoZXZ0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAodHlwZSA9PT0gJ2Ryb3AnIHx8IHR5cGUgPT09ICdkcmFnZW5kJykge1xuXHRcdFx0XHR0aGlzLl9vbkRyb3AoZXZ0KTtcblx0XHRcdH1cblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBTZXJpYWxpemVzIHRoZSBpdGVtIGludG8gYW4gYXJyYXkgb2Ygc3RyaW5nLlxuXHRcdCAqIEByZXR1cm5zIHtTdHJpbmdbXX1cblx0XHQgKi9cblx0XHR0b0FycmF5OiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgb3JkZXIgPSBbXSxcblx0XHRcdFx0ZWwsXG5cdFx0XHRcdGNoaWxkcmVuID0gdGhpcy5lbC5jaGlsZHJlbixcblx0XHRcdFx0aSA9IDAsXG5cdFx0XHRcdG4gPSBjaGlsZHJlbi5sZW5ndGgsXG5cdFx0XHRcdG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG5cblx0XHRcdGZvciAoOyBpIDwgbjsgaSsrKSB7XG5cdFx0XHRcdGVsID0gY2hpbGRyZW5baV07XG5cdFx0XHRcdGlmIChfY2xvc2VzdChlbCwgb3B0aW9ucy5kcmFnZ2FibGUsIHRoaXMuZWwpKSB7XG5cdFx0XHRcdFx0b3JkZXIucHVzaChlbC5nZXRBdHRyaWJ1dGUob3B0aW9ucy5kYXRhSWRBdHRyKSB8fCBfZ2VuZXJhdGVJZChlbCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBvcmRlcjtcblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBTb3J0cyB0aGUgZWxlbWVudHMgYWNjb3JkaW5nIHRvIHRoZSBhcnJheS5cblx0XHQgKiBAcGFyYW0gIHtTdHJpbmdbXX0gIG9yZGVyICBvcmRlciBvZiB0aGUgaXRlbXNcblx0XHQgKi9cblx0XHRzb3J0OiBmdW5jdGlvbiAob3JkZXIpIHtcblx0XHRcdHZhciBpdGVtcyA9IHt9LCByb290RWwgPSB0aGlzLmVsO1xuXG5cdFx0XHR0aGlzLnRvQXJyYXkoKS5mb3JFYWNoKGZ1bmN0aW9uIChpZCwgaSkge1xuXHRcdFx0XHR2YXIgZWwgPSByb290RWwuY2hpbGRyZW5baV07XG5cblx0XHRcdFx0aWYgKF9jbG9zZXN0KGVsLCB0aGlzLm9wdGlvbnMuZHJhZ2dhYmxlLCByb290RWwpKSB7XG5cdFx0XHRcdFx0aXRlbXNbaWRdID0gZWw7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRvcmRlci5mb3JFYWNoKGZ1bmN0aW9uIChpZCkge1xuXHRcdFx0XHRpZiAoaXRlbXNbaWRdKSB7XG5cdFx0XHRcdFx0cm9vdEVsLnJlbW92ZUNoaWxkKGl0ZW1zW2lkXSk7XG5cdFx0XHRcdFx0cm9vdEVsLmFwcGVuZENoaWxkKGl0ZW1zW2lkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0sXG5cblxuXHRcdC8qKlxuXHRcdCAqIFNhdmUgdGhlIGN1cnJlbnQgc29ydGluZ1xuXHRcdCAqL1xuXHRcdHNhdmU6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBzdG9yZSA9IHRoaXMub3B0aW9ucy5zdG9yZTtcblx0XHRcdHN0b3JlICYmIHN0b3JlLnNldCh0aGlzKTtcblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBGb3IgZWFjaCBlbGVtZW50IGluIHRoZSBzZXQsIGdldCB0aGUgZmlyc3QgZWxlbWVudCB0aGF0IG1hdGNoZXMgdGhlIHNlbGVjdG9yIGJ5IHRlc3RpbmcgdGhlIGVsZW1lbnQgaXRzZWxmIGFuZCB0cmF2ZXJzaW5nIHVwIHRocm91Z2ggaXRzIGFuY2VzdG9ycyBpbiB0aGUgRE9NIHRyZWUuXG5cdFx0ICogQHBhcmFtICAge0hUTUxFbGVtZW50fSAgZWxcblx0XHQgKiBAcGFyYW0gICB7U3RyaW5nfSAgICAgICBbc2VsZWN0b3JdICBkZWZhdWx0OiBgb3B0aW9ucy5kcmFnZ2FibGVgXG5cdFx0ICogQHJldHVybnMge0hUTUxFbGVtZW50fG51bGx9XG5cdFx0ICovXG5cdFx0Y2xvc2VzdDogZnVuY3Rpb24gKGVsLCBzZWxlY3Rvcikge1xuXHRcdFx0cmV0dXJuIF9jbG9zZXN0KGVsLCBzZWxlY3RvciB8fCB0aGlzLm9wdGlvbnMuZHJhZ2dhYmxlLCB0aGlzLmVsKTtcblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBTZXQvZ2V0IG9wdGlvblxuXHRcdCAqIEBwYXJhbSAgIHtzdHJpbmd9IG5hbWVcblx0XHQgKiBAcGFyYW0gICB7Kn0gICAgICBbdmFsdWVdXG5cdFx0ICogQHJldHVybnMgeyp9XG5cdFx0ICovXG5cdFx0b3B0aW9uOiBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcblx0XHRcdHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuXG5cdFx0XHRpZiAodmFsdWUgPT09IHZvaWQgMCkge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9uc1tuYW1lXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9wdGlvbnNbbmFtZV0gPSB2YWx1ZTtcblxuXHRcdFx0XHRpZiAobmFtZSA9PT0gJ2dyb3VwJykge1xuXHRcdFx0XHRcdF9wcmVwYXJlR3JvdXAob3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBEZXN0cm95XG5cdFx0ICovXG5cdFx0ZGVzdHJveTogZnVuY3Rpb24gKCkge1xuXHRcdFx0dmFyIGVsID0gdGhpcy5lbDtcblxuXHRcdFx0ZWxbZXhwYW5kb10gPSBudWxsO1xuXG5cdFx0XHRfb2ZmKGVsLCAnbW91c2Vkb3duJywgdGhpcy5fb25UYXBTdGFydCk7XG5cdFx0XHRfb2ZmKGVsLCAndG91Y2hzdGFydCcsIHRoaXMuX29uVGFwU3RhcnQpO1xuXHRcdFx0X29mZihlbCwgJ3BvaW50ZXJkb3duJywgdGhpcy5fb25UYXBTdGFydCk7XG5cblx0XHRcdGlmICh0aGlzLm5hdGl2ZURyYWdnYWJsZSkge1xuXHRcdFx0XHRfb2ZmKGVsLCAnZHJhZ292ZXInLCB0aGlzKTtcblx0XHRcdFx0X29mZihlbCwgJ2RyYWdlbnRlcicsIHRoaXMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW1vdmUgZHJhZ2dhYmxlIGF0dHJpYnV0ZXNcblx0XHRcdEFycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwoZWwucXVlcnlTZWxlY3RvckFsbCgnW2RyYWdnYWJsZV0nKSwgZnVuY3Rpb24gKGVsKSB7XG5cdFx0XHRcdGVsLnJlbW92ZUF0dHJpYnV0ZSgnZHJhZ2dhYmxlJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dG91Y2hEcmFnT3Zlckxpc3RlbmVycy5zcGxpY2UodG91Y2hEcmFnT3Zlckxpc3RlbmVycy5pbmRleE9mKHRoaXMuX29uRHJhZ092ZXIpLCAxKTtcblxuXHRcdFx0dGhpcy5fb25Ecm9wKCk7XG5cblx0XHRcdHRoaXMuZWwgPSBlbCA9IG51bGw7XG5cdFx0fVxuXHR9O1xuXG5cblx0ZnVuY3Rpb24gX2Nsb25lSGlkZShzdGF0ZSkge1xuXHRcdGlmIChjbG9uZUVsICYmIChjbG9uZUVsLnN0YXRlICE9PSBzdGF0ZSkpIHtcblx0XHRcdF9jc3MoY2xvbmVFbCwgJ2Rpc3BsYXknLCBzdGF0ZSA/ICdub25lJyA6ICcnKTtcblx0XHRcdCFzdGF0ZSAmJiBjbG9uZUVsLnN0YXRlICYmIHJvb3RFbC5pbnNlcnRCZWZvcmUoY2xvbmVFbCwgZHJhZ0VsKTtcblx0XHRcdGNsb25lRWwuc3RhdGUgPSBzdGF0ZTtcblx0XHR9XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF9jbG9zZXN0KC8qKkhUTUxFbGVtZW50Ki9lbCwgLyoqU3RyaW5nKi9zZWxlY3RvciwgLyoqSFRNTEVsZW1lbnQqL2N0eCkge1xuXHRcdGlmIChlbCkge1xuXHRcdFx0Y3R4ID0gY3R4IHx8IGRvY3VtZW50O1xuXG5cdFx0XHRkbyB7XG5cdFx0XHRcdGlmICgoc2VsZWN0b3IgPT09ICc+KicgJiYgZWwucGFyZW50Tm9kZSA9PT0gY3R4KSB8fCBfbWF0Y2hlcyhlbCwgc2VsZWN0b3IpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGVsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8qIGpzaGludCBib3NzOnRydWUgKi9cblx0XHRcdH0gd2hpbGUgKGVsID0gX2dldFBhcmVudE9ySG9zdChlbCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfZ2V0UGFyZW50T3JIb3N0KGVsKSB7XG5cdFx0dmFyIHBhcmVudCA9IGVsLmhvc3Q7XG5cblx0XHRyZXR1cm4gKHBhcmVudCAmJiBwYXJlbnQubm9kZVR5cGUpID8gcGFyZW50IDogZWwucGFyZW50Tm9kZTtcblx0fVxuXG5cblx0ZnVuY3Rpb24gX2dsb2JhbERyYWdPdmVyKC8qKkV2ZW50Ki9ldnQpIHtcblx0XHRpZiAoZXZ0LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0ZXZ0LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ21vdmUnO1xuXHRcdH1cblx0XHRldnQucHJldmVudERlZmF1bHQoKTtcblx0fVxuXG5cblx0ZnVuY3Rpb24gX29uKGVsLCBldmVudCwgZm4pIHtcblx0XHRlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBmbiwgZmFsc2UpO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfb2ZmKGVsLCBldmVudCwgZm4pIHtcblx0XHRlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBmbiwgZmFsc2UpO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfdG9nZ2xlQ2xhc3MoZWwsIG5hbWUsIHN0YXRlKSB7XG5cdFx0aWYgKGVsKSB7XG5cdFx0XHRpZiAoZWwuY2xhc3NMaXN0KSB7XG5cdFx0XHRcdGVsLmNsYXNzTGlzdFtzdGF0ZSA/ICdhZGQnIDogJ3JlbW92ZSddKG5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHZhciBjbGFzc05hbWUgPSAoJyAnICsgZWwuY2xhc3NOYW1lICsgJyAnKS5yZXBsYWNlKFJTUEFDRSwgJyAnKS5yZXBsYWNlKCcgJyArIG5hbWUgKyAnICcsICcgJyk7XG5cdFx0XHRcdGVsLmNsYXNzTmFtZSA9IChjbGFzc05hbWUgKyAoc3RhdGUgPyAnICcgKyBuYW1lIDogJycpKS5yZXBsYWNlKFJTUEFDRSwgJyAnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF9jc3MoZWwsIHByb3AsIHZhbCkge1xuXHRcdHZhciBzdHlsZSA9IGVsICYmIGVsLnN0eWxlO1xuXG5cdFx0aWYgKHN0eWxlKSB7XG5cdFx0XHRpZiAodmFsID09PSB2b2lkIDApIHtcblx0XHRcdFx0aWYgKGRvY3VtZW50LmRlZmF1bHRWaWV3ICYmIGRvY3VtZW50LmRlZmF1bHRWaWV3LmdldENvbXB1dGVkU3R5bGUpIHtcblx0XHRcdFx0XHR2YWwgPSBkb2N1bWVudC5kZWZhdWx0Vmlldy5nZXRDb21wdXRlZFN0eWxlKGVsLCAnJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAoZWwuY3VycmVudFN0eWxlKSB7XG5cdFx0XHRcdFx0dmFsID0gZWwuY3VycmVudFN0eWxlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHByb3AgPT09IHZvaWQgMCA/IHZhbCA6IHZhbFtwcm9wXTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRpZiAoIShwcm9wIGluIHN0eWxlKSkge1xuXHRcdFx0XHRcdHByb3AgPSAnLXdlYmtpdC0nICsgcHJvcDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN0eWxlW3Byb3BdID0gdmFsICsgKHR5cGVvZiB2YWwgPT09ICdzdHJpbmcnID8gJycgOiAncHgnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF9maW5kKGN0eCwgdGFnTmFtZSwgaXRlcmF0b3IpIHtcblx0XHRpZiAoY3R4KSB7XG5cdFx0XHR2YXIgbGlzdCA9IGN0eC5nZXRFbGVtZW50c0J5VGFnTmFtZSh0YWdOYW1lKSwgaSA9IDAsIG4gPSBsaXN0Lmxlbmd0aDtcblxuXHRcdFx0aWYgKGl0ZXJhdG9yKSB7XG5cdFx0XHRcdGZvciAoOyBpIDwgbjsgaSsrKSB7XG5cdFx0XHRcdFx0aXRlcmF0b3IobGlzdFtpXSwgaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGxpc3Q7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblxuXG5cdGZ1bmN0aW9uIF9kaXNwYXRjaEV2ZW50KHNvcnRhYmxlLCByb290RWwsIG5hbWUsIHRhcmdldEVsLCBmcm9tRWwsIHN0YXJ0SW5kZXgsIG5ld0luZGV4KSB7XG5cdFx0c29ydGFibGUgPSAoc29ydGFibGUgfHwgcm9vdEVsW2V4cGFuZG9dKTtcblxuXHRcdHZhciBldnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnRXZlbnQnKSxcblx0XHRcdG9wdGlvbnMgPSBzb3J0YWJsZS5vcHRpb25zLFxuXHRcdFx0b25OYW1lID0gJ29uJyArIG5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnN1YnN0cigxKTtcblxuXHRcdGV2dC5pbml0RXZlbnQobmFtZSwgdHJ1ZSwgdHJ1ZSk7XG5cblx0XHRldnQudG8gPSByb290RWw7XG5cdFx0ZXZ0LmZyb20gPSBmcm9tRWwgfHwgcm9vdEVsO1xuXHRcdGV2dC5pdGVtID0gdGFyZ2V0RWwgfHwgcm9vdEVsO1xuXHRcdGV2dC5jbG9uZSA9IGNsb25lRWw7XG5cblx0XHRldnQub2xkSW5kZXggPSBzdGFydEluZGV4O1xuXHRcdGV2dC5uZXdJbmRleCA9IG5ld0luZGV4O1xuXG5cdFx0cm9vdEVsLmRpc3BhdGNoRXZlbnQoZXZ0KTtcblxuXHRcdGlmIChvcHRpb25zW29uTmFtZV0pIHtcblx0XHRcdG9wdGlvbnNbb25OYW1lXS5jYWxsKHNvcnRhYmxlLCBldnQpO1xuXHRcdH1cblx0fVxuXG5cblx0ZnVuY3Rpb24gX29uTW92ZShmcm9tRWwsIHRvRWwsIGRyYWdFbCwgZHJhZ1JlY3QsIHRhcmdldEVsLCB0YXJnZXRSZWN0LCBvcmlnaW5hbEV2dCkge1xuXHRcdHZhciBldnQsXG5cdFx0XHRzb3J0YWJsZSA9IGZyb21FbFtleHBhbmRvXSxcblx0XHRcdG9uTW92ZUZuID0gc29ydGFibGUub3B0aW9ucy5vbk1vdmUsXG5cdFx0XHRyZXRWYWw7XG5cblx0XHRldnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnRXZlbnQnKTtcblx0XHRldnQuaW5pdEV2ZW50KCdtb3ZlJywgdHJ1ZSwgdHJ1ZSk7XG5cblx0XHRldnQudG8gPSB0b0VsO1xuXHRcdGV2dC5mcm9tID0gZnJvbUVsO1xuXHRcdGV2dC5kcmFnZ2VkID0gZHJhZ0VsO1xuXHRcdGV2dC5kcmFnZ2VkUmVjdCA9IGRyYWdSZWN0O1xuXHRcdGV2dC5yZWxhdGVkID0gdGFyZ2V0RWwgfHwgdG9FbDtcblx0XHRldnQucmVsYXRlZFJlY3QgPSB0YXJnZXRSZWN0IHx8IHRvRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cblx0XHRmcm9tRWwuZGlzcGF0Y2hFdmVudChldnQpO1xuXG5cdFx0aWYgKG9uTW92ZUZuKSB7XG5cdFx0XHRyZXRWYWwgPSBvbk1vdmVGbi5jYWxsKHNvcnRhYmxlLCBldnQsIG9yaWdpbmFsRXZ0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmV0VmFsO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfZGlzYWJsZURyYWdnYWJsZShlbCkge1xuXHRcdGVsLmRyYWdnYWJsZSA9IGZhbHNlO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfdW5zaWxlbnQoKSB7XG5cdFx0X3NpbGVudCA9IGZhbHNlO1xuXHR9XG5cblxuXHQvKiogQHJldHVybnMge0hUTUxFbGVtZW50fGZhbHNlfSAqL1xuXHRmdW5jdGlvbiBfZ2hvc3RJc0xhc3QoZWwsIGV2dCkge1xuXHRcdHZhciBsYXN0RWwgPSBlbC5sYXN0RWxlbWVudENoaWxkLFxuXHRcdFx0cmVjdCA9IGxhc3RFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuXHRcdC8vIDUg4oCUIG1pbiBkZWx0YVxuXHRcdC8vIGFicyDigJQg0L3QtdC70YzQt9GPINC00L7QsdCw0LLQu9GP0YLRjCwg0LAg0YLQviDQs9C70Y7QutC4INC/0YDQuCDQvdCw0LLQtdC00LXQvdC40Lgg0YHQstC10YDRhdGDXG5cdFx0cmV0dXJuIChcblx0XHRcdChldnQuY2xpZW50WSAtIChyZWN0LnRvcCArIHJlY3QuaGVpZ2h0KSA+IDUpIHx8XG5cdFx0XHQoZXZ0LmNsaWVudFggLSAocmVjdC5yaWdodCArIHJlY3Qud2lkdGgpID4gNSlcblx0XHQpICYmIGxhc3RFbDtcblx0fVxuXG5cblx0LyoqXG5cdCAqIEdlbmVyYXRlIGlkXG5cdCAqIEBwYXJhbSAgIHtIVE1MRWxlbWVudH0gZWxcblx0ICogQHJldHVybnMge1N0cmluZ31cblx0ICogQHByaXZhdGVcblx0ICovXG5cdGZ1bmN0aW9uIF9nZW5lcmF0ZUlkKGVsKSB7XG5cdFx0dmFyIHN0ciA9IGVsLnRhZ05hbWUgKyBlbC5jbGFzc05hbWUgKyBlbC5zcmMgKyBlbC5ocmVmICsgZWwudGV4dENvbnRlbnQsXG5cdFx0XHRpID0gc3RyLmxlbmd0aCxcblx0XHRcdHN1bSA9IDA7XG5cblx0XHR3aGlsZSAoaS0tKSB7XG5cdFx0XHRzdW0gKz0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1bS50b1N0cmluZygzNik7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgaW5kZXggb2YgYW4gZWxlbWVudCB3aXRoaW4gaXRzIHBhcmVudCBmb3IgYSBzZWxlY3RlZCBzZXQgb2Zcblx0ICogZWxlbWVudHNcblx0ICogQHBhcmFtICB7SFRNTEVsZW1lbnR9IGVsXG5cdCAqIEBwYXJhbSAge3NlbGVjdG9yfSBzZWxlY3RvclxuXHQgKiBAcmV0dXJuIHtudW1iZXJ9XG5cdCAqL1xuXHRmdW5jdGlvbiBfaW5kZXgoZWwsIHNlbGVjdG9yKSB7XG5cdFx0dmFyIGluZGV4ID0gMDtcblxuXHRcdGlmICghZWwgfHwgIWVsLnBhcmVudE5vZGUpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHR3aGlsZSAoZWwgJiYgKGVsID0gZWwucHJldmlvdXNFbGVtZW50U2libGluZykpIHtcblx0XHRcdGlmICgoZWwubm9kZU5hbWUudG9VcHBlckNhc2UoKSAhPT0gJ1RFTVBMQVRFJykgJiYgKHNlbGVjdG9yID09PSAnPionIHx8IF9tYXRjaGVzKGVsLCBzZWxlY3RvcikpKSB7XG5cdFx0XHRcdGluZGV4Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZGV4O1xuXHR9XG5cblx0ZnVuY3Rpb24gX21hdGNoZXMoLyoqSFRNTEVsZW1lbnQqL2VsLCAvKipTdHJpbmcqL3NlbGVjdG9yKSB7XG5cdFx0aWYgKGVsKSB7XG5cdFx0XHRzZWxlY3RvciA9IHNlbGVjdG9yLnNwbGl0KCcuJyk7XG5cblx0XHRcdHZhciB0YWcgPSBzZWxlY3Rvci5zaGlmdCgpLnRvVXBwZXJDYXNlKCksXG5cdFx0XHRcdHJlID0gbmV3IFJlZ0V4cCgnXFxcXHMoJyArIHNlbGVjdG9yLmpvaW4oJ3wnKSArICcpKD89XFxcXHMpJywgJ2cnKTtcblxuXHRcdFx0cmV0dXJuIChcblx0XHRcdFx0KHRhZyA9PT0gJycgfHwgZWwubm9kZU5hbWUudG9VcHBlckNhc2UoKSA9PSB0YWcpICYmXG5cdFx0XHRcdCghc2VsZWN0b3IubGVuZ3RoIHx8ICgoJyAnICsgZWwuY2xhc3NOYW1lICsgJyAnKS5tYXRjaChyZSkgfHwgW10pLmxlbmd0aCA9PSBzZWxlY3Rvci5sZW5ndGgpXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZ1bmN0aW9uIF90aHJvdHRsZShjYWxsYmFjaywgbXMpIHtcblx0XHR2YXIgYXJncywgX3RoaXM7XG5cblx0XHRyZXR1cm4gZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKGFyZ3MgPT09IHZvaWQgMCkge1xuXHRcdFx0XHRhcmdzID0gYXJndW1lbnRzO1xuXHRcdFx0XHRfdGhpcyA9IHRoaXM7XG5cblx0XHRcdFx0c2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFx0aWYgKGFyZ3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRjYWxsYmFjay5jYWxsKF90aGlzLCBhcmdzWzBdKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y2FsbGJhY2suYXBwbHkoX3RoaXMsIGFyZ3MpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGFyZ3MgPSB2b2lkIDA7XG5cdFx0XHRcdH0sIG1zKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gX2V4dGVuZChkc3QsIHNyYykge1xuXHRcdGlmIChkc3QgJiYgc3JjKSB7XG5cdFx0XHRmb3IgKHZhciBrZXkgaW4gc3JjKSB7XG5cdFx0XHRcdGlmIChzcmMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdFx0XHRcdGRzdFtrZXldID0gc3JjW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZHN0O1xuXHR9XG5cblx0ZnVuY3Rpb24gX2Nsb25lKGVsKSB7XG5cdFx0cmV0dXJuICRcblx0XHRcdD8gJChlbCkuY2xvbmUodHJ1ZSlbMF1cblx0XHRcdDogKFBvbHltZXIgJiYgUG9seW1lci5kb21cblx0XHRcdFx0PyBQb2x5bWVyLmRvbShlbCkuY2xvbmVOb2RlKHRydWUpXG5cdFx0XHRcdDogZWwuY2xvbmVOb2RlKHRydWUpXG5cdFx0XHQpO1xuXHR9XG5cblxuXHQvLyBFeHBvcnQgdXRpbHNcblx0U29ydGFibGUudXRpbHMgPSB7XG5cdFx0b246IF9vbixcblx0XHRvZmY6IF9vZmYsXG5cdFx0Y3NzOiBfY3NzLFxuXHRcdGZpbmQ6IF9maW5kLFxuXHRcdGlzOiBmdW5jdGlvbiAoZWwsIHNlbGVjdG9yKSB7XG5cdFx0XHRyZXR1cm4gISFfY2xvc2VzdChlbCwgc2VsZWN0b3IsIGVsKTtcblx0XHR9LFxuXHRcdGV4dGVuZDogX2V4dGVuZCxcblx0XHR0aHJvdHRsZTogX3Rocm90dGxlLFxuXHRcdGNsb3Nlc3Q6IF9jbG9zZXN0LFxuXHRcdHRvZ2dsZUNsYXNzOiBfdG9nZ2xlQ2xhc3MsXG5cdFx0Y2xvbmU6IF9jbG9uZSxcblx0XHRpbmRleDogX2luZGV4XG5cdH07XG5cblxuXHQvKipcblx0ICogQ3JlYXRlIHNvcnRhYmxlIGluc3RhbmNlXG5cdCAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9ICBlbFxuXHQgKiBAcGFyYW0ge09iamVjdH0gICAgICBbb3B0aW9uc11cblx0ICovXG5cdFNvcnRhYmxlLmNyZWF0ZSA9IGZ1bmN0aW9uIChlbCwgb3B0aW9ucykge1xuXHRcdHJldHVybiBuZXcgU29ydGFibGUoZWwsIG9wdGlvbnMpO1xuXHR9O1xuXG5cblx0Ly8gRXhwb3J0XG5cdFNvcnRhYmxlLnZlcnNpb24gPSAnMS41LjAtcmMxJztcblx0cmV0dXJuIFNvcnRhYmxlO1xufSk7XG4iLCIvKlxuICogJElkOiByYXdkZWZsYXRlLmpzLHYgMC41IDIwMTMvMDQvMDkgMTQ6MjU6MzggZGFua29nYWkgRXhwICRcbiAqXG4gKiBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSwgdmVyc2lvbiAyIChHUEwtMi4wKVxuICogICBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvR1BMLTIuMFxuICogT3JpZ2luYWw6XG4gKiAgaHR0cDovL3d3dy5vbmljb3MuY29tL3N0YWZmL2l6L2FtdXNlL2phdmFzY3JpcHQvZXhwZXJ0L2RlZmxhdGUudHh0XG4gKi9cblxuKGZ1bmN0aW9uKGN0eCl7XG5cbi8qIENvcHlyaWdodCAoQykgMTk5OSBNYXNhbmFvIEl6dW1vIDxpekBvbmljb3MuY28uanA+XG4gKiBWZXJzaW9uOiAxLjAuMVxuICogTGFzdE1vZGlmaWVkOiBEZWMgMjUgMTk5OVxuICovXG5cbi8qIEludGVyZmFjZTpcbiAqIGRhdGEgPSB6aXBfZGVmbGF0ZShzcmMpO1xuICovXG5cbi8qIGNvbnN0YW50IHBhcmFtZXRlcnMgKi9cbnZhciB6aXBfV1NJWkUgPSAzMjc2ODtcdFx0Ly8gU2xpZGluZyBXaW5kb3cgc2l6ZVxudmFyIHppcF9TVE9SRURfQkxPQ0sgPSAwO1xudmFyIHppcF9TVEFUSUNfVFJFRVMgPSAxO1xudmFyIHppcF9EWU5fVFJFRVMgICAgPSAyO1xuXG4vKiBmb3IgZGVmbGF0ZSAqL1xudmFyIHppcF9ERUZBVUxUX0xFVkVMID0gNjtcbnZhciB6aXBfRlVMTF9TRUFSQ0ggPSB0cnVlO1xudmFyIHppcF9JTkJVRlNJWiA9IDMyNzY4O1x0Ly8gSW5wdXQgYnVmZmVyIHNpemVcbnZhciB6aXBfSU5CVUZfRVhUUkEgPSA2NDtcdC8vIEV4dHJhIGJ1ZmZlclxudmFyIHppcF9PVVRCVUZTSVogPSAxMDI0ICogODtcbnZhciB6aXBfd2luZG93X3NpemUgPSAyICogemlwX1dTSVpFO1xudmFyIHppcF9NSU5fTUFUQ0ggPSAzO1xudmFyIHppcF9NQVhfTUFUQ0ggPSAyNTg7XG52YXIgemlwX0JJVFMgPSAxNjtcbi8vIGZvciBTTUFMTF9NRU1cbnZhciB6aXBfTElUX0JVRlNJWkUgPSAweDIwMDA7XG52YXIgemlwX0hBU0hfQklUUyA9IDEzO1xuLy8gZm9yIE1FRElVTV9NRU1cbi8vIHZhciB6aXBfTElUX0JVRlNJWkUgPSAweDQwMDA7XG4vLyB2YXIgemlwX0hBU0hfQklUUyA9IDE0O1xuLy8gZm9yIEJJR19NRU1cbi8vIHZhciB6aXBfTElUX0JVRlNJWkUgPSAweDgwMDA7XG4vLyB2YXIgemlwX0hBU0hfQklUUyA9IDE1O1xuaWYoemlwX0xJVF9CVUZTSVpFID4gemlwX0lOQlVGU0laKVxuICAgIGFsZXJ0KFwiZXJyb3I6IHppcF9JTkJVRlNJWiBpcyB0b28gc21hbGxcIik7XG5pZigoemlwX1dTSVpFPDwxKSA+ICgxPDx6aXBfQklUUykpXG4gICAgYWxlcnQoXCJlcnJvcjogemlwX1dTSVpFIGlzIHRvbyBsYXJnZVwiKTtcbmlmKHppcF9IQVNIX0JJVFMgPiB6aXBfQklUUy0xKVxuICAgIGFsZXJ0KFwiZXJyb3I6IHppcF9IQVNIX0JJVFMgaXMgdG9vIGxhcmdlXCIpO1xuaWYoemlwX0hBU0hfQklUUyA8IDggfHwgemlwX01BWF9NQVRDSCAhPSAyNTgpXG4gICAgYWxlcnQoXCJlcnJvcjogQ29kZSB0b28gY2xldmVyXCIpO1xudmFyIHppcF9ESVNUX0JVRlNJWkUgPSB6aXBfTElUX0JVRlNJWkU7XG52YXIgemlwX0hBU0hfU0laRSA9IDEgPDwgemlwX0hBU0hfQklUUztcbnZhciB6aXBfSEFTSF9NQVNLID0gemlwX0hBU0hfU0laRSAtIDE7XG52YXIgemlwX1dNQVNLID0gemlwX1dTSVpFIC0gMTtcbnZhciB6aXBfTklMID0gMDsgLy8gVGFpbCBvZiBoYXNoIGNoYWluc1xudmFyIHppcF9UT09fRkFSID0gNDA5NjtcbnZhciB6aXBfTUlOX0xPT0tBSEVBRCA9IHppcF9NQVhfTUFUQ0ggKyB6aXBfTUlOX01BVENIICsgMTtcbnZhciB6aXBfTUFYX0RJU1QgPSB6aXBfV1NJWkUgLSB6aXBfTUlOX0xPT0tBSEVBRDtcbnZhciB6aXBfU01BTExFU1QgPSAxO1xudmFyIHppcF9NQVhfQklUUyA9IDE1O1xudmFyIHppcF9NQVhfQkxfQklUUyA9IDc7XG52YXIgemlwX0xFTkdUSF9DT0RFUyA9IDI5O1xudmFyIHppcF9MSVRFUkFMUyA9MjU2O1xudmFyIHppcF9FTkRfQkxPQ0sgPSAyNTY7XG52YXIgemlwX0xfQ09ERVMgPSB6aXBfTElURVJBTFMgKyAxICsgemlwX0xFTkdUSF9DT0RFUztcbnZhciB6aXBfRF9DT0RFUyA9IDMwO1xudmFyIHppcF9CTF9DT0RFUyA9IDE5O1xudmFyIHppcF9SRVBfM182ID0gMTY7XG52YXIgemlwX1JFUFpfM18xMCA9IDE3O1xudmFyIHppcF9SRVBaXzExXzEzOCA9IDE4O1xudmFyIHppcF9IRUFQX1NJWkUgPSAyICogemlwX0xfQ09ERVMgKyAxO1xudmFyIHppcF9IX1NISUZUID0gcGFyc2VJbnQoKHppcF9IQVNIX0JJVFMgKyB6aXBfTUlOX01BVENIIC0gMSkgL1xuXHRcdFx0ICAgemlwX01JTl9NQVRDSCk7XG5cbi8qIHZhcmlhYmxlcyAqL1xudmFyIHppcF9mcmVlX3F1ZXVlO1xudmFyIHppcF9xaGVhZCwgemlwX3F0YWlsO1xudmFyIHppcF9pbml0ZmxhZztcbnZhciB6aXBfb3V0YnVmID0gbnVsbDtcbnZhciB6aXBfb3V0Y250LCB6aXBfb3V0b2ZmO1xudmFyIHppcF9jb21wbGV0ZTtcbnZhciB6aXBfd2luZG93O1xudmFyIHppcF9kX2J1ZjtcbnZhciB6aXBfbF9idWY7XG52YXIgemlwX3ByZXY7XG52YXIgemlwX2JpX2J1ZjtcbnZhciB6aXBfYmlfdmFsaWQ7XG52YXIgemlwX2Jsb2NrX3N0YXJ0O1xudmFyIHppcF9pbnNfaDtcbnZhciB6aXBfaGFzaF9oZWFkO1xudmFyIHppcF9wcmV2X21hdGNoO1xudmFyIHppcF9tYXRjaF9hdmFpbGFibGU7XG52YXIgemlwX21hdGNoX2xlbmd0aDtcbnZhciB6aXBfcHJldl9sZW5ndGg7XG52YXIgemlwX3N0cnN0YXJ0O1xudmFyIHppcF9tYXRjaF9zdGFydDtcbnZhciB6aXBfZW9maWxlO1xudmFyIHppcF9sb29rYWhlYWQ7XG52YXIgemlwX21heF9jaGFpbl9sZW5ndGg7XG52YXIgemlwX21heF9sYXp5X21hdGNoO1xudmFyIHppcF9jb21wcl9sZXZlbDtcbnZhciB6aXBfZ29vZF9tYXRjaDtcbnZhciB6aXBfbmljZV9tYXRjaDtcbnZhciB6aXBfZHluX2x0cmVlO1xudmFyIHppcF9keW5fZHRyZWU7XG52YXIgemlwX3N0YXRpY19sdHJlZTtcbnZhciB6aXBfc3RhdGljX2R0cmVlO1xudmFyIHppcF9ibF90cmVlO1xudmFyIHppcF9sX2Rlc2M7XG52YXIgemlwX2RfZGVzYztcbnZhciB6aXBfYmxfZGVzYztcbnZhciB6aXBfYmxfY291bnQ7XG52YXIgemlwX2hlYXA7XG52YXIgemlwX2hlYXBfbGVuO1xudmFyIHppcF9oZWFwX21heDtcbnZhciB6aXBfZGVwdGg7XG52YXIgemlwX2xlbmd0aF9jb2RlO1xudmFyIHppcF9kaXN0X2NvZGU7XG52YXIgemlwX2Jhc2VfbGVuZ3RoO1xudmFyIHppcF9iYXNlX2Rpc3Q7XG52YXIgemlwX2ZsYWdfYnVmO1xudmFyIHppcF9sYXN0X2xpdDtcbnZhciB6aXBfbGFzdF9kaXN0O1xudmFyIHppcF9sYXN0X2ZsYWdzO1xudmFyIHppcF9mbGFncztcbnZhciB6aXBfZmxhZ19iaXQ7XG52YXIgemlwX29wdF9sZW47XG52YXIgemlwX3N0YXRpY19sZW47XG52YXIgemlwX2RlZmxhdGVfZGF0YTtcbnZhciB6aXBfZGVmbGF0ZV9wb3M7XG5cbi8qIG9iamVjdHMgKGRlZmxhdGUpICovXG5cbnZhciB6aXBfRGVmbGF0ZUNUID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5mYyA9IDA7IC8vIGZyZXF1ZW5jeSBjb3VudCBvciBiaXQgc3RyaW5nXG4gICAgdGhpcy5kbCA9IDA7IC8vIGZhdGhlciBub2RlIGluIEh1ZmZtYW4gdHJlZSBvciBsZW5ndGggb2YgYml0IHN0cmluZ1xufVxuXG52YXIgemlwX0RlZmxhdGVUcmVlRGVzYyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZHluX3RyZWUgPSBudWxsO1x0Ly8gdGhlIGR5bmFtaWMgdHJlZVxuICAgIHRoaXMuc3RhdGljX3RyZWUgPSBudWxsO1x0Ly8gY29ycmVzcG9uZGluZyBzdGF0aWMgdHJlZSBvciBOVUxMXG4gICAgdGhpcy5leHRyYV9iaXRzID0gbnVsbDtcdC8vIGV4dHJhIGJpdHMgZm9yIGVhY2ggY29kZSBvciBOVUxMXG4gICAgdGhpcy5leHRyYV9iYXNlID0gMDtcdC8vIGJhc2UgaW5kZXggZm9yIGV4dHJhX2JpdHNcbiAgICB0aGlzLmVsZW1zID0gMDtcdFx0Ly8gbWF4IG51bWJlciBvZiBlbGVtZW50cyBpbiB0aGUgdHJlZVxuICAgIHRoaXMubWF4X2xlbmd0aCA9IDA7XHQvLyBtYXggYml0IGxlbmd0aCBmb3IgdGhlIGNvZGVzXG4gICAgdGhpcy5tYXhfY29kZSA9IDA7XHRcdC8vIGxhcmdlc3QgY29kZSB3aXRoIG5vbiB6ZXJvIGZyZXF1ZW5jeVxufVxuXG4vKiBWYWx1ZXMgZm9yIG1heF9sYXp5X21hdGNoLCBnb29kX21hdGNoIGFuZCBtYXhfY2hhaW5fbGVuZ3RoLCBkZXBlbmRpbmcgb25cbiAqIHRoZSBkZXNpcmVkIHBhY2sgbGV2ZWwgKDAuLjkpLiBUaGUgdmFsdWVzIGdpdmVuIGJlbG93IGhhdmUgYmVlbiB0dW5lZCB0b1xuICogZXhjbHVkZSB3b3JzdCBjYXNlIHBlcmZvcm1hbmNlIGZvciBwYXRob2xvZ2ljYWwgZmlsZXMuIEJldHRlciB2YWx1ZXMgbWF5IGJlXG4gKiBmb3VuZCBmb3Igc3BlY2lmaWMgZmlsZXMuXG4gKi9cbnZhciB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24gPSBmdW5jdGlvbihhLCBiLCBjLCBkKSB7XG4gICAgdGhpcy5nb29kX2xlbmd0aCA9IGE7IC8vIHJlZHVjZSBsYXp5IHNlYXJjaCBhYm92ZSB0aGlzIG1hdGNoIGxlbmd0aFxuICAgIHRoaXMubWF4X2xhenkgPSBiOyAgICAvLyBkbyBub3QgcGVyZm9ybSBsYXp5IHNlYXJjaCBhYm92ZSB0aGlzIG1hdGNoIGxlbmd0aFxuICAgIHRoaXMubmljZV9sZW5ndGggPSBjOyAvLyBxdWl0IHNlYXJjaCBhYm92ZSB0aGlzIG1hdGNoIGxlbmd0aFxuICAgIHRoaXMubWF4X2NoYWluID0gZDtcbn1cblxudmFyIHppcF9EZWZsYXRlQnVmZmVyID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5uZXh0ID0gbnVsbDtcbiAgICB0aGlzLmxlbiA9IDA7XG4gICAgdGhpcy5wdHIgPSBuZXcgQXJyYXkoemlwX09VVEJVRlNJWik7XG4gICAgdGhpcy5vZmYgPSAwO1xufVxuXG4vKiBjb25zdGFudCB0YWJsZXMgKi9cbnZhciB6aXBfZXh0cmFfbGJpdHMgPSBuZXcgQXJyYXkoXG4gICAgMCwwLDAsMCwwLDAsMCwwLDEsMSwxLDEsMiwyLDIsMiwzLDMsMywzLDQsNCw0LDQsNSw1LDUsNSwwKTtcbnZhciB6aXBfZXh0cmFfZGJpdHMgPSBuZXcgQXJyYXkoXG4gICAgMCwwLDAsMCwxLDEsMiwyLDMsMyw0LDQsNSw1LDYsNiw3LDcsOCw4LDksOSwxMCwxMCwxMSwxMSwxMiwxMiwxMywxMyk7XG52YXIgemlwX2V4dHJhX2JsYml0cyA9IG5ldyBBcnJheShcbiAgICAwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDIsMyw3KTtcbnZhciB6aXBfYmxfb3JkZXIgPSBuZXcgQXJyYXkoXG4gICAgMTYsMTcsMTgsMCw4LDcsOSw2LDEwLDUsMTEsNCwxMiwzLDEzLDIsMTQsMSwxNSk7XG52YXIgemlwX2NvbmZpZ3VyYXRpb25fdGFibGUgPSBuZXcgQXJyYXkoXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oMCwgICAgMCwgICAwLCAgICAwKSxcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbig0LCAgICA0LCAgIDgsICAgIDQpLFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDQsICAgIDUsICAxNiwgICAgOCksXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oNCwgICAgNiwgIDMyLCAgIDMyKSxcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbig0LCAgICA0LCAgMTYsICAgMTYpLFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDgsICAgMTYsICAzMiwgICAzMiksXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oOCwgICAxNiwgMTI4LCAgMTI4KSxcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbig4LCAgIDMyLCAxMjgsICAyNTYpLFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDMyLCAxMjgsIDI1OCwgMTAyNCksXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oMzIsIDI1OCwgMjU4LCA0MDk2KSk7XG5cblxuLyogcm91dGluZXMgKGRlZmxhdGUpICovXG5cbnZhciB6aXBfZGVmbGF0ZV9zdGFydCA9IGZ1bmN0aW9uKGxldmVsKSB7XG4gICAgdmFyIGk7XG5cbiAgICBpZighbGV2ZWwpXG5cdGxldmVsID0gemlwX0RFRkFVTFRfTEVWRUw7XG4gICAgZWxzZSBpZihsZXZlbCA8IDEpXG5cdGxldmVsID0gMTtcbiAgICBlbHNlIGlmKGxldmVsID4gOSlcblx0bGV2ZWwgPSA5O1xuXG4gICAgemlwX2NvbXByX2xldmVsID0gbGV2ZWw7XG4gICAgemlwX2luaXRmbGFnID0gZmFsc2U7XG4gICAgemlwX2VvZmlsZSA9IGZhbHNlO1xuICAgIGlmKHppcF9vdXRidWYgIT0gbnVsbClcblx0cmV0dXJuO1xuXG4gICAgemlwX2ZyZWVfcXVldWUgPSB6aXBfcWhlYWQgPSB6aXBfcXRhaWwgPSBudWxsO1xuICAgIHppcF9vdXRidWYgPSBuZXcgQXJyYXkoemlwX09VVEJVRlNJWik7XG4gICAgemlwX3dpbmRvdyA9IG5ldyBBcnJheSh6aXBfd2luZG93X3NpemUpO1xuICAgIHppcF9kX2J1ZiA9IG5ldyBBcnJheSh6aXBfRElTVF9CVUZTSVpFKTtcbiAgICB6aXBfbF9idWYgPSBuZXcgQXJyYXkoemlwX0lOQlVGU0laICsgemlwX0lOQlVGX0VYVFJBKTtcbiAgICB6aXBfcHJldiA9IG5ldyBBcnJheSgxIDw8IHppcF9CSVRTKTtcbiAgICB6aXBfZHluX2x0cmVlID0gbmV3IEFycmF5KHppcF9IRUFQX1NJWkUpO1xuICAgIGZvcihpID0gMDsgaSA8IHppcF9IRUFQX1NJWkU7IGkrKylcblx0emlwX2R5bl9sdHJlZVtpXSA9IG5ldyB6aXBfRGVmbGF0ZUNUKCk7XG4gICAgemlwX2R5bl9kdHJlZSA9IG5ldyBBcnJheSgyKnppcF9EX0NPREVTKzEpO1xuICAgIGZvcihpID0gMDsgaSA8IDIqemlwX0RfQ09ERVMrMTsgaSsrKVxuXHR6aXBfZHluX2R0cmVlW2ldID0gbmV3IHppcF9EZWZsYXRlQ1QoKTtcbiAgICB6aXBfc3RhdGljX2x0cmVlID0gbmV3IEFycmF5KHppcF9MX0NPREVTKzIpO1xuICAgIGZvcihpID0gMDsgaSA8IHppcF9MX0NPREVTKzI7IGkrKylcblx0emlwX3N0YXRpY19sdHJlZVtpXSA9IG5ldyB6aXBfRGVmbGF0ZUNUKCk7XG4gICAgemlwX3N0YXRpY19kdHJlZSA9IG5ldyBBcnJheSh6aXBfRF9DT0RFUyk7XG4gICAgZm9yKGkgPSAwOyBpIDwgemlwX0RfQ09ERVM7IGkrKylcblx0emlwX3N0YXRpY19kdHJlZVtpXSA9IG5ldyB6aXBfRGVmbGF0ZUNUKCk7XG4gICAgemlwX2JsX3RyZWUgPSBuZXcgQXJyYXkoMip6aXBfQkxfQ09ERVMrMSk7XG4gICAgZm9yKGkgPSAwOyBpIDwgMip6aXBfQkxfQ09ERVMrMTsgaSsrKVxuXHR6aXBfYmxfdHJlZVtpXSA9IG5ldyB6aXBfRGVmbGF0ZUNUKCk7XG4gICAgemlwX2xfZGVzYyA9IG5ldyB6aXBfRGVmbGF0ZVRyZWVEZXNjKCk7XG4gICAgemlwX2RfZGVzYyA9IG5ldyB6aXBfRGVmbGF0ZVRyZWVEZXNjKCk7XG4gICAgemlwX2JsX2Rlc2MgPSBuZXcgemlwX0RlZmxhdGVUcmVlRGVzYygpO1xuICAgIHppcF9ibF9jb3VudCA9IG5ldyBBcnJheSh6aXBfTUFYX0JJVFMrMSk7XG4gICAgemlwX2hlYXAgPSBuZXcgQXJyYXkoMip6aXBfTF9DT0RFUysxKTtcbiAgICB6aXBfZGVwdGggPSBuZXcgQXJyYXkoMip6aXBfTF9DT0RFUysxKTtcbiAgICB6aXBfbGVuZ3RoX2NvZGUgPSBuZXcgQXJyYXkoemlwX01BWF9NQVRDSC16aXBfTUlOX01BVENIKzEpO1xuICAgIHppcF9kaXN0X2NvZGUgPSBuZXcgQXJyYXkoNTEyKTtcbiAgICB6aXBfYmFzZV9sZW5ndGggPSBuZXcgQXJyYXkoemlwX0xFTkdUSF9DT0RFUyk7XG4gICAgemlwX2Jhc2VfZGlzdCA9IG5ldyBBcnJheSh6aXBfRF9DT0RFUyk7XG4gICAgemlwX2ZsYWdfYnVmID0gbmV3IEFycmF5KHBhcnNlSW50KHppcF9MSVRfQlVGU0laRSAvIDgpKTtcbn1cblxudmFyIHppcF9kZWZsYXRlX2VuZCA9IGZ1bmN0aW9uKCkge1xuICAgIHppcF9mcmVlX3F1ZXVlID0gemlwX3FoZWFkID0gemlwX3F0YWlsID0gbnVsbDtcbiAgICB6aXBfb3V0YnVmID0gbnVsbDtcbiAgICB6aXBfd2luZG93ID0gbnVsbDtcbiAgICB6aXBfZF9idWYgPSBudWxsO1xuICAgIHppcF9sX2J1ZiA9IG51bGw7XG4gICAgemlwX3ByZXYgPSBudWxsO1xuICAgIHppcF9keW5fbHRyZWUgPSBudWxsO1xuICAgIHppcF9keW5fZHRyZWUgPSBudWxsO1xuICAgIHppcF9zdGF0aWNfbHRyZWUgPSBudWxsO1xuICAgIHppcF9zdGF0aWNfZHRyZWUgPSBudWxsO1xuICAgIHppcF9ibF90cmVlID0gbnVsbDtcbiAgICB6aXBfbF9kZXNjID0gbnVsbDtcbiAgICB6aXBfZF9kZXNjID0gbnVsbDtcbiAgICB6aXBfYmxfZGVzYyA9IG51bGw7XG4gICAgemlwX2JsX2NvdW50ID0gbnVsbDtcbiAgICB6aXBfaGVhcCA9IG51bGw7XG4gICAgemlwX2RlcHRoID0gbnVsbDtcbiAgICB6aXBfbGVuZ3RoX2NvZGUgPSBudWxsO1xuICAgIHppcF9kaXN0X2NvZGUgPSBudWxsO1xuICAgIHppcF9iYXNlX2xlbmd0aCA9IG51bGw7XG4gICAgemlwX2Jhc2VfZGlzdCA9IG51bGw7XG4gICAgemlwX2ZsYWdfYnVmID0gbnVsbDtcbn1cblxudmFyIHppcF9yZXVzZV9xdWV1ZSA9IGZ1bmN0aW9uKHApIHtcbiAgICBwLm5leHQgPSB6aXBfZnJlZV9xdWV1ZTtcbiAgICB6aXBfZnJlZV9xdWV1ZSA9IHA7XG59XG5cbnZhciB6aXBfbmV3X3F1ZXVlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHA7XG5cbiAgICBpZih6aXBfZnJlZV9xdWV1ZSAhPSBudWxsKVxuICAgIHtcblx0cCA9IHppcF9mcmVlX3F1ZXVlO1xuXHR6aXBfZnJlZV9xdWV1ZSA9IHppcF9mcmVlX3F1ZXVlLm5leHQ7XG4gICAgfVxuICAgIGVsc2Vcblx0cCA9IG5ldyB6aXBfRGVmbGF0ZUJ1ZmZlcigpO1xuICAgIHAubmV4dCA9IG51bGw7XG4gICAgcC5sZW4gPSBwLm9mZiA9IDA7XG5cbiAgICByZXR1cm4gcDtcbn1cblxudmFyIHppcF9oZWFkMSA9IGZ1bmN0aW9uKGkpIHtcbiAgICByZXR1cm4gemlwX3ByZXZbemlwX1dTSVpFICsgaV07XG59XG5cbnZhciB6aXBfaGVhZDIgPSBmdW5jdGlvbihpLCB2YWwpIHtcbiAgICByZXR1cm4gemlwX3ByZXZbemlwX1dTSVpFICsgaV0gPSB2YWw7XG59XG5cbi8qIHB1dF9ieXRlIGlzIHVzZWQgZm9yIHRoZSBjb21wcmVzc2VkIG91dHB1dCwgcHV0X3VieXRlIGZvciB0aGVcbiAqIHVuY29tcHJlc3NlZCBvdXRwdXQuIEhvd2V2ZXIgdW5sencoKSB1c2VzIHdpbmRvdyBmb3IgaXRzXG4gKiBzdWZmaXggdGFibGUgaW5zdGVhZCBvZiBpdHMgb3V0cHV0IGJ1ZmZlciwgc28gaXQgZG9lcyBub3QgdXNlIHB1dF91Ynl0ZVxuICogKHRvIGJlIGNsZWFuZWQgdXApLlxuICovXG52YXIgemlwX3B1dF9ieXRlID0gZnVuY3Rpb24oYykge1xuICAgIHppcF9vdXRidWZbemlwX291dG9mZiArIHppcF9vdXRjbnQrK10gPSBjO1xuICAgIGlmKHppcF9vdXRvZmYgKyB6aXBfb3V0Y250ID09IHppcF9PVVRCVUZTSVopXG5cdHppcF9xb3V0YnVmKCk7XG59XG5cbi8qIE91dHB1dCBhIDE2IGJpdCB2YWx1ZSwgbHNiIGZpcnN0ICovXG52YXIgemlwX3B1dF9zaG9ydCA9IGZ1bmN0aW9uKHcpIHtcbiAgICB3ICY9IDB4ZmZmZjtcbiAgICBpZih6aXBfb3V0b2ZmICsgemlwX291dGNudCA8IHppcF9PVVRCVUZTSVogLSAyKSB7XG5cdHppcF9vdXRidWZbemlwX291dG9mZiArIHppcF9vdXRjbnQrK10gPSAodyAmIDB4ZmYpO1xuXHR6aXBfb3V0YnVmW3ppcF9vdXRvZmYgKyB6aXBfb3V0Y250KytdID0gKHcgPj4+IDgpO1xuICAgIH0gZWxzZSB7XG5cdHppcF9wdXRfYnl0ZSh3ICYgMHhmZik7XG5cdHppcF9wdXRfYnl0ZSh3ID4+PiA4KTtcbiAgICB9XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBJbnNlcnQgc3RyaW5nIHMgaW4gdGhlIGRpY3Rpb25hcnkgYW5kIHNldCBtYXRjaF9oZWFkIHRvIHRoZSBwcmV2aW91cyBoZWFkXG4gKiBvZiB0aGUgaGFzaCBjaGFpbiAodGhlIG1vc3QgcmVjZW50IHN0cmluZyB3aXRoIHNhbWUgaGFzaCBrZXkpLiBSZXR1cm5cbiAqIHRoZSBwcmV2aW91cyBsZW5ndGggb2YgdGhlIGhhc2ggY2hhaW4uXG4gKiBJTiAgYXNzZXJ0aW9uOiBhbGwgY2FsbHMgdG8gdG8gSU5TRVJUX1NUUklORyBhcmUgbWFkZSB3aXRoIGNvbnNlY3V0aXZlXG4gKiAgICBpbnB1dCBjaGFyYWN0ZXJzIGFuZCB0aGUgZmlyc3QgTUlOX01BVENIIGJ5dGVzIG9mIHMgYXJlIHZhbGlkXG4gKiAgICAoZXhjZXB0IGZvciB0aGUgbGFzdCBNSU5fTUFUQ0gtMSBieXRlcyBvZiB0aGUgaW5wdXQgZmlsZSkuXG4gKi9cbnZhciB6aXBfSU5TRVJUX1NUUklORyA9IGZ1bmN0aW9uKCkge1xuICAgIHppcF9pbnNfaCA9ICgoemlwX2luc19oIDw8IHppcF9IX1NISUZUKVxuXHRcdCBeICh6aXBfd2luZG93W3ppcF9zdHJzdGFydCArIHppcF9NSU5fTUFUQ0ggLSAxXSAmIDB4ZmYpKVxuXHQmIHppcF9IQVNIX01BU0s7XG4gICAgemlwX2hhc2hfaGVhZCA9IHppcF9oZWFkMSh6aXBfaW5zX2gpO1xuICAgIHppcF9wcmV2W3ppcF9zdHJzdGFydCAmIHppcF9XTUFTS10gPSB6aXBfaGFzaF9oZWFkO1xuICAgIHppcF9oZWFkMih6aXBfaW5zX2gsIHppcF9zdHJzdGFydCk7XG59XG5cbi8qIFNlbmQgYSBjb2RlIG9mIHRoZSBnaXZlbiB0cmVlLiBjIGFuZCB0cmVlIG11c3Qgbm90IGhhdmUgc2lkZSBlZmZlY3RzICovXG52YXIgemlwX1NFTkRfQ09ERSA9IGZ1bmN0aW9uKGMsIHRyZWUpIHtcbiAgICB6aXBfc2VuZF9iaXRzKHRyZWVbY10uZmMsIHRyZWVbY10uZGwpO1xufVxuXG4vKiBNYXBwaW5nIGZyb20gYSBkaXN0YW5jZSB0byBhIGRpc3RhbmNlIGNvZGUuIGRpc3QgaXMgdGhlIGRpc3RhbmNlIC0gMSBhbmRcbiAqIG11c3Qgbm90IGhhdmUgc2lkZSBlZmZlY3RzLiBkaXN0X2NvZGVbMjU2XSBhbmQgZGlzdF9jb2RlWzI1N10gYXJlIG5ldmVyXG4gKiB1c2VkLlxuICovXG52YXIgemlwX0RfQ09ERSA9IGZ1bmN0aW9uKGRpc3QpIHtcbiAgICByZXR1cm4gKGRpc3QgPCAyNTYgPyB6aXBfZGlzdF9jb2RlW2Rpc3RdXG5cdCAgICA6IHppcF9kaXN0X2NvZGVbMjU2ICsgKGRpc3Q+PjcpXSkgJiAweGZmO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogQ29tcGFyZXMgdG8gc3VidHJlZXMsIHVzaW5nIHRoZSB0cmVlIGRlcHRoIGFzIHRpZSBicmVha2VyIHdoZW5cbiAqIHRoZSBzdWJ0cmVlcyBoYXZlIGVxdWFsIGZyZXF1ZW5jeS4gVGhpcyBtaW5pbWl6ZXMgdGhlIHdvcnN0IGNhc2UgbGVuZ3RoLlxuICovXG52YXIgemlwX1NNQUxMRVIgPSBmdW5jdGlvbih0cmVlLCBuLCBtKSB7XG4gICAgcmV0dXJuIHRyZWVbbl0uZmMgPCB0cmVlW21dLmZjIHx8XG4gICAgICAodHJlZVtuXS5mYyA9PSB0cmVlW21dLmZjICYmIHppcF9kZXB0aFtuXSA8PSB6aXBfZGVwdGhbbV0pO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogcmVhZCBzdHJpbmcgZGF0YVxuICovXG52YXIgemlwX3JlYWRfYnVmZiA9IGZ1bmN0aW9uKGJ1ZmYsIG9mZnNldCwgbikge1xuICAgIHZhciBpO1xuICAgIGZvcihpID0gMDsgaSA8IG4gJiYgemlwX2RlZmxhdGVfcG9zIDwgemlwX2RlZmxhdGVfZGF0YS5sZW5ndGg7IGkrKylcblx0YnVmZltvZmZzZXQgKyBpXSA9XG5cdCAgICB6aXBfZGVmbGF0ZV9kYXRhLmNoYXJDb2RlQXQoemlwX2RlZmxhdGVfcG9zKyspICYgMHhmZjtcbiAgICByZXR1cm4gaTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIEluaXRpYWxpemUgdGhlIFwibG9uZ2VzdCBtYXRjaFwiIHJvdXRpbmVzIGZvciBhIG5ldyBmaWxlXG4gKi9cbnZhciB6aXBfbG1faW5pdCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBqO1xuXG4gICAgLyogSW5pdGlhbGl6ZSB0aGUgaGFzaCB0YWJsZS4gKi9cbiAgICBmb3IoaiA9IDA7IGogPCB6aXBfSEFTSF9TSVpFOyBqKyspXG4vL1x0emlwX2hlYWQyKGosIHppcF9OSUwpO1xuXHR6aXBfcHJldlt6aXBfV1NJWkUgKyBqXSA9IDA7XG4gICAgLyogcHJldiB3aWxsIGJlIGluaXRpYWxpemVkIG9uIHRoZSBmbHkgKi9cblxuICAgIC8qIFNldCB0aGUgZGVmYXVsdCBjb25maWd1cmF0aW9uIHBhcmFtZXRlcnM6XG4gICAgICovXG4gICAgemlwX21heF9sYXp5X21hdGNoID0gemlwX2NvbmZpZ3VyYXRpb25fdGFibGVbemlwX2NvbXByX2xldmVsXS5tYXhfbGF6eTtcbiAgICB6aXBfZ29vZF9tYXRjaCAgICAgPSB6aXBfY29uZmlndXJhdGlvbl90YWJsZVt6aXBfY29tcHJfbGV2ZWxdLmdvb2RfbGVuZ3RoO1xuICAgIGlmKCF6aXBfRlVMTF9TRUFSQ0gpXG5cdHppcF9uaWNlX21hdGNoID0gemlwX2NvbmZpZ3VyYXRpb25fdGFibGVbemlwX2NvbXByX2xldmVsXS5uaWNlX2xlbmd0aDtcbiAgICB6aXBfbWF4X2NoYWluX2xlbmd0aCA9IHppcF9jb25maWd1cmF0aW9uX3RhYmxlW3ppcF9jb21wcl9sZXZlbF0ubWF4X2NoYWluO1xuXG4gICAgemlwX3N0cnN0YXJ0ID0gMDtcbiAgICB6aXBfYmxvY2tfc3RhcnQgPSAwO1xuXG4gICAgemlwX2xvb2thaGVhZCA9IHppcF9yZWFkX2J1ZmYoemlwX3dpbmRvdywgMCwgMiAqIHppcF9XU0laRSk7XG4gICAgaWYoemlwX2xvb2thaGVhZCA8PSAwKSB7XG5cdHppcF9lb2ZpbGUgPSB0cnVlO1xuXHR6aXBfbG9va2FoZWFkID0gMDtcblx0cmV0dXJuO1xuICAgIH1cbiAgICB6aXBfZW9maWxlID0gZmFsc2U7XG4gICAgLyogTWFrZSBzdXJlIHRoYXQgd2UgYWx3YXlzIGhhdmUgZW5vdWdoIGxvb2thaGVhZC4gVGhpcyBpcyBpbXBvcnRhbnRcbiAgICAgKiBpZiBpbnB1dCBjb21lcyBmcm9tIGEgZGV2aWNlIHN1Y2ggYXMgYSB0dHkuXG4gICAgICovXG4gICAgd2hpbGUoemlwX2xvb2thaGVhZCA8IHppcF9NSU5fTE9PS0FIRUFEICYmICF6aXBfZW9maWxlKVxuXHR6aXBfZmlsbF93aW5kb3coKTtcblxuICAgIC8qIElmIGxvb2thaGVhZCA8IE1JTl9NQVRDSCwgaW5zX2ggaXMgZ2FyYmFnZSwgYnV0IHRoaXMgaXNcbiAgICAgKiBub3QgaW1wb3J0YW50IHNpbmNlIG9ubHkgbGl0ZXJhbCBieXRlcyB3aWxsIGJlIGVtaXR0ZWQuXG4gICAgICovXG4gICAgemlwX2luc19oID0gMDtcbiAgICBmb3IoaiA9IDA7IGogPCB6aXBfTUlOX01BVENIIC0gMTsgaisrKSB7XG4vLyAgICAgIFVQREFURV9IQVNIKGluc19oLCB3aW5kb3dbal0pO1xuXHR6aXBfaW5zX2ggPSAoKHppcF9pbnNfaCA8PCB6aXBfSF9TSElGVCkgXiAoemlwX3dpbmRvd1tqXSAmIDB4ZmYpKSAmIHppcF9IQVNIX01BU0s7XG4gICAgfVxufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogU2V0IG1hdGNoX3N0YXJ0IHRvIHRoZSBsb25nZXN0IG1hdGNoIHN0YXJ0aW5nIGF0IHRoZSBnaXZlbiBzdHJpbmcgYW5kXG4gKiByZXR1cm4gaXRzIGxlbmd0aC4gTWF0Y2hlcyBzaG9ydGVyIG9yIGVxdWFsIHRvIHByZXZfbGVuZ3RoIGFyZSBkaXNjYXJkZWQsXG4gKiBpbiB3aGljaCBjYXNlIHRoZSByZXN1bHQgaXMgZXF1YWwgdG8gcHJldl9sZW5ndGggYW5kIG1hdGNoX3N0YXJ0IGlzXG4gKiBnYXJiYWdlLlxuICogSU4gYXNzZXJ0aW9uczogY3VyX21hdGNoIGlzIHRoZSBoZWFkIG9mIHRoZSBoYXNoIGNoYWluIGZvciB0aGUgY3VycmVudFxuICogICBzdHJpbmcgKHN0cnN0YXJ0KSBhbmQgaXRzIGRpc3RhbmNlIGlzIDw9IE1BWF9ESVNULCBhbmQgcHJldl9sZW5ndGggPj0gMVxuICovXG52YXIgemlwX2xvbmdlc3RfbWF0Y2ggPSBmdW5jdGlvbihjdXJfbWF0Y2gpIHtcbiAgICB2YXIgY2hhaW5fbGVuZ3RoID0gemlwX21heF9jaGFpbl9sZW5ndGg7IC8vIG1heCBoYXNoIGNoYWluIGxlbmd0aFxuICAgIHZhciBzY2FucCA9IHppcF9zdHJzdGFydDsgLy8gY3VycmVudCBzdHJpbmdcbiAgICB2YXIgbWF0Y2hwO1x0XHQvLyBtYXRjaGVkIHN0cmluZ1xuICAgIHZhciBsZW47XHRcdC8vIGxlbmd0aCBvZiBjdXJyZW50IG1hdGNoXG4gICAgdmFyIGJlc3RfbGVuID0gemlwX3ByZXZfbGVuZ3RoO1x0Ly8gYmVzdCBtYXRjaCBsZW5ndGggc28gZmFyXG5cbiAgICAvKiBTdG9wIHdoZW4gY3VyX21hdGNoIGJlY29tZXMgPD0gbGltaXQuIFRvIHNpbXBsaWZ5IHRoZSBjb2RlLFxuICAgICAqIHdlIHByZXZlbnQgbWF0Y2hlcyB3aXRoIHRoZSBzdHJpbmcgb2Ygd2luZG93IGluZGV4IDAuXG4gICAgICovXG4gICAgdmFyIGxpbWl0ID0gKHppcF9zdHJzdGFydCA+IHppcF9NQVhfRElTVCA/IHppcF9zdHJzdGFydCAtIHppcF9NQVhfRElTVCA6IHppcF9OSUwpO1xuXG4gICAgdmFyIHN0cmVuZHAgPSB6aXBfc3Ryc3RhcnQgKyB6aXBfTUFYX01BVENIO1xuICAgIHZhciBzY2FuX2VuZDEgPSB6aXBfd2luZG93W3NjYW5wICsgYmVzdF9sZW4gLSAxXTtcbiAgICB2YXIgc2Nhbl9lbmQgID0gemlwX3dpbmRvd1tzY2FucCArIGJlc3RfbGVuXTtcblxuICAgIC8qIERvIG5vdCB3YXN0ZSB0b28gbXVjaCB0aW1lIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGdvb2QgbWF0Y2g6ICovXG4gICAgaWYoemlwX3ByZXZfbGVuZ3RoID49IHppcF9nb29kX21hdGNoKVxuXHRjaGFpbl9sZW5ndGggPj49IDI7XG5cbi8vICBBc3NlcnQoZW5jb2Rlci0+c3Ryc3RhcnQgPD0gd2luZG93X3NpemUtTUlOX0xPT0tBSEVBRCwgXCJpbnN1ZmZpY2llbnQgbG9va2FoZWFkXCIpO1xuXG4gICAgZG8ge1xuLy8gICAgQXNzZXJ0KGN1cl9tYXRjaCA8IGVuY29kZXItPnN0cnN0YXJ0LCBcIm5vIGZ1dHVyZVwiKTtcblx0bWF0Y2hwID0gY3VyX21hdGNoO1xuXG5cdC8qIFNraXAgdG8gbmV4dCBtYXRjaCBpZiB0aGUgbWF0Y2ggbGVuZ3RoIGNhbm5vdCBpbmNyZWFzZVxuXHQgICAgKiBvciBpZiB0aGUgbWF0Y2ggbGVuZ3RoIGlzIGxlc3MgdGhhbiAyOlxuXHQqL1xuXHRpZih6aXBfd2luZG93W21hdGNocCArIGJlc3RfbGVuXVx0IT0gc2Nhbl9lbmQgIHx8XG5cdCAgIHppcF93aW5kb3dbbWF0Y2hwICsgYmVzdF9sZW4gLSAxXVx0IT0gc2Nhbl9lbmQxIHx8XG5cdCAgIHppcF93aW5kb3dbbWF0Y2hwXVx0XHRcdCE9IHppcF93aW5kb3dbc2NhbnBdIHx8XG5cdCAgIHppcF93aW5kb3dbKyttYXRjaHBdXHRcdFx0IT0gemlwX3dpbmRvd1tzY2FucCArIDFdKSB7XG5cdCAgICBjb250aW51ZTtcblx0fVxuXG5cdC8qIFRoZSBjaGVjayBhdCBiZXN0X2xlbi0xIGNhbiBiZSByZW1vdmVkIGJlY2F1c2UgaXQgd2lsbCBiZSBtYWRlXG4gICAgICAgICAqIGFnYWluIGxhdGVyLiAoVGhpcyBoZXVyaXN0aWMgaXMgbm90IGFsd2F5cyBhIHdpbi4pXG4gICAgICAgICAqIEl0IGlzIG5vdCBuZWNlc3NhcnkgdG8gY29tcGFyZSBzY2FuWzJdIGFuZCBtYXRjaFsyXSBzaW5jZSB0aGV5XG4gICAgICAgICAqIGFyZSBhbHdheXMgZXF1YWwgd2hlbiB0aGUgb3RoZXIgYnl0ZXMgbWF0Y2gsIGdpdmVuIHRoYXRcbiAgICAgICAgICogdGhlIGhhc2gga2V5cyBhcmUgZXF1YWwgYW5kIHRoYXQgSEFTSF9CSVRTID49IDguXG4gICAgICAgICAqL1xuXHRzY2FucCArPSAyO1xuXHRtYXRjaHArKztcblxuXHQvKiBXZSBjaGVjayBmb3IgaW5zdWZmaWNpZW50IGxvb2thaGVhZCBvbmx5IGV2ZXJ5IDh0aCBjb21wYXJpc29uO1xuICAgICAgICAgKiB0aGUgMjU2dGggY2hlY2sgd2lsbCBiZSBtYWRlIGF0IHN0cnN0YXJ0KzI1OC5cbiAgICAgICAgICovXG5cdGRvIHtcblx0fSB3aGlsZSh6aXBfd2luZG93Wysrc2NhbnBdID09IHppcF93aW5kb3dbKyttYXRjaHBdICYmXG5cdFx0emlwX3dpbmRvd1srK3NjYW5wXSA9PSB6aXBfd2luZG93WysrbWF0Y2hwXSAmJlxuXHRcdHppcF93aW5kb3dbKytzY2FucF0gPT0gemlwX3dpbmRvd1srK21hdGNocF0gJiZcblx0XHR6aXBfd2luZG93Wysrc2NhbnBdID09IHppcF93aW5kb3dbKyttYXRjaHBdICYmXG5cdFx0emlwX3dpbmRvd1srK3NjYW5wXSA9PSB6aXBfd2luZG93WysrbWF0Y2hwXSAmJlxuXHRcdHppcF93aW5kb3dbKytzY2FucF0gPT0gemlwX3dpbmRvd1srK21hdGNocF0gJiZcblx0XHR6aXBfd2luZG93Wysrc2NhbnBdID09IHppcF93aW5kb3dbKyttYXRjaHBdICYmXG5cdFx0emlwX3dpbmRvd1srK3NjYW5wXSA9PSB6aXBfd2luZG93WysrbWF0Y2hwXSAmJlxuXHRcdHNjYW5wIDwgc3RyZW5kcCk7XG5cbiAgICAgIGxlbiA9IHppcF9NQVhfTUFUQ0ggLSAoc3RyZW5kcCAtIHNjYW5wKTtcbiAgICAgIHNjYW5wID0gc3RyZW5kcCAtIHppcF9NQVhfTUFUQ0g7XG5cbiAgICAgIGlmKGxlbiA+IGJlc3RfbGVuKSB7XG5cdCAgemlwX21hdGNoX3N0YXJ0ID0gY3VyX21hdGNoO1xuXHQgIGJlc3RfbGVuID0gbGVuO1xuXHQgIGlmKHppcF9GVUxMX1NFQVJDSCkge1xuXHQgICAgICBpZihsZW4gPj0gemlwX01BWF9NQVRDSCkgYnJlYWs7XG5cdCAgfSBlbHNlIHtcblx0ICAgICAgaWYobGVuID49IHppcF9uaWNlX21hdGNoKSBicmVhaztcblx0ICB9XG5cblx0ICBzY2FuX2VuZDEgID0gemlwX3dpbmRvd1tzY2FucCArIGJlc3RfbGVuLTFdO1xuXHQgIHNjYW5fZW5kICAgPSB6aXBfd2luZG93W3NjYW5wICsgYmVzdF9sZW5dO1xuICAgICAgfVxuICAgIH0gd2hpbGUoKGN1cl9tYXRjaCA9IHppcF9wcmV2W2N1cl9tYXRjaCAmIHppcF9XTUFTS10pID4gbGltaXRcblx0ICAgICYmIC0tY2hhaW5fbGVuZ3RoICE9IDApO1xuXG4gICAgcmV0dXJuIGJlc3RfbGVuO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogRmlsbCB0aGUgd2luZG93IHdoZW4gdGhlIGxvb2thaGVhZCBiZWNvbWVzIGluc3VmZmljaWVudC5cbiAqIFVwZGF0ZXMgc3Ryc3RhcnQgYW5kIGxvb2thaGVhZCwgYW5kIHNldHMgZW9maWxlIGlmIGVuZCBvZiBpbnB1dCBmaWxlLlxuICogSU4gYXNzZXJ0aW9uOiBsb29rYWhlYWQgPCBNSU5fTE9PS0FIRUFEICYmIHN0cnN0YXJ0ICsgbG9va2FoZWFkID4gMFxuICogT1VUIGFzc2VydGlvbnM6IGF0IGxlYXN0IG9uZSBieXRlIGhhcyBiZWVuIHJlYWQsIG9yIGVvZmlsZSBpcyBzZXQ7XG4gKiAgICBmaWxlIHJlYWRzIGFyZSBwZXJmb3JtZWQgZm9yIGF0IGxlYXN0IHR3byBieXRlcyAocmVxdWlyZWQgZm9yIHRoZVxuICogICAgdHJhbnNsYXRlX2VvbCBvcHRpb24pLlxuICovXG52YXIgemlwX2ZpbGxfd2luZG93ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG4sIG07XG5cbiAgICAvLyBBbW91bnQgb2YgZnJlZSBzcGFjZSBhdCB0aGUgZW5kIG9mIHRoZSB3aW5kb3cuXG4gICAgdmFyIG1vcmUgPSB6aXBfd2luZG93X3NpemUgLSB6aXBfbG9va2FoZWFkIC0gemlwX3N0cnN0YXJ0O1xuXG4gICAgLyogSWYgdGhlIHdpbmRvdyBpcyBhbG1vc3QgZnVsbCBhbmQgdGhlcmUgaXMgaW5zdWZmaWNpZW50IGxvb2thaGVhZCxcbiAgICAgKiBtb3ZlIHRoZSB1cHBlciBoYWxmIHRvIHRoZSBsb3dlciBvbmUgdG8gbWFrZSByb29tIGluIHRoZSB1cHBlciBoYWxmLlxuICAgICAqL1xuICAgIGlmKG1vcmUgPT0gLTEpIHtcblx0LyogVmVyeSB1bmxpa2VseSwgYnV0IHBvc3NpYmxlIG9uIDE2IGJpdCBtYWNoaW5lIGlmIHN0cnN0YXJ0ID09IDBcbiAgICAgICAgICogYW5kIGxvb2thaGVhZCA9PSAxIChpbnB1dCBkb25lIG9uZSBieXRlIGF0IHRpbWUpXG4gICAgICAgICAqL1xuXHRtb3JlLS07XG4gICAgfSBlbHNlIGlmKHppcF9zdHJzdGFydCA+PSB6aXBfV1NJWkUgKyB6aXBfTUFYX0RJU1QpIHtcblx0LyogQnkgdGhlIElOIGFzc2VydGlvbiwgdGhlIHdpbmRvdyBpcyBub3QgZW1wdHkgc28gd2UgY2FuJ3QgY29uZnVzZVxuICAgICAgICAgKiBtb3JlID09IDAgd2l0aCBtb3JlID09IDY0SyBvbiBhIDE2IGJpdCBtYWNoaW5lLlxuICAgICAgICAgKi9cbi8vXHRBc3NlcnQod2luZG93X3NpemUgPT0gKHVsZykyKldTSVpFLCBcIm5vIHNsaWRpbmcgd2l0aCBCSUdfTUVNXCIpO1xuXG4vL1x0U3lzdGVtLmFycmF5Y29weSh3aW5kb3csIFdTSVpFLCB3aW5kb3csIDAsIFdTSVpFKTtcblx0Zm9yKG4gPSAwOyBuIDwgemlwX1dTSVpFOyBuKyspXG5cdCAgICB6aXBfd2luZG93W25dID0gemlwX3dpbmRvd1tuICsgemlwX1dTSVpFXTtcbiAgICAgIFxuXHR6aXBfbWF0Y2hfc3RhcnQgLT0gemlwX1dTSVpFO1xuXHR6aXBfc3Ryc3RhcnQgICAgLT0gemlwX1dTSVpFOyAvKiB3ZSBub3cgaGF2ZSBzdHJzdGFydCA+PSBNQVhfRElTVDogKi9cblx0emlwX2Jsb2NrX3N0YXJ0IC09IHppcF9XU0laRTtcblxuXHRmb3IobiA9IDA7IG4gPCB6aXBfSEFTSF9TSVpFOyBuKyspIHtcblx0ICAgIG0gPSB6aXBfaGVhZDEobik7XG5cdCAgICB6aXBfaGVhZDIobiwgbSA+PSB6aXBfV1NJWkUgPyBtIC0gemlwX1dTSVpFIDogemlwX05JTCk7XG5cdH1cblx0Zm9yKG4gPSAwOyBuIDwgemlwX1dTSVpFOyBuKyspIHtcblx0ICAgIC8qIElmIG4gaXMgbm90IG9uIGFueSBoYXNoIGNoYWluLCBwcmV2W25dIGlzIGdhcmJhZ2UgYnV0XG5cdCAgICAgKiBpdHMgdmFsdWUgd2lsbCBuZXZlciBiZSB1c2VkLlxuXHQgICAgICovXG5cdCAgICBtID0gemlwX3ByZXZbbl07XG5cdCAgICB6aXBfcHJldltuXSA9IChtID49IHppcF9XU0laRSA/IG0gLSB6aXBfV1NJWkUgOiB6aXBfTklMKTtcblx0fVxuXHRtb3JlICs9IHppcF9XU0laRTtcbiAgICB9XG4gICAgLy8gQXQgdGhpcyBwb2ludCwgbW9yZSA+PSAyXG4gICAgaWYoIXppcF9lb2ZpbGUpIHtcblx0biA9IHppcF9yZWFkX2J1ZmYoemlwX3dpbmRvdywgemlwX3N0cnN0YXJ0ICsgemlwX2xvb2thaGVhZCwgbW9yZSk7XG5cdGlmKG4gPD0gMClcblx0ICAgIHppcF9lb2ZpbGUgPSB0cnVlO1xuXHRlbHNlXG5cdCAgICB6aXBfbG9va2FoZWFkICs9IG47XG4gICAgfVxufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogUHJvY2Vzc2VzIGEgbmV3IGlucHV0IGZpbGUgYW5kIHJldHVybiBpdHMgY29tcHJlc3NlZCBsZW5ndGguIFRoaXNcbiAqIGZ1bmN0aW9uIGRvZXMgbm90IHBlcmZvcm0gbGF6eSBldmFsdWF0aW9ub2YgbWF0Y2hlcyBhbmQgaW5zZXJ0c1xuICogbmV3IHN0cmluZ3MgaW4gdGhlIGRpY3Rpb25hcnkgb25seSBmb3IgdW5tYXRjaGVkIHN0cmluZ3Mgb3IgZm9yIHNob3J0XG4gKiBtYXRjaGVzLiBJdCBpcyB1c2VkIG9ubHkgZm9yIHRoZSBmYXN0IGNvbXByZXNzaW9uIG9wdGlvbnMuXG4gKi9cbnZhciB6aXBfZGVmbGF0ZV9mYXN0ID0gZnVuY3Rpb24oKSB7XG4gICAgd2hpbGUoemlwX2xvb2thaGVhZCAhPSAwICYmIHppcF9xaGVhZCA9PSBudWxsKSB7XG5cdHZhciBmbHVzaDsgLy8gc2V0IGlmIGN1cnJlbnQgYmxvY2sgbXVzdCBiZSBmbHVzaGVkXG5cblx0LyogSW5zZXJ0IHRoZSBzdHJpbmcgd2luZG93W3N0cnN0YXJ0IC4uIHN0cnN0YXJ0KzJdIGluIHRoZVxuXHQgKiBkaWN0aW9uYXJ5LCBhbmQgc2V0IGhhc2hfaGVhZCB0byB0aGUgaGVhZCBvZiB0aGUgaGFzaCBjaGFpbjpcblx0ICovXG5cdHppcF9JTlNFUlRfU1RSSU5HKCk7XG5cblx0LyogRmluZCB0aGUgbG9uZ2VzdCBtYXRjaCwgZGlzY2FyZGluZyB0aG9zZSA8PSBwcmV2X2xlbmd0aC5cblx0ICogQXQgdGhpcyBwb2ludCB3ZSBoYXZlIGFsd2F5cyBtYXRjaF9sZW5ndGggPCBNSU5fTUFUQ0hcblx0ICovXG5cdGlmKHppcF9oYXNoX2hlYWQgIT0gemlwX05JTCAmJlxuXHQgICB6aXBfc3Ryc3RhcnQgLSB6aXBfaGFzaF9oZWFkIDw9IHppcF9NQVhfRElTVCkge1xuXHQgICAgLyogVG8gc2ltcGxpZnkgdGhlIGNvZGUsIHdlIHByZXZlbnQgbWF0Y2hlcyB3aXRoIHRoZSBzdHJpbmdcblx0ICAgICAqIG9mIHdpbmRvdyBpbmRleCAwIChpbiBwYXJ0aWN1bGFyIHdlIGhhdmUgdG8gYXZvaWQgYSBtYXRjaFxuXHQgICAgICogb2YgdGhlIHN0cmluZyB3aXRoIGl0c2VsZiBhdCB0aGUgc3RhcnQgb2YgdGhlIGlucHV0IGZpbGUpLlxuXHQgICAgICovXG5cdCAgICB6aXBfbWF0Y2hfbGVuZ3RoID0gemlwX2xvbmdlc3RfbWF0Y2goemlwX2hhc2hfaGVhZCk7XG5cdCAgICAvKiBsb25nZXN0X21hdGNoKCkgc2V0cyBtYXRjaF9zdGFydCAqL1xuXHQgICAgaWYoemlwX21hdGNoX2xlbmd0aCA+IHppcF9sb29rYWhlYWQpXG5cdFx0emlwX21hdGNoX2xlbmd0aCA9IHppcF9sb29rYWhlYWQ7XG5cdH1cblx0aWYoemlwX21hdGNoX2xlbmd0aCA+PSB6aXBfTUlOX01BVENIKSB7XG4vL1x0ICAgIGNoZWNrX21hdGNoKHN0cnN0YXJ0LCBtYXRjaF9zdGFydCwgbWF0Y2hfbGVuZ3RoKTtcblxuXHQgICAgZmx1c2ggPSB6aXBfY3RfdGFsbHkoemlwX3N0cnN0YXJ0IC0gemlwX21hdGNoX3N0YXJ0LFxuXHRcdFx0XHQgemlwX21hdGNoX2xlbmd0aCAtIHppcF9NSU5fTUFUQ0gpO1xuXHQgICAgemlwX2xvb2thaGVhZCAtPSB6aXBfbWF0Y2hfbGVuZ3RoO1xuXG5cdCAgICAvKiBJbnNlcnQgbmV3IHN0cmluZ3MgaW4gdGhlIGhhc2ggdGFibGUgb25seSBpZiB0aGUgbWF0Y2ggbGVuZ3RoXG5cdCAgICAgKiBpcyBub3QgdG9vIGxhcmdlLiBUaGlzIHNhdmVzIHRpbWUgYnV0IGRlZ3JhZGVzIGNvbXByZXNzaW9uLlxuXHQgICAgICovXG5cdCAgICBpZih6aXBfbWF0Y2hfbGVuZ3RoIDw9IHppcF9tYXhfbGF6eV9tYXRjaCkge1xuXHRcdHppcF9tYXRjaF9sZW5ndGgtLTsgLy8gc3RyaW5nIGF0IHN0cnN0YXJ0IGFscmVhZHkgaW4gaGFzaCB0YWJsZVxuXHRcdGRvIHtcblx0XHQgICAgemlwX3N0cnN0YXJ0Kys7XG5cdFx0ICAgIHppcF9JTlNFUlRfU1RSSU5HKCk7XG5cdFx0ICAgIC8qIHN0cnN0YXJ0IG5ldmVyIGV4Y2VlZHMgV1NJWkUtTUFYX01BVENILCBzbyB0aGVyZSBhcmVcblx0XHQgICAgICogYWx3YXlzIE1JTl9NQVRDSCBieXRlcyBhaGVhZC4gSWYgbG9va2FoZWFkIDwgTUlOX01BVENIXG5cdFx0ICAgICAqIHRoZXNlIGJ5dGVzIGFyZSBnYXJiYWdlLCBidXQgaXQgZG9lcyBub3QgbWF0dGVyIHNpbmNlXG5cdFx0ICAgICAqIHRoZSBuZXh0IGxvb2thaGVhZCBieXRlcyB3aWxsIGJlIGVtaXR0ZWQgYXMgbGl0ZXJhbHMuXG5cdFx0ICAgICAqL1xuXHRcdH0gd2hpbGUoLS16aXBfbWF0Y2hfbGVuZ3RoICE9IDApO1xuXHRcdHppcF9zdHJzdGFydCsrO1xuXHQgICAgfSBlbHNlIHtcblx0XHR6aXBfc3Ryc3RhcnQgKz0gemlwX21hdGNoX2xlbmd0aDtcblx0XHR6aXBfbWF0Y2hfbGVuZ3RoID0gMDtcblx0XHR6aXBfaW5zX2ggPSB6aXBfd2luZG93W3ppcF9zdHJzdGFydF0gJiAweGZmO1xuLy9cdFx0VVBEQVRFX0hBU0goaW5zX2gsIHdpbmRvd1tzdHJzdGFydCArIDFdKTtcblx0XHR6aXBfaW5zX2ggPSAoKHppcF9pbnNfaDw8emlwX0hfU0hJRlQpIF4gKHppcF93aW5kb3dbemlwX3N0cnN0YXJ0ICsgMV0gJiAweGZmKSkgJiB6aXBfSEFTSF9NQVNLO1xuXG4vLyNpZiBNSU5fTUFUQ0ggIT0gM1xuLy9cdFx0Q2FsbCBVUERBVEVfSEFTSCgpIE1JTl9NQVRDSC0zIG1vcmUgdGltZXNcbi8vI2VuZGlmXG5cblx0ICAgIH1cblx0fSBlbHNlIHtcblx0ICAgIC8qIE5vIG1hdGNoLCBvdXRwdXQgYSBsaXRlcmFsIGJ5dGUgKi9cblx0ICAgIGZsdXNoID0gemlwX2N0X3RhbGx5KDAsIHppcF93aW5kb3dbemlwX3N0cnN0YXJ0XSAmIDB4ZmYpO1xuXHQgICAgemlwX2xvb2thaGVhZC0tO1xuXHQgICAgemlwX3N0cnN0YXJ0Kys7XG5cdH1cblx0aWYoZmx1c2gpIHtcblx0ICAgIHppcF9mbHVzaF9ibG9jaygwKTtcblx0ICAgIHppcF9ibG9ja19zdGFydCA9IHppcF9zdHJzdGFydDtcblx0fVxuXG5cdC8qIE1ha2Ugc3VyZSB0aGF0IHdlIGFsd2F5cyBoYXZlIGVub3VnaCBsb29rYWhlYWQsIGV4Y2VwdFxuXHQgKiBhdCB0aGUgZW5kIG9mIHRoZSBpbnB1dCBmaWxlLiBXZSBuZWVkIE1BWF9NQVRDSCBieXRlc1xuXHQgKiBmb3IgdGhlIG5leHQgbWF0Y2gsIHBsdXMgTUlOX01BVENIIGJ5dGVzIHRvIGluc2VydCB0aGVcblx0ICogc3RyaW5nIGZvbGxvd2luZyB0aGUgbmV4dCBtYXRjaC5cblx0ICovXG5cdHdoaWxlKHppcF9sb29rYWhlYWQgPCB6aXBfTUlOX0xPT0tBSEVBRCAmJiAhemlwX2VvZmlsZSlcblx0ICAgIHppcF9maWxsX3dpbmRvdygpO1xuICAgIH1cbn1cblxudmFyIHppcF9kZWZsYXRlX2JldHRlciA9IGZ1bmN0aW9uKCkge1xuICAgIC8qIFByb2Nlc3MgdGhlIGlucHV0IGJsb2NrLiAqL1xuICAgIHdoaWxlKHppcF9sb29rYWhlYWQgIT0gMCAmJiB6aXBfcWhlYWQgPT0gbnVsbCkge1xuXHQvKiBJbnNlcnQgdGhlIHN0cmluZyB3aW5kb3dbc3Ryc3RhcnQgLi4gc3Ryc3RhcnQrMl0gaW4gdGhlXG5cdCAqIGRpY3Rpb25hcnksIGFuZCBzZXQgaGFzaF9oZWFkIHRvIHRoZSBoZWFkIG9mIHRoZSBoYXNoIGNoYWluOlxuXHQgKi9cblx0emlwX0lOU0VSVF9TVFJJTkcoKTtcblxuXHQvKiBGaW5kIHRoZSBsb25nZXN0IG1hdGNoLCBkaXNjYXJkaW5nIHRob3NlIDw9IHByZXZfbGVuZ3RoLlxuXHQgKi9cblx0emlwX3ByZXZfbGVuZ3RoID0gemlwX21hdGNoX2xlbmd0aDtcblx0emlwX3ByZXZfbWF0Y2ggPSB6aXBfbWF0Y2hfc3RhcnQ7XG5cdHppcF9tYXRjaF9sZW5ndGggPSB6aXBfTUlOX01BVENIIC0gMTtcblxuXHRpZih6aXBfaGFzaF9oZWFkICE9IHppcF9OSUwgJiZcblx0ICAgemlwX3ByZXZfbGVuZ3RoIDwgemlwX21heF9sYXp5X21hdGNoICYmXG5cdCAgIHppcF9zdHJzdGFydCAtIHppcF9oYXNoX2hlYWQgPD0gemlwX01BWF9ESVNUKSB7XG5cdCAgICAvKiBUbyBzaW1wbGlmeSB0aGUgY29kZSwgd2UgcHJldmVudCBtYXRjaGVzIHdpdGggdGhlIHN0cmluZ1xuXHQgICAgICogb2Ygd2luZG93IGluZGV4IDAgKGluIHBhcnRpY3VsYXIgd2UgaGF2ZSB0byBhdm9pZCBhIG1hdGNoXG5cdCAgICAgKiBvZiB0aGUgc3RyaW5nIHdpdGggaXRzZWxmIGF0IHRoZSBzdGFydCBvZiB0aGUgaW5wdXQgZmlsZSkuXG5cdCAgICAgKi9cblx0ICAgIHppcF9tYXRjaF9sZW5ndGggPSB6aXBfbG9uZ2VzdF9tYXRjaCh6aXBfaGFzaF9oZWFkKTtcblx0ICAgIC8qIGxvbmdlc3RfbWF0Y2goKSBzZXRzIG1hdGNoX3N0YXJ0ICovXG5cdCAgICBpZih6aXBfbWF0Y2hfbGVuZ3RoID4gemlwX2xvb2thaGVhZClcblx0XHR6aXBfbWF0Y2hfbGVuZ3RoID0gemlwX2xvb2thaGVhZDtcblxuXHQgICAgLyogSWdub3JlIGEgbGVuZ3RoIDMgbWF0Y2ggaWYgaXQgaXMgdG9vIGRpc3RhbnQ6ICovXG5cdCAgICBpZih6aXBfbWF0Y2hfbGVuZ3RoID09IHppcF9NSU5fTUFUQ0ggJiZcblx0ICAgICAgIHppcF9zdHJzdGFydCAtIHppcF9tYXRjaF9zdGFydCA+IHppcF9UT09fRkFSKSB7XG5cdFx0LyogSWYgcHJldl9tYXRjaCBpcyBhbHNvIE1JTl9NQVRDSCwgbWF0Y2hfc3RhcnQgaXMgZ2FyYmFnZVxuXHRcdCAqIGJ1dCB3ZSB3aWxsIGlnbm9yZSB0aGUgY3VycmVudCBtYXRjaCBhbnl3YXkuXG5cdFx0ICovXG5cdFx0emlwX21hdGNoX2xlbmd0aC0tO1xuXHQgICAgfVxuXHR9XG5cdC8qIElmIHRoZXJlIHdhcyBhIG1hdGNoIGF0IHRoZSBwcmV2aW91cyBzdGVwIGFuZCB0aGUgY3VycmVudFxuXHQgKiBtYXRjaCBpcyBub3QgYmV0dGVyLCBvdXRwdXQgdGhlIHByZXZpb3VzIG1hdGNoOlxuXHQgKi9cblx0aWYoemlwX3ByZXZfbGVuZ3RoID49IHppcF9NSU5fTUFUQ0ggJiZcblx0ICAgemlwX21hdGNoX2xlbmd0aCA8PSB6aXBfcHJldl9sZW5ndGgpIHtcblx0ICAgIHZhciBmbHVzaDsgLy8gc2V0IGlmIGN1cnJlbnQgYmxvY2sgbXVzdCBiZSBmbHVzaGVkXG5cbi8vXHQgICAgY2hlY2tfbWF0Y2goc3Ryc3RhcnQgLSAxLCBwcmV2X21hdGNoLCBwcmV2X2xlbmd0aCk7XG5cdCAgICBmbHVzaCA9IHppcF9jdF90YWxseSh6aXBfc3Ryc3RhcnQgLSAxIC0gemlwX3ByZXZfbWF0Y2gsXG5cdFx0XHRcdCB6aXBfcHJldl9sZW5ndGggLSB6aXBfTUlOX01BVENIKTtcblxuXHQgICAgLyogSW5zZXJ0IGluIGhhc2ggdGFibGUgYWxsIHN0cmluZ3MgdXAgdG8gdGhlIGVuZCBvZiB0aGUgbWF0Y2guXG5cdCAgICAgKiBzdHJzdGFydC0xIGFuZCBzdHJzdGFydCBhcmUgYWxyZWFkeSBpbnNlcnRlZC5cblx0ICAgICAqL1xuXHQgICAgemlwX2xvb2thaGVhZCAtPSB6aXBfcHJldl9sZW5ndGggLSAxO1xuXHQgICAgemlwX3ByZXZfbGVuZ3RoIC09IDI7XG5cdCAgICBkbyB7XG5cdFx0emlwX3N0cnN0YXJ0Kys7XG5cdFx0emlwX0lOU0VSVF9TVFJJTkcoKTtcblx0XHQvKiBzdHJzdGFydCBuZXZlciBleGNlZWRzIFdTSVpFLU1BWF9NQVRDSCwgc28gdGhlcmUgYXJlXG5cdFx0ICogYWx3YXlzIE1JTl9NQVRDSCBieXRlcyBhaGVhZC4gSWYgbG9va2FoZWFkIDwgTUlOX01BVENIXG5cdFx0ICogdGhlc2UgYnl0ZXMgYXJlIGdhcmJhZ2UsIGJ1dCBpdCBkb2VzIG5vdCBtYXR0ZXIgc2luY2UgdGhlXG5cdFx0ICogbmV4dCBsb29rYWhlYWQgYnl0ZXMgd2lsbCBhbHdheXMgYmUgZW1pdHRlZCBhcyBsaXRlcmFscy5cblx0XHQgKi9cblx0ICAgIH0gd2hpbGUoLS16aXBfcHJldl9sZW5ndGggIT0gMCk7XG5cdCAgICB6aXBfbWF0Y2hfYXZhaWxhYmxlID0gMDtcblx0ICAgIHppcF9tYXRjaF9sZW5ndGggPSB6aXBfTUlOX01BVENIIC0gMTtcblx0ICAgIHppcF9zdHJzdGFydCsrO1xuXHQgICAgaWYoZmx1c2gpIHtcblx0XHR6aXBfZmx1c2hfYmxvY2soMCk7XG5cdFx0emlwX2Jsb2NrX3N0YXJ0ID0gemlwX3N0cnN0YXJ0O1xuXHQgICAgfVxuXHR9IGVsc2UgaWYoemlwX21hdGNoX2F2YWlsYWJsZSAhPSAwKSB7XG5cdCAgICAvKiBJZiB0aGVyZSB3YXMgbm8gbWF0Y2ggYXQgdGhlIHByZXZpb3VzIHBvc2l0aW9uLCBvdXRwdXQgYVxuXHQgICAgICogc2luZ2xlIGxpdGVyYWwuIElmIHRoZXJlIHdhcyBhIG1hdGNoIGJ1dCB0aGUgY3VycmVudCBtYXRjaFxuXHQgICAgICogaXMgbG9uZ2VyLCB0cnVuY2F0ZSB0aGUgcHJldmlvdXMgbWF0Y2ggdG8gYSBzaW5nbGUgbGl0ZXJhbC5cblx0ICAgICAqL1xuXHQgICAgaWYoemlwX2N0X3RhbGx5KDAsIHppcF93aW5kb3dbemlwX3N0cnN0YXJ0IC0gMV0gJiAweGZmKSkge1xuXHRcdHppcF9mbHVzaF9ibG9jaygwKTtcblx0XHR6aXBfYmxvY2tfc3RhcnQgPSB6aXBfc3Ryc3RhcnQ7XG5cdCAgICB9XG5cdCAgICB6aXBfc3Ryc3RhcnQrKztcblx0ICAgIHppcF9sb29rYWhlYWQtLTtcblx0fSBlbHNlIHtcblx0ICAgIC8qIFRoZXJlIGlzIG5vIHByZXZpb3VzIG1hdGNoIHRvIGNvbXBhcmUgd2l0aCwgd2FpdCBmb3Jcblx0ICAgICAqIHRoZSBuZXh0IHN0ZXAgdG8gZGVjaWRlLlxuXHQgICAgICovXG5cdCAgICB6aXBfbWF0Y2hfYXZhaWxhYmxlID0gMTtcblx0ICAgIHppcF9zdHJzdGFydCsrO1xuXHQgICAgemlwX2xvb2thaGVhZC0tO1xuXHR9XG5cblx0LyogTWFrZSBzdXJlIHRoYXQgd2UgYWx3YXlzIGhhdmUgZW5vdWdoIGxvb2thaGVhZCwgZXhjZXB0XG5cdCAqIGF0IHRoZSBlbmQgb2YgdGhlIGlucHV0IGZpbGUuIFdlIG5lZWQgTUFYX01BVENIIGJ5dGVzXG5cdCAqIGZvciB0aGUgbmV4dCBtYXRjaCwgcGx1cyBNSU5fTUFUQ0ggYnl0ZXMgdG8gaW5zZXJ0IHRoZVxuXHQgKiBzdHJpbmcgZm9sbG93aW5nIHRoZSBuZXh0IG1hdGNoLlxuXHQgKi9cblx0d2hpbGUoemlwX2xvb2thaGVhZCA8IHppcF9NSU5fTE9PS0FIRUFEICYmICF6aXBfZW9maWxlKVxuXHQgICAgemlwX2ZpbGxfd2luZG93KCk7XG4gICAgfVxufVxuXG52YXIgemlwX2luaXRfZGVmbGF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmKHppcF9lb2ZpbGUpXG5cdHJldHVybjtcbiAgICB6aXBfYmlfYnVmID0gMDtcbiAgICB6aXBfYmlfdmFsaWQgPSAwO1xuICAgIHppcF9jdF9pbml0KCk7XG4gICAgemlwX2xtX2luaXQoKTtcblxuICAgIHppcF9xaGVhZCA9IG51bGw7XG4gICAgemlwX291dGNudCA9IDA7XG4gICAgemlwX291dG9mZiA9IDA7XG4gICAgemlwX21hdGNoX2F2YWlsYWJsZSA9IDA7XG5cbiAgICBpZih6aXBfY29tcHJfbGV2ZWwgPD0gMylcbiAgICB7XG5cdHppcF9wcmV2X2xlbmd0aCA9IHppcF9NSU5fTUFUQ0ggLSAxO1xuXHR6aXBfbWF0Y2hfbGVuZ3RoID0gMDtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcblx0emlwX21hdGNoX2xlbmd0aCA9IHppcF9NSU5fTUFUQ0ggLSAxO1xuXHR6aXBfbWF0Y2hfYXZhaWxhYmxlID0gMDtcbiAgICAgICAgemlwX21hdGNoX2F2YWlsYWJsZSA9IDA7XG4gICAgfVxuXG4gICAgemlwX2NvbXBsZXRlID0gZmFsc2U7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBTYW1lIGFzIGFib3ZlLCBidXQgYWNoaWV2ZXMgYmV0dGVyIGNvbXByZXNzaW9uLiBXZSB1c2UgYSBsYXp5XG4gKiBldmFsdWF0aW9uIGZvciBtYXRjaGVzOiBhIG1hdGNoIGlzIGZpbmFsbHkgYWRvcHRlZCBvbmx5IGlmIHRoZXJlIGlzXG4gKiBubyBiZXR0ZXIgbWF0Y2ggYXQgdGhlIG5leHQgd2luZG93IHBvc2l0aW9uLlxuICovXG52YXIgemlwX2RlZmxhdGVfaW50ZXJuYWwgPSBmdW5jdGlvbihidWZmLCBvZmYsIGJ1ZmZfc2l6ZSkge1xuICAgIHZhciBuO1xuXG4gICAgaWYoIXppcF9pbml0ZmxhZylcbiAgICB7XG5cdHppcF9pbml0X2RlZmxhdGUoKTtcblx0emlwX2luaXRmbGFnID0gdHJ1ZTtcblx0aWYoemlwX2xvb2thaGVhZCA9PSAwKSB7IC8vIGVtcHR5XG5cdCAgICB6aXBfY29tcGxldGUgPSB0cnVlO1xuXHQgICAgcmV0dXJuIDA7XG5cdH1cbiAgICB9XG5cbiAgICBpZigobiA9IHppcF9xY29weShidWZmLCBvZmYsIGJ1ZmZfc2l6ZSkpID09IGJ1ZmZfc2l6ZSlcblx0cmV0dXJuIGJ1ZmZfc2l6ZTtcblxuICAgIGlmKHppcF9jb21wbGV0ZSlcblx0cmV0dXJuIG47XG5cbiAgICBpZih6aXBfY29tcHJfbGV2ZWwgPD0gMykgLy8gb3B0aW1pemVkIGZvciBzcGVlZFxuXHR6aXBfZGVmbGF0ZV9mYXN0KCk7XG4gICAgZWxzZVxuXHR6aXBfZGVmbGF0ZV9iZXR0ZXIoKTtcbiAgICBpZih6aXBfbG9va2FoZWFkID09IDApIHtcblx0aWYoemlwX21hdGNoX2F2YWlsYWJsZSAhPSAwKVxuXHQgICAgemlwX2N0X3RhbGx5KDAsIHppcF93aW5kb3dbemlwX3N0cnN0YXJ0IC0gMV0gJiAweGZmKTtcblx0emlwX2ZsdXNoX2Jsb2NrKDEpO1xuXHR6aXBfY29tcGxldGUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gbiArIHppcF9xY29weShidWZmLCBuICsgb2ZmLCBidWZmX3NpemUgLSBuKTtcbn1cblxudmFyIHppcF9xY29weSA9IGZ1bmN0aW9uKGJ1ZmYsIG9mZiwgYnVmZl9zaXplKSB7XG4gICAgdmFyIG4sIGksIGo7XG5cbiAgICBuID0gMDtcbiAgICB3aGlsZSh6aXBfcWhlYWQgIT0gbnVsbCAmJiBuIDwgYnVmZl9zaXplKVxuICAgIHtcblx0aSA9IGJ1ZmZfc2l6ZSAtIG47XG5cdGlmKGkgPiB6aXBfcWhlYWQubGVuKVxuXHQgICAgaSA9IHppcF9xaGVhZC5sZW47XG4vLyAgICAgIFN5c3RlbS5hcnJheWNvcHkocWhlYWQucHRyLCBxaGVhZC5vZmYsIGJ1ZmYsIG9mZiArIG4sIGkpO1xuXHRmb3IoaiA9IDA7IGogPCBpOyBqKyspXG5cdCAgICBidWZmW29mZiArIG4gKyBqXSA9IHppcF9xaGVhZC5wdHJbemlwX3FoZWFkLm9mZiArIGpdO1xuXHRcblx0emlwX3FoZWFkLm9mZiArPSBpO1xuXHR6aXBfcWhlYWQubGVuIC09IGk7XG5cdG4gKz0gaTtcblx0aWYoemlwX3FoZWFkLmxlbiA9PSAwKSB7XG5cdCAgICB2YXIgcDtcblx0ICAgIHAgPSB6aXBfcWhlYWQ7XG5cdCAgICB6aXBfcWhlYWQgPSB6aXBfcWhlYWQubmV4dDtcblx0ICAgIHppcF9yZXVzZV9xdWV1ZShwKTtcblx0fVxuICAgIH1cblxuICAgIGlmKG4gPT0gYnVmZl9zaXplKVxuXHRyZXR1cm4gbjtcblxuICAgIGlmKHppcF9vdXRvZmYgPCB6aXBfb3V0Y250KSB7XG5cdGkgPSBidWZmX3NpemUgLSBuO1xuXHRpZihpID4gemlwX291dGNudCAtIHppcF9vdXRvZmYpXG5cdCAgICBpID0gemlwX291dGNudCAtIHppcF9vdXRvZmY7XG5cdC8vIFN5c3RlbS5hcnJheWNvcHkob3V0YnVmLCBvdXRvZmYsIGJ1ZmYsIG9mZiArIG4sIGkpO1xuXHRmb3IoaiA9IDA7IGogPCBpOyBqKyspXG5cdCAgICBidWZmW29mZiArIG4gKyBqXSA9IHppcF9vdXRidWZbemlwX291dG9mZiArIGpdO1xuXHR6aXBfb3V0b2ZmICs9IGk7XG5cdG4gKz0gaTtcblx0aWYoemlwX291dGNudCA9PSB6aXBfb3V0b2ZmKVxuXHQgICAgemlwX291dGNudCA9IHppcF9vdXRvZmYgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gbjtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIEFsbG9jYXRlIHRoZSBtYXRjaCBidWZmZXIsIGluaXRpYWxpemUgdGhlIHZhcmlvdXMgdGFibGVzIGFuZCBzYXZlIHRoZVxuICogbG9jYXRpb24gb2YgdGhlIGludGVybmFsIGZpbGUgYXR0cmlidXRlIChhc2NpaS9iaW5hcnkpIGFuZCBtZXRob2RcbiAqIChERUZMQVRFL1NUT1JFKS5cbiAqL1xudmFyIHppcF9jdF9pbml0ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG47XHQvLyBpdGVyYXRlcyBvdmVyIHRyZWUgZWxlbWVudHNcbiAgICB2YXIgYml0cztcdC8vIGJpdCBjb3VudGVyXG4gICAgdmFyIGxlbmd0aDtcdC8vIGxlbmd0aCB2YWx1ZVxuICAgIHZhciBjb2RlO1x0Ly8gY29kZSB2YWx1ZVxuICAgIHZhciBkaXN0O1x0Ly8gZGlzdGFuY2UgaW5kZXhcblxuICAgIGlmKHppcF9zdGF0aWNfZHRyZWVbMF0uZGwgIT0gMCkgcmV0dXJuOyAvLyBjdF9pbml0IGFscmVhZHkgY2FsbGVkXG5cbiAgICB6aXBfbF9kZXNjLmR5bl90cmVlXHRcdD0gemlwX2R5bl9sdHJlZTtcbiAgICB6aXBfbF9kZXNjLnN0YXRpY190cmVlXHQ9IHppcF9zdGF0aWNfbHRyZWU7XG4gICAgemlwX2xfZGVzYy5leHRyYV9iaXRzXHQ9IHppcF9leHRyYV9sYml0cztcbiAgICB6aXBfbF9kZXNjLmV4dHJhX2Jhc2VcdD0gemlwX0xJVEVSQUxTICsgMTtcbiAgICB6aXBfbF9kZXNjLmVsZW1zXHRcdD0gemlwX0xfQ09ERVM7XG4gICAgemlwX2xfZGVzYy5tYXhfbGVuZ3RoXHQ9IHppcF9NQVhfQklUUztcbiAgICB6aXBfbF9kZXNjLm1heF9jb2RlXHRcdD0gMDtcblxuICAgIHppcF9kX2Rlc2MuZHluX3RyZWVcdFx0PSB6aXBfZHluX2R0cmVlO1xuICAgIHppcF9kX2Rlc2Muc3RhdGljX3RyZWVcdD0gemlwX3N0YXRpY19kdHJlZTtcbiAgICB6aXBfZF9kZXNjLmV4dHJhX2JpdHNcdD0gemlwX2V4dHJhX2RiaXRzO1xuICAgIHppcF9kX2Rlc2MuZXh0cmFfYmFzZVx0PSAwO1xuICAgIHppcF9kX2Rlc2MuZWxlbXNcdFx0PSB6aXBfRF9DT0RFUztcbiAgICB6aXBfZF9kZXNjLm1heF9sZW5ndGhcdD0gemlwX01BWF9CSVRTO1xuICAgIHppcF9kX2Rlc2MubWF4X2NvZGVcdFx0PSAwO1xuXG4gICAgemlwX2JsX2Rlc2MuZHluX3RyZWVcdD0gemlwX2JsX3RyZWU7XG4gICAgemlwX2JsX2Rlc2Muc3RhdGljX3RyZWVcdD0gbnVsbDtcbiAgICB6aXBfYmxfZGVzYy5leHRyYV9iaXRzXHQ9IHppcF9leHRyYV9ibGJpdHM7XG4gICAgemlwX2JsX2Rlc2MuZXh0cmFfYmFzZVx0PSAwO1xuICAgIHppcF9ibF9kZXNjLmVsZW1zXHRcdD0gemlwX0JMX0NPREVTO1xuICAgIHppcF9ibF9kZXNjLm1heF9sZW5ndGhcdD0gemlwX01BWF9CTF9CSVRTO1xuICAgIHppcF9ibF9kZXNjLm1heF9jb2RlXHQ9IDA7XG5cbiAgICAvLyBJbml0aWFsaXplIHRoZSBtYXBwaW5nIGxlbmd0aCAoMC4uMjU1KSAtPiBsZW5ndGggY29kZSAoMC4uMjgpXG4gICAgbGVuZ3RoID0gMDtcbiAgICBmb3IoY29kZSA9IDA7IGNvZGUgPCB6aXBfTEVOR1RIX0NPREVTLTE7IGNvZGUrKykge1xuXHR6aXBfYmFzZV9sZW5ndGhbY29kZV0gPSBsZW5ndGg7XG5cdGZvcihuID0gMDsgbiA8ICgxPDx6aXBfZXh0cmFfbGJpdHNbY29kZV0pOyBuKyspXG5cdCAgICB6aXBfbGVuZ3RoX2NvZGVbbGVuZ3RoKytdID0gY29kZTtcbiAgICB9XG4gICAgLy8gQXNzZXJ0IChsZW5ndGggPT0gMjU2LCBcImN0X2luaXQ6IGxlbmd0aCAhPSAyNTZcIik7XG5cbiAgICAvKiBOb3RlIHRoYXQgdGhlIGxlbmd0aCAyNTUgKG1hdGNoIGxlbmd0aCAyNTgpIGNhbiBiZSByZXByZXNlbnRlZFxuICAgICAqIGluIHR3byBkaWZmZXJlbnQgd2F5czogY29kZSAyODQgKyA1IGJpdHMgb3IgY29kZSAyODUsIHNvIHdlXG4gICAgICogb3ZlcndyaXRlIGxlbmd0aF9jb2RlWzI1NV0gdG8gdXNlIHRoZSBiZXN0IGVuY29kaW5nOlxuICAgICAqL1xuICAgIHppcF9sZW5ndGhfY29kZVtsZW5ndGgtMV0gPSBjb2RlO1xuXG4gICAgLyogSW5pdGlhbGl6ZSB0aGUgbWFwcGluZyBkaXN0ICgwLi4zMkspIC0+IGRpc3QgY29kZSAoMC4uMjkpICovXG4gICAgZGlzdCA9IDA7XG4gICAgZm9yKGNvZGUgPSAwIDsgY29kZSA8IDE2OyBjb2RlKyspIHtcblx0emlwX2Jhc2VfZGlzdFtjb2RlXSA9IGRpc3Q7XG5cdGZvcihuID0gMDsgbiA8ICgxPDx6aXBfZXh0cmFfZGJpdHNbY29kZV0pOyBuKyspIHtcblx0ICAgIHppcF9kaXN0X2NvZGVbZGlzdCsrXSA9IGNvZGU7XG5cdH1cbiAgICB9XG4gICAgLy8gQXNzZXJ0IChkaXN0ID09IDI1NiwgXCJjdF9pbml0OiBkaXN0ICE9IDI1NlwiKTtcbiAgICBkaXN0ID4+PSA3OyAvLyBmcm9tIG5vdyBvbiwgYWxsIGRpc3RhbmNlcyBhcmUgZGl2aWRlZCBieSAxMjhcbiAgICBmb3IoIDsgY29kZSA8IHppcF9EX0NPREVTOyBjb2RlKyspIHtcblx0emlwX2Jhc2VfZGlzdFtjb2RlXSA9IGRpc3QgPDwgNztcblx0Zm9yKG4gPSAwOyBuIDwgKDE8PCh6aXBfZXh0cmFfZGJpdHNbY29kZV0tNykpOyBuKyspXG5cdCAgICB6aXBfZGlzdF9jb2RlWzI1NiArIGRpc3QrK10gPSBjb2RlO1xuICAgIH1cbiAgICAvLyBBc3NlcnQgKGRpc3QgPT0gMjU2LCBcImN0X2luaXQ6IDI1NitkaXN0ICE9IDUxMlwiKTtcblxuICAgIC8vIENvbnN0cnVjdCB0aGUgY29kZXMgb2YgdGhlIHN0YXRpYyBsaXRlcmFsIHRyZWVcbiAgICBmb3IoYml0cyA9IDA7IGJpdHMgPD0gemlwX01BWF9CSVRTOyBiaXRzKyspXG5cdHppcF9ibF9jb3VudFtiaXRzXSA9IDA7XG4gICAgbiA9IDA7XG4gICAgd2hpbGUobiA8PSAxNDMpIHsgemlwX3N0YXRpY19sdHJlZVtuKytdLmRsID0gODsgemlwX2JsX2NvdW50WzhdKys7IH1cbiAgICB3aGlsZShuIDw9IDI1NSkgeyB6aXBfc3RhdGljX2x0cmVlW24rK10uZGwgPSA5OyB6aXBfYmxfY291bnRbOV0rKzsgfVxuICAgIHdoaWxlKG4gPD0gMjc5KSB7IHppcF9zdGF0aWNfbHRyZWVbbisrXS5kbCA9IDc7IHppcF9ibF9jb3VudFs3XSsrOyB9XG4gICAgd2hpbGUobiA8PSAyODcpIHsgemlwX3N0YXRpY19sdHJlZVtuKytdLmRsID0gODsgemlwX2JsX2NvdW50WzhdKys7IH1cbiAgICAvKiBDb2RlcyAyODYgYW5kIDI4NyBkbyBub3QgZXhpc3QsIGJ1dCB3ZSBtdXN0IGluY2x1ZGUgdGhlbSBpbiB0aGVcbiAgICAgKiB0cmVlIGNvbnN0cnVjdGlvbiB0byBnZXQgYSBjYW5vbmljYWwgSHVmZm1hbiB0cmVlIChsb25nZXN0IGNvZGVcbiAgICAgKiBhbGwgb25lcylcbiAgICAgKi9cbiAgICB6aXBfZ2VuX2NvZGVzKHppcF9zdGF0aWNfbHRyZWUsIHppcF9MX0NPREVTICsgMSk7XG5cbiAgICAvKiBUaGUgc3RhdGljIGRpc3RhbmNlIHRyZWUgaXMgdHJpdmlhbDogKi9cbiAgICBmb3IobiA9IDA7IG4gPCB6aXBfRF9DT0RFUzsgbisrKSB7XG5cdHppcF9zdGF0aWNfZHRyZWVbbl0uZGwgPSA1O1xuXHR6aXBfc3RhdGljX2R0cmVlW25dLmZjID0gemlwX2JpX3JldmVyc2UobiwgNSk7XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgZmlyc3QgYmxvY2sgb2YgdGhlIGZpcnN0IGZpbGU6XG4gICAgemlwX2luaXRfYmxvY2soKTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIEluaXRpYWxpemUgYSBuZXcgYmxvY2suXG4gKi9cbnZhciB6aXBfaW5pdF9ibG9jayA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBuOyAvLyBpdGVyYXRlcyBvdmVyIHRyZWUgZWxlbWVudHNcblxuICAgIC8vIEluaXRpYWxpemUgdGhlIHRyZWVzLlxuICAgIGZvcihuID0gMDsgbiA8IHppcF9MX0NPREVTOyAgbisrKSB6aXBfZHluX2x0cmVlW25dLmZjID0gMDtcbiAgICBmb3IobiA9IDA7IG4gPCB6aXBfRF9DT0RFUzsgIG4rKykgemlwX2R5bl9kdHJlZVtuXS5mYyA9IDA7XG4gICAgZm9yKG4gPSAwOyBuIDwgemlwX0JMX0NPREVTOyBuKyspIHppcF9ibF90cmVlW25dLmZjID0gMDtcblxuICAgIHppcF9keW5fbHRyZWVbemlwX0VORF9CTE9DS10uZmMgPSAxO1xuICAgIHppcF9vcHRfbGVuID0gemlwX3N0YXRpY19sZW4gPSAwO1xuICAgIHppcF9sYXN0X2xpdCA9IHppcF9sYXN0X2Rpc3QgPSB6aXBfbGFzdF9mbGFncyA9IDA7XG4gICAgemlwX2ZsYWdzID0gMDtcbiAgICB6aXBfZmxhZ19iaXQgPSAxO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogUmVzdG9yZSB0aGUgaGVhcCBwcm9wZXJ0eSBieSBtb3ZpbmcgZG93biB0aGUgdHJlZSBzdGFydGluZyBhdCBub2RlIGssXG4gKiBleGNoYW5naW5nIGEgbm9kZSB3aXRoIHRoZSBzbWFsbGVzdCBvZiBpdHMgdHdvIHNvbnMgaWYgbmVjZXNzYXJ5LCBzdG9wcGluZ1xuICogd2hlbiB0aGUgaGVhcCBwcm9wZXJ0eSBpcyByZS1lc3RhYmxpc2hlZCAoZWFjaCBmYXRoZXIgc21hbGxlciB0aGFuIGl0c1xuICogdHdvIHNvbnMpLlxuICovXG52YXIgemlwX3BxZG93bmhlYXAgPSBmdW5jdGlvbihcbiAgICB0cmVlLFx0Ly8gdGhlIHRyZWUgdG8gcmVzdG9yZVxuICAgIGspIHtcdC8vIG5vZGUgdG8gbW92ZSBkb3duXG4gICAgdmFyIHYgPSB6aXBfaGVhcFtrXTtcbiAgICB2YXIgaiA9IGsgPDwgMTtcdC8vIGxlZnQgc29uIG9mIGtcblxuICAgIHdoaWxlKGogPD0gemlwX2hlYXBfbGVuKSB7XG5cdC8vIFNldCBqIHRvIHRoZSBzbWFsbGVzdCBvZiB0aGUgdHdvIHNvbnM6XG5cdGlmKGogPCB6aXBfaGVhcF9sZW4gJiZcblx0ICAgemlwX1NNQUxMRVIodHJlZSwgemlwX2hlYXBbaiArIDFdLCB6aXBfaGVhcFtqXSkpXG5cdCAgICBqKys7XG5cblx0Ly8gRXhpdCBpZiB2IGlzIHNtYWxsZXIgdGhhbiBib3RoIHNvbnNcblx0aWYoemlwX1NNQUxMRVIodHJlZSwgdiwgemlwX2hlYXBbal0pKVxuXHQgICAgYnJlYWs7XG5cblx0Ly8gRXhjaGFuZ2UgdiB3aXRoIHRoZSBzbWFsbGVzdCBzb25cblx0emlwX2hlYXBba10gPSB6aXBfaGVhcFtqXTtcblx0ayA9IGo7XG5cblx0Ly8gQW5kIGNvbnRpbnVlIGRvd24gdGhlIHRyZWUsIHNldHRpbmcgaiB0byB0aGUgbGVmdCBzb24gb2Yga1xuXHRqIDw8PSAxO1xuICAgIH1cbiAgICB6aXBfaGVhcFtrXSA9IHY7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBDb21wdXRlIHRoZSBvcHRpbWFsIGJpdCBsZW5ndGhzIGZvciBhIHRyZWUgYW5kIHVwZGF0ZSB0aGUgdG90YWwgYml0IGxlbmd0aFxuICogZm9yIHRoZSBjdXJyZW50IGJsb2NrLlxuICogSU4gYXNzZXJ0aW9uOiB0aGUgZmllbGRzIGZyZXEgYW5kIGRhZCBhcmUgc2V0LCBoZWFwW2hlYXBfbWF4XSBhbmRcbiAqICAgIGFib3ZlIGFyZSB0aGUgdHJlZSBub2RlcyBzb3J0ZWQgYnkgaW5jcmVhc2luZyBmcmVxdWVuY3kuXG4gKiBPVVQgYXNzZXJ0aW9uczogdGhlIGZpZWxkIGxlbiBpcyBzZXQgdG8gdGhlIG9wdGltYWwgYml0IGxlbmd0aCwgdGhlXG4gKiAgICAgYXJyYXkgYmxfY291bnQgY29udGFpbnMgdGhlIGZyZXF1ZW5jaWVzIGZvciBlYWNoIGJpdCBsZW5ndGguXG4gKiAgICAgVGhlIGxlbmd0aCBvcHRfbGVuIGlzIHVwZGF0ZWQ7IHN0YXRpY19sZW4gaXMgYWxzbyB1cGRhdGVkIGlmIHN0cmVlIGlzXG4gKiAgICAgbm90IG51bGwuXG4gKi9cbnZhciB6aXBfZ2VuX2JpdGxlbiA9IGZ1bmN0aW9uKGRlc2MpIHsgLy8gdGhlIHRyZWUgZGVzY3JpcHRvclxuICAgIHZhciB0cmVlXHRcdD0gZGVzYy5keW5fdHJlZTtcbiAgICB2YXIgZXh0cmFcdFx0PSBkZXNjLmV4dHJhX2JpdHM7XG4gICAgdmFyIGJhc2VcdFx0PSBkZXNjLmV4dHJhX2Jhc2U7XG4gICAgdmFyIG1heF9jb2RlXHQ9IGRlc2MubWF4X2NvZGU7XG4gICAgdmFyIG1heF9sZW5ndGhcdD0gZGVzYy5tYXhfbGVuZ3RoO1xuICAgIHZhciBzdHJlZVx0XHQ9IGRlc2Muc3RhdGljX3RyZWU7XG4gICAgdmFyIGg7XHRcdC8vIGhlYXAgaW5kZXhcbiAgICB2YXIgbiwgbTtcdFx0Ly8gaXRlcmF0ZSBvdmVyIHRoZSB0cmVlIGVsZW1lbnRzXG4gICAgdmFyIGJpdHM7XHRcdC8vIGJpdCBsZW5ndGhcbiAgICB2YXIgeGJpdHM7XHRcdC8vIGV4dHJhIGJpdHNcbiAgICB2YXIgZjtcdFx0Ly8gZnJlcXVlbmN5XG4gICAgdmFyIG92ZXJmbG93ID0gMDtcdC8vIG51bWJlciBvZiBlbGVtZW50cyB3aXRoIGJpdCBsZW5ndGggdG9vIGxhcmdlXG5cbiAgICBmb3IoYml0cyA9IDA7IGJpdHMgPD0gemlwX01BWF9CSVRTOyBiaXRzKyspXG5cdHppcF9ibF9jb3VudFtiaXRzXSA9IDA7XG5cbiAgICAvKiBJbiBhIGZpcnN0IHBhc3MsIGNvbXB1dGUgdGhlIG9wdGltYWwgYml0IGxlbmd0aHMgKHdoaWNoIG1heVxuICAgICAqIG92ZXJmbG93IGluIHRoZSBjYXNlIG9mIHRoZSBiaXQgbGVuZ3RoIHRyZWUpLlxuICAgICAqL1xuICAgIHRyZWVbemlwX2hlYXBbemlwX2hlYXBfbWF4XV0uZGwgPSAwOyAvLyByb290IG9mIHRoZSBoZWFwXG5cbiAgICBmb3IoaCA9IHppcF9oZWFwX21heCArIDE7IGggPCB6aXBfSEVBUF9TSVpFOyBoKyspIHtcblx0biA9IHppcF9oZWFwW2hdO1xuXHRiaXRzID0gdHJlZVt0cmVlW25dLmRsXS5kbCArIDE7XG5cdGlmKGJpdHMgPiBtYXhfbGVuZ3RoKSB7XG5cdCAgICBiaXRzID0gbWF4X2xlbmd0aDtcblx0ICAgIG92ZXJmbG93Kys7XG5cdH1cblx0dHJlZVtuXS5kbCA9IGJpdHM7XG5cdC8vIFdlIG92ZXJ3cml0ZSB0cmVlW25dLmRsIHdoaWNoIGlzIG5vIGxvbmdlciBuZWVkZWRcblxuXHRpZihuID4gbWF4X2NvZGUpXG5cdCAgICBjb250aW51ZTsgLy8gbm90IGEgbGVhZiBub2RlXG5cblx0emlwX2JsX2NvdW50W2JpdHNdKys7XG5cdHhiaXRzID0gMDtcblx0aWYobiA+PSBiYXNlKVxuXHQgICAgeGJpdHMgPSBleHRyYVtuIC0gYmFzZV07XG5cdGYgPSB0cmVlW25dLmZjO1xuXHR6aXBfb3B0X2xlbiArPSBmICogKGJpdHMgKyB4Yml0cyk7XG5cdGlmKHN0cmVlICE9IG51bGwpXG5cdCAgICB6aXBfc3RhdGljX2xlbiArPSBmICogKHN0cmVlW25dLmRsICsgeGJpdHMpO1xuICAgIH1cbiAgICBpZihvdmVyZmxvdyA9PSAwKVxuXHRyZXR1cm47XG5cbiAgICAvLyBUaGlzIGhhcHBlbnMgZm9yIGV4YW1wbGUgb24gb2JqMiBhbmQgcGljIG9mIHRoZSBDYWxnYXJ5IGNvcnB1c1xuXG4gICAgLy8gRmluZCB0aGUgZmlyc3QgYml0IGxlbmd0aCB3aGljaCBjb3VsZCBpbmNyZWFzZTpcbiAgICBkbyB7XG5cdGJpdHMgPSBtYXhfbGVuZ3RoIC0gMTtcblx0d2hpbGUoemlwX2JsX2NvdW50W2JpdHNdID09IDApXG5cdCAgICBiaXRzLS07XG5cdHppcF9ibF9jb3VudFtiaXRzXS0tO1x0XHQvLyBtb3ZlIG9uZSBsZWFmIGRvd24gdGhlIHRyZWVcblx0emlwX2JsX2NvdW50W2JpdHMgKyAxXSArPSAyO1x0Ly8gbW92ZSBvbmUgb3ZlcmZsb3cgaXRlbSBhcyBpdHMgYnJvdGhlclxuXHR6aXBfYmxfY291bnRbbWF4X2xlbmd0aF0tLTtcblx0LyogVGhlIGJyb3RoZXIgb2YgdGhlIG92ZXJmbG93IGl0ZW0gYWxzbyBtb3ZlcyBvbmUgc3RlcCB1cCxcblx0ICogYnV0IHRoaXMgZG9lcyBub3QgYWZmZWN0IGJsX2NvdW50W21heF9sZW5ndGhdXG5cdCAqL1xuXHRvdmVyZmxvdyAtPSAyO1xuICAgIH0gd2hpbGUob3ZlcmZsb3cgPiAwKTtcblxuICAgIC8qIE5vdyByZWNvbXB1dGUgYWxsIGJpdCBsZW5ndGhzLCBzY2FubmluZyBpbiBpbmNyZWFzaW5nIGZyZXF1ZW5jeS5cbiAgICAgKiBoIGlzIHN0aWxsIGVxdWFsIHRvIEhFQVBfU0laRS4gKEl0IGlzIHNpbXBsZXIgdG8gcmVjb25zdHJ1Y3QgYWxsXG4gICAgICogbGVuZ3RocyBpbnN0ZWFkIG9mIGZpeGluZyBvbmx5IHRoZSB3cm9uZyBvbmVzLiBUaGlzIGlkZWEgaXMgdGFrZW5cbiAgICAgKiBmcm9tICdhcicgd3JpdHRlbiBieSBIYXJ1aGlrbyBPa3VtdXJhLilcbiAgICAgKi9cbiAgICBmb3IoYml0cyA9IG1heF9sZW5ndGg7IGJpdHMgIT0gMDsgYml0cy0tKSB7XG5cdG4gPSB6aXBfYmxfY291bnRbYml0c107XG5cdHdoaWxlKG4gIT0gMCkge1xuXHQgICAgbSA9IHppcF9oZWFwWy0taF07XG5cdCAgICBpZihtID4gbWF4X2NvZGUpXG5cdFx0Y29udGludWU7XG5cdCAgICBpZih0cmVlW21dLmRsICE9IGJpdHMpIHtcblx0XHR6aXBfb3B0X2xlbiArPSAoYml0cyAtIHRyZWVbbV0uZGwpICogdHJlZVttXS5mYztcblx0XHR0cmVlW21dLmZjID0gYml0cztcblx0ICAgIH1cblx0ICAgIG4tLTtcblx0fVxuICAgIH1cbn1cblxuICAvKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgKiBHZW5lcmF0ZSB0aGUgY29kZXMgZm9yIGEgZ2l2ZW4gdHJlZSBhbmQgYml0IGNvdW50cyAod2hpY2ggbmVlZCBub3QgYmVcbiAgICogb3B0aW1hbCkuXG4gICAqIElOIGFzc2VydGlvbjogdGhlIGFycmF5IGJsX2NvdW50IGNvbnRhaW5zIHRoZSBiaXQgbGVuZ3RoIHN0YXRpc3RpY3MgZm9yXG4gICAqIHRoZSBnaXZlbiB0cmVlIGFuZCB0aGUgZmllbGQgbGVuIGlzIHNldCBmb3IgYWxsIHRyZWUgZWxlbWVudHMuXG4gICAqIE9VVCBhc3NlcnRpb246IHRoZSBmaWVsZCBjb2RlIGlzIHNldCBmb3IgYWxsIHRyZWUgZWxlbWVudHMgb2Ygbm9uXG4gICAqICAgICB6ZXJvIGNvZGUgbGVuZ3RoLlxuICAgKi9cbnZhciB6aXBfZ2VuX2NvZGVzID0gZnVuY3Rpb24odHJlZSxcdC8vIHRoZSB0cmVlIHRvIGRlY29yYXRlXG5cdFx0ICAgbWF4X2NvZGUpIHtcdC8vIGxhcmdlc3QgY29kZSB3aXRoIG5vbiB6ZXJvIGZyZXF1ZW5jeVxuICAgIHZhciBuZXh0X2NvZGUgPSBuZXcgQXJyYXkoemlwX01BWF9CSVRTKzEpOyAvLyBuZXh0IGNvZGUgdmFsdWUgZm9yIGVhY2ggYml0IGxlbmd0aFxuICAgIHZhciBjb2RlID0gMDtcdFx0Ly8gcnVubmluZyBjb2RlIHZhbHVlXG4gICAgdmFyIGJpdHM7XHRcdFx0Ly8gYml0IGluZGV4XG4gICAgdmFyIG47XHRcdFx0Ly8gY29kZSBpbmRleFxuXG4gICAgLyogVGhlIGRpc3RyaWJ1dGlvbiBjb3VudHMgYXJlIGZpcnN0IHVzZWQgdG8gZ2VuZXJhdGUgdGhlIGNvZGUgdmFsdWVzXG4gICAgICogd2l0aG91dCBiaXQgcmV2ZXJzYWwuXG4gICAgICovXG4gICAgZm9yKGJpdHMgPSAxOyBiaXRzIDw9IHppcF9NQVhfQklUUzsgYml0cysrKSB7XG5cdGNvZGUgPSAoKGNvZGUgKyB6aXBfYmxfY291bnRbYml0cy0xXSkgPDwgMSk7XG5cdG5leHRfY29kZVtiaXRzXSA9IGNvZGU7XG4gICAgfVxuXG4gICAgLyogQ2hlY2sgdGhhdCB0aGUgYml0IGNvdW50cyBpbiBibF9jb3VudCBhcmUgY29uc2lzdGVudC4gVGhlIGxhc3QgY29kZVxuICAgICAqIG11c3QgYmUgYWxsIG9uZXMuXG4gICAgICovXG4vLyAgICBBc3NlcnQgKGNvZGUgKyBlbmNvZGVyLT5ibF9jb3VudFtNQVhfQklUU10tMSA9PSAoMTw8TUFYX0JJVFMpLTEsXG4vL1x0ICAgIFwiaW5jb25zaXN0ZW50IGJpdCBjb3VudHNcIik7XG4vLyAgICBUcmFjZXYoKHN0ZGVycixcIlxcbmdlbl9jb2RlczogbWF4X2NvZGUgJWQgXCIsIG1heF9jb2RlKSk7XG5cbiAgICBmb3IobiA9IDA7IG4gPD0gbWF4X2NvZGU7IG4rKykge1xuXHR2YXIgbGVuID0gdHJlZVtuXS5kbDtcblx0aWYobGVuID09IDApXG5cdCAgICBjb250aW51ZTtcblx0Ly8gTm93IHJldmVyc2UgdGhlIGJpdHNcblx0dHJlZVtuXS5mYyA9IHppcF9iaV9yZXZlcnNlKG5leHRfY29kZVtsZW5dKyssIGxlbik7XG5cbi8vICAgICAgVHJhY2VjKHRyZWUgIT0gc3RhdGljX2x0cmVlLCAoc3RkZXJyLFwiXFxubiAlM2QgJWMgbCAlMmQgYyAlNHggKCV4KSBcIixcbi8vXHQgIG4sIChpc2dyYXBoKG4pID8gbiA6ICcgJyksIGxlbiwgdHJlZVtuXS5mYywgbmV4dF9jb2RlW2xlbl0tMSkpO1xuICAgIH1cbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIENvbnN0cnVjdCBvbmUgSHVmZm1hbiB0cmVlIGFuZCBhc3NpZ25zIHRoZSBjb2RlIGJpdCBzdHJpbmdzIGFuZCBsZW5ndGhzLlxuICogVXBkYXRlIHRoZSB0b3RhbCBiaXQgbGVuZ3RoIGZvciB0aGUgY3VycmVudCBibG9jay5cbiAqIElOIGFzc2VydGlvbjogdGhlIGZpZWxkIGZyZXEgaXMgc2V0IGZvciBhbGwgdHJlZSBlbGVtZW50cy5cbiAqIE9VVCBhc3NlcnRpb25zOiB0aGUgZmllbGRzIGxlbiBhbmQgY29kZSBhcmUgc2V0IHRvIHRoZSBvcHRpbWFsIGJpdCBsZW5ndGhcbiAqICAgICBhbmQgY29ycmVzcG9uZGluZyBjb2RlLiBUaGUgbGVuZ3RoIG9wdF9sZW4gaXMgdXBkYXRlZDsgc3RhdGljX2xlbiBpc1xuICogICAgIGFsc28gdXBkYXRlZCBpZiBzdHJlZSBpcyBub3QgbnVsbC4gVGhlIGZpZWxkIG1heF9jb2RlIGlzIHNldC5cbiAqL1xudmFyIHppcF9idWlsZF90cmVlID0gZnVuY3Rpb24oZGVzYykgeyAvLyB0aGUgdHJlZSBkZXNjcmlwdG9yXG4gICAgdmFyIHRyZWVcdD0gZGVzYy5keW5fdHJlZTtcbiAgICB2YXIgc3RyZWVcdD0gZGVzYy5zdGF0aWNfdHJlZTtcbiAgICB2YXIgZWxlbXNcdD0gZGVzYy5lbGVtcztcbiAgICB2YXIgbiwgbTtcdFx0Ly8gaXRlcmF0ZSBvdmVyIGhlYXAgZWxlbWVudHNcbiAgICB2YXIgbWF4X2NvZGUgPSAtMTtcdC8vIGxhcmdlc3QgY29kZSB3aXRoIG5vbiB6ZXJvIGZyZXF1ZW5jeVxuICAgIHZhciBub2RlID0gZWxlbXM7XHQvLyBuZXh0IGludGVybmFsIG5vZGUgb2YgdGhlIHRyZWVcblxuICAgIC8qIENvbnN0cnVjdCB0aGUgaW5pdGlhbCBoZWFwLCB3aXRoIGxlYXN0IGZyZXF1ZW50IGVsZW1lbnQgaW5cbiAgICAgKiBoZWFwW1NNQUxMRVNUXS4gVGhlIHNvbnMgb2YgaGVhcFtuXSBhcmUgaGVhcFsyKm5dIGFuZCBoZWFwWzIqbisxXS5cbiAgICAgKiBoZWFwWzBdIGlzIG5vdCB1c2VkLlxuICAgICAqL1xuICAgIHppcF9oZWFwX2xlbiA9IDA7XG4gICAgemlwX2hlYXBfbWF4ID0gemlwX0hFQVBfU0laRTtcblxuICAgIGZvcihuID0gMDsgbiA8IGVsZW1zOyBuKyspIHtcblx0aWYodHJlZVtuXS5mYyAhPSAwKSB7XG5cdCAgICB6aXBfaGVhcFsrK3ppcF9oZWFwX2xlbl0gPSBtYXhfY29kZSA9IG47XG5cdCAgICB6aXBfZGVwdGhbbl0gPSAwO1xuXHR9IGVsc2Vcblx0ICAgIHRyZWVbbl0uZGwgPSAwO1xuICAgIH1cblxuICAgIC8qIFRoZSBwa3ppcCBmb3JtYXQgcmVxdWlyZXMgdGhhdCBhdCBsZWFzdCBvbmUgZGlzdGFuY2UgY29kZSBleGlzdHMsXG4gICAgICogYW5kIHRoYXQgYXQgbGVhc3Qgb25lIGJpdCBzaG91bGQgYmUgc2VudCBldmVuIGlmIHRoZXJlIGlzIG9ubHkgb25lXG4gICAgICogcG9zc2libGUgY29kZS4gU28gdG8gYXZvaWQgc3BlY2lhbCBjaGVja3MgbGF0ZXIgb24gd2UgZm9yY2UgYXQgbGVhc3RcbiAgICAgKiB0d28gY29kZXMgb2Ygbm9uIHplcm8gZnJlcXVlbmN5LlxuICAgICAqL1xuICAgIHdoaWxlKHppcF9oZWFwX2xlbiA8IDIpIHtcblx0dmFyIHhuZXcgPSB6aXBfaGVhcFsrK3ppcF9oZWFwX2xlbl0gPSAobWF4X2NvZGUgPCAyID8gKyttYXhfY29kZSA6IDApO1xuXHR0cmVlW3huZXddLmZjID0gMTtcblx0emlwX2RlcHRoW3huZXddID0gMDtcblx0emlwX29wdF9sZW4tLTtcblx0aWYoc3RyZWUgIT0gbnVsbClcblx0ICAgIHppcF9zdGF0aWNfbGVuIC09IHN0cmVlW3huZXddLmRsO1xuXHQvLyBuZXcgaXMgMCBvciAxIHNvIGl0IGRvZXMgbm90IGhhdmUgZXh0cmEgYml0c1xuICAgIH1cbiAgICBkZXNjLm1heF9jb2RlID0gbWF4X2NvZGU7XG5cbiAgICAvKiBUaGUgZWxlbWVudHMgaGVhcFtoZWFwX2xlbi8yKzEgLi4gaGVhcF9sZW5dIGFyZSBsZWF2ZXMgb2YgdGhlIHRyZWUsXG4gICAgICogZXN0YWJsaXNoIHN1Yi1oZWFwcyBvZiBpbmNyZWFzaW5nIGxlbmd0aHM6XG4gICAgICovXG4gICAgZm9yKG4gPSB6aXBfaGVhcF9sZW4gPj4gMTsgbiA+PSAxOyBuLS0pXG5cdHppcF9wcWRvd25oZWFwKHRyZWUsIG4pO1xuXG4gICAgLyogQ29uc3RydWN0IHRoZSBIdWZmbWFuIHRyZWUgYnkgcmVwZWF0ZWRseSBjb21iaW5pbmcgdGhlIGxlYXN0IHR3b1xuICAgICAqIGZyZXF1ZW50IG5vZGVzLlxuICAgICAqL1xuICAgIGRvIHtcblx0biA9IHppcF9oZWFwW3ppcF9TTUFMTEVTVF07XG5cdHppcF9oZWFwW3ppcF9TTUFMTEVTVF0gPSB6aXBfaGVhcFt6aXBfaGVhcF9sZW4tLV07XG5cdHppcF9wcWRvd25oZWFwKHRyZWUsIHppcF9TTUFMTEVTVCk7XG5cblx0bSA9IHppcF9oZWFwW3ppcF9TTUFMTEVTVF07ICAvLyBtID0gbm9kZSBvZiBuZXh0IGxlYXN0IGZyZXF1ZW5jeVxuXG5cdC8vIGtlZXAgdGhlIG5vZGVzIHNvcnRlZCBieSBmcmVxdWVuY3lcblx0emlwX2hlYXBbLS16aXBfaGVhcF9tYXhdID0gbjtcblx0emlwX2hlYXBbLS16aXBfaGVhcF9tYXhdID0gbTtcblxuXHQvLyBDcmVhdGUgYSBuZXcgbm9kZSBmYXRoZXIgb2YgbiBhbmQgbVxuXHR0cmVlW25vZGVdLmZjID0gdHJlZVtuXS5mYyArIHRyZWVbbV0uZmM7XG4vL1x0ZGVwdGhbbm9kZV0gPSAoY2hhcikoTUFYKGRlcHRoW25dLCBkZXB0aFttXSkgKyAxKTtcblx0aWYoemlwX2RlcHRoW25dID4gemlwX2RlcHRoW21dICsgMSlcblx0ICAgIHppcF9kZXB0aFtub2RlXSA9IHppcF9kZXB0aFtuXTtcblx0ZWxzZVxuXHQgICAgemlwX2RlcHRoW25vZGVdID0gemlwX2RlcHRoW21dICsgMTtcblx0dHJlZVtuXS5kbCA9IHRyZWVbbV0uZGwgPSBub2RlO1xuXG5cdC8vIGFuZCBpbnNlcnQgdGhlIG5ldyBub2RlIGluIHRoZSBoZWFwXG5cdHppcF9oZWFwW3ppcF9TTUFMTEVTVF0gPSBub2RlKys7XG5cdHppcF9wcWRvd25oZWFwKHRyZWUsIHppcF9TTUFMTEVTVCk7XG5cbiAgICB9IHdoaWxlKHppcF9oZWFwX2xlbiA+PSAyKTtcblxuICAgIHppcF9oZWFwWy0temlwX2hlYXBfbWF4XSA9IHppcF9oZWFwW3ppcF9TTUFMTEVTVF07XG5cbiAgICAvKiBBdCB0aGlzIHBvaW50LCB0aGUgZmllbGRzIGZyZXEgYW5kIGRhZCBhcmUgc2V0LiBXZSBjYW4gbm93XG4gICAgICogZ2VuZXJhdGUgdGhlIGJpdCBsZW5ndGhzLlxuICAgICAqL1xuICAgIHppcF9nZW5fYml0bGVuKGRlc2MpO1xuXG4gICAgLy8gVGhlIGZpZWxkIGxlbiBpcyBub3cgc2V0LCB3ZSBjYW4gZ2VuZXJhdGUgdGhlIGJpdCBjb2Rlc1xuICAgIHppcF9nZW5fY29kZXModHJlZSwgbWF4X2NvZGUpO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogU2NhbiBhIGxpdGVyYWwgb3IgZGlzdGFuY2UgdHJlZSB0byBkZXRlcm1pbmUgdGhlIGZyZXF1ZW5jaWVzIG9mIHRoZSBjb2Rlc1xuICogaW4gdGhlIGJpdCBsZW5ndGggdHJlZS4gVXBkYXRlcyBvcHRfbGVuIHRvIHRha2UgaW50byBhY2NvdW50IHRoZSByZXBlYXRcbiAqIGNvdW50cy4gKFRoZSBjb250cmlidXRpb24gb2YgdGhlIGJpdCBsZW5ndGggY29kZXMgd2lsbCBiZSBhZGRlZCBsYXRlclxuICogZHVyaW5nIHRoZSBjb25zdHJ1Y3Rpb24gb2YgYmxfdHJlZS4pXG4gKi9cbnZhciB6aXBfc2Nhbl90cmVlID0gZnVuY3Rpb24odHJlZSwvLyB0aGUgdHJlZSB0byBiZSBzY2FubmVkXG5cdFx0ICAgICAgIG1heF9jb2RlKSB7ICAvLyBhbmQgaXRzIGxhcmdlc3QgY29kZSBvZiBub24gemVybyBmcmVxdWVuY3lcbiAgICB2YXIgbjtcdFx0XHQvLyBpdGVyYXRlcyBvdmVyIGFsbCB0cmVlIGVsZW1lbnRzXG4gICAgdmFyIHByZXZsZW4gPSAtMTtcdFx0Ly8gbGFzdCBlbWl0dGVkIGxlbmd0aFxuICAgIHZhciBjdXJsZW47XHRcdFx0Ly8gbGVuZ3RoIG9mIGN1cnJlbnQgY29kZVxuICAgIHZhciBuZXh0bGVuID0gdHJlZVswXS5kbDtcdC8vIGxlbmd0aCBvZiBuZXh0IGNvZGVcbiAgICB2YXIgY291bnQgPSAwO1x0XHQvLyByZXBlYXQgY291bnQgb2YgdGhlIGN1cnJlbnQgY29kZVxuICAgIHZhciBtYXhfY291bnQgPSA3O1x0XHQvLyBtYXggcmVwZWF0IGNvdW50XG4gICAgdmFyIG1pbl9jb3VudCA9IDQ7XHRcdC8vIG1pbiByZXBlYXQgY291bnRcblxuICAgIGlmKG5leHRsZW4gPT0gMCkge1xuXHRtYXhfY291bnQgPSAxMzg7XG5cdG1pbl9jb3VudCA9IDM7XG4gICAgfVxuICAgIHRyZWVbbWF4X2NvZGUgKyAxXS5kbCA9IDB4ZmZmZjsgLy8gZ3VhcmRcblxuICAgIGZvcihuID0gMDsgbiA8PSBtYXhfY29kZTsgbisrKSB7XG5cdGN1cmxlbiA9IG5leHRsZW47XG5cdG5leHRsZW4gPSB0cmVlW24gKyAxXS5kbDtcblx0aWYoKytjb3VudCA8IG1heF9jb3VudCAmJiBjdXJsZW4gPT0gbmV4dGxlbilcblx0ICAgIGNvbnRpbnVlO1xuXHRlbHNlIGlmKGNvdW50IDwgbWluX2NvdW50KVxuXHQgICAgemlwX2JsX3RyZWVbY3VybGVuXS5mYyArPSBjb3VudDtcblx0ZWxzZSBpZihjdXJsZW4gIT0gMCkge1xuXHQgICAgaWYoY3VybGVuICE9IHByZXZsZW4pXG5cdFx0emlwX2JsX3RyZWVbY3VybGVuXS5mYysrO1xuXHQgICAgemlwX2JsX3RyZWVbemlwX1JFUF8zXzZdLmZjKys7XG5cdH0gZWxzZSBpZihjb3VudCA8PSAxMClcblx0ICAgIHppcF9ibF90cmVlW3ppcF9SRVBaXzNfMTBdLmZjKys7XG5cdGVsc2Vcblx0ICAgIHppcF9ibF90cmVlW3ppcF9SRVBaXzExXzEzOF0uZmMrKztcblx0Y291bnQgPSAwOyBwcmV2bGVuID0gY3VybGVuO1xuXHRpZihuZXh0bGVuID09IDApIHtcblx0ICAgIG1heF9jb3VudCA9IDEzODtcblx0ICAgIG1pbl9jb3VudCA9IDM7XG5cdH0gZWxzZSBpZihjdXJsZW4gPT0gbmV4dGxlbikge1xuXHQgICAgbWF4X2NvdW50ID0gNjtcblx0ICAgIG1pbl9jb3VudCA9IDM7XG5cdH0gZWxzZSB7XG5cdCAgICBtYXhfY291bnQgPSA3O1xuXHQgICAgbWluX2NvdW50ID0gNDtcblx0fVxuICAgIH1cbn1cblxuICAvKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgKiBTZW5kIGEgbGl0ZXJhbCBvciBkaXN0YW5jZSB0cmVlIGluIGNvbXByZXNzZWQgZm9ybSwgdXNpbmcgdGhlIGNvZGVzIGluXG4gICAqIGJsX3RyZWUuXG4gICAqL1xudmFyIHppcF9zZW5kX3RyZWUgPSBmdW5jdGlvbih0cmVlLCAvLyB0aGUgdHJlZSB0byBiZSBzY2FubmVkXG5cdFx0ICAgbWF4X2NvZGUpIHsgLy8gYW5kIGl0cyBsYXJnZXN0IGNvZGUgb2Ygbm9uIHplcm8gZnJlcXVlbmN5XG4gICAgdmFyIG47XHRcdFx0Ly8gaXRlcmF0ZXMgb3ZlciBhbGwgdHJlZSBlbGVtZW50c1xuICAgIHZhciBwcmV2bGVuID0gLTE7XHRcdC8vIGxhc3QgZW1pdHRlZCBsZW5ndGhcbiAgICB2YXIgY3VybGVuO1x0XHRcdC8vIGxlbmd0aCBvZiBjdXJyZW50IGNvZGVcbiAgICB2YXIgbmV4dGxlbiA9IHRyZWVbMF0uZGw7XHQvLyBsZW5ndGggb2YgbmV4dCBjb2RlXG4gICAgdmFyIGNvdW50ID0gMDtcdFx0Ly8gcmVwZWF0IGNvdW50IG9mIHRoZSBjdXJyZW50IGNvZGVcbiAgICB2YXIgbWF4X2NvdW50ID0gNztcdFx0Ly8gbWF4IHJlcGVhdCBjb3VudFxuICAgIHZhciBtaW5fY291bnQgPSA0O1x0XHQvLyBtaW4gcmVwZWF0IGNvdW50XG5cbiAgICAvKiB0cmVlW21heF9jb2RlKzFdLmRsID0gLTE7ICovICAvKiBndWFyZCBhbHJlYWR5IHNldCAqL1xuICAgIGlmKG5leHRsZW4gPT0gMCkge1xuICAgICAgbWF4X2NvdW50ID0gMTM4O1xuICAgICAgbWluX2NvdW50ID0gMztcbiAgICB9XG5cbiAgICBmb3IobiA9IDA7IG4gPD0gbWF4X2NvZGU7IG4rKykge1xuXHRjdXJsZW4gPSBuZXh0bGVuO1xuXHRuZXh0bGVuID0gdHJlZVtuKzFdLmRsO1xuXHRpZigrK2NvdW50IDwgbWF4X2NvdW50ICYmIGN1cmxlbiA9PSBuZXh0bGVuKSB7XG5cdCAgICBjb250aW51ZTtcblx0fSBlbHNlIGlmKGNvdW50IDwgbWluX2NvdW50KSB7XG5cdCAgICBkbyB7IHppcF9TRU5EX0NPREUoY3VybGVuLCB6aXBfYmxfdHJlZSk7IH0gd2hpbGUoLS1jb3VudCAhPSAwKTtcblx0fSBlbHNlIGlmKGN1cmxlbiAhPSAwKSB7XG5cdCAgICBpZihjdXJsZW4gIT0gcHJldmxlbikge1xuXHRcdHppcF9TRU5EX0NPREUoY3VybGVuLCB6aXBfYmxfdHJlZSk7XG5cdFx0Y291bnQtLTtcblx0ICAgIH1cblx0ICAgIC8vIEFzc2VydChjb3VudCA+PSAzICYmIGNvdW50IDw9IDYsIFwiIDNfNj9cIik7XG5cdCAgICB6aXBfU0VORF9DT0RFKHppcF9SRVBfM182LCB6aXBfYmxfdHJlZSk7XG5cdCAgICB6aXBfc2VuZF9iaXRzKGNvdW50IC0gMywgMik7XG5cdH0gZWxzZSBpZihjb3VudCA8PSAxMCkge1xuXHQgICAgemlwX1NFTkRfQ09ERSh6aXBfUkVQWl8zXzEwLCB6aXBfYmxfdHJlZSk7XG5cdCAgICB6aXBfc2VuZF9iaXRzKGNvdW50LTMsIDMpO1xuXHR9IGVsc2Uge1xuXHQgICAgemlwX1NFTkRfQ09ERSh6aXBfUkVQWl8xMV8xMzgsIHppcF9ibF90cmVlKTtcblx0ICAgIHppcF9zZW5kX2JpdHMoY291bnQtMTEsIDcpO1xuXHR9XG5cdGNvdW50ID0gMDtcblx0cHJldmxlbiA9IGN1cmxlbjtcblx0aWYobmV4dGxlbiA9PSAwKSB7XG5cdCAgICBtYXhfY291bnQgPSAxMzg7XG5cdCAgICBtaW5fY291bnQgPSAzO1xuXHR9IGVsc2UgaWYoY3VybGVuID09IG5leHRsZW4pIHtcblx0ICAgIG1heF9jb3VudCA9IDY7XG5cdCAgICBtaW5fY291bnQgPSAzO1xuXHR9IGVsc2Uge1xuXHQgICAgbWF4X2NvdW50ID0gNztcblx0ICAgIG1pbl9jb3VudCA9IDQ7XG5cdH1cbiAgICB9XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBDb25zdHJ1Y3QgdGhlIEh1ZmZtYW4gdHJlZSBmb3IgdGhlIGJpdCBsZW5ndGhzIGFuZCByZXR1cm4gdGhlIGluZGV4IGluXG4gKiBibF9vcmRlciBvZiB0aGUgbGFzdCBiaXQgbGVuZ3RoIGNvZGUgdG8gc2VuZC5cbiAqL1xudmFyIHppcF9idWlsZF9ibF90cmVlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG1heF9ibGluZGV4OyAgLy8gaW5kZXggb2YgbGFzdCBiaXQgbGVuZ3RoIGNvZGUgb2Ygbm9uIHplcm8gZnJlcVxuXG4gICAgLy8gRGV0ZXJtaW5lIHRoZSBiaXQgbGVuZ3RoIGZyZXF1ZW5jaWVzIGZvciBsaXRlcmFsIGFuZCBkaXN0YW5jZSB0cmVlc1xuICAgIHppcF9zY2FuX3RyZWUoemlwX2R5bl9sdHJlZSwgemlwX2xfZGVzYy5tYXhfY29kZSk7XG4gICAgemlwX3NjYW5fdHJlZSh6aXBfZHluX2R0cmVlLCB6aXBfZF9kZXNjLm1heF9jb2RlKTtcblxuICAgIC8vIEJ1aWxkIHRoZSBiaXQgbGVuZ3RoIHRyZWU6XG4gICAgemlwX2J1aWxkX3RyZWUoemlwX2JsX2Rlc2MpO1xuICAgIC8qIG9wdF9sZW4gbm93IGluY2x1ZGVzIHRoZSBsZW5ndGggb2YgdGhlIHRyZWUgcmVwcmVzZW50YXRpb25zLCBleGNlcHRcbiAgICAgKiB0aGUgbGVuZ3RocyBvZiB0aGUgYml0IGxlbmd0aHMgY29kZXMgYW5kIHRoZSA1KzUrNCBiaXRzIGZvciB0aGUgY291bnRzLlxuICAgICAqL1xuXG4gICAgLyogRGV0ZXJtaW5lIHRoZSBudW1iZXIgb2YgYml0IGxlbmd0aCBjb2RlcyB0byBzZW5kLiBUaGUgcGt6aXAgZm9ybWF0XG4gICAgICogcmVxdWlyZXMgdGhhdCBhdCBsZWFzdCA0IGJpdCBsZW5ndGggY29kZXMgYmUgc2VudC4gKGFwcG5vdGUudHh0IHNheXNcbiAgICAgKiAzIGJ1dCB0aGUgYWN0dWFsIHZhbHVlIHVzZWQgaXMgNC4pXG4gICAgICovXG4gICAgZm9yKG1heF9ibGluZGV4ID0gemlwX0JMX0NPREVTLTE7IG1heF9ibGluZGV4ID49IDM7IG1heF9ibGluZGV4LS0pIHtcblx0aWYoemlwX2JsX3RyZWVbemlwX2JsX29yZGVyW21heF9ibGluZGV4XV0uZGwgIT0gMCkgYnJlYWs7XG4gICAgfVxuICAgIC8qIFVwZGF0ZSBvcHRfbGVuIHRvIGluY2x1ZGUgdGhlIGJpdCBsZW5ndGggdHJlZSBhbmQgY291bnRzICovXG4gICAgemlwX29wdF9sZW4gKz0gMyoobWF4X2JsaW5kZXgrMSkgKyA1KzUrNDtcbi8vICAgIFRyYWNldigoc3RkZXJyLCBcIlxcbmR5biB0cmVlczogZHluICVsZCwgc3RhdCAlbGRcIixcbi8vXHQgICAgZW5jb2Rlci0+b3B0X2xlbiwgZW5jb2Rlci0+c3RhdGljX2xlbikpO1xuXG4gICAgcmV0dXJuIG1heF9ibGluZGV4O1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogU2VuZCB0aGUgaGVhZGVyIGZvciBhIGJsb2NrIHVzaW5nIGR5bmFtaWMgSHVmZm1hbiB0cmVlczogdGhlIGNvdW50cywgdGhlXG4gKiBsZW5ndGhzIG9mIHRoZSBiaXQgbGVuZ3RoIGNvZGVzLCB0aGUgbGl0ZXJhbCB0cmVlIGFuZCB0aGUgZGlzdGFuY2UgdHJlZS5cbiAqIElOIGFzc2VydGlvbjogbGNvZGVzID49IDI1NywgZGNvZGVzID49IDEsIGJsY29kZXMgPj0gNC5cbiAqL1xudmFyIHppcF9zZW5kX2FsbF90cmVlcyA9IGZ1bmN0aW9uKGxjb2RlcywgZGNvZGVzLCBibGNvZGVzKSB7IC8vIG51bWJlciBvZiBjb2RlcyBmb3IgZWFjaCB0cmVlXG4gICAgdmFyIHJhbms7IC8vIGluZGV4IGluIGJsX29yZGVyXG5cbi8vICAgIEFzc2VydCAobGNvZGVzID49IDI1NyAmJiBkY29kZXMgPj0gMSAmJiBibGNvZGVzID49IDQsIFwibm90IGVub3VnaCBjb2Rlc1wiKTtcbi8vICAgIEFzc2VydCAobGNvZGVzIDw9IExfQ09ERVMgJiYgZGNvZGVzIDw9IERfQ09ERVMgJiYgYmxjb2RlcyA8PSBCTF9DT0RFUyxcbi8vXHQgICAgXCJ0b28gbWFueSBjb2Rlc1wiKTtcbi8vICAgIFRyYWNldigoc3RkZXJyLCBcIlxcbmJsIGNvdW50czogXCIpKTtcbiAgICB6aXBfc2VuZF9iaXRzKGxjb2Rlcy0yNTcsIDUpOyAvLyBub3QgKzI1NSBhcyBzdGF0ZWQgaW4gYXBwbm90ZS50eHRcbiAgICB6aXBfc2VuZF9iaXRzKGRjb2Rlcy0xLCAgIDUpO1xuICAgIHppcF9zZW5kX2JpdHMoYmxjb2Rlcy00LCAgNCk7IC8vIG5vdCAtMyBhcyBzdGF0ZWQgaW4gYXBwbm90ZS50eHRcbiAgICBmb3IocmFuayA9IDA7IHJhbmsgPCBibGNvZGVzOyByYW5rKyspIHtcbi8vICAgICAgVHJhY2V2KChzdGRlcnIsIFwiXFxuYmwgY29kZSAlMmQgXCIsIGJsX29yZGVyW3JhbmtdKSk7XG5cdHppcF9zZW5kX2JpdHMoemlwX2JsX3RyZWVbemlwX2JsX29yZGVyW3JhbmtdXS5kbCwgMyk7XG4gICAgfVxuXG4gICAgLy8gc2VuZCB0aGUgbGl0ZXJhbCB0cmVlXG4gICAgemlwX3NlbmRfdHJlZSh6aXBfZHluX2x0cmVlLGxjb2Rlcy0xKTtcblxuICAgIC8vIHNlbmQgdGhlIGRpc3RhbmNlIHRyZWVcbiAgICB6aXBfc2VuZF90cmVlKHppcF9keW5fZHRyZWUsZGNvZGVzLTEpO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogRGV0ZXJtaW5lIHRoZSBiZXN0IGVuY29kaW5nIGZvciB0aGUgY3VycmVudCBibG9jazogZHluYW1pYyB0cmVlcywgc3RhdGljXG4gKiB0cmVlcyBvciBzdG9yZSwgYW5kIG91dHB1dCB0aGUgZW5jb2RlZCBibG9jayB0byB0aGUgemlwIGZpbGUuXG4gKi9cbnZhciB6aXBfZmx1c2hfYmxvY2sgPSBmdW5jdGlvbihlb2YpIHsgLy8gdHJ1ZSBpZiB0aGlzIGlzIHRoZSBsYXN0IGJsb2NrIGZvciBhIGZpbGVcbiAgICB2YXIgb3B0X2xlbmIsIHN0YXRpY19sZW5iOyAvLyBvcHRfbGVuIGFuZCBzdGF0aWNfbGVuIGluIGJ5dGVzXG4gICAgdmFyIG1heF9ibGluZGV4O1x0Ly8gaW5kZXggb2YgbGFzdCBiaXQgbGVuZ3RoIGNvZGUgb2Ygbm9uIHplcm8gZnJlcVxuICAgIHZhciBzdG9yZWRfbGVuO1x0Ly8gbGVuZ3RoIG9mIGlucHV0IGJsb2NrXG5cbiAgICBzdG9yZWRfbGVuID0gemlwX3N0cnN0YXJ0IC0gemlwX2Jsb2NrX3N0YXJ0O1xuICAgIHppcF9mbGFnX2J1Zlt6aXBfbGFzdF9mbGFnc10gPSB6aXBfZmxhZ3M7IC8vIFNhdmUgdGhlIGZsYWdzIGZvciB0aGUgbGFzdCA4IGl0ZW1zXG5cbiAgICAvLyBDb25zdHJ1Y3QgdGhlIGxpdGVyYWwgYW5kIGRpc3RhbmNlIHRyZWVzXG4gICAgemlwX2J1aWxkX3RyZWUoemlwX2xfZGVzYyk7XG4vLyAgICBUcmFjZXYoKHN0ZGVyciwgXCJcXG5saXQgZGF0YTogZHluICVsZCwgc3RhdCAlbGRcIixcbi8vXHQgICAgZW5jb2Rlci0+b3B0X2xlbiwgZW5jb2Rlci0+c3RhdGljX2xlbikpO1xuXG4gICAgemlwX2J1aWxkX3RyZWUoemlwX2RfZGVzYyk7XG4vLyAgICBUcmFjZXYoKHN0ZGVyciwgXCJcXG5kaXN0IGRhdGE6IGR5biAlbGQsIHN0YXQgJWxkXCIsXG4vL1x0ICAgIGVuY29kZXItPm9wdF9sZW4sIGVuY29kZXItPnN0YXRpY19sZW4pKTtcbiAgICAvKiBBdCB0aGlzIHBvaW50LCBvcHRfbGVuIGFuZCBzdGF0aWNfbGVuIGFyZSB0aGUgdG90YWwgYml0IGxlbmd0aHMgb2ZcbiAgICAgKiB0aGUgY29tcHJlc3NlZCBibG9jayBkYXRhLCBleGNsdWRpbmcgdGhlIHRyZWUgcmVwcmVzZW50YXRpb25zLlxuICAgICAqL1xuXG4gICAgLyogQnVpbGQgdGhlIGJpdCBsZW5ndGggdHJlZSBmb3IgdGhlIGFib3ZlIHR3byB0cmVlcywgYW5kIGdldCB0aGUgaW5kZXhcbiAgICAgKiBpbiBibF9vcmRlciBvZiB0aGUgbGFzdCBiaXQgbGVuZ3RoIGNvZGUgdG8gc2VuZC5cbiAgICAgKi9cbiAgICBtYXhfYmxpbmRleCA9IHppcF9idWlsZF9ibF90cmVlKCk7XG5cbiAgICAvLyBEZXRlcm1pbmUgdGhlIGJlc3QgZW5jb2RpbmcuIENvbXB1dGUgZmlyc3QgdGhlIGJsb2NrIGxlbmd0aCBpbiBieXRlc1xuICAgIG9wdF9sZW5iXHQ9ICh6aXBfb3B0X2xlbiAgICszKzcpPj4zO1xuICAgIHN0YXRpY19sZW5iID0gKHppcF9zdGF0aWNfbGVuKzMrNyk+PjM7XG5cbi8vICAgIFRyYWNlKChzdGRlcnIsIFwiXFxub3B0ICVsdSglbHUpIHN0YXQgJWx1KCVsdSkgc3RvcmVkICVsdSBsaXQgJXUgZGlzdCAldSBcIixcbi8vXHQgICBvcHRfbGVuYiwgZW5jb2Rlci0+b3B0X2xlbixcbi8vXHQgICBzdGF0aWNfbGVuYiwgZW5jb2Rlci0+c3RhdGljX2xlbiwgc3RvcmVkX2xlbixcbi8vXHQgICBlbmNvZGVyLT5sYXN0X2xpdCwgZW5jb2Rlci0+bGFzdF9kaXN0KSk7XG5cbiAgICBpZihzdGF0aWNfbGVuYiA8PSBvcHRfbGVuYilcblx0b3B0X2xlbmIgPSBzdGF0aWNfbGVuYjtcbiAgICBpZihzdG9yZWRfbGVuICsgNCA8PSBvcHRfbGVuYiAvLyA0OiB0d28gd29yZHMgZm9yIHRoZSBsZW5ndGhzXG4gICAgICAgJiYgemlwX2Jsb2NrX3N0YXJ0ID49IDApIHtcblx0dmFyIGk7XG5cblx0LyogVGhlIHRlc3QgYnVmICE9IE5VTEwgaXMgb25seSBuZWNlc3NhcnkgaWYgTElUX0JVRlNJWkUgPiBXU0laRS5cblx0ICogT3RoZXJ3aXNlIHdlIGNhbid0IGhhdmUgcHJvY2Vzc2VkIG1vcmUgdGhhbiBXU0laRSBpbnB1dCBieXRlcyBzaW5jZVxuXHQgKiB0aGUgbGFzdCBibG9jayBmbHVzaCwgYmVjYXVzZSBjb21wcmVzc2lvbiB3b3VsZCBoYXZlIGJlZW5cblx0ICogc3VjY2Vzc2Z1bC4gSWYgTElUX0JVRlNJWkUgPD0gV1NJWkUsIGl0IGlzIG5ldmVyIHRvbyBsYXRlIHRvXG5cdCAqIHRyYW5zZm9ybSBhIGJsb2NrIGludG8gYSBzdG9yZWQgYmxvY2suXG5cdCAqL1xuXHR6aXBfc2VuZF9iaXRzKCh6aXBfU1RPUkVEX0JMT0NLPDwxKStlb2YsIDMpOyAgLyogc2VuZCBibG9jayB0eXBlICovXG5cdHppcF9iaV93aW5kdXAoKTtcdFx0IC8qIGFsaWduIG9uIGJ5dGUgYm91bmRhcnkgKi9cblx0emlwX3B1dF9zaG9ydChzdG9yZWRfbGVuKTtcblx0emlwX3B1dF9zaG9ydCh+c3RvcmVkX2xlbik7XG5cbiAgICAgIC8vIGNvcHkgYmxvY2tcbi8qXG4gICAgICBwID0gJndpbmRvd1tibG9ja19zdGFydF07XG4gICAgICBmb3IoaSA9IDA7IGkgPCBzdG9yZWRfbGVuOyBpKyspXG5cdHB1dF9ieXRlKHBbaV0pO1xuKi9cblx0Zm9yKGkgPSAwOyBpIDwgc3RvcmVkX2xlbjsgaSsrKVxuXHQgICAgemlwX3B1dF9ieXRlKHppcF93aW5kb3dbemlwX2Jsb2NrX3N0YXJ0ICsgaV0pO1xuXG4gICAgfSBlbHNlIGlmKHN0YXRpY19sZW5iID09IG9wdF9sZW5iKSB7XG5cdHppcF9zZW5kX2JpdHMoKHppcF9TVEFUSUNfVFJFRVM8PDEpK2VvZiwgMyk7XG5cdHppcF9jb21wcmVzc19ibG9jayh6aXBfc3RhdGljX2x0cmVlLCB6aXBfc3RhdGljX2R0cmVlKTtcbiAgICB9IGVsc2Uge1xuXHR6aXBfc2VuZF9iaXRzKCh6aXBfRFlOX1RSRUVTPDwxKStlb2YsIDMpO1xuXHR6aXBfc2VuZF9hbGxfdHJlZXMoemlwX2xfZGVzYy5tYXhfY29kZSsxLFxuXHRcdFx0ICAgemlwX2RfZGVzYy5tYXhfY29kZSsxLFxuXHRcdFx0ICAgbWF4X2JsaW5kZXgrMSk7XG5cdHppcF9jb21wcmVzc19ibG9jayh6aXBfZHluX2x0cmVlLCB6aXBfZHluX2R0cmVlKTtcbiAgICB9XG5cbiAgICB6aXBfaW5pdF9ibG9jaygpO1xuXG4gICAgaWYoZW9mICE9IDApXG5cdHppcF9iaV93aW5kdXAoKTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFNhdmUgdGhlIG1hdGNoIGluZm8gYW5kIHRhbGx5IHRoZSBmcmVxdWVuY3kgY291bnRzLiBSZXR1cm4gdHJ1ZSBpZlxuICogdGhlIGN1cnJlbnQgYmxvY2sgbXVzdCBiZSBmbHVzaGVkLlxuICovXG52YXIgemlwX2N0X3RhbGx5ID0gZnVuY3Rpb24oXG5cdGRpc3QsIC8vIGRpc3RhbmNlIG9mIG1hdGNoZWQgc3RyaW5nXG5cdGxjKSB7IC8vIG1hdGNoIGxlbmd0aC1NSU5fTUFUQ0ggb3IgdW5tYXRjaGVkIGNoYXIgKGlmIGRpc3Q9PTApXG4gICAgemlwX2xfYnVmW3ppcF9sYXN0X2xpdCsrXSA9IGxjO1xuICAgIGlmKGRpc3QgPT0gMCkge1xuXHQvLyBsYyBpcyB0aGUgdW5tYXRjaGVkIGNoYXJcblx0emlwX2R5bl9sdHJlZVtsY10uZmMrKztcbiAgICB9IGVsc2Uge1xuXHQvLyBIZXJlLCBsYyBpcyB0aGUgbWF0Y2ggbGVuZ3RoIC0gTUlOX01BVENIXG5cdGRpc3QtLTtcdFx0ICAgIC8vIGRpc3QgPSBtYXRjaCBkaXN0YW5jZSAtIDFcbi8vICAgICAgQXNzZXJ0KCh1c2gpZGlzdCA8ICh1c2gpTUFYX0RJU1QgJiZcbi8vXHQgICAgICh1c2gpbGMgPD0gKHVzaCkoTUFYX01BVENILU1JTl9NQVRDSCkgJiZcbi8vXHQgICAgICh1c2gpRF9DT0RFKGRpc3QpIDwgKHVzaClEX0NPREVTLCAgXCJjdF90YWxseTogYmFkIG1hdGNoXCIpO1xuXG5cdHppcF9keW5fbHRyZWVbemlwX2xlbmd0aF9jb2RlW2xjXSt6aXBfTElURVJBTFMrMV0uZmMrKztcblx0emlwX2R5bl9kdHJlZVt6aXBfRF9DT0RFKGRpc3QpXS5mYysrO1xuXG5cdHppcF9kX2J1Zlt6aXBfbGFzdF9kaXN0KytdID0gZGlzdDtcblx0emlwX2ZsYWdzIHw9IHppcF9mbGFnX2JpdDtcbiAgICB9XG4gICAgemlwX2ZsYWdfYml0IDw8PSAxO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBmbGFncyBpZiB0aGV5IGZpbGwgYSBieXRlXG4gICAgaWYoKHppcF9sYXN0X2xpdCAmIDcpID09IDApIHtcblx0emlwX2ZsYWdfYnVmW3ppcF9sYXN0X2ZsYWdzKytdID0gemlwX2ZsYWdzO1xuXHR6aXBfZmxhZ3MgPSAwO1xuXHR6aXBfZmxhZ19iaXQgPSAxO1xuICAgIH1cbiAgICAvLyBUcnkgdG8gZ3Vlc3MgaWYgaXQgaXMgcHJvZml0YWJsZSB0byBzdG9wIHRoZSBjdXJyZW50IGJsb2NrIGhlcmVcbiAgICBpZih6aXBfY29tcHJfbGV2ZWwgPiAyICYmICh6aXBfbGFzdF9saXQgJiAweGZmZikgPT0gMCkge1xuXHQvLyBDb21wdXRlIGFuIHVwcGVyIGJvdW5kIGZvciB0aGUgY29tcHJlc3NlZCBsZW5ndGhcblx0dmFyIG91dF9sZW5ndGggPSB6aXBfbGFzdF9saXQgKiA4O1xuXHR2YXIgaW5fbGVuZ3RoID0gemlwX3N0cnN0YXJ0IC0gemlwX2Jsb2NrX3N0YXJ0O1xuXHR2YXIgZGNvZGU7XG5cblx0Zm9yKGRjb2RlID0gMDsgZGNvZGUgPCB6aXBfRF9DT0RFUzsgZGNvZGUrKykge1xuXHQgICAgb3V0X2xlbmd0aCArPSB6aXBfZHluX2R0cmVlW2Rjb2RlXS5mYyAqICg1ICsgemlwX2V4dHJhX2RiaXRzW2Rjb2RlXSk7XG5cdH1cblx0b3V0X2xlbmd0aCA+Pj0gMztcbi8vICAgICAgVHJhY2UoKHN0ZGVycixcIlxcbmxhc3RfbGl0ICV1LCBsYXN0X2Rpc3QgJXUsIGluICVsZCwgb3V0IH4lbGQoJWxkJSUpIFwiLFxuLy9cdCAgICAgZW5jb2Rlci0+bGFzdF9saXQsIGVuY29kZXItPmxhc3RfZGlzdCwgaW5fbGVuZ3RoLCBvdXRfbGVuZ3RoLFxuLy9cdCAgICAgMTAwTCAtIG91dF9sZW5ndGgqMTAwTC9pbl9sZW5ndGgpKTtcblx0aWYoemlwX2xhc3RfZGlzdCA8IHBhcnNlSW50KHppcF9sYXN0X2xpdC8yKSAmJlxuXHQgICBvdXRfbGVuZ3RoIDwgcGFyc2VJbnQoaW5fbGVuZ3RoLzIpKVxuXHQgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiAoemlwX2xhc3RfbGl0ID09IHppcF9MSVRfQlVGU0laRS0xIHx8XG5cdCAgICB6aXBfbGFzdF9kaXN0ID09IHppcF9ESVNUX0JVRlNJWkUpO1xuICAgIC8qIFdlIGF2b2lkIGVxdWFsaXR5IHdpdGggTElUX0JVRlNJWkUgYmVjYXVzZSBvZiB3cmFwYXJvdW5kIGF0IDY0S1xuICAgICAqIG9uIDE2IGJpdCBtYWNoaW5lcyBhbmQgYmVjYXVzZSBzdG9yZWQgYmxvY2tzIGFyZSByZXN0cmljdGVkIHRvXG4gICAgICogNjRLLTEgYnl0ZXMuXG4gICAgICovXG59XG5cbiAgLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICogU2VuZCB0aGUgYmxvY2sgZGF0YSBjb21wcmVzc2VkIHVzaW5nIHRoZSBnaXZlbiBIdWZmbWFuIHRyZWVzXG4gICAqL1xudmFyIHppcF9jb21wcmVzc19ibG9jayA9IGZ1bmN0aW9uKFxuXHRsdHJlZSxcdC8vIGxpdGVyYWwgdHJlZVxuXHRkdHJlZSkge1x0Ly8gZGlzdGFuY2UgdHJlZVxuICAgIHZhciBkaXN0O1x0XHQvLyBkaXN0YW5jZSBvZiBtYXRjaGVkIHN0cmluZ1xuICAgIHZhciBsYztcdFx0Ly8gbWF0Y2ggbGVuZ3RoIG9yIHVubWF0Y2hlZCBjaGFyIChpZiBkaXN0ID09IDApXG4gICAgdmFyIGx4ID0gMDtcdFx0Ly8gcnVubmluZyBpbmRleCBpbiBsX2J1ZlxuICAgIHZhciBkeCA9IDA7XHRcdC8vIHJ1bm5pbmcgaW5kZXggaW4gZF9idWZcbiAgICB2YXIgZnggPSAwO1x0XHQvLyBydW5uaW5nIGluZGV4IGluIGZsYWdfYnVmXG4gICAgdmFyIGZsYWcgPSAwO1x0Ly8gY3VycmVudCBmbGFnc1xuICAgIHZhciBjb2RlO1x0XHQvLyB0aGUgY29kZSB0byBzZW5kXG4gICAgdmFyIGV4dHJhO1x0XHQvLyBudW1iZXIgb2YgZXh0cmEgYml0cyB0byBzZW5kXG5cbiAgICBpZih6aXBfbGFzdF9saXQgIT0gMCkgZG8ge1xuXHRpZigobHggJiA3KSA9PSAwKVxuXHQgICAgZmxhZyA9IHppcF9mbGFnX2J1ZltmeCsrXTtcblx0bGMgPSB6aXBfbF9idWZbbHgrK10gJiAweGZmO1xuXHRpZigoZmxhZyAmIDEpID09IDApIHtcblx0ICAgIHppcF9TRU5EX0NPREUobGMsIGx0cmVlKTsgLyogc2VuZCBhIGxpdGVyYWwgYnl0ZSAqL1xuLy9cdFRyYWNlY3YoaXNncmFwaChsYyksIChzdGRlcnIsXCIgJyVjJyBcIiwgbGMpKTtcblx0fSBlbHNlIHtcblx0ICAgIC8vIEhlcmUsIGxjIGlzIHRoZSBtYXRjaCBsZW5ndGggLSBNSU5fTUFUQ0hcblx0ICAgIGNvZGUgPSB6aXBfbGVuZ3RoX2NvZGVbbGNdO1xuXHQgICAgemlwX1NFTkRfQ09ERShjb2RlK3ppcF9MSVRFUkFMUysxLCBsdHJlZSk7IC8vIHNlbmQgdGhlIGxlbmd0aCBjb2RlXG5cdCAgICBleHRyYSA9IHppcF9leHRyYV9sYml0c1tjb2RlXTtcblx0ICAgIGlmKGV4dHJhICE9IDApIHtcblx0XHRsYyAtPSB6aXBfYmFzZV9sZW5ndGhbY29kZV07XG5cdFx0emlwX3NlbmRfYml0cyhsYywgZXh0cmEpOyAvLyBzZW5kIHRoZSBleHRyYSBsZW5ndGggYml0c1xuXHQgICAgfVxuXHQgICAgZGlzdCA9IHppcF9kX2J1ZltkeCsrXTtcblx0ICAgIC8vIEhlcmUsIGRpc3QgaXMgdGhlIG1hdGNoIGRpc3RhbmNlIC0gMVxuXHQgICAgY29kZSA9IHppcF9EX0NPREUoZGlzdCk7XG4vL1x0QXNzZXJ0IChjb2RlIDwgRF9DT0RFUywgXCJiYWQgZF9jb2RlXCIpO1xuXG5cdCAgICB6aXBfU0VORF9DT0RFKGNvZGUsIGR0cmVlKTtcdCAgLy8gc2VuZCB0aGUgZGlzdGFuY2UgY29kZVxuXHQgICAgZXh0cmEgPSB6aXBfZXh0cmFfZGJpdHNbY29kZV07XG5cdCAgICBpZihleHRyYSAhPSAwKSB7XG5cdFx0ZGlzdCAtPSB6aXBfYmFzZV9kaXN0W2NvZGVdO1xuXHRcdHppcF9zZW5kX2JpdHMoZGlzdCwgZXh0cmEpOyAgIC8vIHNlbmQgdGhlIGV4dHJhIGRpc3RhbmNlIGJpdHNcblx0ICAgIH1cblx0fSAvLyBsaXRlcmFsIG9yIG1hdGNoIHBhaXIgP1xuXHRmbGFnID4+PSAxO1xuICAgIH0gd2hpbGUobHggPCB6aXBfbGFzdF9saXQpO1xuXG4gICAgemlwX1NFTkRfQ09ERSh6aXBfRU5EX0JMT0NLLCBsdHJlZSk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBTZW5kIGEgdmFsdWUgb24gYSBnaXZlbiBudW1iZXIgb2YgYml0cy5cbiAqIElOIGFzc2VydGlvbjogbGVuZ3RoIDw9IDE2IGFuZCB2YWx1ZSBmaXRzIGluIGxlbmd0aCBiaXRzLlxuICovXG52YXIgemlwX0J1Zl9zaXplID0gMTY7IC8vIGJpdCBzaXplIG9mIGJpX2J1ZlxudmFyIHppcF9zZW5kX2JpdHMgPSBmdW5jdGlvbihcblx0dmFsdWUsXHQvLyB2YWx1ZSB0byBzZW5kXG5cdGxlbmd0aCkge1x0Ly8gbnVtYmVyIG9mIGJpdHNcbiAgICAvKiBJZiBub3QgZW5vdWdoIHJvb20gaW4gYmlfYnVmLCB1c2UgKHZhbGlkKSBiaXRzIGZyb20gYmlfYnVmIGFuZFxuICAgICAqICgxNiAtIGJpX3ZhbGlkKSBiaXRzIGZyb20gdmFsdWUsIGxlYXZpbmcgKHdpZHRoIC0gKDE2LWJpX3ZhbGlkKSlcbiAgICAgKiB1bnVzZWQgYml0cyBpbiB2YWx1ZS5cbiAgICAgKi9cbiAgICBpZih6aXBfYmlfdmFsaWQgPiB6aXBfQnVmX3NpemUgLSBsZW5ndGgpIHtcblx0emlwX2JpX2J1ZiB8PSAodmFsdWUgPDwgemlwX2JpX3ZhbGlkKTtcblx0emlwX3B1dF9zaG9ydCh6aXBfYmlfYnVmKTtcblx0emlwX2JpX2J1ZiA9ICh2YWx1ZSA+PiAoemlwX0J1Zl9zaXplIC0gemlwX2JpX3ZhbGlkKSk7XG5cdHppcF9iaV92YWxpZCArPSBsZW5ndGggLSB6aXBfQnVmX3NpemU7XG4gICAgfSBlbHNlIHtcblx0emlwX2JpX2J1ZiB8PSB2YWx1ZSA8PCB6aXBfYmlfdmFsaWQ7XG5cdHppcF9iaV92YWxpZCArPSBsZW5ndGg7XG4gICAgfVxufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogUmV2ZXJzZSB0aGUgZmlyc3QgbGVuIGJpdHMgb2YgYSBjb2RlLCB1c2luZyBzdHJhaWdodGZvcndhcmQgY29kZSAoYSBmYXN0ZXJcbiAqIG1ldGhvZCB3b3VsZCB1c2UgYSB0YWJsZSlcbiAqIElOIGFzc2VydGlvbjogMSA8PSBsZW4gPD0gMTVcbiAqL1xudmFyIHppcF9iaV9yZXZlcnNlID0gZnVuY3Rpb24oXG5cdGNvZGUsXHQvLyB0aGUgdmFsdWUgdG8gaW52ZXJ0XG5cdGxlbikge1x0Ly8gaXRzIGJpdCBsZW5ndGhcbiAgICB2YXIgcmVzID0gMDtcbiAgICBkbyB7XG5cdHJlcyB8PSBjb2RlICYgMTtcblx0Y29kZSA+Pj0gMTtcblx0cmVzIDw8PSAxO1xuICAgIH0gd2hpbGUoLS1sZW4gPiAwKTtcbiAgICByZXR1cm4gcmVzID4+IDE7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBXcml0ZSBvdXQgYW55IHJlbWFpbmluZyBiaXRzIGluIGFuIGluY29tcGxldGUgYnl0ZS5cbiAqL1xudmFyIHppcF9iaV93aW5kdXAgPSBmdW5jdGlvbigpIHtcbiAgICBpZih6aXBfYmlfdmFsaWQgPiA4KSB7XG5cdHppcF9wdXRfc2hvcnQoemlwX2JpX2J1Zik7XG4gICAgfSBlbHNlIGlmKHppcF9iaV92YWxpZCA+IDApIHtcblx0emlwX3B1dF9ieXRlKHppcF9iaV9idWYpO1xuICAgIH1cbiAgICB6aXBfYmlfYnVmID0gMDtcbiAgICB6aXBfYmlfdmFsaWQgPSAwO1xufVxuXG52YXIgemlwX3FvdXRidWYgPSBmdW5jdGlvbigpIHtcbiAgICBpZih6aXBfb3V0Y250ICE9IDApIHtcblx0dmFyIHEsIGk7XG5cdHEgPSB6aXBfbmV3X3F1ZXVlKCk7XG5cdGlmKHppcF9xaGVhZCA9PSBudWxsKVxuXHQgICAgemlwX3FoZWFkID0gemlwX3F0YWlsID0gcTtcblx0ZWxzZVxuXHQgICAgemlwX3F0YWlsID0gemlwX3F0YWlsLm5leHQgPSBxO1xuXHRxLmxlbiA9IHppcF9vdXRjbnQgLSB6aXBfb3V0b2ZmO1xuLy8gICAgICBTeXN0ZW0uYXJyYXljb3B5KHppcF9vdXRidWYsIHppcF9vdXRvZmYsIHEucHRyLCAwLCBxLmxlbik7XG5cdGZvcihpID0gMDsgaSA8IHEubGVuOyBpKyspXG5cdCAgICBxLnB0cltpXSA9IHppcF9vdXRidWZbemlwX291dG9mZiArIGldO1xuXHR6aXBfb3V0Y250ID0gemlwX291dG9mZiA9IDA7XG4gICAgfVxufVxuXG52YXIgemlwX2RlZmxhdGUgPSBmdW5jdGlvbihzdHIsIGxldmVsKSB7XG4gICAgdmFyIGksIGo7XG5cbiAgICB6aXBfZGVmbGF0ZV9kYXRhID0gc3RyO1xuICAgIHppcF9kZWZsYXRlX3BvcyA9IDA7XG4gICAgaWYodHlwZW9mIGxldmVsID09IFwidW5kZWZpbmVkXCIpXG5cdGxldmVsID0gemlwX0RFRkFVTFRfTEVWRUw7XG4gICAgemlwX2RlZmxhdGVfc3RhcnQobGV2ZWwpO1xuXG4gICAgdmFyIGJ1ZmYgPSBuZXcgQXJyYXkoMTAyNCk7XG4gICAgdmFyIGFvdXQgPSBbXTtcbiAgICB3aGlsZSgoaSA9IHppcF9kZWZsYXRlX2ludGVybmFsKGJ1ZmYsIDAsIGJ1ZmYubGVuZ3RoKSkgPiAwKSB7XG5cdHZhciBjYnVmID0gbmV3IEFycmF5KGkpO1xuXHRmb3IoaiA9IDA7IGogPCBpOyBqKyspe1xuXHQgICAgY2J1ZltqXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmZltqXSk7XG5cdH1cblx0YW91dFthb3V0Lmxlbmd0aF0gPSBjYnVmLmpvaW4oXCJcIik7XG4gICAgfVxuICAgIHppcF9kZWZsYXRlX2RhdGEgPSBudWxsOyAvLyBHLkMuXG4gICAgcmV0dXJuIGFvdXQuam9pbihcIlwiKTtcbn1cblxuaWYgKCEgY3R4LlJhd0RlZmxhdGUpIGN0eC5SYXdEZWZsYXRlID0ge307XG5jdHguUmF3RGVmbGF0ZS5kZWZsYXRlID0gemlwX2RlZmxhdGU7XG5cbn0pKHRoaXMpO1xuIiwiLypcbiAqICRJZDogcmF3aW5mbGF0ZS5qcyx2IDAuNCAyMDE0LzAzLzAxIDIxOjU5OjA4IGRhbmtvZ2FpIEV4cCBkYW5rb2dhaSAkXG4gKlxuICogR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UsIHZlcnNpb24gMiAoR1BMLTIuMClcbiAqICAgaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0dQTC0yLjBcbiAqIG9yaWdpbmFsOlxuICogICBodHRwOi8vd3d3Lm9uaWNvcy5jb20vc3RhZmYvaXovYW11c2UvamF2YXNjcmlwdC9leHBlcnQvaW5mbGF0ZS50eHRcbiAqL1xuXG4oZnVuY3Rpb24oY3R4KXtcblxuLyogQ29weXJpZ2h0IChDKSAxOTk5IE1hc2FuYW8gSXp1bW8gPGl6QG9uaWNvcy5jby5qcD5cbiAqIFZlcnNpb246IDEuMC4wLjFcbiAqIExhc3RNb2RpZmllZDogRGVjIDI1IDE5OTlcbiAqL1xuXG4vKiBJbnRlcmZhY2U6XG4gKiBkYXRhID0gemlwX2luZmxhdGUoc3JjKTtcbiAqL1xuXG4vKiBjb25zdGFudCBwYXJhbWV0ZXJzICovXG52YXIgemlwX1dTSVpFID0gMzI3Njg7XHRcdC8vIFNsaWRpbmcgV2luZG93IHNpemVcbnZhciB6aXBfU1RPUkVEX0JMT0NLID0gMDtcbnZhciB6aXBfU1RBVElDX1RSRUVTID0gMTtcbnZhciB6aXBfRFlOX1RSRUVTICAgID0gMjtcblxuLyogZm9yIGluZmxhdGUgKi9cbnZhciB6aXBfbGJpdHMgPSA5OyBcdFx0Ly8gYml0cyBpbiBiYXNlIGxpdGVyYWwvbGVuZ3RoIGxvb2t1cCB0YWJsZVxudmFyIHppcF9kYml0cyA9IDY7IFx0XHQvLyBiaXRzIGluIGJhc2UgZGlzdGFuY2UgbG9va3VwIHRhYmxlXG52YXIgemlwX0lOQlVGU0laID0gMzI3Njg7XHQvLyBJbnB1dCBidWZmZXIgc2l6ZVxudmFyIHppcF9JTkJVRl9FWFRSQSA9IDY0O1x0Ly8gRXh0cmEgYnVmZmVyXG5cbi8qIHZhcmlhYmxlcyAoaW5mbGF0ZSkgKi9cbnZhciB6aXBfc2xpZGU7XG52YXIgemlwX3dwO1x0XHRcdC8vIGN1cnJlbnQgcG9zaXRpb24gaW4gc2xpZGVcbnZhciB6aXBfZml4ZWRfdGwgPSBudWxsO1x0Ly8gaW5mbGF0ZSBzdGF0aWNcbnZhciB6aXBfZml4ZWRfdGQ7XHRcdC8vIGluZmxhdGUgc3RhdGljXG52YXIgemlwX2ZpeGVkX2JsLCB6aXBfZml4ZWRfYmQ7XHQvLyBpbmZsYXRlIHN0YXRpY1xudmFyIHppcF9iaXRfYnVmO1x0XHQvLyBiaXQgYnVmZmVyXG52YXIgemlwX2JpdF9sZW47XHRcdC8vIGJpdHMgaW4gYml0IGJ1ZmZlclxudmFyIHppcF9tZXRob2Q7XG52YXIgemlwX2VvZjtcbnZhciB6aXBfY29weV9sZW5nO1xudmFyIHppcF9jb3B5X2Rpc3Q7XG52YXIgemlwX3RsLCB6aXBfdGQ7XHQvLyBsaXRlcmFsL2xlbmd0aCBhbmQgZGlzdGFuY2UgZGVjb2RlciB0YWJsZXNcbnZhciB6aXBfYmwsIHppcF9iZDtcdC8vIG51bWJlciBvZiBiaXRzIGRlY29kZWQgYnkgdGwgYW5kIHRkXG5cbnZhciB6aXBfaW5mbGF0ZV9kYXRhO1xudmFyIHppcF9pbmZsYXRlX3BvcztcblxuXG4vKiBjb25zdGFudCB0YWJsZXMgKGluZmxhdGUpICovXG52YXIgemlwX01BU0tfQklUUyA9IG5ldyBBcnJheShcbiAgICAweDAwMDAsXG4gICAgMHgwMDAxLCAweDAwMDMsIDB4MDAwNywgMHgwMDBmLCAweDAwMWYsIDB4MDAzZiwgMHgwMDdmLCAweDAwZmYsXG4gICAgMHgwMWZmLCAweDAzZmYsIDB4MDdmZiwgMHgwZmZmLCAweDFmZmYsIDB4M2ZmZiwgMHg3ZmZmLCAweGZmZmYpO1xuLy8gVGFibGVzIGZvciBkZWZsYXRlIGZyb20gUEtaSVAncyBhcHBub3RlLnR4dC5cbnZhciB6aXBfY3BsZW5zID0gbmV3IEFycmF5KCAvLyBDb3B5IGxlbmd0aHMgZm9yIGxpdGVyYWwgY29kZXMgMjU3Li4yODVcbiAgICAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMCwgMTEsIDEzLCAxNSwgMTcsIDE5LCAyMywgMjcsIDMxLFxuICAgIDM1LCA0MywgNTEsIDU5LCA2NywgODMsIDk5LCAxMTUsIDEzMSwgMTYzLCAxOTUsIDIyNywgMjU4LCAwLCAwKTtcbi8qIG5vdGU6IHNlZSBub3RlICMxMyBhYm92ZSBhYm91dCB0aGUgMjU4IGluIHRoaXMgbGlzdC4gKi9cbnZhciB6aXBfY3BsZXh0ID0gbmV3IEFycmF5KCAvLyBFeHRyYSBiaXRzIGZvciBsaXRlcmFsIGNvZGVzIDI1Ny4uMjg1XG4gICAgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMSwgMSwgMSwgMSwgMiwgMiwgMiwgMixcbiAgICAzLCAzLCAzLCAzLCA0LCA0LCA0LCA0LCA1LCA1LCA1LCA1LCAwLCA5OSwgOTkpOyAvLyA5OT09aW52YWxpZFxudmFyIHppcF9jcGRpc3QgPSBuZXcgQXJyYXkoIC8vIENvcHkgb2Zmc2V0cyBmb3IgZGlzdGFuY2UgY29kZXMgMC4uMjlcbiAgICAxLCAyLCAzLCA0LCA1LCA3LCA5LCAxMywgMTcsIDI1LCAzMywgNDksIDY1LCA5NywgMTI5LCAxOTMsXG4gICAgMjU3LCAzODUsIDUxMywgNzY5LCAxMDI1LCAxNTM3LCAyMDQ5LCAzMDczLCA0MDk3LCA2MTQ1LFxuICAgIDgxOTMsIDEyMjg5LCAxNjM4NSwgMjQ1NzcpO1xudmFyIHppcF9jcGRleHQgPSBuZXcgQXJyYXkoIC8vIEV4dHJhIGJpdHMgZm9yIGRpc3RhbmNlIGNvZGVzXG4gICAgMCwgMCwgMCwgMCwgMSwgMSwgMiwgMiwgMywgMywgNCwgNCwgNSwgNSwgNiwgNixcbiAgICA3LCA3LCA4LCA4LCA5LCA5LCAxMCwgMTAsIDExLCAxMSxcbiAgICAxMiwgMTIsIDEzLCAxMyk7XG52YXIgemlwX2JvcmRlciA9IG5ldyBBcnJheSggIC8vIE9yZGVyIG9mIHRoZSBiaXQgbGVuZ3RoIGNvZGUgbGVuZ3Roc1xuICAgIDE2LCAxNywgMTgsIDAsIDgsIDcsIDksIDYsIDEwLCA1LCAxMSwgNCwgMTIsIDMsIDEzLCAyLCAxNCwgMSwgMTUpO1xuLyogb2JqZWN0cyAoaW5mbGF0ZSkgKi9cblxudmFyIHppcF9IdWZ0TGlzdCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubmV4dCA9IG51bGw7XG4gICAgdGhpcy5saXN0ID0gbnVsbDtcbn1cblxudmFyIHppcF9IdWZ0Tm9kZSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZSA9IDA7IC8vIG51bWJlciBvZiBleHRyYSBiaXRzIG9yIG9wZXJhdGlvblxuICAgIHRoaXMuYiA9IDA7IC8vIG51bWJlciBvZiBiaXRzIGluIHRoaXMgY29kZSBvciBzdWJjb2RlXG5cbiAgICAvLyB1bmlvblxuICAgIHRoaXMubiA9IDA7IC8vIGxpdGVyYWwsIGxlbmd0aCBiYXNlLCBvciBkaXN0YW5jZSBiYXNlXG4gICAgdGhpcy50ID0gbnVsbDsgLy8gKHppcF9IdWZ0Tm9kZSkgcG9pbnRlciB0byBuZXh0IGxldmVsIG9mIHRhYmxlXG59XG5cbnZhciB6aXBfSHVmdEJ1aWxkID0gZnVuY3Rpb24oYixcdC8vIGNvZGUgbGVuZ3RocyBpbiBiaXRzIChhbGwgYXNzdW1lZCA8PSBCTUFYKVxuXHRcdCAgICAgICBuLFx0Ly8gbnVtYmVyIG9mIGNvZGVzIChhc3N1bWVkIDw9IE5fTUFYKVxuXHRcdCAgICAgICBzLFx0Ly8gbnVtYmVyIG9mIHNpbXBsZS12YWx1ZWQgY29kZXMgKDAuLnMtMSlcblx0XHQgICAgICAgZCxcdC8vIGxpc3Qgb2YgYmFzZSB2YWx1ZXMgZm9yIG5vbi1zaW1wbGUgY29kZXNcblx0XHQgICAgICAgZSxcdC8vIGxpc3Qgb2YgZXh0cmEgYml0cyBmb3Igbm9uLXNpbXBsZSBjb2Rlc1xuXHRcdCAgICAgICBtbVx0Ly8gbWF4aW11bSBsb29rdXAgYml0c1xuXHRcdCAgICkge1xuICAgIHRoaXMuQk1BWCA9IDE2OyAgIC8vIG1heGltdW0gYml0IGxlbmd0aCBvZiBhbnkgY29kZVxuICAgIHRoaXMuTl9NQVggPSAyODg7IC8vIG1heGltdW0gbnVtYmVyIG9mIGNvZGVzIGluIGFueSBzZXRcbiAgICB0aGlzLnN0YXR1cyA9IDA7XHQvLyAwOiBzdWNjZXNzLCAxOiBpbmNvbXBsZXRlIHRhYmxlLCAyOiBiYWQgaW5wdXRcbiAgICB0aGlzLnJvb3QgPSBudWxsO1x0Ly8gKHppcF9IdWZ0TGlzdCkgc3RhcnRpbmcgdGFibGVcbiAgICB0aGlzLm0gPSAwO1x0XHQvLyBtYXhpbXVtIGxvb2t1cCBiaXRzLCByZXR1cm5zIGFjdHVhbFxuXG4vKiBHaXZlbiBhIGxpc3Qgb2YgY29kZSBsZW5ndGhzIGFuZCBhIG1heGltdW0gdGFibGUgc2l6ZSwgbWFrZSBhIHNldCBvZlxuICAgdGFibGVzIHRvIGRlY29kZSB0aGF0IHNldCBvZiBjb2Rlcy5cdFJldHVybiB6ZXJvIG9uIHN1Y2Nlc3MsIG9uZSBpZlxuICAgdGhlIGdpdmVuIGNvZGUgc2V0IGlzIGluY29tcGxldGUgKHRoZSB0YWJsZXMgYXJlIHN0aWxsIGJ1aWx0IGluIHRoaXNcbiAgIGNhc2UpLCB0d28gaWYgdGhlIGlucHV0IGlzIGludmFsaWQgKGFsbCB6ZXJvIGxlbmd0aCBjb2RlcyBvciBhblxuICAgb3ZlcnN1YnNjcmliZWQgc2V0IG9mIGxlbmd0aHMpLCBhbmQgdGhyZWUgaWYgbm90IGVub3VnaCBtZW1vcnkuXG4gICBUaGUgY29kZSB3aXRoIHZhbHVlIDI1NiBpcyBzcGVjaWFsLCBhbmQgdGhlIHRhYmxlcyBhcmUgY29uc3RydWN0ZWRcbiAgIHNvIHRoYXQgbm8gYml0cyBiZXlvbmQgdGhhdCBjb2RlIGFyZSBmZXRjaGVkIHdoZW4gdGhhdCBjb2RlIGlzXG4gICBkZWNvZGVkLiAqL1xuICAgIHtcblx0dmFyIGE7XHRcdFx0Ly8gY291bnRlciBmb3IgY29kZXMgb2YgbGVuZ3RoIGtcblx0dmFyIGMgPSBuZXcgQXJyYXkodGhpcy5CTUFYKzEpO1x0Ly8gYml0IGxlbmd0aCBjb3VudCB0YWJsZVxuXHR2YXIgZWw7XHRcdFx0Ly8gbGVuZ3RoIG9mIEVPQiBjb2RlICh2YWx1ZSAyNTYpXG5cdHZhciBmO1x0XHRcdC8vIGkgcmVwZWF0cyBpbiB0YWJsZSBldmVyeSBmIGVudHJpZXNcblx0dmFyIGc7XHRcdFx0Ly8gbWF4aW11bSBjb2RlIGxlbmd0aFxuXHR2YXIgaDtcdFx0XHQvLyB0YWJsZSBsZXZlbFxuXHR2YXIgaTtcdFx0XHQvLyBjb3VudGVyLCBjdXJyZW50IGNvZGVcblx0dmFyIGo7XHRcdFx0Ly8gY291bnRlclxuXHR2YXIgaztcdFx0XHQvLyBudW1iZXIgb2YgYml0cyBpbiBjdXJyZW50IGNvZGVcblx0dmFyIGx4ID0gbmV3IEFycmF5KHRoaXMuQk1BWCsxKTtcdC8vIHN0YWNrIG9mIGJpdHMgcGVyIHRhYmxlXG5cdHZhciBwO1x0XHRcdC8vIHBvaW50ZXIgaW50byBjW10sIGJbXSwgb3IgdltdXG5cdHZhciBwaWR4O1x0XHQvLyBpbmRleCBvZiBwXG5cdHZhciBxO1x0XHRcdC8vICh6aXBfSHVmdE5vZGUpIHBvaW50cyB0byBjdXJyZW50IHRhYmxlXG5cdHZhciByID0gbmV3IHppcF9IdWZ0Tm9kZSgpOyAvLyB0YWJsZSBlbnRyeSBmb3Igc3RydWN0dXJlIGFzc2lnbm1lbnRcblx0dmFyIHUgPSBuZXcgQXJyYXkodGhpcy5CTUFYKTsgLy8gemlwX0h1ZnROb2RlW0JNQVhdW10gIHRhYmxlIHN0YWNrXG5cdHZhciB2ID0gbmV3IEFycmF5KHRoaXMuTl9NQVgpOyAvLyB2YWx1ZXMgaW4gb3JkZXIgb2YgYml0IGxlbmd0aFxuXHR2YXIgdztcblx0dmFyIHggPSBuZXcgQXJyYXkodGhpcy5CTUFYKzEpOy8vIGJpdCBvZmZzZXRzLCB0aGVuIGNvZGUgc3RhY2tcblx0dmFyIHhwO1x0XHRcdC8vIHBvaW50ZXIgaW50byB4IG9yIGNcblx0dmFyIHk7XHRcdFx0Ly8gbnVtYmVyIG9mIGR1bW15IGNvZGVzIGFkZGVkXG5cdHZhciB6O1x0XHRcdC8vIG51bWJlciBvZiBlbnRyaWVzIGluIGN1cnJlbnQgdGFibGVcblx0dmFyIG87XG5cdHZhciB0YWlsO1x0XHQvLyAoemlwX0h1ZnRMaXN0KVxuXG5cdHRhaWwgPSB0aGlzLnJvb3QgPSBudWxsO1xuXHRmb3IoaSA9IDA7IGkgPCBjLmxlbmd0aDsgaSsrKVxuXHQgICAgY1tpXSA9IDA7XG5cdGZvcihpID0gMDsgaSA8IGx4Lmxlbmd0aDsgaSsrKVxuXHQgICAgbHhbaV0gPSAwO1xuXHRmb3IoaSA9IDA7IGkgPCB1Lmxlbmd0aDsgaSsrKVxuXHQgICAgdVtpXSA9IG51bGw7XG5cdGZvcihpID0gMDsgaSA8IHYubGVuZ3RoOyBpKyspXG5cdCAgICB2W2ldID0gMDtcblx0Zm9yKGkgPSAwOyBpIDwgeC5sZW5ndGg7IGkrKylcblx0ICAgIHhbaV0gPSAwO1xuXG5cdC8vIEdlbmVyYXRlIGNvdW50cyBmb3IgZWFjaCBiaXQgbGVuZ3RoXG5cdGVsID0gbiA+IDI1NiA/IGJbMjU2XSA6IHRoaXMuQk1BWDsgLy8gc2V0IGxlbmd0aCBvZiBFT0IgY29kZSwgaWYgYW55XG5cdHAgPSBiOyBwaWR4ID0gMDtcblx0aSA9IG47XG5cdGRvIHtcblx0ICAgIGNbcFtwaWR4XV0rKztcdC8vIGFzc3VtZSBhbGwgZW50cmllcyA8PSBCTUFYXG5cdCAgICBwaWR4Kys7XG5cdH0gd2hpbGUoLS1pID4gMCk7XG5cdGlmKGNbMF0gPT0gbikge1x0Ly8gbnVsbCBpbnB1dC0tYWxsIHplcm8gbGVuZ3RoIGNvZGVzXG5cdCAgICB0aGlzLnJvb3QgPSBudWxsO1xuXHQgICAgdGhpcy5tID0gMDtcblx0ICAgIHRoaXMuc3RhdHVzID0gMDtcblx0ICAgIHJldHVybjtcblx0fVxuXG5cdC8vIEZpbmQgbWluaW11bSBhbmQgbWF4aW11bSBsZW5ndGgsIGJvdW5kICptIGJ5IHRob3NlXG5cdGZvcihqID0gMTsgaiA8PSB0aGlzLkJNQVg7IGorKylcblx0ICAgIGlmKGNbal0gIT0gMClcblx0XHRicmVhaztcblx0ayA9IGo7XHRcdFx0Ly8gbWluaW11bSBjb2RlIGxlbmd0aFxuXHRpZihtbSA8IGopXG5cdCAgICBtbSA9IGo7XG5cdGZvcihpID0gdGhpcy5CTUFYOyBpICE9IDA7IGktLSlcblx0ICAgIGlmKGNbaV0gIT0gMClcblx0XHRicmVhaztcblx0ZyA9IGk7XHRcdFx0Ly8gbWF4aW11bSBjb2RlIGxlbmd0aFxuXHRpZihtbSA+IGkpXG5cdCAgICBtbSA9IGk7XG5cblx0Ly8gQWRqdXN0IGxhc3QgbGVuZ3RoIGNvdW50IHRvIGZpbGwgb3V0IGNvZGVzLCBpZiBuZWVkZWRcblx0Zm9yKHkgPSAxIDw8IGo7IGogPCBpOyBqKyssIHkgPDw9IDEpXG5cdCAgICBpZigoeSAtPSBjW2pdKSA8IDApIHtcblx0XHR0aGlzLnN0YXR1cyA9IDI7XHQvLyBiYWQgaW5wdXQ6IG1vcmUgY29kZXMgdGhhbiBiaXRzXG5cdFx0dGhpcy5tID0gbW07XG5cdFx0cmV0dXJuO1xuXHQgICAgfVxuXHRpZigoeSAtPSBjW2ldKSA8IDApIHtcblx0ICAgIHRoaXMuc3RhdHVzID0gMjtcblx0ICAgIHRoaXMubSA9IG1tO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cdGNbaV0gKz0geTtcblxuXHQvLyBHZW5lcmF0ZSBzdGFydGluZyBvZmZzZXRzIGludG8gdGhlIHZhbHVlIHRhYmxlIGZvciBlYWNoIGxlbmd0aFxuXHR4WzFdID0gaiA9IDA7XG5cdHAgPSBjO1xuXHRwaWR4ID0gMTtcblx0eHAgPSAyO1xuXHR3aGlsZSgtLWkgPiAwKVx0XHQvLyBub3RlIHRoYXQgaSA9PSBnIGZyb20gYWJvdmVcblx0ICAgIHhbeHArK10gPSAoaiArPSBwW3BpZHgrK10pO1xuXG5cdC8vIE1ha2UgYSB0YWJsZSBvZiB2YWx1ZXMgaW4gb3JkZXIgb2YgYml0IGxlbmd0aHNcblx0cCA9IGI7IHBpZHggPSAwO1xuXHRpID0gMDtcblx0ZG8ge1xuXHQgICAgaWYoKGogPSBwW3BpZHgrK10pICE9IDApXG5cdFx0dlt4W2pdKytdID0gaTtcblx0fSB3aGlsZSgrK2kgPCBuKTtcblx0biA9IHhbZ107XHRcdFx0Ly8gc2V0IG4gdG8gbGVuZ3RoIG9mIHZcblxuXHQvLyBHZW5lcmF0ZSB0aGUgSHVmZm1hbiBjb2RlcyBhbmQgZm9yIGVhY2gsIG1ha2UgdGhlIHRhYmxlIGVudHJpZXNcblx0eFswXSA9IGkgPSAwO1x0XHQvLyBmaXJzdCBIdWZmbWFuIGNvZGUgaXMgemVyb1xuXHRwID0gdjsgcGlkeCA9IDA7XHRcdC8vIGdyYWIgdmFsdWVzIGluIGJpdCBvcmRlclxuXHRoID0gLTE7XHRcdFx0Ly8gbm8gdGFibGVzIHlldC0tbGV2ZWwgLTFcblx0dyA9IGx4WzBdID0gMDtcdFx0Ly8gbm8gYml0cyBkZWNvZGVkIHlldFxuXHRxID0gbnVsbDtcdFx0XHQvLyBkaXR0b1xuXHR6ID0gMDtcdFx0XHQvLyBkaXR0b1xuXG5cdC8vIGdvIHRocm91Z2ggdGhlIGJpdCBsZW5ndGhzIChrIGFscmVhZHkgaXMgYml0cyBpbiBzaG9ydGVzdCBjb2RlKVxuXHRmb3IoOyBrIDw9IGc7IGsrKykge1xuXHQgICAgYSA9IGNba107XG5cdCAgICB3aGlsZShhLS0gPiAwKSB7XG5cdFx0Ly8gaGVyZSBpIGlzIHRoZSBIdWZmbWFuIGNvZGUgb2YgbGVuZ3RoIGsgYml0cyBmb3IgdmFsdWUgcFtwaWR4XVxuXHRcdC8vIG1ha2UgdGFibGVzIHVwIHRvIHJlcXVpcmVkIGxldmVsXG5cdFx0d2hpbGUoayA+IHcgKyBseFsxICsgaF0pIHtcblx0XHQgICAgdyArPSBseFsxICsgaF07IC8vIGFkZCBiaXRzIGFscmVhZHkgZGVjb2RlZFxuXHRcdCAgICBoKys7XG5cblx0XHQgICAgLy8gY29tcHV0ZSBtaW5pbXVtIHNpemUgdGFibGUgbGVzcyB0aGFuIG9yIGVxdWFsIHRvICptIGJpdHNcblx0XHQgICAgeiA9ICh6ID0gZyAtIHcpID4gbW0gPyBtbSA6IHo7IC8vIHVwcGVyIGxpbWl0XG5cdFx0ICAgIGlmKChmID0gMSA8PCAoaiA9IGsgLSB3KSkgPiBhICsgMSkgeyAvLyB0cnkgYSBrLXcgYml0IHRhYmxlXG5cdFx0XHQvLyB0b28gZmV3IGNvZGVzIGZvciBrLXcgYml0IHRhYmxlXG5cdFx0XHRmIC09IGEgKyAxO1x0Ly8gZGVkdWN0IGNvZGVzIGZyb20gcGF0dGVybnMgbGVmdFxuXHRcdFx0eHAgPSBrO1xuXHRcdFx0d2hpbGUoKytqIDwgeikgeyAvLyB0cnkgc21hbGxlciB0YWJsZXMgdXAgdG8geiBiaXRzXG5cdFx0XHQgICAgaWYoKGYgPDw9IDEpIDw9IGNbKyt4cF0pXG5cdFx0XHRcdGJyZWFrO1x0Ly8gZW5vdWdoIGNvZGVzIHRvIHVzZSB1cCBqIGJpdHNcblx0XHRcdCAgICBmIC09IGNbeHBdO1x0Ly8gZWxzZSBkZWR1Y3QgY29kZXMgZnJvbSBwYXR0ZXJuc1xuXHRcdFx0fVxuXHRcdCAgICB9XG5cdFx0ICAgIGlmKHcgKyBqID4gZWwgJiYgdyA8IGVsKVxuXHRcdFx0aiA9IGVsIC0gdztcdC8vIG1ha2UgRU9CIGNvZGUgZW5kIGF0IHRhYmxlXG5cdFx0ICAgIHogPSAxIDw8IGo7XHQvLyB0YWJsZSBlbnRyaWVzIGZvciBqLWJpdCB0YWJsZVxuXHRcdCAgICBseFsxICsgaF0gPSBqOyAvLyBzZXQgdGFibGUgc2l6ZSBpbiBzdGFja1xuXG5cdFx0ICAgIC8vIGFsbG9jYXRlIGFuZCBsaW5rIGluIG5ldyB0YWJsZVxuXHRcdCAgICBxID0gbmV3IEFycmF5KHopO1xuXHRcdCAgICBmb3IobyA9IDA7IG8gPCB6OyBvKyspIHtcblx0XHRcdHFbb10gPSBuZXcgemlwX0h1ZnROb2RlKCk7XG5cdFx0ICAgIH1cblxuXHRcdCAgICBpZih0YWlsID09IG51bGwpXG5cdFx0XHR0YWlsID0gdGhpcy5yb290ID0gbmV3IHppcF9IdWZ0TGlzdCgpO1xuXHRcdCAgICBlbHNlXG5cdFx0XHR0YWlsID0gdGFpbC5uZXh0ID0gbmV3IHppcF9IdWZ0TGlzdCgpO1xuXHRcdCAgICB0YWlsLm5leHQgPSBudWxsO1xuXHRcdCAgICB0YWlsLmxpc3QgPSBxO1xuXHRcdCAgICB1W2hdID0gcTtcdC8vIHRhYmxlIHN0YXJ0cyBhZnRlciBsaW5rXG5cblx0XHQgICAgLyogY29ubmVjdCB0byBsYXN0IHRhYmxlLCBpZiB0aGVyZSBpcyBvbmUgKi9cblx0XHQgICAgaWYoaCA+IDApIHtcblx0XHRcdHhbaF0gPSBpO1x0XHQvLyBzYXZlIHBhdHRlcm4gZm9yIGJhY2tpbmcgdXBcblx0XHRcdHIuYiA9IGx4W2hdO1x0Ly8gYml0cyB0byBkdW1wIGJlZm9yZSB0aGlzIHRhYmxlXG5cdFx0XHRyLmUgPSAxNiArIGo7XHQvLyBiaXRzIGluIHRoaXMgdGFibGVcblx0XHRcdHIudCA9IHE7XHRcdC8vIHBvaW50ZXIgdG8gdGhpcyB0YWJsZVxuXHRcdFx0aiA9IChpICYgKCgxIDw8IHcpIC0gMSkpID4+ICh3IC0gbHhbaF0pO1xuXHRcdFx0dVtoLTFdW2pdLmUgPSByLmU7XG5cdFx0XHR1W2gtMV1bal0uYiA9IHIuYjtcblx0XHRcdHVbaC0xXVtqXS5uID0gci5uO1xuXHRcdFx0dVtoLTFdW2pdLnQgPSByLnQ7XG5cdFx0ICAgIH1cblx0XHR9XG5cblx0XHQvLyBzZXQgdXAgdGFibGUgZW50cnkgaW4gclxuXHRcdHIuYiA9IGsgLSB3O1xuXHRcdGlmKHBpZHggPj0gbilcblx0XHQgICAgci5lID0gOTk7XHRcdC8vIG91dCBvZiB2YWx1ZXMtLWludmFsaWQgY29kZVxuXHRcdGVsc2UgaWYocFtwaWR4XSA8IHMpIHtcblx0XHQgICAgci5lID0gKHBbcGlkeF0gPCAyNTYgPyAxNiA6IDE1KTsgLy8gMjU2IGlzIGVuZC1vZi1ibG9jayBjb2RlXG5cdFx0ICAgIHIubiA9IHBbcGlkeCsrXTtcdC8vIHNpbXBsZSBjb2RlIGlzIGp1c3QgdGhlIHZhbHVlXG5cdFx0fSBlbHNlIHtcblx0XHQgICAgci5lID0gZVtwW3BpZHhdIC0gc107XHQvLyBub24tc2ltcGxlLS1sb29rIHVwIGluIGxpc3RzXG5cdFx0ICAgIHIubiA9IGRbcFtwaWR4KytdIC0gc107XG5cdFx0fVxuXG5cdFx0Ly8gZmlsbCBjb2RlLWxpa2UgZW50cmllcyB3aXRoIHIgLy9cblx0XHRmID0gMSA8PCAoayAtIHcpO1xuXHRcdGZvcihqID0gaSA+PiB3OyBqIDwgejsgaiArPSBmKSB7XG5cdFx0ICAgIHFbal0uZSA9IHIuZTtcblx0XHQgICAgcVtqXS5iID0gci5iO1xuXHRcdCAgICBxW2pdLm4gPSByLm47XG5cdFx0ICAgIHFbal0udCA9IHIudDtcblx0XHR9XG5cblx0XHQvLyBiYWNrd2FyZHMgaW5jcmVtZW50IHRoZSBrLWJpdCBjb2RlIGlcblx0XHRmb3IoaiA9IDEgPDwgKGsgLSAxKTsgKGkgJiBqKSAhPSAwOyBqID4+PSAxKVxuXHRcdCAgICBpIF49IGo7XG5cdFx0aSBePSBqO1xuXG5cdFx0Ly8gYmFja3VwIG92ZXIgZmluaXNoZWQgdGFibGVzXG5cdFx0d2hpbGUoKGkgJiAoKDEgPDwgdykgLSAxKSkgIT0geFtoXSkge1xuXHRcdCAgICB3IC09IGx4W2hdO1x0XHQvLyBkb24ndCBuZWVkIHRvIHVwZGF0ZSBxXG5cdFx0ICAgIGgtLTtcblx0XHR9XG5cdCAgICB9XG5cdH1cblxuXHQvKiByZXR1cm4gYWN0dWFsIHNpemUgb2YgYmFzZSB0YWJsZSAqL1xuXHR0aGlzLm0gPSBseFsxXTtcblxuXHQvKiBSZXR1cm4gdHJ1ZSAoMSkgaWYgd2Ugd2VyZSBnaXZlbiBhbiBpbmNvbXBsZXRlIHRhYmxlICovXG5cdHRoaXMuc3RhdHVzID0gKCh5ICE9IDAgJiYgZyAhPSAxKSA/IDEgOiAwKTtcbiAgICB9IC8qIGVuZCBvZiBjb25zdHJ1Y3RvciAqL1xufVxuXG5cbi8qIHJvdXRpbmVzIChpbmZsYXRlKSAqL1xuXG52YXIgemlwX0dFVF9CWVRFID0gZnVuY3Rpb24oKSB7XG4gICAgaWYoemlwX2luZmxhdGVfZGF0YS5sZW5ndGggPT0gemlwX2luZmxhdGVfcG9zKVxuXHRyZXR1cm4gLTE7XG4gICAgcmV0dXJuIHppcF9pbmZsYXRlX2RhdGEuY2hhckNvZGVBdCh6aXBfaW5mbGF0ZV9wb3MrKykgJiAweGZmO1xufVxuXG52YXIgemlwX05FRURCSVRTID0gZnVuY3Rpb24obikge1xuICAgIHdoaWxlKHppcF9iaXRfbGVuIDwgbikge1xuXHR6aXBfYml0X2J1ZiB8PSB6aXBfR0VUX0JZVEUoKSA8PCB6aXBfYml0X2xlbjtcblx0emlwX2JpdF9sZW4gKz0gODtcbiAgICB9XG59XG5cbnZhciB6aXBfR0VUQklUUyA9IGZ1bmN0aW9uKG4pIHtcbiAgICByZXR1cm4gemlwX2JpdF9idWYgJiB6aXBfTUFTS19CSVRTW25dO1xufVxuXG52YXIgemlwX0RVTVBCSVRTID0gZnVuY3Rpb24obikge1xuICAgIHppcF9iaXRfYnVmID4+PSBuO1xuICAgIHppcF9iaXRfbGVuIC09IG47XG59XG5cbnZhciB6aXBfaW5mbGF0ZV9jb2RlcyA9IGZ1bmN0aW9uKGJ1ZmYsIG9mZiwgc2l6ZSkge1xuICAgIC8qIGluZmxhdGUgKGRlY29tcHJlc3MpIHRoZSBjb2RlcyBpbiBhIGRlZmxhdGVkIChjb21wcmVzc2VkKSBibG9jay5cbiAgICAgICBSZXR1cm4gYW4gZXJyb3IgY29kZSBvciB6ZXJvIGlmIGl0IGFsbCBnb2VzIG9rLiAqL1xuICAgIHZhciBlO1x0XHQvLyB0YWJsZSBlbnRyeSBmbGFnL251bWJlciBvZiBleHRyYSBiaXRzXG4gICAgdmFyIHQ7XHRcdC8vICh6aXBfSHVmdE5vZGUpIHBvaW50ZXIgdG8gdGFibGUgZW50cnlcbiAgICB2YXIgbjtcblxuICAgIGlmKHNpemUgPT0gMClcbiAgICAgIHJldHVybiAwO1xuXG4gICAgLy8gaW5mbGF0ZSB0aGUgY29kZWQgZGF0YVxuICAgIG4gPSAwO1xuICAgIGZvcig7Oykge1x0XHRcdC8vIGRvIHVudGlsIGVuZCBvZiBibG9ja1xuXHR6aXBfTkVFREJJVFMoemlwX2JsKTtcblx0dCA9IHppcF90bC5saXN0W3ppcF9HRVRCSVRTKHppcF9ibCldO1xuXHRlID0gdC5lO1xuXHR3aGlsZShlID4gMTYpIHtcblx0ICAgIGlmKGUgPT0gOTkpXG5cdFx0cmV0dXJuIC0xO1xuXHQgICAgemlwX0RVTVBCSVRTKHQuYik7XG5cdCAgICBlIC09IDE2O1xuXHQgICAgemlwX05FRURCSVRTKGUpO1xuXHQgICAgdCA9IHQudFt6aXBfR0VUQklUUyhlKV07XG5cdCAgICBlID0gdC5lO1xuXHR9XG5cdHppcF9EVU1QQklUUyh0LmIpO1xuXG5cdGlmKGUgPT0gMTYpIHtcdFx0Ly8gdGhlbiBpdCdzIGEgbGl0ZXJhbFxuXHQgICAgemlwX3dwICY9IHppcF9XU0laRSAtIDE7XG5cdCAgICBidWZmW29mZiArIG4rK10gPSB6aXBfc2xpZGVbemlwX3dwKytdID0gdC5uO1xuXHQgICAgaWYobiA9PSBzaXplKVxuXHRcdHJldHVybiBzaXplO1xuXHQgICAgY29udGludWU7XG5cdH1cblxuXHQvLyBleGl0IGlmIGVuZCBvZiBibG9ja1xuXHRpZihlID09IDE1KVxuXHQgICAgYnJlYWs7XG5cblx0Ly8gaXQncyBhbiBFT0Igb3IgYSBsZW5ndGhcblxuXHQvLyBnZXQgbGVuZ3RoIG9mIGJsb2NrIHRvIGNvcHlcblx0emlwX05FRURCSVRTKGUpO1xuXHR6aXBfY29weV9sZW5nID0gdC5uICsgemlwX0dFVEJJVFMoZSk7XG5cdHppcF9EVU1QQklUUyhlKTtcblxuXHQvLyBkZWNvZGUgZGlzdGFuY2Ugb2YgYmxvY2sgdG8gY29weVxuXHR6aXBfTkVFREJJVFMoemlwX2JkKTtcblx0dCA9IHppcF90ZC5saXN0W3ppcF9HRVRCSVRTKHppcF9iZCldO1xuXHRlID0gdC5lO1xuXG5cdHdoaWxlKGUgPiAxNikge1xuXHQgICAgaWYoZSA9PSA5OSlcblx0XHRyZXR1cm4gLTE7XG5cdCAgICB6aXBfRFVNUEJJVFModC5iKTtcblx0ICAgIGUgLT0gMTY7XG5cdCAgICB6aXBfTkVFREJJVFMoZSk7XG5cdCAgICB0ID0gdC50W3ppcF9HRVRCSVRTKGUpXTtcblx0ICAgIGUgPSB0LmU7XG5cdH1cblx0emlwX0RVTVBCSVRTKHQuYik7XG5cdHppcF9ORUVEQklUUyhlKTtcblx0emlwX2NvcHlfZGlzdCA9IHppcF93cCAtIHQubiAtIHppcF9HRVRCSVRTKGUpO1xuXHR6aXBfRFVNUEJJVFMoZSk7XG5cblx0Ly8gZG8gdGhlIGNvcHlcblx0d2hpbGUoemlwX2NvcHlfbGVuZyA+IDAgJiYgbiA8IHNpemUpIHtcblx0ICAgIHppcF9jb3B5X2xlbmctLTtcblx0ICAgIHppcF9jb3B5X2Rpc3QgJj0gemlwX1dTSVpFIC0gMTtcblx0ICAgIHppcF93cCAmPSB6aXBfV1NJWkUgLSAxO1xuXHQgICAgYnVmZltvZmYgKyBuKytdID0gemlwX3NsaWRlW3ppcF93cCsrXVxuXHRcdD0gemlwX3NsaWRlW3ppcF9jb3B5X2Rpc3QrK107XG5cdH1cblxuXHRpZihuID09IHNpemUpXG5cdCAgICByZXR1cm4gc2l6ZTtcbiAgICB9XG5cbiAgICB6aXBfbWV0aG9kID0gLTE7IC8vIGRvbmVcbiAgICByZXR1cm4gbjtcbn1cblxudmFyIHppcF9pbmZsYXRlX3N0b3JlZCA9IGZ1bmN0aW9uKGJ1ZmYsIG9mZiwgc2l6ZSkge1xuICAgIC8qIFwiZGVjb21wcmVzc1wiIGFuIGluZmxhdGVkIHR5cGUgMCAoc3RvcmVkKSBibG9jay4gKi9cbiAgICB2YXIgbjtcblxuICAgIC8vIGdvIHRvIGJ5dGUgYm91bmRhcnlcbiAgICBuID0gemlwX2JpdF9sZW4gJiA3O1xuICAgIHppcF9EVU1QQklUUyhuKTtcblxuICAgIC8vIGdldCB0aGUgbGVuZ3RoIGFuZCBpdHMgY29tcGxlbWVudFxuICAgIHppcF9ORUVEQklUUygxNik7XG4gICAgbiA9IHppcF9HRVRCSVRTKDE2KTtcbiAgICB6aXBfRFVNUEJJVFMoMTYpO1xuICAgIHppcF9ORUVEQklUUygxNik7XG4gICAgaWYobiAhPSAoKH56aXBfYml0X2J1ZikgJiAweGZmZmYpKVxuXHRyZXR1cm4gLTE7XHRcdFx0Ly8gZXJyb3IgaW4gY29tcHJlc3NlZCBkYXRhXG4gICAgemlwX0RVTVBCSVRTKDE2KTtcblxuICAgIC8vIHJlYWQgYW5kIG91dHB1dCB0aGUgY29tcHJlc3NlZCBkYXRhXG4gICAgemlwX2NvcHlfbGVuZyA9IG47XG5cbiAgICBuID0gMDtcbiAgICB3aGlsZSh6aXBfY29weV9sZW5nID4gMCAmJiBuIDwgc2l6ZSkge1xuXHR6aXBfY29weV9sZW5nLS07XG5cdHppcF93cCAmPSB6aXBfV1NJWkUgLSAxO1xuXHR6aXBfTkVFREJJVFMoOCk7XG5cdGJ1ZmZbb2ZmICsgbisrXSA9IHppcF9zbGlkZVt6aXBfd3ArK10gPVxuXHQgICAgemlwX0dFVEJJVFMoOCk7XG5cdHppcF9EVU1QQklUUyg4KTtcbiAgICB9XG5cbiAgICBpZih6aXBfY29weV9sZW5nID09IDApXG4gICAgICB6aXBfbWV0aG9kID0gLTE7IC8vIGRvbmVcbiAgICByZXR1cm4gbjtcbn1cblxudmFyIHppcF9pbmZsYXRlX2ZpeGVkID0gZnVuY3Rpb24oYnVmZiwgb2ZmLCBzaXplKSB7XG4gICAgLyogZGVjb21wcmVzcyBhbiBpbmZsYXRlZCB0eXBlIDEgKGZpeGVkIEh1ZmZtYW4gY29kZXMpIGJsb2NrLiAgV2Ugc2hvdWxkXG4gICAgICAgZWl0aGVyIHJlcGxhY2UgdGhpcyB3aXRoIGEgY3VzdG9tIGRlY29kZXIsIG9yIGF0IGxlYXN0IHByZWNvbXB1dGUgdGhlXG4gICAgICAgSHVmZm1hbiB0YWJsZXMuICovXG5cbiAgICAvLyBpZiBmaXJzdCB0aW1lLCBzZXQgdXAgdGFibGVzIGZvciBmaXhlZCBibG9ja3NcbiAgICBpZih6aXBfZml4ZWRfdGwgPT0gbnVsbCkge1xuXHR2YXIgaTtcdFx0XHQvLyB0ZW1wb3JhcnkgdmFyaWFibGVcblx0dmFyIGwgPSBuZXcgQXJyYXkoMjg4KTtcdC8vIGxlbmd0aCBsaXN0IGZvciBodWZ0X2J1aWxkXG5cdHZhciBoO1x0Ly8gemlwX0h1ZnRCdWlsZFxuXG5cdC8vIGxpdGVyYWwgdGFibGVcblx0Zm9yKGkgPSAwOyBpIDwgMTQ0OyBpKyspXG5cdCAgICBsW2ldID0gODtcblx0Zm9yKDsgaSA8IDI1NjsgaSsrKVxuXHQgICAgbFtpXSA9IDk7XG5cdGZvcig7IGkgPCAyODA7IGkrKylcblx0ICAgIGxbaV0gPSA3O1xuXHRmb3IoOyBpIDwgMjg4OyBpKyspXHQvLyBtYWtlIGEgY29tcGxldGUsIGJ1dCB3cm9uZyBjb2RlIHNldFxuXHQgICAgbFtpXSA9IDg7XG5cdHppcF9maXhlZF9ibCA9IDc7XG5cblx0aCA9IG5ldyB6aXBfSHVmdEJ1aWxkKGwsIDI4OCwgMjU3LCB6aXBfY3BsZW5zLCB6aXBfY3BsZXh0LFxuXHRcdFx0ICAgICAgemlwX2ZpeGVkX2JsKTtcblx0aWYoaC5zdGF0dXMgIT0gMCkge1xuXHQgICAgYWxlcnQoXCJIdWZCdWlsZCBlcnJvcjogXCIraC5zdGF0dXMpO1xuXHQgICAgcmV0dXJuIC0xO1xuXHR9XG5cdHppcF9maXhlZF90bCA9IGgucm9vdDtcblx0emlwX2ZpeGVkX2JsID0gaC5tO1xuXG5cdC8vIGRpc3RhbmNlIHRhYmxlXG5cdGZvcihpID0gMDsgaSA8IDMwOyBpKyspXHQvLyBtYWtlIGFuIGluY29tcGxldGUgY29kZSBzZXRcblx0ICAgIGxbaV0gPSA1O1xuXHR6aXBfZml4ZWRfYmQgPSA1O1xuXG5cdGggPSBuZXcgemlwX0h1ZnRCdWlsZChsLCAzMCwgMCwgemlwX2NwZGlzdCwgemlwX2NwZGV4dCwgemlwX2ZpeGVkX2JkKTtcblx0aWYoaC5zdGF0dXMgPiAxKSB7XG5cdCAgICB6aXBfZml4ZWRfdGwgPSBudWxsO1xuXHQgICAgYWxlcnQoXCJIdWZCdWlsZCBlcnJvcjogXCIraC5zdGF0dXMpO1xuXHQgICAgcmV0dXJuIC0xO1xuXHR9XG5cdHppcF9maXhlZF90ZCA9IGgucm9vdDtcblx0emlwX2ZpeGVkX2JkID0gaC5tO1xuICAgIH1cblxuICAgIHppcF90bCA9IHppcF9maXhlZF90bDtcbiAgICB6aXBfdGQgPSB6aXBfZml4ZWRfdGQ7XG4gICAgemlwX2JsID0gemlwX2ZpeGVkX2JsO1xuICAgIHppcF9iZCA9IHppcF9maXhlZF9iZDtcbiAgICByZXR1cm4gemlwX2luZmxhdGVfY29kZXMoYnVmZiwgb2ZmLCBzaXplKTtcbn1cblxudmFyIHppcF9pbmZsYXRlX2R5bmFtaWMgPSBmdW5jdGlvbihidWZmLCBvZmYsIHNpemUpIHtcbiAgICAvLyBkZWNvbXByZXNzIGFuIGluZmxhdGVkIHR5cGUgMiAoZHluYW1pYyBIdWZmbWFuIGNvZGVzKSBibG9jay5cbiAgICB2YXIgaTtcdFx0Ly8gdGVtcG9yYXJ5IHZhcmlhYmxlc1xuICAgIHZhciBqO1xuICAgIHZhciBsO1x0XHQvLyBsYXN0IGxlbmd0aFxuICAgIHZhciBuO1x0XHQvLyBudW1iZXIgb2YgbGVuZ3RocyB0byBnZXRcbiAgICB2YXIgdDtcdFx0Ly8gKHppcF9IdWZ0Tm9kZSkgbGl0ZXJhbC9sZW5ndGggY29kZSB0YWJsZVxuICAgIHZhciBuYjtcdFx0Ly8gbnVtYmVyIG9mIGJpdCBsZW5ndGggY29kZXNcbiAgICB2YXIgbmw7XHRcdC8vIG51bWJlciBvZiBsaXRlcmFsL2xlbmd0aCBjb2Rlc1xuICAgIHZhciBuZDtcdFx0Ly8gbnVtYmVyIG9mIGRpc3RhbmNlIGNvZGVzXG4gICAgdmFyIGxsID0gbmV3IEFycmF5KDI4NiszMCk7IC8vIGxpdGVyYWwvbGVuZ3RoIGFuZCBkaXN0YW5jZSBjb2RlIGxlbmd0aHNcbiAgICB2YXIgaDtcdFx0Ly8gKHppcF9IdWZ0QnVpbGQpXG5cbiAgICBmb3IoaSA9IDA7IGkgPCBsbC5sZW5ndGg7IGkrKylcblx0bGxbaV0gPSAwO1xuXG4gICAgLy8gcmVhZCBpbiB0YWJsZSBsZW5ndGhzXG4gICAgemlwX05FRURCSVRTKDUpO1xuICAgIG5sID0gMjU3ICsgemlwX0dFVEJJVFMoNSk7XHQvLyBudW1iZXIgb2YgbGl0ZXJhbC9sZW5ndGggY29kZXNcbiAgICB6aXBfRFVNUEJJVFMoNSk7XG4gICAgemlwX05FRURCSVRTKDUpO1xuICAgIG5kID0gMSArIHppcF9HRVRCSVRTKDUpO1x0Ly8gbnVtYmVyIG9mIGRpc3RhbmNlIGNvZGVzXG4gICAgemlwX0RVTVBCSVRTKDUpO1xuICAgIHppcF9ORUVEQklUUyg0KTtcbiAgICBuYiA9IDQgKyB6aXBfR0VUQklUUyg0KTtcdC8vIG51bWJlciBvZiBiaXQgbGVuZ3RoIGNvZGVzXG4gICAgemlwX0RVTVBCSVRTKDQpO1xuICAgIGlmKG5sID4gMjg2IHx8IG5kID4gMzApXG4gICAgICByZXR1cm4gLTE7XHRcdC8vIGJhZCBsZW5ndGhzXG5cbiAgICAvLyByZWFkIGluIGJpdC1sZW5ndGgtY29kZSBsZW5ndGhzXG4gICAgZm9yKGogPSAwOyBqIDwgbmI7IGorKylcbiAgICB7XG5cdHppcF9ORUVEQklUUygzKTtcblx0bGxbemlwX2JvcmRlcltqXV0gPSB6aXBfR0VUQklUUygzKTtcblx0emlwX0RVTVBCSVRTKDMpO1xuICAgIH1cbiAgICBmb3IoOyBqIDwgMTk7IGorKylcblx0bGxbemlwX2JvcmRlcltqXV0gPSAwO1xuXG4gICAgLy8gYnVpbGQgZGVjb2RpbmcgdGFibGUgZm9yIHRyZWVzLS1zaW5nbGUgbGV2ZWwsIDcgYml0IGxvb2t1cFxuICAgIHppcF9ibCA9IDc7XG4gICAgaCA9IG5ldyB6aXBfSHVmdEJ1aWxkKGxsLCAxOSwgMTksIG51bGwsIG51bGwsIHppcF9ibCk7XG4gICAgaWYoaC5zdGF0dXMgIT0gMClcblx0cmV0dXJuIC0xO1x0Ly8gaW5jb21wbGV0ZSBjb2RlIHNldFxuXG4gICAgemlwX3RsID0gaC5yb290O1xuICAgIHppcF9ibCA9IGgubTtcblxuICAgIC8vIHJlYWQgaW4gbGl0ZXJhbCBhbmQgZGlzdGFuY2UgY29kZSBsZW5ndGhzXG4gICAgbiA9IG5sICsgbmQ7XG4gICAgaSA9IGwgPSAwO1xuICAgIHdoaWxlKGkgPCBuKSB7XG5cdHppcF9ORUVEQklUUyh6aXBfYmwpO1xuXHR0ID0gemlwX3RsLmxpc3RbemlwX0dFVEJJVFMoemlwX2JsKV07XG5cdGogPSB0LmI7XG5cdHppcF9EVU1QQklUUyhqKTtcblx0aiA9IHQubjtcblx0aWYoaiA8IDE2KVx0XHQvLyBsZW5ndGggb2YgY29kZSBpbiBiaXRzICgwLi4xNSlcblx0ICAgIGxsW2krK10gPSBsID0gajtcdC8vIHNhdmUgbGFzdCBsZW5ndGggaW4gbFxuXHRlbHNlIGlmKGogPT0gMTYpIHtcdC8vIHJlcGVhdCBsYXN0IGxlbmd0aCAzIHRvIDYgdGltZXNcblx0ICAgIHppcF9ORUVEQklUUygyKTtcblx0ICAgIGogPSAzICsgemlwX0dFVEJJVFMoMik7XG5cdCAgICB6aXBfRFVNUEJJVFMoMik7XG5cdCAgICBpZihpICsgaiA+IG4pXG5cdFx0cmV0dXJuIC0xO1xuXHQgICAgd2hpbGUoai0tID4gMClcblx0XHRsbFtpKytdID0gbDtcblx0fSBlbHNlIGlmKGogPT0gMTcpIHtcdC8vIDMgdG8gMTAgemVybyBsZW5ndGggY29kZXNcblx0ICAgIHppcF9ORUVEQklUUygzKTtcblx0ICAgIGogPSAzICsgemlwX0dFVEJJVFMoMyk7XG5cdCAgICB6aXBfRFVNUEJJVFMoMyk7XG5cdCAgICBpZihpICsgaiA+IG4pXG5cdFx0cmV0dXJuIC0xO1xuXHQgICAgd2hpbGUoai0tID4gMClcblx0XHRsbFtpKytdID0gMDtcblx0ICAgIGwgPSAwO1xuXHR9IGVsc2Uge1x0XHQvLyBqID09IDE4OiAxMSB0byAxMzggemVybyBsZW5ndGggY29kZXNcblx0ICAgIHppcF9ORUVEQklUUyg3KTtcblx0ICAgIGogPSAxMSArIHppcF9HRVRCSVRTKDcpO1xuXHQgICAgemlwX0RVTVBCSVRTKDcpO1xuXHQgICAgaWYoaSArIGogPiBuKVxuXHRcdHJldHVybiAtMTtcblx0ICAgIHdoaWxlKGotLSA+IDApXG5cdFx0bGxbaSsrXSA9IDA7XG5cdCAgICBsID0gMDtcblx0fVxuICAgIH1cblxuICAgIC8vIGJ1aWxkIHRoZSBkZWNvZGluZyB0YWJsZXMgZm9yIGxpdGVyYWwvbGVuZ3RoIGFuZCBkaXN0YW5jZSBjb2Rlc1xuICAgIHppcF9ibCA9IHppcF9sYml0cztcbiAgICBoID0gbmV3IHppcF9IdWZ0QnVpbGQobGwsIG5sLCAyNTcsIHppcF9jcGxlbnMsIHppcF9jcGxleHQsIHppcF9ibCk7XG4gICAgaWYoemlwX2JsID09IDApXHQvLyBubyBsaXRlcmFscyBvciBsZW5ndGhzXG5cdGguc3RhdHVzID0gMTtcbiAgICBpZihoLnN0YXR1cyAhPSAwKSB7XG5cdGlmKGguc3RhdHVzID09IDEpXG5cdCAgICA7Ly8gKippbmNvbXBsZXRlIGxpdGVyYWwgdHJlZSoqXG5cdHJldHVybiAtMTtcdFx0Ly8gaW5jb21wbGV0ZSBjb2RlIHNldFxuICAgIH1cbiAgICB6aXBfdGwgPSBoLnJvb3Q7XG4gICAgemlwX2JsID0gaC5tO1xuXG4gICAgZm9yKGkgPSAwOyBpIDwgbmQ7IGkrKylcblx0bGxbaV0gPSBsbFtpICsgbmxdO1xuICAgIHppcF9iZCA9IHppcF9kYml0cztcbiAgICBoID0gbmV3IHppcF9IdWZ0QnVpbGQobGwsIG5kLCAwLCB6aXBfY3BkaXN0LCB6aXBfY3BkZXh0LCB6aXBfYmQpO1xuICAgIHppcF90ZCA9IGgucm9vdDtcbiAgICB6aXBfYmQgPSBoLm07XG5cbiAgICBpZih6aXBfYmQgPT0gMCAmJiBubCA+IDI1NykgeyAgIC8vIGxlbmd0aHMgYnV0IG5vIGRpc3RhbmNlc1xuXHQvLyAqKmluY29tcGxldGUgZGlzdGFuY2UgdHJlZSoqXG5cdHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBpZihoLnN0YXR1cyA9PSAxKSB7XG5cdDsvLyAqKmluY29tcGxldGUgZGlzdGFuY2UgdHJlZSoqXG4gICAgfVxuICAgIGlmKGguc3RhdHVzICE9IDApXG5cdHJldHVybiAtMTtcblxuICAgIC8vIGRlY29tcHJlc3MgdW50aWwgYW4gZW5kLW9mLWJsb2NrIGNvZGVcbiAgICByZXR1cm4gemlwX2luZmxhdGVfY29kZXMoYnVmZiwgb2ZmLCBzaXplKTtcbn1cblxudmFyIHppcF9pbmZsYXRlX3N0YXJ0ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGk7XG5cbiAgICBpZih6aXBfc2xpZGUgPT0gbnVsbClcblx0emlwX3NsaWRlID0gbmV3IEFycmF5KDIgKiB6aXBfV1NJWkUpO1xuICAgIHppcF93cCA9IDA7XG4gICAgemlwX2JpdF9idWYgPSAwO1xuICAgIHppcF9iaXRfbGVuID0gMDtcbiAgICB6aXBfbWV0aG9kID0gLTE7XG4gICAgemlwX2VvZiA9IGZhbHNlO1xuICAgIHppcF9jb3B5X2xlbmcgPSB6aXBfY29weV9kaXN0ID0gMDtcbiAgICB6aXBfdGwgPSBudWxsO1xufVxuXG52YXIgemlwX2luZmxhdGVfaW50ZXJuYWwgPSBmdW5jdGlvbihidWZmLCBvZmYsIHNpemUpIHtcbiAgICAvLyBkZWNvbXByZXNzIGFuIGluZmxhdGVkIGVudHJ5XG4gICAgdmFyIG4sIGk7XG5cbiAgICBuID0gMDtcbiAgICB3aGlsZShuIDwgc2l6ZSkge1xuXHRpZih6aXBfZW9mICYmIHppcF9tZXRob2QgPT0gLTEpXG5cdCAgICByZXR1cm4gbjtcblxuXHRpZih6aXBfY29weV9sZW5nID4gMCkge1xuXHQgICAgaWYoemlwX21ldGhvZCAhPSB6aXBfU1RPUkVEX0JMT0NLKSB7XG5cdFx0Ly8gU1RBVElDX1RSRUVTIG9yIERZTl9UUkVFU1xuXHRcdHdoaWxlKHppcF9jb3B5X2xlbmcgPiAwICYmIG4gPCBzaXplKSB7XG5cdFx0ICAgIHppcF9jb3B5X2xlbmctLTtcblx0XHQgICAgemlwX2NvcHlfZGlzdCAmPSB6aXBfV1NJWkUgLSAxO1xuXHRcdCAgICB6aXBfd3AgJj0gemlwX1dTSVpFIC0gMTtcblx0XHQgICAgYnVmZltvZmYgKyBuKytdID0gemlwX3NsaWRlW3ppcF93cCsrXSA9XG5cdFx0XHR6aXBfc2xpZGVbemlwX2NvcHlfZGlzdCsrXTtcblx0XHR9XG5cdCAgICB9IGVsc2Uge1xuXHRcdHdoaWxlKHppcF9jb3B5X2xlbmcgPiAwICYmIG4gPCBzaXplKSB7XG5cdFx0ICAgIHppcF9jb3B5X2xlbmctLTtcblx0XHQgICAgemlwX3dwICY9IHppcF9XU0laRSAtIDE7XG5cdFx0ICAgIHppcF9ORUVEQklUUyg4KTtcblx0XHQgICAgYnVmZltvZmYgKyBuKytdID0gemlwX3NsaWRlW3ppcF93cCsrXSA9IHppcF9HRVRCSVRTKDgpO1xuXHRcdCAgICB6aXBfRFVNUEJJVFMoOCk7XG5cdFx0fVxuXHRcdGlmKHppcF9jb3B5X2xlbmcgPT0gMClcblx0XHQgICAgemlwX21ldGhvZCA9IC0xOyAvLyBkb25lXG5cdCAgICB9XG5cdCAgICBpZihuID09IHNpemUpXG5cdFx0cmV0dXJuIG47XG5cdH1cblxuXHRpZih6aXBfbWV0aG9kID09IC0xKSB7XG5cdCAgICBpZih6aXBfZW9mKVxuXHRcdGJyZWFrO1xuXG5cdCAgICAvLyByZWFkIGluIGxhc3QgYmxvY2sgYml0XG5cdCAgICB6aXBfTkVFREJJVFMoMSk7XG5cdCAgICBpZih6aXBfR0VUQklUUygxKSAhPSAwKVxuXHRcdHppcF9lb2YgPSB0cnVlO1xuXHQgICAgemlwX0RVTVBCSVRTKDEpO1xuXG5cdCAgICAvLyByZWFkIGluIGJsb2NrIHR5cGVcblx0ICAgIHppcF9ORUVEQklUUygyKTtcblx0ICAgIHppcF9tZXRob2QgPSB6aXBfR0VUQklUUygyKTtcblx0ICAgIHppcF9EVU1QQklUUygyKTtcblx0ICAgIHppcF90bCA9IG51bGw7XG5cdCAgICB6aXBfY29weV9sZW5nID0gMDtcblx0fVxuXG5cdHN3aXRjaCh6aXBfbWV0aG9kKSB7XG5cdCAgY2FzZSAwOiAvLyB6aXBfU1RPUkVEX0JMT0NLXG5cdCAgICBpID0gemlwX2luZmxhdGVfc3RvcmVkKGJ1ZmYsIG9mZiArIG4sIHNpemUgLSBuKTtcblx0ICAgIGJyZWFrO1xuXG5cdCAgY2FzZSAxOiAvLyB6aXBfU1RBVElDX1RSRUVTXG5cdCAgICBpZih6aXBfdGwgIT0gbnVsbClcblx0XHRpID0gemlwX2luZmxhdGVfY29kZXMoYnVmZiwgb2ZmICsgbiwgc2l6ZSAtIG4pO1xuXHQgICAgZWxzZVxuXHRcdGkgPSB6aXBfaW5mbGF0ZV9maXhlZChidWZmLCBvZmYgKyBuLCBzaXplIC0gbik7XG5cdCAgICBicmVhaztcblxuXHQgIGNhc2UgMjogLy8gemlwX0RZTl9UUkVFU1xuXHQgICAgaWYoemlwX3RsICE9IG51bGwpXG5cdFx0aSA9IHppcF9pbmZsYXRlX2NvZGVzKGJ1ZmYsIG9mZiArIG4sIHNpemUgLSBuKTtcblx0ICAgIGVsc2Vcblx0XHRpID0gemlwX2luZmxhdGVfZHluYW1pYyhidWZmLCBvZmYgKyBuLCBzaXplIC0gbik7XG5cdCAgICBicmVhaztcblxuXHQgIGRlZmF1bHQ6IC8vIGVycm9yXG5cdCAgICBpID0gLTE7XG5cdCAgICBicmVhaztcblx0fVxuXG5cdGlmKGkgPT0gLTEpIHtcblx0ICAgIGlmKHppcF9lb2YpXG5cdFx0cmV0dXJuIDA7XG5cdCAgICByZXR1cm4gLTE7XG5cdH1cblx0biArPSBpO1xuICAgIH1cbiAgICByZXR1cm4gbjtcbn1cblxudmFyIHppcF9pbmZsYXRlID0gZnVuY3Rpb24oc3RyKSB7XG4gICAgdmFyIGksIGo7XG5cbiAgICB6aXBfaW5mbGF0ZV9zdGFydCgpO1xuICAgIHppcF9pbmZsYXRlX2RhdGEgPSBzdHI7XG4gICAgemlwX2luZmxhdGVfcG9zID0gMDtcblxuICAgIHZhciBidWZmID0gbmV3IEFycmF5KDEwMjQpO1xuICAgIHZhciBhb3V0ID0gW107XG4gICAgd2hpbGUoKGkgPSB6aXBfaW5mbGF0ZV9pbnRlcm5hbChidWZmLCAwLCBidWZmLmxlbmd0aCkpID4gMCkge1xuXHR2YXIgY2J1ZiA9IG5ldyBBcnJheShpKTtcblx0Zm9yKGogPSAwOyBqIDwgaTsgaisrKXtcblx0ICAgIGNidWZbal0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZmZbal0pO1xuXHR9XG5cdGFvdXRbYW91dC5sZW5ndGhdID0gY2J1Zi5qb2luKFwiXCIpO1xuICAgIH1cbiAgICB6aXBfaW5mbGF0ZV9kYXRhID0gbnVsbDsgLy8gRy5DLlxuICAgIHJldHVybiBhb3V0LmpvaW4oXCJcIik7XG59XG5cbmlmICghIGN0eC5SYXdEZWZsYXRlKSBjdHguUmF3RGVmbGF0ZSA9IHt9O1xuY3R4LlJhd0RlZmxhdGUuaW5mbGF0ZSA9IHppcF9pbmZsYXRlO1xuXG59KSh0aGlzKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcsIFsneW91dHViZS1lbWJlZCddKTtcblxufSkoKTtcbiIsIi8qIGdsb2JhbHMgQmFzZTY0LCBSYXdEZWZsYXRlICovXG4oZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBIYXNoID0gZnVuY3Rpb24oJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcblxuICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGhhc2ggPSBkZWNvZGVVUklDb21wb25lbnQoJHdpbmRvdy5sb2NhdGlvbi5oYXNoLnN1YnN0cmluZygxKSk7XG4gICAgICAgIGlmIChoYXNoLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYW5ndWxhci5mcm9tSnNvbihCYXNlNjQuYnRvdShSYXdEZWZsYXRlLmluZmxhdGUoQmFzZTY0LmZyb21CYXNlNjQoaGFzaCkpKSk7XG4gICAgICB9LFxuXG4gICAgICBzZXQ6IGZ1bmN0aW9uKGFycikge1xuICAgICAgICAkd2luZG93LmxvY2F0aW9uLmhhc2ggPSBhcnIubGVuZ3RoID09PSAwID8gJycgOiBlbmNvZGVVUklDb21wb25lbnQoQmFzZTY0LnRvQmFzZTY0KFJhd0RlZmxhdGUuZGVmbGF0ZShCYXNlNjQudXRvYihhbmd1bGFyLnRvSnNvbihhcnIpKSkpKTtcbiAgICAgIH0sXG5cbiAgICB9O1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmZhY3RvcnkoJ0hhc2gnLCBbJyR3aW5kb3cnLCBIYXNoXSk7XG5cbn0pKCk7XG4iLCIvKiBnbG9iYWxzIGpvY2tleSAqL1xuXG4oZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBQbGF5bGlzdE1vZGVsID0gZnVuY3Rpb24oJHJvb3RTY29wZSwgSGFzaCkge1xuXG4gICAgdmFyIGl0ZW1zID0gSGFzaC5nZXQoKTtcbiAgICB2YXIgb3B0cyA9IHtcbiAgICAgIG1vZGVsQ2hhbmdlOiBmdW5jdGlvbihfLCBpdGVtcykge1xuICAgICAgICBIYXNoLnNldChpdGVtcyk7XG4gICAgICB9LFxuICAgICAgc3RhdGVDaGFuZ2U6IGZ1bmN0aW9uKHN0YXRlLCBjdXJyZW50SXRlbSkge1xuICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3Qoc3RhdGUsIGN1cnJlbnRJdGVtKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBqb2NrZXkoaXRlbXMsIG9wdHMpO1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmZhY3RvcnkoJ1BsYXlsaXN0TW9kZWwnLCBbJyRyb290U2NvcGUnLCAnSGFzaCcsIFBsYXlsaXN0TW9kZWxdKTtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFQSV9LRVkgPSAnQUl6YVN5Q2k2N0VUaTh5UGR5T2NsajhUNzBQckkzejhXRW9lOWZvJztcblxuICB2YXIgbWFwID0gZnVuY3Rpb24oYXJyLCBjYikge1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgaSA9IC0xO1xuICAgIHZhciBsZW4gPSBhcnIubGVuZ3RoO1xuICAgIHdoaWxlICgrK2kgPCBsZW4pIHtcbiAgICAgIHJlc3VsdC5wdXNoKGNiKGFycltpXSwgaSkpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIHZhciB6ZXJvUGFkID0gZnVuY3Rpb24obikge1xuICAgIG4gPSBuID8gbiArICcnIDogJyc7XG4gICAgcmV0dXJuIG4ubGVuZ3RoID49IDIgPyBuIDogbmV3IEFycmF5KDIgLSBuLmxlbmd0aCArIDEpLmpvaW4oJzAnKSArIG47XG4gIH07XG5cbiAgdmFyIGZvcm1hdER1cmF0aW9uID0gZnVuY3Rpb24oc3RyLCBkZWxpbWV0ZXIpIHtcbiAgICB2YXIgbWF0Y2hlcyA9IHN0ci5tYXRjaCgvXlBUKD86KFxcZCspSCk/KD86KFxcZCspTSk/KD86KFxcZCspUyk/JC8pLnNsaWNlKDEsIDQpO1xuICAgIHZhciBpID0gLTE7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIHdoaWxlICgrK2kgPCAzKSB7XG4gICAgICBpZiAoaSA9PT0gMCAmJiBhbmd1bGFyLmlzVW5kZWZpbmVkKG1hdGNoZXNbaV0pKSB7XG4gICAgICAgIC8vIHNraXAgaG91cnMgaWYgdW5kZWZpbmVkXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnB1c2goemVyb1BhZChtYXRjaGVzW2ldIHx8ICcwMCcpKTsgLy8gbWludXRlcyBhbmQgc2Vjb25kc1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0LmpvaW4oZGVsaW1ldGVyKTtcbiAgfTtcblxuICB2YXIgWW91VHViZUFQSSA9IGZ1bmN0aW9uKCRodHRwKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2VhcmNoOiBmdW5jdGlvbihxdWVyeSkge1xuICAgICAgICBxdWVyeSA9IGVuY29kZVVSSUNvbXBvbmVudChxdWVyeSkucmVwbGFjZSgvJTIwL2csICcrJyk7XG4gICAgICAgIHZhciBlbmRwb2ludCA9ICdodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS95b3V0dWJlL3YzL3NlYXJjaD9wYXJ0PXNuaXBwZXQmZmllbGRzPWl0ZW1zKGlkJTJDc25pcHBldCkmbWF4UmVzdWx0cz01MCZvcmRlcj12aWV3Q291bnQmcT0nICsgcXVlcnkgKyAnJnR5cGU9dmlkZW8mdmlkZW9FbWJlZGRhYmxlPXRydWUmdmlkZW9TeW5kaWNhdGVkPXRydWUma2V5PScgKyBBUElfS0VZO1xuICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KGVuZHBvaW50KVxuICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1hcChyZXNwb25zZS5kYXRhLml0ZW1zLCBmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgICAgICAgIHJldHVybiBpdGVtLmlkLnZpZGVvSWQ7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKGlkcykge1xuICAgICAgICAgICAgdmFyIGVuZHBvaW50ID0gJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3lvdXR1YmUvdjMvdmlkZW9zP3BhcnQ9aWQlMkNjb250ZW50RGV0YWlscyUyQ3NuaXBwZXQmaWQ9JyArIGlkcy5qb2luKCclMkMnKSArICcmZmllbGRzPWl0ZW1zKGlkJTJDY29udGVudERldGFpbHMlMkNzbmlwcGV0KSZrZXk9JyArIEFQSV9LRVk7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KGVuZHBvaW50KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1hcChyZXNwb25zZS5kYXRhLml0ZW1zLCBmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaWQ6IGl0ZW0uaWQsXG4gICAgICAgICAgICAgICAgdGl0bGU6IGl0ZW0uc25pcHBldC50aXRsZSxcbiAgICAgICAgICAgICAgICBkdXJhdGlvbjogZm9ybWF0RHVyYXRpb24oaXRlbS5jb250ZW50RGV0YWlscy5kdXJhdGlvbiwgJzonKVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5mYWN0b3J5KCdZb3VUdWJlQVBJJywgWyckaHR0cCcsIFlvdVR1YmVBUEldKTtcblxufSkoKTtcbiIsIi8qIGdsb2JhbHMgYXV0b3NpemVJbnB1dCAqL1xuKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgRU5URVIgPSAxMztcbiAgdmFyIEVTQ0FQRSA9IDI3O1xuXG4gIHZhciB5cUF1dG9zaXplSW5wdXQgPSBmdW5jdGlvbigkdGltZW91dCkge1xuXG4gICAgdmFyIGxpbmsgPSBmdW5jdGlvbihzY29wZSwgZWxlbWVudCkge1xuXG4gICAgICB2YXIgc2V0O1xuICAgICAgJHRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHNldCA9IGF1dG9zaXplSW5wdXQoZWxlbWVudFswXSk7XG4gICAgICB9KTtcblxuICAgICAgc2NvcGUuJG9uKCdzZXRBdXRvc2l6ZScsIGZ1bmN0aW9uKCkge1xuICAgICAgICAkdGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICBzZXQoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgZWxlbWVudC5vbigna2V5dXAnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIGlmIChlLmtleUNvZGUgPT09IEVOVEVSIHx8IGUua2V5Q29kZSA9PT0gRVNDQVBFKSB7XG4gICAgICAgICAgZS50YXJnZXQuYmx1cigpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgIH07XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgIGxpbms6IGxpbmtcbiAgICB9O1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmRpcmVjdGl2ZSgneXFBdXRvc2l6ZUlucHV0JywgWyckdGltZW91dCcsIHlxQXV0b3NpemVJbnB1dF0pO1xuXG59KSgpO1xuIiwiLyogZ2xvYmFscyBTb3J0YWJsZSAqL1xuKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgc2xpY2UgPSBbXS5zbGljZTtcblxuICB2YXIgeXFTb3J0YWJsZSA9IGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHNjb3BlID0ge1xuICAgICAgY2FsbGJhY2s6ICc9eXFTb3J0YWJsZScsXG4gICAgICBoYW5kbGU6ICdAeXFTb3J0YWJsZUhhbmRsZScsXG4gICAgICBzb3J0ZWRDbGFzczogJ0B5cVNvcnRhYmxlU29ydGVkQ2xhc3MnLFxuICAgICAgZ2hvc3RDbGFzczogJ0B5cVNvcnRhYmxlR2hvc3RDbGFzcydcbiAgICB9O1xuXG4gICAgdmFyIGxpbmsgPSBmdW5jdGlvbihzY29wZSwgZWxlbWVudCkge1xuICAgICAgdmFyIG9uVXBkYXRlID0gZnVuY3Rpb24oZSkge1xuICAgICAgICB2YXIgaXRlbXMgPSBzbGljZS5jYWxsKGVsZW1lbnQuY2hpbGRyZW4oKSk7XG4gICAgICAgIHZhciBtb3ZlZEl0ZW0gPSBlLml0ZW07XG4gICAgICAgIHZhciBvbGRJbmRleCA9IGFuZ3VsYXIuZWxlbWVudChtb3ZlZEl0ZW0pLnNjb3BlKCkuJGluZGV4O1xuICAgICAgICB2YXIgbmV3SW5kZXggPSBpdGVtcy5pbmRleE9mKG1vdmVkSXRlbSk7XG4gICAgICAgIHNjb3BlLmNhbGxiYWNrKG9sZEluZGV4LCBuZXdJbmRleCk7XG4gICAgICAgIGVsZW1lbnQuYWRkQ2xhc3Moc2NvcGUuc29ydGVkQ2xhc3MpO1xuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBmdW5jdGlvbiBtb3VzZW1vdmUoKSB7XG4gICAgICAgICAgZWxlbWVudC5yZW1vdmVDbGFzcyhzY29wZS5zb3J0ZWRDbGFzcyk7XG4gICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgbW91c2Vtb3ZlKTtcbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgbmV3IFNvcnRhYmxlKGVsZW1lbnRbMF0sIHtcbiAgICAgICAgaGFuZGxlOiBzY29wZS5oYW5kbGUsXG4gICAgICAgIGdob3N0Q2xhc3M6IHNjb3BlLmdob3N0Q2xhc3MsXG4gICAgICAgIG9uVXBkYXRlOiBvblVwZGF0ZVxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgc2NvcGU6IHNjb3BlLFxuICAgICAgbGluazogbGlua1xuICAgIH07XG5cbiAgfTtcblxuICBhbmd1bGFyLm1vZHVsZSgnYXBwJykuZGlyZWN0aXZlKCd5cVNvcnRhYmxlJywgW3lxU29ydGFibGVdKTtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHlxU3luY0ZvY3VzID0gZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgc2NvcGUgPSB7XG4gICAgICB2YWw6ICc9eXFTeW5jRm9jdXMnXG4gICAgfTtcblxuICAgIHZhciBsaW5rID0gZnVuY3Rpb24oJHNjb3BlLCAkZWxlbWVudCkge1xuICAgICAgJHNjb3BlLiR3YXRjaCgndmFsJywgZnVuY3Rpb24oY3VycmVudFZhbCwgcHJldmlvdXNWYWwpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRWYWwgJiYgIXByZXZpb3VzVmFsKSB7XG4gICAgICAgICAgJGVsZW1lbnRbMF0uZm9jdXMoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFjdXJyZW50VmFsICYmIHByZXZpb3VzVmFsKSB7XG4gICAgICAgICAgJGVsZW1lbnRbMF0uYmx1cigpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICBzY29wZTogc2NvcGUsXG4gICAgICBsaW5rOiBsaW5rXG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5kaXJlY3RpdmUoJ3lxU3luY0ZvY3VzJywgW3lxU3luY0ZvY3VzXSk7XG5cbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBUSVRMRSA9ICdYT1hPJztcbiAgdmFyIFBMQVkgPSAnXFx1MjVCNic7XG5cbiAgdmFyIE1haW5DdHJsID0gZnVuY3Rpb24oJHNjb3BlLCBQbGF5bGlzdE1vZGVsKSB7XG5cbiAgICAkc2NvcGUuaXNTZWFyY2hPcGVuID0gZmFsc2U7XG4gICAgJHNjb3BlLmlzVmlkZW9WaXNpYmxlID0gZmFsc2U7XG5cbiAgICAkc2NvcGUudGl0bGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIGlmIChQbGF5bGlzdE1vZGVsLmlzUGxheWluZygpKSB7XG4gICAgICAgIHJldHVybiBQTEFZICsgJyAnICsgUGxheWxpc3RNb2RlbC5nZXRDdXJyZW50KCkudGl0bGU7XG4gICAgICB9XG4gICAgICByZXR1cm4gVElUTEU7XG4gICAgfTtcblxuICAgICRzY29wZS5pc1N0b3BwZWQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBQbGF5bGlzdE1vZGVsLmlzU3RvcHBlZCgpO1xuICAgIH07XG5cbiAgICAkc2NvcGUudG9nZ2xlU2VhcmNoID0gZnVuY3Rpb24oKSB7XG4gICAgICAkc2NvcGUuaXNTZWFyY2hPcGVuID0gISRzY29wZS5pc1NlYXJjaE9wZW47XG4gICAgfTtcbiAgICAkc2NvcGUudG9nZ2xlVmlkZW8gPSBmdW5jdGlvbigpIHtcbiAgICAgICRzY29wZS5pc1ZpZGVvVmlzaWJsZSA9ICEkc2NvcGUuaXNWaWRlb1Zpc2libGU7XG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5jb250cm9sbGVyKCdNYWluQ3RybCcsIFsnJHNjb3BlJywgJ1BsYXlsaXN0TW9kZWwnLCBNYWluQ3RybF0pO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS95b3V0dWJlL2lmcmFtZV9hcGlfcmVmZXJlbmNlI1BsYXliYWNrX3N0YXR1c1xuICB2YXIgUExBWUlORyA9IDE7XG5cbiAgdmFyIFBsYXllckN0cmwgPSBmdW5jdGlvbigkc2NvcGUsIFBsYXlsaXN0TW9kZWwpIHtcblxuICAgICRzY29wZS5pZCA9IG51bGw7XG4gICAgJHNjb3BlLnBsYXllciA9IG51bGw7XG5cbiAgICAkc2NvcGUuJG9uKCdwbGF5JywgZnVuY3Rpb24oXywgaXRlbSkge1xuICAgICAgdmFyIGlkID0gaXRlbS5pZDtcbiAgICAgICRzY29wZS5pZCA9IGlkO1xuICAgICAgaWYgKCRzY29wZS5wbGF5ZXIgIT09IG51bGwpIHtcbiAgICAgICAgJHNjb3BlLnBsYXllci5sb2FkVmlkZW9CeUlkKGlkKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHZhciBwYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKCRzY29wZS5wbGF5ZXIgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgJHNjb3BlLnBsYXllci5wYXVzZVZpZGVvKCk7XG4gICAgfTtcblxuICAgICRzY29wZS4kb24oJ3N0b3AnLCBwYXVzZSk7XG5cbiAgICAkc2NvcGUuJG9uKCdwYXVzZScsIHBhdXNlKTtcblxuICAgICRzY29wZS4kb24oJ3Jlc3VtZScsIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKCRzY29wZS5wbGF5ZXIuZ2V0UGxheWVyU3RhdGUoKSAhPT0gUExBWUlORykge1xuICAgICAgICAkc2NvcGUucGxheWVyLnBsYXlWaWRlbygpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgJHNjb3BlLiRvbigneW91dHViZS5wbGF5ZXIucGxheWluZycsIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKFBsYXlsaXN0TW9kZWwuaXNQYXVzZWQoKSkge1xuICAgICAgICBQbGF5bGlzdE1vZGVsLnBsYXkoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgICRzY29wZS4kb24oJ3lvdXR1YmUucGxheWVyLnBhdXNlZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKFBsYXlsaXN0TW9kZWwuaXNQbGF5aW5nKCkpIHtcbiAgICAgICAgUGxheWxpc3RNb2RlbC5wbGF5KCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAkc2NvcGUuJG9uKCd5b3V0dWJlLnBsYXllci5yZWFkeScsIGZ1bmN0aW9uKF8sIHBsYXllcikge1xuICAgICAgcGxheWVyLnNldFZvbHVtZSgxMDApO1xuICAgICAgcGxheWVyLnBsYXlWaWRlbygpO1xuICAgICAgJHNjb3BlLnBsYXllciA9IHBsYXllcjtcbiAgICB9KTtcblxuICAgICRzY29wZS4kb24oJ3lvdXR1YmUucGxheWVyLmVuZGVkJywgZnVuY3Rpb24oKSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLm5leHQoKTtcbiAgICB9KTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5jb250cm9sbGVyKCdQbGF5ZXJDdHJsJywgWyckc2NvcGUnLCAnUGxheWxpc3RNb2RlbCcsIFBsYXllckN0cmxdKTtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIFBsYXlsaXN0Q3RybCA9IGZ1bmN0aW9uKCRzY29wZSwgJHRpbWVvdXQsIFBsYXlsaXN0TW9kZWwpIHtcblxuICAgIC8vIEdldHRlcnMuXG4gICAgJHNjb3BlLmdldCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFBsYXlsaXN0TW9kZWwuZ2V0KCk7XG4gICAgfTtcbiAgICAkc2NvcGUuZ2V0Q3VycmVudEluZGV4ID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gUGxheWxpc3RNb2RlbC5nZXRDdXJyZW50SW5kZXgoKTtcbiAgICB9O1xuXG4gICAgLy8gQ2hlY2sgdGhlIHBsYXlsaXN0IHN0YXRlLlxuICAgICRzY29wZS5pc1N0b3BwZWQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAhUGxheWxpc3RNb2RlbC5pc1BsYXlpbmcoKTtcbiAgICB9O1xuICAgICRzY29wZS5pc1BsYXlpbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBQbGF5bGlzdE1vZGVsLmlzUGxheWluZygpO1xuICAgIH07XG4gICAgJHNjb3BlLmlzUGF1c2VkID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gUGxheWxpc3RNb2RlbC5pc1BhdXNlZCgpO1xuICAgIH07XG4gICAgJHNjb3BlLmlzUmVwZWF0aW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gUGxheWxpc3RNb2RlbC5pc1JlcGVhdGluZygpO1xuICAgIH07XG4gICAgJHNjb3BlLmlzU2h1ZmZsaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gUGxheWxpc3RNb2RlbC5pc1NodWZmbGluZygpO1xuICAgIH07XG5cbiAgICAvLyBDaGFuZ2UgdGhlIHBsYXlsaXN0IHN0YXRlLlxuICAgICRzY29wZS5wbGF5ID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgICAgIFBsYXlsaXN0TW9kZWwucGxheShpbmRleCk7XG4gICAgfTtcbiAgICAkc2NvcGUucHJldmlvdXMgPSBmdW5jdGlvbigpIHtcbiAgICAgIFBsYXlsaXN0TW9kZWwucHJldmlvdXMoKTtcbiAgICB9O1xuICAgICRzY29wZS5uZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLm5leHQoKTtcbiAgICB9O1xuICAgICRzY29wZS5yZXBlYXQgPSBmdW5jdGlvbigpIHtcbiAgICAgIFBsYXlsaXN0TW9kZWwucmVwZWF0KCk7XG4gICAgfTtcbiAgICAkc2NvcGUuc2h1ZmZsZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgUGxheWxpc3RNb2RlbC5zaHVmZmxlKCk7XG4gICAgfTtcblxuICAgIC8vIENoYW5nZSB0aGUgcGxheWxpc3QgbW9kZWwuXG4gICAgdmFyIHNldEF1dG9zaXplID0gZnVuY3Rpb24oKSB7XG4gICAgICAvLyBGb3IgYWRqdXN0aW5nIHRoZSB0ZXh0IGlucHV0IHdpZHRocy5cbiAgICAgICRzY29wZS4kZXZhbEFzeW5jKGZ1bmN0aW9uKCkge1xuICAgICAgICAkc2NvcGUuJGJyb2FkY2FzdCgnc2V0QXV0b3NpemUnKTtcbiAgICAgIH0pO1xuICAgIH07XG4gICAgJHNjb3BlLnJlbW92ZSA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLnJlbW92ZShpbmRleCk7XG4gICAgICBzZXRBdXRvc2l6ZSgpO1xuICAgIH07XG4gICAgJHNjb3BlLnNvcnRhYmxlQ2FsbGJhY2sgPSBmdW5jdGlvbihvbGRJbmRleCwgbmV3SW5kZXgpIHtcbiAgICAgIFBsYXlsaXN0TW9kZWwucmVvcmRlcihvbGRJbmRleCwgbmV3SW5kZXgpO1xuICAgICAgc2V0QXV0b3NpemUoKTtcbiAgICB9O1xuICAgICRzY29wZS5zZXQgPSBmdW5jdGlvbihpbmRleCwgbmV3VGl0bGUpIHtcbiAgICAgIHZhciBpdGVtID0gUGxheWxpc3RNb2RlbC5nZXQoaW5kZXgpO1xuICAgICAgaXRlbS50aXRsZSA9IG5ld1RpdGxlO1xuICAgICAgUGxheWxpc3RNb2RlbC5zZXQoaW5kZXgsIGl0ZW0pO1xuICAgIH07XG5cbiAgfTtcblxuICBhbmd1bGFyLm1vZHVsZSgnYXBwJykuY29udHJvbGxlcignUGxheWxpc3RDdHJsJywgWyckc2NvcGUnLCAnJHRpbWVvdXQnLCAnUGxheWxpc3RNb2RlbCcsIFBsYXlsaXN0Q3RybF0pO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgU2VhcmNoQ3RybCA9IGZ1bmN0aW9uKCRzY29wZSwgUGxheWxpc3RNb2RlbCwgWW91VHViZUFQSSkge1xuXG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcblxuICAgICRzY29wZS5xdWVyeSA9ICcnO1xuICAgICRzY29wZS5sb2FkaW5nID0gZmFsc2U7XG5cbiAgICAkc2NvcGUuYWRkVG9QbGF5bGlzdCA9IGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgIFBsYXlsaXN0TW9kZWwuYWRkKGFuZ3VsYXIuY29weShpdGVtKSk7XG4gICAgfTtcblxuICAgICRzY29wZS5zZWFyY2ggPSBmdW5jdGlvbigpIHtcbiAgICAgIHJlc3VsdHMgPSBbXTsgLy8gY2xlYXIgYHJlc3VsdHNgXG4gICAgICBpZiAoJHNjb3BlLnF1ZXJ5ID09PSAnJykge1xuICAgICAgICAkc2NvcGUubG9hZGluZyA9IGZhbHNlO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICAkc2NvcGUubG9hZGluZyA9IHRydWU7XG4gICAgICBZb3VUdWJlQVBJLnNlYXJjaCgkc2NvcGUucXVlcnkpLnRoZW4oZnVuY3Rpb24ocikge1xuICAgICAgICAkc2NvcGUubG9hZGluZyA9IGZhbHNlO1xuICAgICAgICByZXN1bHRzID0gcjtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuZ2V0UmVzdWx0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5jb250cm9sbGVyKCdTZWFyY2hDdHJsJywgWyckc2NvcGUnLCAnUGxheWxpc3RNb2RlbCcsICdZb3VUdWJlQVBJJywgU2VhcmNoQ3RybF0pO1xuXG59KSgpO1xuIl19
