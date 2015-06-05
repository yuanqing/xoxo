/* global YT */
angular.module('youtube-embed', ['ng'])
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
                var uriComponent = decodeURIComponent(id.split(';')[1]);
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

    // Inject YouTube's iFrame API
    (function () {
        var validProtocols = ['http:', 'https:'];
        var url = '//www.youtube.com/iframe_api';

        // We'd prefer a protocol relative url, but let's
        // fallback to `http:` for invalid protocols
        if (validProtocols.indexOf(window.location.protocol) < 0) {
            url = 'http:' + url;
        }
        var tag = document.createElement('script');
        tag.src = url;
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }());

    Service.ready = false;

    // Youtube callback when API is ready
    $window.onYouTubeIframeAPIReady = function () {
        $rootScope.$apply(function () {
            Service.ready = true;
        });
    };

    return Service;
}])
.directive('youtubeVideo', ['youtubeEmbedUtils', function (youtubeEmbedUtils) {
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
                        onStateChange: onPlayerStateChange
                    }
                });

                player.id = playerId;
                return player;
            }

            function loadPlayer () {
                if (playerId && scope.videoId) {
                    if (scope.player && scope.player.d &&
                        typeof scope.player.destroy === 'function') {
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
                        ||  typeof scope.videoId !== 'undefined');
                },
                function (ready) {
                    if (ready) {
                        stopWatchingReady();

                        // use URL if you've got it
                        if (typeof scope.videoUrl !== 'undefined') {
                            scope.$watch('videoUrl', function (url) {
                                scope.videoId = scope.utils.getIdFromURL(url);
                                scope.urlStartTime = scope.utils.getTimeFromURL(url);

                                loadPlayer();
                            });

                        // otherwise, watch the id
                        } else {
                            scope.$watch('videoId', function (id) {
                                scope.urlStartTime = null;
                                loadPlayer();
                            });
                        }
                    }
            });

            scope.$on('$destroy', function () {
                scope.player && scope.player.destroy();
            });
        }
    };
}]);

require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"jockey":[function(require,module,exports){
'use strict';

var STOPPED = 0;
var PLAYING = 1;
var PAUSED = 2;

var noop = function() {};

var forEach = function(arr, fn) {
  var i;
  var len = arr.length;
  for (i = 0; i < len; ++i) {
    fn(arr[i], i);
  }
};

var jockey = function(items, cbs, mockShuffle) {

  items = items ? items.slice() : [];

  cbs = cbs || {};
  forEach(['onModelChange', 'onStateChange'], function(name) {
    cbs[name] = cbs[name] || noop;
  });

  var playOrder = [];
  forEach(items, function(_, i) {
    playOrder.push(i);
  });

  var playOrderIndex = -1;
  var state = STOPPED;
  var repeating = false;
  var shuffling = false;

  var _isValidIndex = function(index) {
    return index > -1 && items.length > index;
  };

  var _getNextPlayOrderIndex = function() {

    // exit if not playing
    if (state === STOPPED) {
      return -1;
    }

    // increment
    var nextIndex = playOrderIndex + 1;

    // wraparound if repeating
    if (nextIndex === playOrder.length && repeating) {
      nextIndex = 0;
    }

    // return `nextIndex` if valid, else return -1
    if (nextIndex < playOrder.length) {
      return nextIndex;
    }
    return -1;

  };

  var _getPreviousPlayOrderIndex = function() {

    // exit if not playing
    if (state === STOPPED) {
      return -1;
    }

    // decrement
    var previousIndex = playOrderIndex - 1;

    // wraparound if repeating
    if (previousIndex === -1 && repeating) {
      previousIndex = playOrder.length - 1;
    }

    // return `previousIndex` if valid, else return -1
    if (previousIndex > -1) {
      return previousIndex;
    }
    return -1;

  };

  var _stop = function(self) {
    playOrderIndex = -1;
    state = STOPPED;
    cbs.onStateChange('stopped', self.getCurrent());
    if (shuffling) {
      playOrder = _shuffle(playOrder);
    }
    return null;
  };

  var _playByPlayOrderIndex = function(self, _playOrderIndex) {

    if (_isValidIndex(_playOrderIndex)) {
      playOrderIndex = _playOrderIndex;
      state = PLAYING;
      cbs.onStateChange('playing', self.getCurrent());
      return items[playOrder[playOrderIndex]];
    }
    return _stop(self);

  };

  /* istanbul ignore next */
  var _shuffle = mockShuffle || function(arr) {

    var i = arr.length - 1;
    var j, temp;
    while (i > 0) {
      j = Math.floor(Math.random() * (i + 1));
      temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
      i--;
    }
    return arr;

  };

  var _spliceToFront = function(itemIndex) {
    playOrder.sort();
    playOrder.splice(itemIndex, 1);
    playOrder = [itemIndex].concat(_shuffle(playOrder));
  };

  var _spliceToEnd = function(itemIndex) {
    playOrder.sort();
    playOrder.splice(itemIndex, 1);
    playOrder = _shuffle(playOrder).concat([itemIndex]);
  };

  var _get = function(index) {

    if (typeof index === 'undefined') {
      return items;
    }
    if (index > -1 && index < items.length) {
      return items[index];
    }
    return null;

  };

  return {

    add: function(item) {

      items.push(item);
      playOrder.push(items.length - 1);

      // call `onModelChange` callback
      cbs.onModelChange(_get());

      if (this.isShuffling()) {
        // shuffle unplayed items in `playOrder`
        var unplayedIndices = playOrder.splice(playOrderIndex + 1);
        playOrder = playOrder.concat(_shuffle(unplayedIndices));
      }

      return item;

    },

    remove: function(itemIndex) {

      if (!_isValidIndex(itemIndex)) {
        return null;
      }

      // remove the item at `itemIndex`
      var removedItem = items.splice(itemIndex, 1)[0];

      // call `onModelChange` callback
      cbs.onModelChange(_get());

      // stop if `removedItem` is currently played or paused
      if (itemIndex === playOrder[playOrderIndex]) {
        this.stop();
      }

      // remove `itemIndex` from `playOrder`, and move indices > `itemIndex`
      // left by 1
      var newPlayOrder = [];
      forEach(playOrder, function(playOrderIndex) {
        if (playOrderIndex !== itemIndex) {
          if (playOrderIndex > itemIndex) {
            playOrderIndex = playOrderIndex - 1;
          }
          newPlayOrder.push(playOrderIndex);
        }
      });
      playOrder = newPlayOrder;
      if (playOrderIndex > itemIndex) {
        playOrderIndex = playOrderIndex - 1;
      }

      return removedItem;

    },

    set: function(index, newItem) {

      if (index > -1 && index < items.length) {

        // call `onModelChange` callback
        cbs.onModelChange(_get());

        items[index] = newItem;
        return newItem;
      }

      return null;

    },

    get: _get,

    getCurrentIndex: function() {

      if (playOrderIndex === -1) {
        return -1;
      }
      return playOrder[playOrderIndex];

    },

    getCurrent: function() {

      return this.get(this.getCurrentIndex());

    },

    getPlayOrder: function() {

      return playOrder;

    },

    reorder: function(oldIndex, newIndex) {

      // exit if no change, or invalid indices
      if (oldIndex === newIndex || !_isValidIndex(oldIndex) || !_isValidIndex(newIndex)) {
        return null;
      }

      // move item from `oldIndex` to `newIndex`
      var movedItem = items.splice(oldIndex, 1)[0];
      items.splice(newIndex, 0, movedItem);

      // call `onModelChange` callback
      cbs.onModelChange(this.get());

      if (this.isShuffling()) {
        // find left and right ordering of `oldIndex` and `newIndex`
        var l, r, offset;
        if (oldIndex < newIndex) {
          l = oldIndex;
          r = newIndex;
          offset = -1;
        } else {
          l = newIndex;
          r = oldIndex;
          offset = 1;
        }
        // adjust `playOrder` if shuffling
        forEach(playOrder, function(playOrderIndex, i) {
          if (playOrderIndex >= l && playOrderIndex <= r) {
            if (playOrderIndex === oldIndex) {
              playOrder[i] = newIndex;
            } else {
              playOrder[i] = playOrderIndex + offset;
            }
          }
        });
      } else {
        // adjust `playOrderIndex` if not shuffling
        if (playOrderIndex === oldIndex) {
          playOrderIndex = newIndex;
        } else {
          if (playOrderIndex >= newIndex && playOrderIndex < oldIndex) {
            playOrderIndex = playOrderIndex + 1;
          }
          if (playOrderIndex <= newIndex && playOrderIndex > oldIndex) {
            playOrderIndex = playOrderIndex - 1;
          }
        }
      }

      return items[newIndex];

    },

    isStopped: function() {
      return state === STOPPED;
    },
    isPlaying: function() {
      return state === PLAYING;
    },
    isPaused: function() {
      return state === PAUSED;
    },
    isRepeating: function() {
      return repeating;
    },
    isShuffling: function() {
      return shuffling;
    },

    stop: function() {

      return _stop(this);

    },

    play: function(itemIndex) {

      var currentItem;

      if (typeof itemIndex === 'undefined') {
        if (this.isStopped()) {
          itemIndex = playOrder[0];
        } else {
          itemIndex = playOrder[playOrderIndex];
        }
        if (_isValidIndex(itemIndex)) {
          if (this.isStopped()) {
            playOrderIndex = 0; // playOrder 0 was valid; save it
          }
          state = PLAYING;
          currentItem = this.getCurrent();
          cbs.onStateChange('playing', currentItem);
          return currentItem;
        }
      } else {
        if (_isValidIndex(itemIndex)) {
          if (this.isShuffling()) {
            // move `itemIndex` to the front of `playOrder`
            _spliceToFront(itemIndex);
            playOrderIndex = 0;
          } else {
            playOrderIndex = itemIndex;
          }
          state = PLAYING;
          currentItem = this.getCurrent();
          cbs.onStateChange('playing', currentItem);
          return currentItem;
        }
      }

      this.stop();
      return null;

    },

    pause: function() {

      if (!this.isStopped()) {
        state = PAUSED;
        var currentItem = this.getCurrent();
        cbs.onStateChange('paused', this.getCurrent());
        return currentItem;
      }

      return null;

    },

    getPreviousIndex: function() {

      var playOrderIndex = _getPreviousPlayOrderIndex();
      if (_isValidIndex(playOrderIndex)) {
        return playOrder[playOrderIndex];
      }
      return -1;

    },

    getPrevious: function() {

      var itemIndex = this.getPreviousIndex();
      return this.get(itemIndex);

    },

    previous: function() {

      var playOrderIndex = _getPreviousPlayOrderIndex();

      if (this.isRepeating() && playOrderIndex === playOrder.length - 1) {
        var itemIndex = playOrder[playOrderIndex];
        _spliceToEnd(itemIndex);
      }

      return _playByPlayOrderIndex(this, playOrderIndex);

    },

    getNextIndex: function() {

      var playOrderIndex = _getNextPlayOrderIndex();
      if (_isValidIndex(playOrderIndex)) {
        return playOrder[playOrderIndex];
      }
      return -1;

    },

    getNext: function() {

      var itemIndex = this.getNextIndex();
      return this.get(itemIndex);

    },

    next: function() {

      var playOrderIndex = _getNextPlayOrderIndex();

      if (this.isRepeating() && playOrderIndex === 0) {
        var itemIndex = playOrder[playOrderIndex];
        _spliceToFront(itemIndex);
      }

      return _playByPlayOrderIndex(this, playOrderIndex);

    },

    repeat: function() {

      repeating = !repeating;
      return repeating;

    },

    shuffle: function() {

      if (this.isShuffling()) {
        playOrderIndex = playOrder[playOrderIndex];
        shuffling = false;
        playOrder.sort();
        return false;
      }

      shuffling = true;
      if (this.isStopped()) {
        // shuffle entire `playOrder`
        playOrder = _shuffle(playOrder);
      } else {
        // move `playOrderIndex` to front
        _spliceToFront(playOrderIndex);
        playOrderIndex = 0;
      }
      return true;

    }

  };

};

module.exports = exports = jockey;

},{}]},{},[]);

/*
 * $Id: rawdeflate.js,v 0.5 2013/04/09 14:25:38 dankogai Exp dankogai $
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

/*
 * $Id: rawinflate.js,v 0.3 2013/04/09 14:25:38 dankogai Exp dankogai $
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

/*
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
    var version = "2.1.5";
    // if node.js, we use Buffer
    var buffer;
    if (typeof module !== 'undefined' && module.exports) {
        buffer = require('buffer').Buffer;
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
    var _encode = buffer
        ? function (u) { return (new buffer(u)).toString('base64') } 
    : function (u) { return btoa(utob(u)) }
    ;
    var encode = function(u, urisafe) {
        return !urisafe 
            ? _encode(u)
            : _encode(u).replace(/[+\/]/g, function(m0) {
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
    var _decode = buffer
        ? function(a) { return (new buffer(a, 'base64')).toString() }
    : function(a) { return btou(atob(a)) };
    var decode = function(a){
        return _decode(
            a.replace(/[-_]/g, function(m0) { return m0 == '-' ? '+' : '/' })
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
})(this);

if (this['Meteor']) {
    Base64 = global.Base64; // for normal export in Meteor.js
}

/**!
 * Sortable
 * @author	RubaXa   <trash@rubaxa.org>
 * @license MIT
 */


(function (factory){
	"use strict";

	if( typeof define === "function" && define.amd ){
		define(factory);
	}
	else if( typeof module != "undefined" && typeof module.exports != "undefined" ){
		module.exports = factory();
	}
	else {
		window["Sortable"] = factory();
	}
})(function (){
	"use strict";

	var
		  dragEl
		, ghostEl
		, rootEl
		, nextEl

		, lastEl
		, lastCSS
		, lastRect

		, activeGroup

		, tapEvt
		, touchEvt

		, expando = 'Sortable' + (new Date).getTime()

		, win = window
		, document = win.document
		, parseInt = win.parseInt
		, supportIEdnd = !!document.createElement('div').dragDrop

		, _silent = false

		, _createEvent = function (event/**String*/, item/**HTMLElement*/){
			var evt = document.createEvent('Event');
			evt.initEvent(event, true, true);
			evt.item = item;
			return evt;
		}

		, _dispatchEvent = function (rootEl, name, targetEl) {
			rootEl.dispatchEvent(_createEvent(name, targetEl || rootEl));
		}

		, _customEvents = 'onAdd onUpdate onRemove onStart onEnd onFilter'.split(' ')

		, noop = function (){}
		, slice = [].slice

		, touchDragOverListeners = []
	;



	/**
	 * @class  Sortable
	 * @param  {HTMLElement}  el
	 * @param  {Object}       [options]
	 */
	function Sortable(el, options){
		this.el = el; // root element
		this.options = options = (options || {});


		// Defaults
		var defaults = {
			group: Math.random(),
			store: null,
			handle: null,
			draggable: el.children[0] && el.children[0].nodeName || (/[uo]l/i.test(el.nodeName) ? 'li' : '*'),
			ghostClass: 'sortable-ghost',
			ignore: 'a, img',
			filter: null
		};

		// Set default options
		for (var name in defaults) {
			options[name] = options[name] || defaults[name];
		}


		// Define events
		_customEvents.forEach(function (name) {
			options[name] = _bind(this, options[name] || noop);
			_on(el, name.substr(2).toLowerCase(), options[name]);
		}, this);


		// Export group name
		el[expando] = options.group;


		// Bind all private methods
		for( var fn in this ){
			if( fn.charAt(0) === '_' ){
				this[fn] = _bind(this, this[fn]);
			}
		}


		// Bind events
		_on(el, 'mousedown', this._onTapStart);
		_on(el, 'touchstart', this._onTapStart);
		supportIEdnd && _on(el, 'selectstart', this._onTapStart);

		_on(el, 'dragover', this._onDragOver);
		_on(el, 'dragenter', this._onDragOver);

		touchDragOverListeners.push(this._onDragOver);

		// Restore sorting
		options.store && this.sort(options.store.get(this));
	}


	Sortable.prototype = /** @lends Sortable.prototype */ {
		constructor: Sortable,


		_applyEffects: function (){
			_toggleClass(dragEl, this.options.ghostClass, true);
		},


		_onTapStart: function (evt/**Event|TouchEvent*/){
			var
				  touch = evt.touches && evt.touches[0]
				, target = (touch || evt).target
				, options =  this.options
				, el = this.el
				, filter = options.filter
			;

			if( evt.type === 'mousedown' && evt.button !== 0 ) {
				return; // only left button
			}

			// Check filter
			if( typeof filter === 'function' ){
				if( filter.call(this, target, this) ){
					_dispatchEvent(el, 'filter', target);
					return; // cancel dnd
				}
			}
			else if( filter ){
				filter = filter.split(',').filter(function (criteria) {
					return _closest(target, criteria.trim(), el);
				});

				if (filter.length) {
					_dispatchEvent(el, 'filter', target);
					return; // cancel dnd
				}
			}

			if( options.handle ){
				target = _closest(target, options.handle, el);
			}

			target = _closest(target, options.draggable, el);

			// IE 9 Support
			if( target && evt.type == 'selectstart' ){
				if( target.tagName != 'A' && target.tagName != 'IMG'){
					target.dragDrop();
				}
			}

			if( target && !dragEl && (target.parentNode === el) ){
				tapEvt = evt;

				rootEl = this.el;
				dragEl = target;
				nextEl = dragEl.nextSibling;
				activeGroup = this.options.group;

				dragEl.draggable = true;

				// Disable "draggable"
				options.ignore.split(',').forEach(function (criteria) {
					_find(target, criteria.trim(), _disableDraggable);
				});

				if( touch ){
					// Touch device support
					tapEvt = {
						  target:  target
						, clientX: touch.clientX
						, clientY: touch.clientY
					};

					this._onDragStart(tapEvt, true);
					evt.preventDefault();
				}

				_on(document, 'mouseup', this._onDrop);
				_on(document, 'touchend', this._onDrop);
				_on(document, 'touchcancel', this._onDrop);

				_on(this.el, 'dragstart', this._onDragStart);
				_on(this.el, 'dragend', this._onDrop);
				_on(document, 'dragover', _globalDragOver);


				try {
					if( document.selection ){
						document.selection.empty();
					} else {
						window.getSelection().removeAllRanges()
					}
				} catch (err){ }


				_dispatchEvent(dragEl, 'start');
			}
		},

		_emulateDragOver: function (){
			if( touchEvt ){
				_css(ghostEl, 'display', 'none');

				var
					  target = document.elementFromPoint(touchEvt.clientX, touchEvt.clientY)
					, parent = target
					, group = this.options.group
					, i = touchDragOverListeners.length
				;

				if( parent ){
					do {
						if( parent[expando] === group ){
							while( i-- ){
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
					while( parent = parent.parentNode );
				}

				_css(ghostEl, 'display', '');
			}
		},


		_onTouchMove: function (evt/**TouchEvent*/){
			if( tapEvt ){
				var
					  touch = evt.touches[0]
					, dx = touch.clientX - tapEvt.clientX
					, dy = touch.clientY - tapEvt.clientY
					, translate3d = 'translate3d(' + dx + 'px,' + dy + 'px,0)'
				;

				touchEvt = touch;

				_css(ghostEl, 'webkitTransform', translate3d);
				_css(ghostEl, 'mozTransform', translate3d);
				_css(ghostEl, 'msTransform', translate3d);
				_css(ghostEl, 'transform', translate3d);

				evt.preventDefault();
			}
		},


		_onDragStart: function (evt/**Event*/, isTouch/**Boolean*/){
			var dataTransfer = evt.dataTransfer;

			this._offUpEvents();

			if( isTouch ){
				var
					  rect = dragEl.getBoundingClientRect()
					, css = _css(dragEl)
					, ghostRect
				;

				ghostEl = dragEl.cloneNode(true);

				_css(ghostEl, 'top', rect.top - parseInt(css.marginTop, 10));
				_css(ghostEl, 'left', rect.left - parseInt(css.marginLeft, 10));
				_css(ghostEl, 'width', rect.width);
				_css(ghostEl, 'height', rect.height);
				_css(ghostEl, 'opacity', '0.8');
				_css(ghostEl, 'position', 'fixed');
				_css(ghostEl, 'zIndex', '100000');

				rootEl.appendChild(ghostEl);

				// Fixing dimensions.
				ghostRect = ghostEl.getBoundingClientRect();
				_css(ghostEl, 'width', rect.width*2 - ghostRect.width);
				_css(ghostEl, 'height', rect.height*2 - ghostRect.height);

				// Bind touch events
				_on(document, 'touchmove', this._onTouchMove);
				_on(document, 'touchend', this._onDrop);
				_on(document, 'touchcancel', this._onDrop);

				this._loopId = setInterval(this._emulateDragOver, 150);
			}
			else {
				dataTransfer.effectAllowed = 'move';
				dataTransfer.setData('Text', dragEl.textContent);

				_on(document, 'drop', this._onDrop);
			}

			setTimeout(this._applyEffects);
		},


		_onDragOver: function (evt/**Event*/){
			if( !_silent && (activeGroup === this.options.group) && (evt.rootEl === void 0 || evt.rootEl === this.el) ){
				var
					  el = this.el
					, target = _closest(evt.target, this.options.draggable, el)
				;

				if( el.children.length === 0 || el.children[0] === ghostEl || (el === evt.target) && _ghostInBottom(el, evt) ){
					el.appendChild(dragEl);
				}
				else if( target && target !== dragEl && (target.parentNode[expando] !== void 0) ){
					if( lastEl !== target ){
						lastEl = target;
						lastCSS = _css(target);
						lastRect = target.getBoundingClientRect();
					}


					var
						  rect = lastRect
						, width = rect.right - rect.left
						, height = rect.bottom - rect.top
						, floating = /left|right|inline/.test(lastCSS.cssFloat + lastCSS.display)
						, isWide = (target.offsetWidth > dragEl.offsetWidth)
						, isLong = (target.offsetHeight > dragEl.offsetHeight)
						, halfway = (floating ? (evt.clientX - rect.left)/width : (evt.clientY - rect.top)/height) > .5
						, nextSibling = target.nextElementSibling
						, after
					;

					_silent = true;
					setTimeout(_unsilent, 30);

					if( floating ){
						after = (target.previousElementSibling === dragEl) && !isWide || halfway && isWide
					} else {
						after = (nextSibling !== dragEl) && !isLong || halfway && isLong;
					}

					if( after && !nextSibling ){
						el.appendChild(dragEl);
					} else {
						target.parentNode.insertBefore(dragEl, after ? nextSibling : target);
					}
				}
			}
		},

		_offUpEvents: function () {
			_off(document, 'mouseup', this._onDrop);
			_off(document, 'touchmove', this._onTouchMove);
			_off(document, 'touchend', this._onDrop);
			_off(document, 'touchcancel', this._onDrop);
		},

		_onDrop: function (evt/**Event*/){
			clearInterval(this._loopId);

			// Unbind events
			_off(document, 'drop', this._onDrop);
			_off(document, 'dragover', _globalDragOver);

			_off(this.el, 'dragend', this._onDrop);
			_off(this.el, 'dragstart', this._onDragStart);
			_off(this.el, 'selectstart', this._onTapStart);

			this._offUpEvents();

			if( evt ){
				evt.preventDefault();
				evt.stopPropagation();

				if( ghostEl ){
					ghostEl.parentNode.removeChild(ghostEl);
				}

				if( dragEl ){
					_disableDraggable(dragEl);
					_toggleClass(dragEl, this.options.ghostClass, false);

					if( !rootEl.contains(dragEl) ){
						// Remove event
						_dispatchEvent(rootEl, 'remove', dragEl);

						// Add event
						_dispatchEvent(dragEl, 'add');
					}
					else if( dragEl.nextSibling !== nextEl ){
						// Update event
						_dispatchEvent(dragEl, 'update');
					}

					_dispatchEvent(dragEl, 'end');
				}

				// Set NULL
				rootEl =
				dragEl =
				ghostEl =
				nextEl =

				tapEvt =
				touchEvt =

				lastEl =
				lastCSS =

				activeGroup = null;

				// Save sorting
				this.options.store && this.options.store.set(this);
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
				n = children.length
			;

			for (; i < n; i++) {
				el = children[i];
				if (_closest(el, this.options.draggable, this.el)) {
					order.push(el.getAttribute('data-id') || _generateId(el));
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
		 * For each element in the set, get the first element that matches the selector by testing the element itself and traversing up through its ancestors in the DOM tree.
		 * @param   {HTMLElement}  el
		 * @param   {String}       [selector]  default: `options.draggable`
		 * @returns {HTMLElement|null}
		 */
		closest: function (el, selector) {
			return _closest(el, selector || this.options.draggable, this.el);
		},


		/**
		 * Destroy
		 */
		destroy: function () {
			var el = this.el, options = this.options;

			_customEvents.forEach(function (name) {
				_off(el, name.substr(2).toLowerCase(), options[name]);
			});

			_off(el, 'mousedown', this._onTapStart);
			_off(el, 'touchstart', this._onTapStart);
			_off(el, 'selectstart', this._onTapStart);

			_off(el, 'dragover', this._onDragOver);
			_off(el, 'dragenter', this._onDragOver);

			//remove draggable attributes
			Array.prototype.forEach.call(el.querySelectorAll('[draggable]'), function(el) {
				el.removeAttribute('draggable');
			});

			touchDragOverListeners.splice(touchDragOverListeners.indexOf(this._onDragOver), 1);

			this._onDrop();

			this.el = null;
		}
	};


	function _bind(ctx, fn){
		var args = slice.call(arguments, 2);
		return	fn.bind ? fn.bind.apply(fn, [ctx].concat(args)) : function (){
			return fn.apply(ctx, args.concat(slice.call(arguments)));
		};
	}


	function _closest(el, selector, ctx){
		if( selector === '*' ){
			return el;
		}
		else if( el ){
			ctx = ctx || document;
			selector = selector.split('.');

			var
				  tag = selector.shift().toUpperCase()
				, re = new RegExp('\\s('+selector.join('|')+')\\s', 'g')
			;

			do {
				if(
					   (tag === '' || el.nodeName == tag)
					&& (!selector.length || ((' '+el.className+' ').match(re) || []).length == selector.length)
				){
					return	el;
				}
			}
			while( el !== ctx && (el = el.parentNode) );
		}

		return	null;
	}


	function _globalDragOver(evt){
		evt.dataTransfer.dropEffect = 'move';
		evt.preventDefault();
	}


	function _on(el, event, fn){
		el.addEventListener(event, fn, false);
	}


	function _off(el, event, fn){
		el.removeEventListener(event, fn, false);
	}


	function _toggleClass(el, name, state){
		if( el ){
			if( el.classList ){
				el.classList[state ? 'add' : 'remove'](name);
			}
			else {
				var className = (' '+el.className+' ').replace(/\s+/g, ' ').replace(' '+name+' ', '');
				el.className = className + (state ? ' '+name : '')
			}
		}
	}


	function _css(el, prop, val){
		if( el && el.style ){
			if( val === void 0 ){
				if( document.defaultView && document.defaultView.getComputedStyle ){
					val = document.defaultView.getComputedStyle(el, '');
				}
				else if( el.currentStyle ){
					val	= el.currentStyle;
				}
				return	prop === void 0 ? val : val[prop];
			} else {
				el.style[prop] = val + (typeof val === 'string' ? '' : 'px');
			}
		}
	}


	function _find(ctx, tagName, iterator){
		if( ctx ){
			var list = ctx.getElementsByTagName(tagName), i = 0, n = list.length;
			if( iterator ){
				for( ; i < n; i++ ){
					iterator(list[i], i);
				}
			}
			return	list;
		}
		return	[];
	}


	function _disableDraggable(el){
		return el.draggable = false;
	}


	function _unsilent(){
		_silent = false;
	}


	function _ghostInBottom(el, evt){
		var last = el.lastElementChild.getBoundingClientRect();
		return evt.clientY - (last.top + last.height) > 5; // min delta
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
			sum = 0
		;

		while (i--) {
			sum += str.charCodeAt(i);
		}

		return sum.toString(36);
	}


	// Export utils
	Sortable.utils = {
		on: _on,
		off: _off,
		css: _css,
		find: _find,
		bind: _bind,
		closest: _closest,
		toggleClass: _toggleClass,
		createEvent: _createEvent,
		dispatchEvent: _dispatchEvent
	};


	Sortable.version = '0.5.2';


	// Export
	return Sortable;
});

(function() {

  'use strict';

  angular.module('app', ['youtube-embed']);

})();

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

(function() {

  'use strict';

  var jockey = require('jockey');

  var PlaylistModel = function($rootScope, Hash) {

    var items = Hash.get();
    var cbs = {
      onModelChange: function(items) {
        Hash.set(items);
      },
      onStateChange: function(state, currentItem) {
        $rootScope.$broadcast(state, currentItem);
      }
    };
    return jockey(items, cbs);

  };

  angular.module('app').factory('PlaylistModel', ['$rootScope', 'Hash', PlaylistModel]);

})();

(function() {

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

(function() {

  'use strict';

  var yqEditable = function() {

    var scope = {
      callback: '=yqEditable'
    };

    var link = function(scope, element) {
      element.on('keypress', function(e) {
        if (e.keyCode === 13 || e.keyCode === 27) {
          e.target.blur();
        }
      });
      element.on('blur', function() {
        scope.callback(scope.$parent.$index, element.text());
      });
    };

    return {
      restrict: 'A',
      scope: scope,
      link: link
    };

  };

  angular.module('app').directive('yqEditable', [yqEditable]);

})();

/* globals Sortable */
(function() {

  'use strict';

  var yqSortable = function() {

    var scope = {
      callback: '=yqSortable',
      handle: '@yqSortableHandle',
      ghostClass: '@yqSortableGhostClass',
    };

    var link = function(scope, element) {
      var onUpdate = function(e) {
        var items = Array.prototype.slice.call(element.children());
        var movedItem = e.item;
        var oldIndex = angular.element(movedItem).scope().$index;
        var newIndex = items.indexOf(movedItem);
        scope.callback(oldIndex, newIndex);
      };
      new Sortable(element[0], {
        handle: scope.handle,
        ghostClass: scope.ghostClass,
        onUpdate: onUpdate,
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

(function() {

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

(function() {

  'use strict';

  var TITLE = 'XOXO';

  var MainCtrl = function($scope, PlaylistModel) {

    $scope.isSearchOpen = false;
    $scope.isVideoVisible = false;

    $scope.title = function() {
      if (PlaylistModel.isPlaying()) {
        return '\u25B6 ' + TITLE;
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

(function() {

  'use strict';

  var PlayerCtrl = function($scope, /* $interval, */ $timeout, PlaylistModel) {

    var PLAYING = 1;
    // var _interval = null;

    $scope.id = null;
    $scope.player = null;
    $scope.isVisible = false;
    // $scope.elapsed = 0;

    var _isMounted = function(id) {
      if ($scope.player === null) {
        return false;
      }
      if (!angular.isUndefined(id)) {
        return $scope.id === id;
      }
      return $scope.id !== null;
    };

    // var _resetProgress = function() {
    //   $interval.cancel(_interval);
    //   _interval = null;
    //   $scope.elapsed = 0;
    // };

    var _stop = function() {
      if (_isMounted()) {
        $scope.player.stopVideo();
        $scope.id = null;
      }
      // _resetProgress();
    };

    $scope.toggle = function() {
      $scope.isVisible = !$scope.isVisible;
    };

    $scope.$on('stopped', function() {
      _stop();
    });

    $scope.$on('playing', function(_, item) {
      var id = item.id;
      if (_isMounted(id)) {
        if ($scope.player.getPlayerState() !== PLAYING) {
          $scope.player.playVideo();
        }
      } else {
        _stop();
        $scope.id = id;
        if ($scope.player !== null) {
          $scope.player.loadVideoById(id);
        }
      }
    });

    $scope.$on('paused', function() {
      if (!_isMounted()) {
        return;
      }
      $scope.player.pauseVideo();
    });

    $scope.$on('youtube.player.ready', function(_, player) {
      player.setVolume(100);
      player.playVideo();
      $scope.player = player;
    });

    $scope.$on('youtube.player.paused', function() {
      PlaylistModel.pause();
    });

    // $scope.$on('youtube.player.playing', function() {
    //   var player = $scope.player;
    //   _resetProgress();
    //   $scope.elapsed = (player.getCurrentTime() / player.getDuration() * 100);
    //   _interval = $interval(function() {
    //     $scope.elapsed = (player.getCurrentTime() / player.getDuration() * 100);
    //   }, 400);
    // });

    $scope.$on('youtube.player.ended', function() {
      // _resetProgress();
      PlaylistModel.next();
    });

  };

  angular.module('app').controller('PlayerCtrl', ['$scope', /* '$interval', */ '$timeout', 'PlaylistModel', PlayerCtrl]);

})();

(function() {

  'use strict';

  var PlaylistCtrl = function($scope, PlaylistModel) {

    // player state
    $scope.isStopped = function() {
      return PlaylistModel.isStopped();
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

    // get items in playlist
    $scope.get = function() {
      return PlaylistModel.get();
    };
    $scope.getCurrentIndex = function() {
      return PlaylistModel.getCurrentIndex();
    };

    // change playlist state
    $scope.play = function(index) {
      if (angular.isUndefined(index)) {
        if (PlaylistModel.isPlaying()) {
          PlaylistModel.pause();
        } else {
          PlaylistModel.play();
        }
      } else {
        PlaylistModel.play(index);
      }
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

    // change playlist model
    $scope.remove = function(index) {
      PlaylistModel.remove(index);
    };
    $scope.sortableCallback = function(oldIndex, newIndex) {
      PlaylistModel.reorder(oldIndex, newIndex);
    };
    $scope.editableCallback = function(index, newTitle) {
      var item = PlaylistModel.get(index);
      item.title = newTitle;
      PlaylistModel.set(index, item);
    };

  };

  angular.module('app').controller('PlaylistCtrl', ['$scope', 'PlaylistModel', PlaylistCtrl]);

})();

(function() {

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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFuZ3VsYXIteW91dHViZS1lbWJlZC5qcyIsImpvY2tleS5qcyIsInJhd2RlZmxhdGUuanMiLCJyYXdpbmZsYXRlLmpzIiwiYmFzZTY0LmpzIiwiU29ydGFibGUuanMiLCJhcHAuanMiLCJIYXNoLmpzIiwiUGxheWxpc3RNb2RlbC5qcyIsIllvdVR1YmVBUEkuanMiLCJ5cUVkaXRhYmxlLmpzIiwieXFTb3J0YWJsZS5qcyIsInlxU3luY0ZvY3VzLmpzIiwiTWFpbkN0cmwuanMiLCJQbGF5ZXJDdHJsLmpzIiwiUGxheWxpc3RDdHJsLmpzIiwiU2VhcmNoQ3RybC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM1T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNwZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzNvREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbnZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzdMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyogZ2xvYmFsIFlUICovXG5hbmd1bGFyLm1vZHVsZSgneW91dHViZS1lbWJlZCcsIFsnbmcnXSlcbi5zZXJ2aWNlICgneW91dHViZUVtYmVkVXRpbHMnLCBbJyR3aW5kb3cnLCAnJHJvb3RTY29wZScsIGZ1bmN0aW9uICgkd2luZG93LCAkcm9vdFNjb3BlKSB7XG4gICAgdmFyIFNlcnZpY2UgPSB7fVxuXG4gICAgLy8gYWRhcHRlZCBmcm9tIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzU4MzExOTEvMTYxNDk2N1xuICAgIHZhciB5b3V0dWJlUmVnZXhwID0gL2h0dHBzPzpcXC9cXC8oPzpbMC05QS1aLV0rXFwuKT8oPzp5b3V0dVxcLmJlXFwvfHlvdXR1YmUoPzotbm9jb29raWUpP1xcLmNvbVxcUypbXlxcd1xccy1dKShbXFx3LV17MTF9KSg/PVteXFx3LV18JCkoPyFbPz0mKyVcXHcuLV0qKD86WydcIl1bXjw+XSo+fDxcXC9hPikpWz89JislXFx3Li1dKi9pZztcbiAgICB2YXIgdGltZVJlZ2V4cCA9IC90PShcXGQrKVttc10/KFxcZCspP3M/LztcblxuICAgIGZ1bmN0aW9uIGNvbnRhaW5zKHN0ciwgc3Vic3RyKSB7XG4gICAgICAgIHJldHVybiAoc3RyLmluZGV4T2Yoc3Vic3RyKSA+IC0xKTtcbiAgICB9XG5cbiAgICBTZXJ2aWNlLmdldElkRnJvbVVSTCA9IGZ1bmN0aW9uIGdldElkRnJvbVVSTCh1cmwpIHtcbiAgICAgICAgdmFyIGlkID0gdXJsLnJlcGxhY2UoeW91dHViZVJlZ2V4cCwgJyQxJyk7XG5cbiAgICAgICAgaWYgKGNvbnRhaW5zKGlkLCAnOycpKSB7XG4gICAgICAgICAgICB2YXIgcGllY2VzID0gaWQuc3BsaXQoJzsnKTtcblxuICAgICAgICAgICAgaWYgKGNvbnRhaW5zKHBpZWNlc1sxXSwgJyUnKSkge1xuICAgICAgICAgICAgICAgIC8vIGxpbmtzIGxpa2UgdGhpczpcbiAgICAgICAgICAgICAgICAvLyBcImh0dHA6Ly93d3cueW91dHViZS5jb20vYXR0cmlidXRpb25fbGluaz9hPXB4YTZnb0hxemFBJmFtcDt1PSUyRndhdGNoJTNGdiUzRGRQZGd4MzB3OXNVJTI2ZmVhdHVyZSUzRHNoYXJlXCJcbiAgICAgICAgICAgICAgICAvLyBoYXZlIHRoZSByZWFsIHF1ZXJ5IHN0cmluZyBVUkkgZW5jb2RlZCBiZWhpbmQgYSAnOycuXG4gICAgICAgICAgICAgICAgLy8gYXQgdGhpcyBwb2ludCwgYGlkIGlzICdweGE2Z29IcXphQTt1PSUyRndhdGNoJTNGdiUzRGRQZGd4MzB3OXNVJTI2ZmVhdHVyZSUzRHNoYXJlJ1xuICAgICAgICAgICAgICAgIHZhciB1cmlDb21wb25lbnQgPSBkZWNvZGVVUklDb21wb25lbnQoaWQuc3BsaXQoJzsnKVsxXSk7XG4gICAgICAgICAgICAgICAgaWQgPSAoJ2h0dHA6Ly95b3V0dWJlLmNvbScgKyB1cmlDb21wb25lbnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSh5b3V0dWJlUmVnZXhwLCAnJDEnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1WYk5GOVgxd2FTYyZhbXA7ZmVhdHVyZT15b3V0dS5iZVxuICAgICAgICAgICAgICAgIC8vIGBpZGAgbG9va3MgbGlrZSAnVmJORjlYMXdhU2M7ZmVhdHVyZT15b3V0dS5iZScgY3VycmVudGx5LlxuICAgICAgICAgICAgICAgIC8vIHN0cmlwIHRoZSAnO2ZlYXR1cmU9eW91dHUuYmUnXG4gICAgICAgICAgICAgICAgaWQgPSBwaWVjZXNbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoY29udGFpbnMoaWQsICcjJykpIHtcbiAgICAgICAgICAgIC8vIGlkIG1pZ2h0IGxvb2sgbGlrZSAnOTNMdlRLRl9qVzAjdD0xJ1xuICAgICAgICAgICAgLy8gYW5kIHdlIHdhbnQgJzkzTHZUS0ZfalcwJ1xuICAgICAgICAgICAgaWQgPSBpZC5zcGxpdCgnIycpWzBdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH07XG5cbiAgICBTZXJ2aWNlLmdldFRpbWVGcm9tVVJMID0gZnVuY3Rpb24gZ2V0VGltZUZyb21VUkwodXJsKSB7XG4gICAgICAgIHVybCA9IHVybCB8fCAnJztcblxuICAgICAgICAvLyB0PTRtMjBzXG4gICAgICAgIC8vIHJldHVybnMgWyd0PTRtMjBzJywgJzQnLCAnMjAnXVxuICAgICAgICAvLyB0PTQ2c1xuICAgICAgICAvLyByZXR1cm5zIFsndD00NnMnLCAnNDYnXVxuICAgICAgICAvLyB0PTQ2XG4gICAgICAgIC8vIHJldHVybnMgWyd0PTQ2JywgJzQ2J11cbiAgICAgICAgdmFyIHRpbWVzID0gdXJsLm1hdGNoKHRpbWVSZWdleHApO1xuXG4gICAgICAgIGlmICghdGltZXMpIHtcbiAgICAgICAgICAgIC8vIHplcm8gc2Vjb25kc1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBhc3N1bWUgdGhlIGZpcnN0XG4gICAgICAgIHZhciBmdWxsID0gdGltZXNbMF0sXG4gICAgICAgICAgICBtaW51dGVzID0gdGltZXNbMV0sXG4gICAgICAgICAgICBzZWNvbmRzID0gdGltZXNbMl07XG5cbiAgICAgICAgLy8gdD00bTIwc1xuICAgICAgICBpZiAodHlwZW9mIHNlY29uZHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBzZWNvbmRzID0gcGFyc2VJbnQoc2Vjb25kcywgMTApO1xuICAgICAgICAgICAgbWludXRlcyA9IHBhcnNlSW50KG1pbnV0ZXMsIDEwKTtcblxuICAgICAgICAvLyB0PTRtXG4gICAgICAgIH0gZWxzZSBpZiAoY29udGFpbnMoZnVsbCwgJ20nKSkge1xuICAgICAgICAgICAgbWludXRlcyA9IHBhcnNlSW50KG1pbnV0ZXMsIDEwKTtcbiAgICAgICAgICAgIHNlY29uZHMgPSAwO1xuXG4gICAgICAgIC8vIHQ9NHNcbiAgICAgICAgLy8gdD00XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWNvbmRzID0gcGFyc2VJbnQobWludXRlcywgMTApO1xuICAgICAgICAgICAgbWludXRlcyA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpbiBzZWNvbmRzXG4gICAgICAgIHJldHVybiBzZWNvbmRzICsgKG1pbnV0ZXMgKiA2MCk7XG4gICAgfTtcblxuICAgIC8vIEluamVjdCBZb3VUdWJlJ3MgaUZyYW1lIEFQSVxuICAgIChmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB2YWxpZFByb3RvY29scyA9IFsnaHR0cDonLCAnaHR0cHM6J107XG4gICAgICAgIHZhciB1cmwgPSAnLy93d3cueW91dHViZS5jb20vaWZyYW1lX2FwaSc7XG5cbiAgICAgICAgLy8gV2UnZCBwcmVmZXIgYSBwcm90b2NvbCByZWxhdGl2ZSB1cmwsIGJ1dCBsZXQnc1xuICAgICAgICAvLyBmYWxsYmFjayB0byBgaHR0cDpgIGZvciBpbnZhbGlkIHByb3RvY29sc1xuICAgICAgICBpZiAodmFsaWRQcm90b2NvbHMuaW5kZXhPZih3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wpIDwgMCkge1xuICAgICAgICAgICAgdXJsID0gJ2h0dHA6JyArIHVybDtcbiAgICAgICAgfVxuICAgICAgICB2YXIgdGFnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gICAgICAgIHRhZy5zcmMgPSB1cmw7XG4gICAgICAgIHZhciBmaXJzdFNjcmlwdFRhZyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKVswXTtcbiAgICAgICAgZmlyc3RTY3JpcHRUYWcucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGFnLCBmaXJzdFNjcmlwdFRhZyk7XG4gICAgfSgpKTtcblxuICAgIFNlcnZpY2UucmVhZHkgPSBmYWxzZTtcblxuICAgIC8vIFlvdXR1YmUgY2FsbGJhY2sgd2hlbiBBUEkgaXMgcmVhZHlcbiAgICAkd2luZG93Lm9uWW91VHViZUlmcmFtZUFQSVJlYWR5ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkcm9vdFNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBTZXJ2aWNlLnJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJldHVybiBTZXJ2aWNlO1xufV0pXG4uZGlyZWN0aXZlKCd5b3V0dWJlVmlkZW8nLCBbJ3lvdXR1YmVFbWJlZFV0aWxzJywgZnVuY3Rpb24gKHlvdXR1YmVFbWJlZFV0aWxzKSB7XG4gICAgdmFyIHVuaXFJZCA9IDE7XG5cbiAgICAvLyBmcm9tIFlULlBsYXllclN0YXRlXG4gICAgdmFyIHN0YXRlTmFtZXMgPSB7XG4gICAgICAgICctMSc6ICd1bnN0YXJ0ZWQnLFxuICAgICAgICAwOiAnZW5kZWQnLFxuICAgICAgICAxOiAncGxheWluZycsXG4gICAgICAgIDI6ICdwYXVzZWQnLFxuICAgICAgICAzOiAnYnVmZmVyaW5nJyxcbiAgICAgICAgNTogJ3F1ZXVlZCdcbiAgICB9O1xuXG4gICAgdmFyIGV2ZW50UHJlZml4ID0gJ3lvdXR1YmUucGxheWVyLic7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0VBJyxcbiAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgIHZpZGVvSWQ6ICc9PycsXG4gICAgICAgICAgICB2aWRlb1VybDogJz0/JyxcbiAgICAgICAgICAgIHBsYXllcjogJz0/JyxcbiAgICAgICAgICAgIHBsYXllclZhcnM6ICc9PycsXG4gICAgICAgICAgICBwbGF5ZXJIZWlnaHQ6ICc9PycsXG4gICAgICAgICAgICBwbGF5ZXJXaWR0aDogJz0/J1xuICAgICAgICB9LFxuICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSB7XG4gICAgICAgICAgICAvLyBhbGxvd3MgdXMgdG8gJHdhdGNoIGByZWFkeWBcbiAgICAgICAgICAgIHNjb3BlLnV0aWxzID0geW91dHViZUVtYmVkVXRpbHM7XG5cbiAgICAgICAgICAgIC8vIHBsYXllci1pZCBhdHRyID4gaWQgYXR0ciA+IGRpcmVjdGl2ZS1nZW5lcmF0ZWQgSURcbiAgICAgICAgICAgIHZhciBwbGF5ZXJJZCA9IGF0dHJzLnBsYXllcklkIHx8IGVsZW1lbnRbMF0uaWQgfHwgJ3VuaXF1ZS15b3V0dWJlLWVtYmVkLWlkLScgKyB1bmlxSWQrKztcbiAgICAgICAgICAgIGVsZW1lbnRbMF0uaWQgPSBwbGF5ZXJJZDtcblxuICAgICAgICAgICAgLy8gQXR0YWNoIHRvIGVsZW1lbnRcbiAgICAgICAgICAgIHNjb3BlLnBsYXllckhlaWdodCA9IHNjb3BlLnBsYXllckhlaWdodCB8fCAzOTA7XG4gICAgICAgICAgICBzY29wZS5wbGF5ZXJXaWR0aCA9IHNjb3BlLnBsYXllcldpZHRoIHx8IDY0MDtcbiAgICAgICAgICAgIHNjb3BlLnBsYXllclZhcnMgPSBzY29wZS5wbGF5ZXJWYXJzIHx8IHt9O1xuXG4gICAgICAgICAgICAvLyBZVCBjYWxscyBjYWxsYmFja3Mgb3V0c2lkZSBvZiBkaWdlc3QgY3ljbGVcbiAgICAgICAgICAgIGZ1bmN0aW9uIGFwcGx5QnJvYWRjYXN0ICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJGVtaXQuYXBwbHkoc2NvcGUsIGFyZ3MpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBvblBsYXllclN0YXRlQ2hhbmdlIChldmVudCkge1xuICAgICAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0YXRlTmFtZXNbZXZlbnQuZGF0YV07XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBzdGF0ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlCcm9hZGNhc3QoZXZlbnRQcmVmaXggKyBzdGF0ZSwgc2NvcGUucGxheWVyLCBldmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnBsYXllci5jdXJyZW50U3RhdGUgPSBzdGF0ZTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gb25QbGF5ZXJSZWFkeSAoZXZlbnQpIHtcbiAgICAgICAgICAgICAgICBhcHBseUJyb2FkY2FzdChldmVudFByZWZpeCArICdyZWFkeScsIHNjb3BlLnBsYXllciwgZXZlbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBjcmVhdGVQbGF5ZXIgKCkge1xuICAgICAgICAgICAgICAgIHZhciBwbGF5ZXJWYXJzID0gYW5ndWxhci5jb3B5KHNjb3BlLnBsYXllclZhcnMpO1xuICAgICAgICAgICAgICAgIHBsYXllclZhcnMuc3RhcnQgPSBwbGF5ZXJWYXJzLnN0YXJ0IHx8IHNjb3BlLnVybFN0YXJ0VGltZTtcbiAgICAgICAgICAgICAgICB2YXIgcGxheWVyID0gbmV3IFlULlBsYXllcihwbGF5ZXJJZCwge1xuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHNjb3BlLnBsYXllckhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHNjb3BlLnBsYXllcldpZHRoLFxuICAgICAgICAgICAgICAgICAgICB2aWRlb0lkOiBzY29wZS52aWRlb0lkLFxuICAgICAgICAgICAgICAgICAgICBwbGF5ZXJWYXJzOiBwbGF5ZXJWYXJzLFxuICAgICAgICAgICAgICAgICAgICBldmVudHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uUmVhZHk6IG9uUGxheWVyUmVhZHksXG4gICAgICAgICAgICAgICAgICAgICAgICBvblN0YXRlQ2hhbmdlOiBvblBsYXllclN0YXRlQ2hhbmdlXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHBsYXllci5pZCA9IHBsYXllcklkO1xuICAgICAgICAgICAgICAgIHJldHVybiBwbGF5ZXI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGxvYWRQbGF5ZXIgKCkge1xuICAgICAgICAgICAgICAgIGlmIChwbGF5ZXJJZCAmJiBzY29wZS52aWRlb0lkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzY29wZS5wbGF5ZXIgJiYgc2NvcGUucGxheWVyLmQgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiBzY29wZS5wbGF5ZXIuZGVzdHJveSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUucGxheWVyLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnBsYXllciA9IGNyZWF0ZVBsYXllcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBzdG9wV2F0Y2hpbmdSZWFkeSA9IHNjb3BlLiR3YXRjaChcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS51dGlscy5yZWFkeVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2FpdCB1bnRpbCBvbmUgb2YgdGhlbSBpcyBkZWZpbmVkLi4uXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAodHlwZW9mIHNjb3BlLnZpZGVvVXJsICE9PSAndW5kZWZpbmVkJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfHwgIHR5cGVvZiBzY29wZS52aWRlb0lkICE9PSAndW5kZWZpbmVkJyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAocmVhZHkpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlYWR5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdG9wV2F0Y2hpbmdSZWFkeSgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB1c2UgVVJMIGlmIHlvdSd2ZSBnb3QgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2Ygc2NvcGUudmlkZW9VcmwgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuJHdhdGNoKCd2aWRlb1VybCcsIGZ1bmN0aW9uICh1cmwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUudmlkZW9JZCA9IHNjb3BlLnV0aWxzLmdldElkRnJvbVVSTCh1cmwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS51cmxTdGFydFRpbWUgPSBzY29wZS51dGlscy5nZXRUaW1lRnJvbVVSTCh1cmwpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvYWRQbGF5ZXIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCB3YXRjaCB0aGUgaWRcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuJHdhdGNoKCd2aWRlb0lkJywgZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLnVybFN0YXJ0VGltZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvYWRQbGF5ZXIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUucGxheWVyICYmIHNjb3BlLnBsYXllci5kZXN0cm95KCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG59XSk7XG4iLCJyZXF1aXJlPShmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHtcImpvY2tleVwiOltmdW5jdGlvbihyZXF1aXJlLG1vZHVsZSxleHBvcnRzKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIFNUT1BQRUQgPSAwO1xudmFyIFBMQVlJTkcgPSAxO1xudmFyIFBBVVNFRCA9IDI7XG5cbnZhciBub29wID0gZnVuY3Rpb24oKSB7fTtcblxudmFyIGZvckVhY2ggPSBmdW5jdGlvbihhcnIsIGZuKSB7XG4gIHZhciBpO1xuICB2YXIgbGVuID0gYXJyLmxlbmd0aDtcbiAgZm9yIChpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgZm4oYXJyW2ldLCBpKTtcbiAgfVxufTtcblxudmFyIGpvY2tleSA9IGZ1bmN0aW9uKGl0ZW1zLCBjYnMsIG1vY2tTaHVmZmxlKSB7XG5cbiAgaXRlbXMgPSBpdGVtcyA/IGl0ZW1zLnNsaWNlKCkgOiBbXTtcblxuICBjYnMgPSBjYnMgfHwge307XG4gIGZvckVhY2goWydvbk1vZGVsQ2hhbmdlJywgJ29uU3RhdGVDaGFuZ2UnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIGNic1tuYW1lXSA9IGNic1tuYW1lXSB8fCBub29wO1xuICB9KTtcblxuICB2YXIgcGxheU9yZGVyID0gW107XG4gIGZvckVhY2goaXRlbXMsIGZ1bmN0aW9uKF8sIGkpIHtcbiAgICBwbGF5T3JkZXIucHVzaChpKTtcbiAgfSk7XG5cbiAgdmFyIHBsYXlPcmRlckluZGV4ID0gLTE7XG4gIHZhciBzdGF0ZSA9IFNUT1BQRUQ7XG4gIHZhciByZXBlYXRpbmcgPSBmYWxzZTtcbiAgdmFyIHNodWZmbGluZyA9IGZhbHNlO1xuXG4gIHZhciBfaXNWYWxpZEluZGV4ID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgICByZXR1cm4gaW5kZXggPiAtMSAmJiBpdGVtcy5sZW5ndGggPiBpbmRleDtcbiAgfTtcblxuICB2YXIgX2dldE5leHRQbGF5T3JkZXJJbmRleCA9IGZ1bmN0aW9uKCkge1xuXG4gICAgLy8gZXhpdCBpZiBub3QgcGxheWluZ1xuICAgIGlmIChzdGF0ZSA9PT0gU1RPUFBFRCkge1xuICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIC8vIGluY3JlbWVudFxuICAgIHZhciBuZXh0SW5kZXggPSBwbGF5T3JkZXJJbmRleCArIDE7XG5cbiAgICAvLyB3cmFwYXJvdW5kIGlmIHJlcGVhdGluZ1xuICAgIGlmIChuZXh0SW5kZXggPT09IHBsYXlPcmRlci5sZW5ndGggJiYgcmVwZWF0aW5nKSB7XG4gICAgICBuZXh0SW5kZXggPSAwO1xuICAgIH1cblxuICAgIC8vIHJldHVybiBgbmV4dEluZGV4YCBpZiB2YWxpZCwgZWxzZSByZXR1cm4gLTFcbiAgICBpZiAobmV4dEluZGV4IDwgcGxheU9yZGVyLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIG5leHRJbmRleDtcbiAgICB9XG4gICAgcmV0dXJuIC0xO1xuXG4gIH07XG5cbiAgdmFyIF9nZXRQcmV2aW91c1BsYXlPcmRlckluZGV4ID0gZnVuY3Rpb24oKSB7XG5cbiAgICAvLyBleGl0IGlmIG5vdCBwbGF5aW5nXG4gICAgaWYgKHN0YXRlID09PSBTVE9QUEVEKSB7XG4gICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgLy8gZGVjcmVtZW50XG4gICAgdmFyIHByZXZpb3VzSW5kZXggPSBwbGF5T3JkZXJJbmRleCAtIDE7XG5cbiAgICAvLyB3cmFwYXJvdW5kIGlmIHJlcGVhdGluZ1xuICAgIGlmIChwcmV2aW91c0luZGV4ID09PSAtMSAmJiByZXBlYXRpbmcpIHtcbiAgICAgIHByZXZpb3VzSW5kZXggPSBwbGF5T3JkZXIubGVuZ3RoIC0gMTtcbiAgICB9XG5cbiAgICAvLyByZXR1cm4gYHByZXZpb3VzSW5kZXhgIGlmIHZhbGlkLCBlbHNlIHJldHVybiAtMVxuICAgIGlmIChwcmV2aW91c0luZGV4ID4gLTEpIHtcbiAgICAgIHJldHVybiBwcmV2aW91c0luZGV4O1xuICAgIH1cbiAgICByZXR1cm4gLTE7XG5cbiAgfTtcblxuICB2YXIgX3N0b3AgPSBmdW5jdGlvbihzZWxmKSB7XG4gICAgcGxheU9yZGVySW5kZXggPSAtMTtcbiAgICBzdGF0ZSA9IFNUT1BQRUQ7XG4gICAgY2JzLm9uU3RhdGVDaGFuZ2UoJ3N0b3BwZWQnLCBzZWxmLmdldEN1cnJlbnQoKSk7XG4gICAgaWYgKHNodWZmbGluZykge1xuICAgICAgcGxheU9yZGVyID0gX3NodWZmbGUocGxheU9yZGVyKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH07XG5cbiAgdmFyIF9wbGF5QnlQbGF5T3JkZXJJbmRleCA9IGZ1bmN0aW9uKHNlbGYsIF9wbGF5T3JkZXJJbmRleCkge1xuXG4gICAgaWYgKF9pc1ZhbGlkSW5kZXgoX3BsYXlPcmRlckluZGV4KSkge1xuICAgICAgcGxheU9yZGVySW5kZXggPSBfcGxheU9yZGVySW5kZXg7XG4gICAgICBzdGF0ZSA9IFBMQVlJTkc7XG4gICAgICBjYnMub25TdGF0ZUNoYW5nZSgncGxheWluZycsIHNlbGYuZ2V0Q3VycmVudCgpKTtcbiAgICAgIHJldHVybiBpdGVtc1twbGF5T3JkZXJbcGxheU9yZGVySW5kZXhdXTtcbiAgICB9XG4gICAgcmV0dXJuIF9zdG9wKHNlbGYpO1xuXG4gIH07XG5cbiAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgdmFyIF9zaHVmZmxlID0gbW9ja1NodWZmbGUgfHwgZnVuY3Rpb24oYXJyKSB7XG5cbiAgICB2YXIgaSA9IGFyci5sZW5ndGggLSAxO1xuICAgIHZhciBqLCB0ZW1wO1xuICAgIHdoaWxlIChpID4gMCkge1xuICAgICAgaiA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChpICsgMSkpO1xuICAgICAgdGVtcCA9IGFycltpXTtcbiAgICAgIGFycltpXSA9IGFycltqXTtcbiAgICAgIGFycltqXSA9IHRlbXA7XG4gICAgICBpLS07XG4gICAgfVxuICAgIHJldHVybiBhcnI7XG5cbiAgfTtcblxuICB2YXIgX3NwbGljZVRvRnJvbnQgPSBmdW5jdGlvbihpdGVtSW5kZXgpIHtcbiAgICBwbGF5T3JkZXIuc29ydCgpO1xuICAgIHBsYXlPcmRlci5zcGxpY2UoaXRlbUluZGV4LCAxKTtcbiAgICBwbGF5T3JkZXIgPSBbaXRlbUluZGV4XS5jb25jYXQoX3NodWZmbGUocGxheU9yZGVyKSk7XG4gIH07XG5cbiAgdmFyIF9zcGxpY2VUb0VuZCA9IGZ1bmN0aW9uKGl0ZW1JbmRleCkge1xuICAgIHBsYXlPcmRlci5zb3J0KCk7XG4gICAgcGxheU9yZGVyLnNwbGljZShpdGVtSW5kZXgsIDEpO1xuICAgIHBsYXlPcmRlciA9IF9zaHVmZmxlKHBsYXlPcmRlcikuY29uY2F0KFtpdGVtSW5kZXhdKTtcbiAgfTtcblxuICB2YXIgX2dldCA9IGZ1bmN0aW9uKGluZGV4KSB7XG5cbiAgICBpZiAodHlwZW9mIGluZGV4ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIGl0ZW1zO1xuICAgIH1cbiAgICBpZiAoaW5kZXggPiAtMSAmJiBpbmRleCA8IGl0ZW1zLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGl0ZW1zW2luZGV4XTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG5cbiAgfTtcblxuICByZXR1cm4ge1xuXG4gICAgYWRkOiBmdW5jdGlvbihpdGVtKSB7XG5cbiAgICAgIGl0ZW1zLnB1c2goaXRlbSk7XG4gICAgICBwbGF5T3JkZXIucHVzaChpdGVtcy5sZW5ndGggLSAxKTtcblxuICAgICAgLy8gY2FsbCBgb25Nb2RlbENoYW5nZWAgY2FsbGJhY2tcbiAgICAgIGNicy5vbk1vZGVsQ2hhbmdlKF9nZXQoKSk7XG5cbiAgICAgIGlmICh0aGlzLmlzU2h1ZmZsaW5nKCkpIHtcbiAgICAgICAgLy8gc2h1ZmZsZSB1bnBsYXllZCBpdGVtcyBpbiBgcGxheU9yZGVyYFxuICAgICAgICB2YXIgdW5wbGF5ZWRJbmRpY2VzID0gcGxheU9yZGVyLnNwbGljZShwbGF5T3JkZXJJbmRleCArIDEpO1xuICAgICAgICBwbGF5T3JkZXIgPSBwbGF5T3JkZXIuY29uY2F0KF9zaHVmZmxlKHVucGxheWVkSW5kaWNlcykpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gaXRlbTtcblxuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uKGl0ZW1JbmRleCkge1xuXG4gICAgICBpZiAoIV9pc1ZhbGlkSW5kZXgoaXRlbUluZGV4KSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgLy8gcmVtb3ZlIHRoZSBpdGVtIGF0IGBpdGVtSW5kZXhgXG4gICAgICB2YXIgcmVtb3ZlZEl0ZW0gPSBpdGVtcy5zcGxpY2UoaXRlbUluZGV4LCAxKVswXTtcblxuICAgICAgLy8gY2FsbCBgb25Nb2RlbENoYW5nZWAgY2FsbGJhY2tcbiAgICAgIGNicy5vbk1vZGVsQ2hhbmdlKF9nZXQoKSk7XG5cbiAgICAgIC8vIHN0b3AgaWYgYHJlbW92ZWRJdGVtYCBpcyBjdXJyZW50bHkgcGxheWVkIG9yIHBhdXNlZFxuICAgICAgaWYgKGl0ZW1JbmRleCA9PT0gcGxheU9yZGVyW3BsYXlPcmRlckluZGV4XSkge1xuICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgIH1cblxuICAgICAgLy8gcmVtb3ZlIGBpdGVtSW5kZXhgIGZyb20gYHBsYXlPcmRlcmAsIGFuZCBtb3ZlIGluZGljZXMgPiBgaXRlbUluZGV4YFxuICAgICAgLy8gbGVmdCBieSAxXG4gICAgICB2YXIgbmV3UGxheU9yZGVyID0gW107XG4gICAgICBmb3JFYWNoKHBsYXlPcmRlciwgZnVuY3Rpb24ocGxheU9yZGVySW5kZXgpIHtcbiAgICAgICAgaWYgKHBsYXlPcmRlckluZGV4ICE9PSBpdGVtSW5kZXgpIHtcbiAgICAgICAgICBpZiAocGxheU9yZGVySW5kZXggPiBpdGVtSW5kZXgpIHtcbiAgICAgICAgICAgIHBsYXlPcmRlckluZGV4ID0gcGxheU9yZGVySW5kZXggLSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICBuZXdQbGF5T3JkZXIucHVzaChwbGF5T3JkZXJJbmRleCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcGxheU9yZGVyID0gbmV3UGxheU9yZGVyO1xuICAgICAgaWYgKHBsYXlPcmRlckluZGV4ID4gaXRlbUluZGV4KSB7XG4gICAgICAgIHBsYXlPcmRlckluZGV4ID0gcGxheU9yZGVySW5kZXggLSAxO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVtb3ZlZEl0ZW07XG5cbiAgICB9LFxuXG4gICAgc2V0OiBmdW5jdGlvbihpbmRleCwgbmV3SXRlbSkge1xuXG4gICAgICBpZiAoaW5kZXggPiAtMSAmJiBpbmRleCA8IGl0ZW1zLmxlbmd0aCkge1xuXG4gICAgICAgIC8vIGNhbGwgYG9uTW9kZWxDaGFuZ2VgIGNhbGxiYWNrXG4gICAgICAgIGNicy5vbk1vZGVsQ2hhbmdlKF9nZXQoKSk7XG5cbiAgICAgICAgaXRlbXNbaW5kZXhdID0gbmV3SXRlbTtcbiAgICAgICAgcmV0dXJuIG5ld0l0ZW07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgfSxcblxuICAgIGdldDogX2dldCxcblxuICAgIGdldEN1cnJlbnRJbmRleDogZnVuY3Rpb24oKSB7XG5cbiAgICAgIGlmIChwbGF5T3JkZXJJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHBsYXlPcmRlcltwbGF5T3JkZXJJbmRleF07XG5cbiAgICB9LFxuXG4gICAgZ2V0Q3VycmVudDogZnVuY3Rpb24oKSB7XG5cbiAgICAgIHJldHVybiB0aGlzLmdldCh0aGlzLmdldEN1cnJlbnRJbmRleCgpKTtcblxuICAgIH0sXG5cbiAgICBnZXRQbGF5T3JkZXI6IGZ1bmN0aW9uKCkge1xuXG4gICAgICByZXR1cm4gcGxheU9yZGVyO1xuXG4gICAgfSxcblxuICAgIHJlb3JkZXI6IGZ1bmN0aW9uKG9sZEluZGV4LCBuZXdJbmRleCkge1xuXG4gICAgICAvLyBleGl0IGlmIG5vIGNoYW5nZSwgb3IgaW52YWxpZCBpbmRpY2VzXG4gICAgICBpZiAob2xkSW5kZXggPT09IG5ld0luZGV4IHx8ICFfaXNWYWxpZEluZGV4KG9sZEluZGV4KSB8fCAhX2lzVmFsaWRJbmRleChuZXdJbmRleCkpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIC8vIG1vdmUgaXRlbSBmcm9tIGBvbGRJbmRleGAgdG8gYG5ld0luZGV4YFxuICAgICAgdmFyIG1vdmVkSXRlbSA9IGl0ZW1zLnNwbGljZShvbGRJbmRleCwgMSlbMF07XG4gICAgICBpdGVtcy5zcGxpY2UobmV3SW5kZXgsIDAsIG1vdmVkSXRlbSk7XG5cbiAgICAgIC8vIGNhbGwgYG9uTW9kZWxDaGFuZ2VgIGNhbGxiYWNrXG4gICAgICBjYnMub25Nb2RlbENoYW5nZSh0aGlzLmdldCgpKTtcblxuICAgICAgaWYgKHRoaXMuaXNTaHVmZmxpbmcoKSkge1xuICAgICAgICAvLyBmaW5kIGxlZnQgYW5kIHJpZ2h0IG9yZGVyaW5nIG9mIGBvbGRJbmRleGAgYW5kIGBuZXdJbmRleGBcbiAgICAgICAgdmFyIGwsIHIsIG9mZnNldDtcbiAgICAgICAgaWYgKG9sZEluZGV4IDwgbmV3SW5kZXgpIHtcbiAgICAgICAgICBsID0gb2xkSW5kZXg7XG4gICAgICAgICAgciA9IG5ld0luZGV4O1xuICAgICAgICAgIG9mZnNldCA9IC0xO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGwgPSBuZXdJbmRleDtcbiAgICAgICAgICByID0gb2xkSW5kZXg7XG4gICAgICAgICAgb2Zmc2V0ID0gMTtcbiAgICAgICAgfVxuICAgICAgICAvLyBhZGp1c3QgYHBsYXlPcmRlcmAgaWYgc2h1ZmZsaW5nXG4gICAgICAgIGZvckVhY2gocGxheU9yZGVyLCBmdW5jdGlvbihwbGF5T3JkZXJJbmRleCwgaSkge1xuICAgICAgICAgIGlmIChwbGF5T3JkZXJJbmRleCA+PSBsICYmIHBsYXlPcmRlckluZGV4IDw9IHIpIHtcbiAgICAgICAgICAgIGlmIChwbGF5T3JkZXJJbmRleCA9PT0gb2xkSW5kZXgpIHtcbiAgICAgICAgICAgICAgcGxheU9yZGVyW2ldID0gbmV3SW5kZXg7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwbGF5T3JkZXJbaV0gPSBwbGF5T3JkZXJJbmRleCArIG9mZnNldDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gYWRqdXN0IGBwbGF5T3JkZXJJbmRleGAgaWYgbm90IHNodWZmbGluZ1xuICAgICAgICBpZiAocGxheU9yZGVySW5kZXggPT09IG9sZEluZGV4KSB7XG4gICAgICAgICAgcGxheU9yZGVySW5kZXggPSBuZXdJbmRleDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAocGxheU9yZGVySW5kZXggPj0gbmV3SW5kZXggJiYgcGxheU9yZGVySW5kZXggPCBvbGRJbmRleCkge1xuICAgICAgICAgICAgcGxheU9yZGVySW5kZXggPSBwbGF5T3JkZXJJbmRleCArIDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChwbGF5T3JkZXJJbmRleCA8PSBuZXdJbmRleCAmJiBwbGF5T3JkZXJJbmRleCA+IG9sZEluZGV4KSB7XG4gICAgICAgICAgICBwbGF5T3JkZXJJbmRleCA9IHBsYXlPcmRlckluZGV4IC0gMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGl0ZW1zW25ld0luZGV4XTtcblxuICAgIH0sXG5cbiAgICBpc1N0b3BwZWQ6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHN0YXRlID09PSBTVE9QUEVEO1xuICAgIH0sXG4gICAgaXNQbGF5aW5nOiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBzdGF0ZSA9PT0gUExBWUlORztcbiAgICB9LFxuICAgIGlzUGF1c2VkOiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBzdGF0ZSA9PT0gUEFVU0VEO1xuICAgIH0sXG4gICAgaXNSZXBlYXRpbmc6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHJlcGVhdGluZztcbiAgICB9LFxuICAgIGlzU2h1ZmZsaW5nOiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBzaHVmZmxpbmc7XG4gICAgfSxcblxuICAgIHN0b3A6IGZ1bmN0aW9uKCkge1xuXG4gICAgICByZXR1cm4gX3N0b3AodGhpcyk7XG5cbiAgICB9LFxuXG4gICAgcGxheTogZnVuY3Rpb24oaXRlbUluZGV4KSB7XG5cbiAgICAgIHZhciBjdXJyZW50SXRlbTtcblxuICAgICAgaWYgKHR5cGVvZiBpdGVtSW5kZXggPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGlmICh0aGlzLmlzU3RvcHBlZCgpKSB7XG4gICAgICAgICAgaXRlbUluZGV4ID0gcGxheU9yZGVyWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGl0ZW1JbmRleCA9IHBsYXlPcmRlcltwbGF5T3JkZXJJbmRleF07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKF9pc1ZhbGlkSW5kZXgoaXRlbUluZGV4KSkge1xuICAgICAgICAgIGlmICh0aGlzLmlzU3RvcHBlZCgpKSB7XG4gICAgICAgICAgICBwbGF5T3JkZXJJbmRleCA9IDA7IC8vIHBsYXlPcmRlciAwIHdhcyB2YWxpZDsgc2F2ZSBpdFxuICAgICAgICAgIH1cbiAgICAgICAgICBzdGF0ZSA9IFBMQVlJTkc7XG4gICAgICAgICAgY3VycmVudEl0ZW0gPSB0aGlzLmdldEN1cnJlbnQoKTtcbiAgICAgICAgICBjYnMub25TdGF0ZUNoYW5nZSgncGxheWluZycsIGN1cnJlbnRJdGVtKTtcbiAgICAgICAgICByZXR1cm4gY3VycmVudEl0ZW07XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChfaXNWYWxpZEluZGV4KGl0ZW1JbmRleCkpIHtcbiAgICAgICAgICBpZiAodGhpcy5pc1NodWZmbGluZygpKSB7XG4gICAgICAgICAgICAvLyBtb3ZlIGBpdGVtSW5kZXhgIHRvIHRoZSBmcm9udCBvZiBgcGxheU9yZGVyYFxuICAgICAgICAgICAgX3NwbGljZVRvRnJvbnQoaXRlbUluZGV4KTtcbiAgICAgICAgICAgIHBsYXlPcmRlckluZGV4ID0gMDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGxheU9yZGVySW5kZXggPSBpdGVtSW5kZXg7XG4gICAgICAgICAgfVxuICAgICAgICAgIHN0YXRlID0gUExBWUlORztcbiAgICAgICAgICBjdXJyZW50SXRlbSA9IHRoaXMuZ2V0Q3VycmVudCgpO1xuICAgICAgICAgIGNicy5vblN0YXRlQ2hhbmdlKCdwbGF5aW5nJywgY3VycmVudEl0ZW0pO1xuICAgICAgICAgIHJldHVybiBjdXJyZW50SXRlbTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLnN0b3AoKTtcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgfSxcblxuICAgIHBhdXNlOiBmdW5jdGlvbigpIHtcblxuICAgICAgaWYgKCF0aGlzLmlzU3RvcHBlZCgpKSB7XG4gICAgICAgIHN0YXRlID0gUEFVU0VEO1xuICAgICAgICB2YXIgY3VycmVudEl0ZW0gPSB0aGlzLmdldEN1cnJlbnQoKTtcbiAgICAgICAgY2JzLm9uU3RhdGVDaGFuZ2UoJ3BhdXNlZCcsIHRoaXMuZ2V0Q3VycmVudCgpKTtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnRJdGVtO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIH0sXG5cbiAgICBnZXRQcmV2aW91c0luZGV4OiBmdW5jdGlvbigpIHtcblxuICAgICAgdmFyIHBsYXlPcmRlckluZGV4ID0gX2dldFByZXZpb3VzUGxheU9yZGVySW5kZXgoKTtcbiAgICAgIGlmIChfaXNWYWxpZEluZGV4KHBsYXlPcmRlckluZGV4KSkge1xuICAgICAgICByZXR1cm4gcGxheU9yZGVyW3BsYXlPcmRlckluZGV4XTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcblxuICAgIH0sXG5cbiAgICBnZXRQcmV2aW91czogZnVuY3Rpb24oKSB7XG5cbiAgICAgIHZhciBpdGVtSW5kZXggPSB0aGlzLmdldFByZXZpb3VzSW5kZXgoKTtcbiAgICAgIHJldHVybiB0aGlzLmdldChpdGVtSW5kZXgpO1xuXG4gICAgfSxcblxuICAgIHByZXZpb3VzOiBmdW5jdGlvbigpIHtcblxuICAgICAgdmFyIHBsYXlPcmRlckluZGV4ID0gX2dldFByZXZpb3VzUGxheU9yZGVySW5kZXgoKTtcblxuICAgICAgaWYgKHRoaXMuaXNSZXBlYXRpbmcoKSAmJiBwbGF5T3JkZXJJbmRleCA9PT0gcGxheU9yZGVyLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgdmFyIGl0ZW1JbmRleCA9IHBsYXlPcmRlcltwbGF5T3JkZXJJbmRleF07XG4gICAgICAgIF9zcGxpY2VUb0VuZChpdGVtSW5kZXgpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gX3BsYXlCeVBsYXlPcmRlckluZGV4KHRoaXMsIHBsYXlPcmRlckluZGV4KTtcblxuICAgIH0sXG5cbiAgICBnZXROZXh0SW5kZXg6IGZ1bmN0aW9uKCkge1xuXG4gICAgICB2YXIgcGxheU9yZGVySW5kZXggPSBfZ2V0TmV4dFBsYXlPcmRlckluZGV4KCk7XG4gICAgICBpZiAoX2lzVmFsaWRJbmRleChwbGF5T3JkZXJJbmRleCkpIHtcbiAgICAgICAgcmV0dXJuIHBsYXlPcmRlcltwbGF5T3JkZXJJbmRleF07XG4gICAgICB9XG4gICAgICByZXR1cm4gLTE7XG5cbiAgICB9LFxuXG4gICAgZ2V0TmV4dDogZnVuY3Rpb24oKSB7XG5cbiAgICAgIHZhciBpdGVtSW5kZXggPSB0aGlzLmdldE5leHRJbmRleCgpO1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0KGl0ZW1JbmRleCk7XG5cbiAgICB9LFxuXG4gICAgbmV4dDogZnVuY3Rpb24oKSB7XG5cbiAgICAgIHZhciBwbGF5T3JkZXJJbmRleCA9IF9nZXROZXh0UGxheU9yZGVySW5kZXgoKTtcblxuICAgICAgaWYgKHRoaXMuaXNSZXBlYXRpbmcoKSAmJiBwbGF5T3JkZXJJbmRleCA9PT0gMCkge1xuICAgICAgICB2YXIgaXRlbUluZGV4ID0gcGxheU9yZGVyW3BsYXlPcmRlckluZGV4XTtcbiAgICAgICAgX3NwbGljZVRvRnJvbnQoaXRlbUluZGV4KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIF9wbGF5QnlQbGF5T3JkZXJJbmRleCh0aGlzLCBwbGF5T3JkZXJJbmRleCk7XG5cbiAgICB9LFxuXG4gICAgcmVwZWF0OiBmdW5jdGlvbigpIHtcblxuICAgICAgcmVwZWF0aW5nID0gIXJlcGVhdGluZztcbiAgICAgIHJldHVybiByZXBlYXRpbmc7XG5cbiAgICB9LFxuXG4gICAgc2h1ZmZsZTogZnVuY3Rpb24oKSB7XG5cbiAgICAgIGlmICh0aGlzLmlzU2h1ZmZsaW5nKCkpIHtcbiAgICAgICAgcGxheU9yZGVySW5kZXggPSBwbGF5T3JkZXJbcGxheU9yZGVySW5kZXhdO1xuICAgICAgICBzaHVmZmxpbmcgPSBmYWxzZTtcbiAgICAgICAgcGxheU9yZGVyLnNvcnQoKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBzaHVmZmxpbmcgPSB0cnVlO1xuICAgICAgaWYgKHRoaXMuaXNTdG9wcGVkKCkpIHtcbiAgICAgICAgLy8gc2h1ZmZsZSBlbnRpcmUgYHBsYXlPcmRlcmBcbiAgICAgICAgcGxheU9yZGVyID0gX3NodWZmbGUocGxheU9yZGVyKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG1vdmUgYHBsYXlPcmRlckluZGV4YCB0byBmcm9udFxuICAgICAgICBfc3BsaWNlVG9Gcm9udChwbGF5T3JkZXJJbmRleCk7XG4gICAgICAgIHBsYXlPcmRlckluZGV4ID0gMDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuXG4gICAgfVxuXG4gIH07XG5cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9IGpvY2tleTtcblxufSx7fV19LHt9LFtdKTtcbiIsIi8qXG4gKiAkSWQ6IHJhd2RlZmxhdGUuanMsdiAwLjUgMjAxMy8wNC8wOSAxNDoyNTozOCBkYW5rb2dhaSBFeHAgZGFua29nYWkgJFxuICpcbiAqIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlLCB2ZXJzaW9uIDIgKEdQTC0yLjApXG4gKiAgIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9HUEwtMi4wXG4gKiBPcmlnaW5hbDpcbiAqICBodHRwOi8vd3d3Lm9uaWNvcy5jb20vc3RhZmYvaXovYW11c2UvamF2YXNjcmlwdC9leHBlcnQvZGVmbGF0ZS50eHRcbiAqL1xuXG4oZnVuY3Rpb24oY3R4KXtcblxuLyogQ29weXJpZ2h0IChDKSAxOTk5IE1hc2FuYW8gSXp1bW8gPGl6QG9uaWNvcy5jby5qcD5cbiAqIFZlcnNpb246IDEuMC4xXG4gKiBMYXN0TW9kaWZpZWQ6IERlYyAyNSAxOTk5XG4gKi9cblxuLyogSW50ZXJmYWNlOlxuICogZGF0YSA9IHppcF9kZWZsYXRlKHNyYyk7XG4gKi9cblxuLyogY29uc3RhbnQgcGFyYW1ldGVycyAqL1xudmFyIHppcF9XU0laRSA9IDMyNzY4O1x0XHQvLyBTbGlkaW5nIFdpbmRvdyBzaXplXG52YXIgemlwX1NUT1JFRF9CTE9DSyA9IDA7XG52YXIgemlwX1NUQVRJQ19UUkVFUyA9IDE7XG52YXIgemlwX0RZTl9UUkVFUyAgICA9IDI7XG5cbi8qIGZvciBkZWZsYXRlICovXG52YXIgemlwX0RFRkFVTFRfTEVWRUwgPSA2O1xudmFyIHppcF9GVUxMX1NFQVJDSCA9IHRydWU7XG52YXIgemlwX0lOQlVGU0laID0gMzI3Njg7XHQvLyBJbnB1dCBidWZmZXIgc2l6ZVxudmFyIHppcF9JTkJVRl9FWFRSQSA9IDY0O1x0Ly8gRXh0cmEgYnVmZmVyXG52YXIgemlwX09VVEJVRlNJWiA9IDEwMjQgKiA4O1xudmFyIHppcF93aW5kb3dfc2l6ZSA9IDIgKiB6aXBfV1NJWkU7XG52YXIgemlwX01JTl9NQVRDSCA9IDM7XG52YXIgemlwX01BWF9NQVRDSCA9IDI1ODtcbnZhciB6aXBfQklUUyA9IDE2O1xuLy8gZm9yIFNNQUxMX01FTVxudmFyIHppcF9MSVRfQlVGU0laRSA9IDB4MjAwMDtcbnZhciB6aXBfSEFTSF9CSVRTID0gMTM7XG4vLyBmb3IgTUVESVVNX01FTVxuLy8gdmFyIHppcF9MSVRfQlVGU0laRSA9IDB4NDAwMDtcbi8vIHZhciB6aXBfSEFTSF9CSVRTID0gMTQ7XG4vLyBmb3IgQklHX01FTVxuLy8gdmFyIHppcF9MSVRfQlVGU0laRSA9IDB4ODAwMDtcbi8vIHZhciB6aXBfSEFTSF9CSVRTID0gMTU7XG5pZih6aXBfTElUX0JVRlNJWkUgPiB6aXBfSU5CVUZTSVopXG4gICAgYWxlcnQoXCJlcnJvcjogemlwX0lOQlVGU0laIGlzIHRvbyBzbWFsbFwiKTtcbmlmKCh6aXBfV1NJWkU8PDEpID4gKDE8PHppcF9CSVRTKSlcbiAgICBhbGVydChcImVycm9yOiB6aXBfV1NJWkUgaXMgdG9vIGxhcmdlXCIpO1xuaWYoemlwX0hBU0hfQklUUyA+IHppcF9CSVRTLTEpXG4gICAgYWxlcnQoXCJlcnJvcjogemlwX0hBU0hfQklUUyBpcyB0b28gbGFyZ2VcIik7XG5pZih6aXBfSEFTSF9CSVRTIDwgOCB8fCB6aXBfTUFYX01BVENIICE9IDI1OClcbiAgICBhbGVydChcImVycm9yOiBDb2RlIHRvbyBjbGV2ZXJcIik7XG52YXIgemlwX0RJU1RfQlVGU0laRSA9IHppcF9MSVRfQlVGU0laRTtcbnZhciB6aXBfSEFTSF9TSVpFID0gMSA8PCB6aXBfSEFTSF9CSVRTO1xudmFyIHppcF9IQVNIX01BU0sgPSB6aXBfSEFTSF9TSVpFIC0gMTtcbnZhciB6aXBfV01BU0sgPSB6aXBfV1NJWkUgLSAxO1xudmFyIHppcF9OSUwgPSAwOyAvLyBUYWlsIG9mIGhhc2ggY2hhaW5zXG52YXIgemlwX1RPT19GQVIgPSA0MDk2O1xudmFyIHppcF9NSU5fTE9PS0FIRUFEID0gemlwX01BWF9NQVRDSCArIHppcF9NSU5fTUFUQ0ggKyAxO1xudmFyIHppcF9NQVhfRElTVCA9IHppcF9XU0laRSAtIHppcF9NSU5fTE9PS0FIRUFEO1xudmFyIHppcF9TTUFMTEVTVCA9IDE7XG52YXIgemlwX01BWF9CSVRTID0gMTU7XG52YXIgemlwX01BWF9CTF9CSVRTID0gNztcbnZhciB6aXBfTEVOR1RIX0NPREVTID0gMjk7XG52YXIgemlwX0xJVEVSQUxTID0yNTY7XG52YXIgemlwX0VORF9CTE9DSyA9IDI1NjtcbnZhciB6aXBfTF9DT0RFUyA9IHppcF9MSVRFUkFMUyArIDEgKyB6aXBfTEVOR1RIX0NPREVTO1xudmFyIHppcF9EX0NPREVTID0gMzA7XG52YXIgemlwX0JMX0NPREVTID0gMTk7XG52YXIgemlwX1JFUF8zXzYgPSAxNjtcbnZhciB6aXBfUkVQWl8zXzEwID0gMTc7XG52YXIgemlwX1JFUFpfMTFfMTM4ID0gMTg7XG52YXIgemlwX0hFQVBfU0laRSA9IDIgKiB6aXBfTF9DT0RFUyArIDE7XG52YXIgemlwX0hfU0hJRlQgPSBwYXJzZUludCgoemlwX0hBU0hfQklUUyArIHppcF9NSU5fTUFUQ0ggLSAxKSAvXG5cdFx0XHQgICB6aXBfTUlOX01BVENIKTtcblxuLyogdmFyaWFibGVzICovXG52YXIgemlwX2ZyZWVfcXVldWU7XG52YXIgemlwX3FoZWFkLCB6aXBfcXRhaWw7XG52YXIgemlwX2luaXRmbGFnO1xudmFyIHppcF9vdXRidWYgPSBudWxsO1xudmFyIHppcF9vdXRjbnQsIHppcF9vdXRvZmY7XG52YXIgemlwX2NvbXBsZXRlO1xudmFyIHppcF93aW5kb3c7XG52YXIgemlwX2RfYnVmO1xudmFyIHppcF9sX2J1ZjtcbnZhciB6aXBfcHJldjtcbnZhciB6aXBfYmlfYnVmO1xudmFyIHppcF9iaV92YWxpZDtcbnZhciB6aXBfYmxvY2tfc3RhcnQ7XG52YXIgemlwX2luc19oO1xudmFyIHppcF9oYXNoX2hlYWQ7XG52YXIgemlwX3ByZXZfbWF0Y2g7XG52YXIgemlwX21hdGNoX2F2YWlsYWJsZTtcbnZhciB6aXBfbWF0Y2hfbGVuZ3RoO1xudmFyIHppcF9wcmV2X2xlbmd0aDtcbnZhciB6aXBfc3Ryc3RhcnQ7XG52YXIgemlwX21hdGNoX3N0YXJ0O1xudmFyIHppcF9lb2ZpbGU7XG52YXIgemlwX2xvb2thaGVhZDtcbnZhciB6aXBfbWF4X2NoYWluX2xlbmd0aDtcbnZhciB6aXBfbWF4X2xhenlfbWF0Y2g7XG52YXIgemlwX2NvbXByX2xldmVsO1xudmFyIHppcF9nb29kX21hdGNoO1xudmFyIHppcF9uaWNlX21hdGNoO1xudmFyIHppcF9keW5fbHRyZWU7XG52YXIgemlwX2R5bl9kdHJlZTtcbnZhciB6aXBfc3RhdGljX2x0cmVlO1xudmFyIHppcF9zdGF0aWNfZHRyZWU7XG52YXIgemlwX2JsX3RyZWU7XG52YXIgemlwX2xfZGVzYztcbnZhciB6aXBfZF9kZXNjO1xudmFyIHppcF9ibF9kZXNjO1xudmFyIHppcF9ibF9jb3VudDtcbnZhciB6aXBfaGVhcDtcbnZhciB6aXBfaGVhcF9sZW47XG52YXIgemlwX2hlYXBfbWF4O1xudmFyIHppcF9kZXB0aDtcbnZhciB6aXBfbGVuZ3RoX2NvZGU7XG52YXIgemlwX2Rpc3RfY29kZTtcbnZhciB6aXBfYmFzZV9sZW5ndGg7XG52YXIgemlwX2Jhc2VfZGlzdDtcbnZhciB6aXBfZmxhZ19idWY7XG52YXIgemlwX2xhc3RfbGl0O1xudmFyIHppcF9sYXN0X2Rpc3Q7XG52YXIgemlwX2xhc3RfZmxhZ3M7XG52YXIgemlwX2ZsYWdzO1xudmFyIHppcF9mbGFnX2JpdDtcbnZhciB6aXBfb3B0X2xlbjtcbnZhciB6aXBfc3RhdGljX2xlbjtcbnZhciB6aXBfZGVmbGF0ZV9kYXRhO1xudmFyIHppcF9kZWZsYXRlX3BvcztcblxuLyogb2JqZWN0cyAoZGVmbGF0ZSkgKi9cblxudmFyIHppcF9EZWZsYXRlQ1QgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmZjID0gMDsgLy8gZnJlcXVlbmN5IGNvdW50IG9yIGJpdCBzdHJpbmdcbiAgICB0aGlzLmRsID0gMDsgLy8gZmF0aGVyIG5vZGUgaW4gSHVmZm1hbiB0cmVlIG9yIGxlbmd0aCBvZiBiaXQgc3RyaW5nXG59XG5cbnZhciB6aXBfRGVmbGF0ZVRyZWVEZXNjID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5keW5fdHJlZSA9IG51bGw7XHQvLyB0aGUgZHluYW1pYyB0cmVlXG4gICAgdGhpcy5zdGF0aWNfdHJlZSA9IG51bGw7XHQvLyBjb3JyZXNwb25kaW5nIHN0YXRpYyB0cmVlIG9yIE5VTExcbiAgICB0aGlzLmV4dHJhX2JpdHMgPSBudWxsO1x0Ly8gZXh0cmEgYml0cyBmb3IgZWFjaCBjb2RlIG9yIE5VTExcbiAgICB0aGlzLmV4dHJhX2Jhc2UgPSAwO1x0Ly8gYmFzZSBpbmRleCBmb3IgZXh0cmFfYml0c1xuICAgIHRoaXMuZWxlbXMgPSAwO1x0XHQvLyBtYXggbnVtYmVyIG9mIGVsZW1lbnRzIGluIHRoZSB0cmVlXG4gICAgdGhpcy5tYXhfbGVuZ3RoID0gMDtcdC8vIG1heCBiaXQgbGVuZ3RoIGZvciB0aGUgY29kZXNcbiAgICB0aGlzLm1heF9jb2RlID0gMDtcdFx0Ly8gbGFyZ2VzdCBjb2RlIHdpdGggbm9uIHplcm8gZnJlcXVlbmN5XG59XG5cbi8qIFZhbHVlcyBmb3IgbWF4X2xhenlfbWF0Y2gsIGdvb2RfbWF0Y2ggYW5kIG1heF9jaGFpbl9sZW5ndGgsIGRlcGVuZGluZyBvblxuICogdGhlIGRlc2lyZWQgcGFjayBsZXZlbCAoMC4uOSkuIFRoZSB2YWx1ZXMgZ2l2ZW4gYmVsb3cgaGF2ZSBiZWVuIHR1bmVkIHRvXG4gKiBleGNsdWRlIHdvcnN0IGNhc2UgcGVyZm9ybWFuY2UgZm9yIHBhdGhvbG9naWNhbCBmaWxlcy4gQmV0dGVyIHZhbHVlcyBtYXkgYmVcbiAqIGZvdW5kIGZvciBzcGVjaWZpYyBmaWxlcy5cbiAqL1xudmFyIHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbiA9IGZ1bmN0aW9uKGEsIGIsIGMsIGQpIHtcbiAgICB0aGlzLmdvb2RfbGVuZ3RoID0gYTsgLy8gcmVkdWNlIGxhenkgc2VhcmNoIGFib3ZlIHRoaXMgbWF0Y2ggbGVuZ3RoXG4gICAgdGhpcy5tYXhfbGF6eSA9IGI7ICAgIC8vIGRvIG5vdCBwZXJmb3JtIGxhenkgc2VhcmNoIGFib3ZlIHRoaXMgbWF0Y2ggbGVuZ3RoXG4gICAgdGhpcy5uaWNlX2xlbmd0aCA9IGM7IC8vIHF1aXQgc2VhcmNoIGFib3ZlIHRoaXMgbWF0Y2ggbGVuZ3RoXG4gICAgdGhpcy5tYXhfY2hhaW4gPSBkO1xufVxuXG52YXIgemlwX0RlZmxhdGVCdWZmZXIgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5leHQgPSBudWxsO1xuICAgIHRoaXMubGVuID0gMDtcbiAgICB0aGlzLnB0ciA9IG5ldyBBcnJheSh6aXBfT1VUQlVGU0laKTtcbiAgICB0aGlzLm9mZiA9IDA7XG59XG5cbi8qIGNvbnN0YW50IHRhYmxlcyAqL1xudmFyIHppcF9leHRyYV9sYml0cyA9IG5ldyBBcnJheShcbiAgICAwLDAsMCwwLDAsMCwwLDAsMSwxLDEsMSwyLDIsMiwyLDMsMywzLDMsNCw0LDQsNCw1LDUsNSw1LDApO1xudmFyIHppcF9leHRyYV9kYml0cyA9IG5ldyBBcnJheShcbiAgICAwLDAsMCwwLDEsMSwyLDIsMywzLDQsNCw1LDUsNiw2LDcsNyw4LDgsOSw5LDEwLDEwLDExLDExLDEyLDEyLDEzLDEzKTtcbnZhciB6aXBfZXh0cmFfYmxiaXRzID0gbmV3IEFycmF5KFxuICAgIDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMiwzLDcpO1xudmFyIHppcF9ibF9vcmRlciA9IG5ldyBBcnJheShcbiAgICAxNiwxNywxOCwwLDgsNyw5LDYsMTAsNSwxMSw0LDEyLDMsMTMsMiwxNCwxLDE1KTtcbnZhciB6aXBfY29uZmlndXJhdGlvbl90YWJsZSA9IG5ldyBBcnJheShcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbigwLCAgICAwLCAgIDAsICAgIDApLFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDQsICAgIDQsICAgOCwgICAgNCksXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oNCwgICAgNSwgIDE2LCAgICA4KSxcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbig0LCAgICA2LCAgMzIsICAgMzIpLFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDQsICAgIDQsICAxNiwgICAxNiksXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oOCwgICAxNiwgIDMyLCAgIDMyKSxcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbig4LCAgIDE2LCAxMjgsICAxMjgpLFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDgsICAgMzIsIDEyOCwgIDI1NiksXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oMzIsIDEyOCwgMjU4LCAxMDI0KSxcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbigzMiwgMjU4LCAyNTgsIDQwOTYpKTtcblxuXG4vKiByb3V0aW5lcyAoZGVmbGF0ZSkgKi9cblxudmFyIHppcF9kZWZsYXRlX3N0YXJ0ID0gZnVuY3Rpb24obGV2ZWwpIHtcbiAgICB2YXIgaTtcblxuICAgIGlmKCFsZXZlbClcblx0bGV2ZWwgPSB6aXBfREVGQVVMVF9MRVZFTDtcbiAgICBlbHNlIGlmKGxldmVsIDwgMSlcblx0bGV2ZWwgPSAxO1xuICAgIGVsc2UgaWYobGV2ZWwgPiA5KVxuXHRsZXZlbCA9IDk7XG5cbiAgICB6aXBfY29tcHJfbGV2ZWwgPSBsZXZlbDtcbiAgICB6aXBfaW5pdGZsYWcgPSBmYWxzZTtcbiAgICB6aXBfZW9maWxlID0gZmFsc2U7XG4gICAgaWYoemlwX291dGJ1ZiAhPSBudWxsKVxuXHRyZXR1cm47XG5cbiAgICB6aXBfZnJlZV9xdWV1ZSA9IHppcF9xaGVhZCA9IHppcF9xdGFpbCA9IG51bGw7XG4gICAgemlwX291dGJ1ZiA9IG5ldyBBcnJheSh6aXBfT1VUQlVGU0laKTtcbiAgICB6aXBfd2luZG93ID0gbmV3IEFycmF5KHppcF93aW5kb3dfc2l6ZSk7XG4gICAgemlwX2RfYnVmID0gbmV3IEFycmF5KHppcF9ESVNUX0JVRlNJWkUpO1xuICAgIHppcF9sX2J1ZiA9IG5ldyBBcnJheSh6aXBfSU5CVUZTSVogKyB6aXBfSU5CVUZfRVhUUkEpO1xuICAgIHppcF9wcmV2ID0gbmV3IEFycmF5KDEgPDwgemlwX0JJVFMpO1xuICAgIHppcF9keW5fbHRyZWUgPSBuZXcgQXJyYXkoemlwX0hFQVBfU0laRSk7XG4gICAgZm9yKGkgPSAwOyBpIDwgemlwX0hFQVBfU0laRTsgaSsrKVxuXHR6aXBfZHluX2x0cmVlW2ldID0gbmV3IHppcF9EZWZsYXRlQ1QoKTtcbiAgICB6aXBfZHluX2R0cmVlID0gbmV3IEFycmF5KDIqemlwX0RfQ09ERVMrMSk7XG4gICAgZm9yKGkgPSAwOyBpIDwgMip6aXBfRF9DT0RFUysxOyBpKyspXG5cdHppcF9keW5fZHRyZWVbaV0gPSBuZXcgemlwX0RlZmxhdGVDVCgpO1xuICAgIHppcF9zdGF0aWNfbHRyZWUgPSBuZXcgQXJyYXkoemlwX0xfQ09ERVMrMik7XG4gICAgZm9yKGkgPSAwOyBpIDwgemlwX0xfQ09ERVMrMjsgaSsrKVxuXHR6aXBfc3RhdGljX2x0cmVlW2ldID0gbmV3IHppcF9EZWZsYXRlQ1QoKTtcbiAgICB6aXBfc3RhdGljX2R0cmVlID0gbmV3IEFycmF5KHppcF9EX0NPREVTKTtcbiAgICBmb3IoaSA9IDA7IGkgPCB6aXBfRF9DT0RFUzsgaSsrKVxuXHR6aXBfc3RhdGljX2R0cmVlW2ldID0gbmV3IHppcF9EZWZsYXRlQ1QoKTtcbiAgICB6aXBfYmxfdHJlZSA9IG5ldyBBcnJheSgyKnppcF9CTF9DT0RFUysxKTtcbiAgICBmb3IoaSA9IDA7IGkgPCAyKnppcF9CTF9DT0RFUysxOyBpKyspXG5cdHppcF9ibF90cmVlW2ldID0gbmV3IHppcF9EZWZsYXRlQ1QoKTtcbiAgICB6aXBfbF9kZXNjID0gbmV3IHppcF9EZWZsYXRlVHJlZURlc2MoKTtcbiAgICB6aXBfZF9kZXNjID0gbmV3IHppcF9EZWZsYXRlVHJlZURlc2MoKTtcbiAgICB6aXBfYmxfZGVzYyA9IG5ldyB6aXBfRGVmbGF0ZVRyZWVEZXNjKCk7XG4gICAgemlwX2JsX2NvdW50ID0gbmV3IEFycmF5KHppcF9NQVhfQklUUysxKTtcbiAgICB6aXBfaGVhcCA9IG5ldyBBcnJheSgyKnppcF9MX0NPREVTKzEpO1xuICAgIHppcF9kZXB0aCA9IG5ldyBBcnJheSgyKnppcF9MX0NPREVTKzEpO1xuICAgIHppcF9sZW5ndGhfY29kZSA9IG5ldyBBcnJheSh6aXBfTUFYX01BVENILXppcF9NSU5fTUFUQ0grMSk7XG4gICAgemlwX2Rpc3RfY29kZSA9IG5ldyBBcnJheSg1MTIpO1xuICAgIHppcF9iYXNlX2xlbmd0aCA9IG5ldyBBcnJheSh6aXBfTEVOR1RIX0NPREVTKTtcbiAgICB6aXBfYmFzZV9kaXN0ID0gbmV3IEFycmF5KHppcF9EX0NPREVTKTtcbiAgICB6aXBfZmxhZ19idWYgPSBuZXcgQXJyYXkocGFyc2VJbnQoemlwX0xJVF9CVUZTSVpFIC8gOCkpO1xufVxuXG52YXIgemlwX2RlZmxhdGVfZW5kID0gZnVuY3Rpb24oKSB7XG4gICAgemlwX2ZyZWVfcXVldWUgPSB6aXBfcWhlYWQgPSB6aXBfcXRhaWwgPSBudWxsO1xuICAgIHppcF9vdXRidWYgPSBudWxsO1xuICAgIHppcF93aW5kb3cgPSBudWxsO1xuICAgIHppcF9kX2J1ZiA9IG51bGw7XG4gICAgemlwX2xfYnVmID0gbnVsbDtcbiAgICB6aXBfcHJldiA9IG51bGw7XG4gICAgemlwX2R5bl9sdHJlZSA9IG51bGw7XG4gICAgemlwX2R5bl9kdHJlZSA9IG51bGw7XG4gICAgemlwX3N0YXRpY19sdHJlZSA9IG51bGw7XG4gICAgemlwX3N0YXRpY19kdHJlZSA9IG51bGw7XG4gICAgemlwX2JsX3RyZWUgPSBudWxsO1xuICAgIHppcF9sX2Rlc2MgPSBudWxsO1xuICAgIHppcF9kX2Rlc2MgPSBudWxsO1xuICAgIHppcF9ibF9kZXNjID0gbnVsbDtcbiAgICB6aXBfYmxfY291bnQgPSBudWxsO1xuICAgIHppcF9oZWFwID0gbnVsbDtcbiAgICB6aXBfZGVwdGggPSBudWxsO1xuICAgIHppcF9sZW5ndGhfY29kZSA9IG51bGw7XG4gICAgemlwX2Rpc3RfY29kZSA9IG51bGw7XG4gICAgemlwX2Jhc2VfbGVuZ3RoID0gbnVsbDtcbiAgICB6aXBfYmFzZV9kaXN0ID0gbnVsbDtcbiAgICB6aXBfZmxhZ19idWYgPSBudWxsO1xufVxuXG52YXIgemlwX3JldXNlX3F1ZXVlID0gZnVuY3Rpb24ocCkge1xuICAgIHAubmV4dCA9IHppcF9mcmVlX3F1ZXVlO1xuICAgIHppcF9mcmVlX3F1ZXVlID0gcDtcbn1cblxudmFyIHppcF9uZXdfcXVldWUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgcDtcblxuICAgIGlmKHppcF9mcmVlX3F1ZXVlICE9IG51bGwpXG4gICAge1xuXHRwID0gemlwX2ZyZWVfcXVldWU7XG5cdHppcF9mcmVlX3F1ZXVlID0gemlwX2ZyZWVfcXVldWUubmV4dDtcbiAgICB9XG4gICAgZWxzZVxuXHRwID0gbmV3IHppcF9EZWZsYXRlQnVmZmVyKCk7XG4gICAgcC5uZXh0ID0gbnVsbDtcbiAgICBwLmxlbiA9IHAub2ZmID0gMDtcblxuICAgIHJldHVybiBwO1xufVxuXG52YXIgemlwX2hlYWQxID0gZnVuY3Rpb24oaSkge1xuICAgIHJldHVybiB6aXBfcHJldlt6aXBfV1NJWkUgKyBpXTtcbn1cblxudmFyIHppcF9oZWFkMiA9IGZ1bmN0aW9uKGksIHZhbCkge1xuICAgIHJldHVybiB6aXBfcHJldlt6aXBfV1NJWkUgKyBpXSA9IHZhbDtcbn1cblxuLyogcHV0X2J5dGUgaXMgdXNlZCBmb3IgdGhlIGNvbXByZXNzZWQgb3V0cHV0LCBwdXRfdWJ5dGUgZm9yIHRoZVxuICogdW5jb21wcmVzc2VkIG91dHB1dC4gSG93ZXZlciB1bmx6dygpIHVzZXMgd2luZG93IGZvciBpdHNcbiAqIHN1ZmZpeCB0YWJsZSBpbnN0ZWFkIG9mIGl0cyBvdXRwdXQgYnVmZmVyLCBzbyBpdCBkb2VzIG5vdCB1c2UgcHV0X3VieXRlXG4gKiAodG8gYmUgY2xlYW5lZCB1cCkuXG4gKi9cbnZhciB6aXBfcHV0X2J5dGUgPSBmdW5jdGlvbihjKSB7XG4gICAgemlwX291dGJ1Zlt6aXBfb3V0b2ZmICsgemlwX291dGNudCsrXSA9IGM7XG4gICAgaWYoemlwX291dG9mZiArIHppcF9vdXRjbnQgPT0gemlwX09VVEJVRlNJWilcblx0emlwX3FvdXRidWYoKTtcbn1cblxuLyogT3V0cHV0IGEgMTYgYml0IHZhbHVlLCBsc2IgZmlyc3QgKi9cbnZhciB6aXBfcHV0X3Nob3J0ID0gZnVuY3Rpb24odykge1xuICAgIHcgJj0gMHhmZmZmO1xuICAgIGlmKHppcF9vdXRvZmYgKyB6aXBfb3V0Y250IDwgemlwX09VVEJVRlNJWiAtIDIpIHtcblx0emlwX291dGJ1Zlt6aXBfb3V0b2ZmICsgemlwX291dGNudCsrXSA9ICh3ICYgMHhmZik7XG5cdHppcF9vdXRidWZbemlwX291dG9mZiArIHppcF9vdXRjbnQrK10gPSAodyA+Pj4gOCk7XG4gICAgfSBlbHNlIHtcblx0emlwX3B1dF9ieXRlKHcgJiAweGZmKTtcblx0emlwX3B1dF9ieXRlKHcgPj4+IDgpO1xuICAgIH1cbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIEluc2VydCBzdHJpbmcgcyBpbiB0aGUgZGljdGlvbmFyeSBhbmQgc2V0IG1hdGNoX2hlYWQgdG8gdGhlIHByZXZpb3VzIGhlYWRcbiAqIG9mIHRoZSBoYXNoIGNoYWluICh0aGUgbW9zdCByZWNlbnQgc3RyaW5nIHdpdGggc2FtZSBoYXNoIGtleSkuIFJldHVyblxuICogdGhlIHByZXZpb3VzIGxlbmd0aCBvZiB0aGUgaGFzaCBjaGFpbi5cbiAqIElOICBhc3NlcnRpb246IGFsbCBjYWxscyB0byB0byBJTlNFUlRfU1RSSU5HIGFyZSBtYWRlIHdpdGggY29uc2VjdXRpdmVcbiAqICAgIGlucHV0IGNoYXJhY3RlcnMgYW5kIHRoZSBmaXJzdCBNSU5fTUFUQ0ggYnl0ZXMgb2YgcyBhcmUgdmFsaWRcbiAqICAgIChleGNlcHQgZm9yIHRoZSBsYXN0IE1JTl9NQVRDSC0xIGJ5dGVzIG9mIHRoZSBpbnB1dCBmaWxlKS5cbiAqL1xudmFyIHppcF9JTlNFUlRfU1RSSU5HID0gZnVuY3Rpb24oKSB7XG4gICAgemlwX2luc19oID0gKCh6aXBfaW5zX2ggPDwgemlwX0hfU0hJRlQpXG5cdFx0IF4gKHppcF93aW5kb3dbemlwX3N0cnN0YXJ0ICsgemlwX01JTl9NQVRDSCAtIDFdICYgMHhmZikpXG5cdCYgemlwX0hBU0hfTUFTSztcbiAgICB6aXBfaGFzaF9oZWFkID0gemlwX2hlYWQxKHppcF9pbnNfaCk7XG4gICAgemlwX3ByZXZbemlwX3N0cnN0YXJ0ICYgemlwX1dNQVNLXSA9IHppcF9oYXNoX2hlYWQ7XG4gICAgemlwX2hlYWQyKHppcF9pbnNfaCwgemlwX3N0cnN0YXJ0KTtcbn1cblxuLyogU2VuZCBhIGNvZGUgb2YgdGhlIGdpdmVuIHRyZWUuIGMgYW5kIHRyZWUgbXVzdCBub3QgaGF2ZSBzaWRlIGVmZmVjdHMgKi9cbnZhciB6aXBfU0VORF9DT0RFID0gZnVuY3Rpb24oYywgdHJlZSkge1xuICAgIHppcF9zZW5kX2JpdHModHJlZVtjXS5mYywgdHJlZVtjXS5kbCk7XG59XG5cbi8qIE1hcHBpbmcgZnJvbSBhIGRpc3RhbmNlIHRvIGEgZGlzdGFuY2UgY29kZS4gZGlzdCBpcyB0aGUgZGlzdGFuY2UgLSAxIGFuZFxuICogbXVzdCBub3QgaGF2ZSBzaWRlIGVmZmVjdHMuIGRpc3RfY29kZVsyNTZdIGFuZCBkaXN0X2NvZGVbMjU3XSBhcmUgbmV2ZXJcbiAqIHVzZWQuXG4gKi9cbnZhciB6aXBfRF9DT0RFID0gZnVuY3Rpb24oZGlzdCkge1xuICAgIHJldHVybiAoZGlzdCA8IDI1NiA/IHppcF9kaXN0X2NvZGVbZGlzdF1cblx0ICAgIDogemlwX2Rpc3RfY29kZVsyNTYgKyAoZGlzdD4+NyldKSAmIDB4ZmY7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBDb21wYXJlcyB0byBzdWJ0cmVlcywgdXNpbmcgdGhlIHRyZWUgZGVwdGggYXMgdGllIGJyZWFrZXIgd2hlblxuICogdGhlIHN1YnRyZWVzIGhhdmUgZXF1YWwgZnJlcXVlbmN5LiBUaGlzIG1pbmltaXplcyB0aGUgd29yc3QgY2FzZSBsZW5ndGguXG4gKi9cbnZhciB6aXBfU01BTExFUiA9IGZ1bmN0aW9uKHRyZWUsIG4sIG0pIHtcbiAgICByZXR1cm4gdHJlZVtuXS5mYyA8IHRyZWVbbV0uZmMgfHxcbiAgICAgICh0cmVlW25dLmZjID09IHRyZWVbbV0uZmMgJiYgemlwX2RlcHRoW25dIDw9IHppcF9kZXB0aFttXSk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiByZWFkIHN0cmluZyBkYXRhXG4gKi9cbnZhciB6aXBfcmVhZF9idWZmID0gZnVuY3Rpb24oYnVmZiwgb2Zmc2V0LCBuKSB7XG4gICAgdmFyIGk7XG4gICAgZm9yKGkgPSAwOyBpIDwgbiAmJiB6aXBfZGVmbGF0ZV9wb3MgPCB6aXBfZGVmbGF0ZV9kYXRhLmxlbmd0aDsgaSsrKVxuXHRidWZmW29mZnNldCArIGldID1cblx0ICAgIHppcF9kZWZsYXRlX2RhdGEuY2hhckNvZGVBdCh6aXBfZGVmbGF0ZV9wb3MrKykgJiAweGZmO1xuICAgIHJldHVybiBpO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogSW5pdGlhbGl6ZSB0aGUgXCJsb25nZXN0IG1hdGNoXCIgcm91dGluZXMgZm9yIGEgbmV3IGZpbGVcbiAqL1xudmFyIHppcF9sbV9pbml0ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGo7XG5cbiAgICAvKiBJbml0aWFsaXplIHRoZSBoYXNoIHRhYmxlLiAqL1xuICAgIGZvcihqID0gMDsgaiA8IHppcF9IQVNIX1NJWkU7IGorKylcbi8vXHR6aXBfaGVhZDIoaiwgemlwX05JTCk7XG5cdHppcF9wcmV2W3ppcF9XU0laRSArIGpdID0gMDtcbiAgICAvKiBwcmV2IHdpbGwgYmUgaW5pdGlhbGl6ZWQgb24gdGhlIGZseSAqL1xuXG4gICAgLyogU2V0IHRoZSBkZWZhdWx0IGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVyczpcbiAgICAgKi9cbiAgICB6aXBfbWF4X2xhenlfbWF0Y2ggPSB6aXBfY29uZmlndXJhdGlvbl90YWJsZVt6aXBfY29tcHJfbGV2ZWxdLm1heF9sYXp5O1xuICAgIHppcF9nb29kX21hdGNoICAgICA9IHppcF9jb25maWd1cmF0aW9uX3RhYmxlW3ppcF9jb21wcl9sZXZlbF0uZ29vZF9sZW5ndGg7XG4gICAgaWYoIXppcF9GVUxMX1NFQVJDSClcblx0emlwX25pY2VfbWF0Y2ggPSB6aXBfY29uZmlndXJhdGlvbl90YWJsZVt6aXBfY29tcHJfbGV2ZWxdLm5pY2VfbGVuZ3RoO1xuICAgIHppcF9tYXhfY2hhaW5fbGVuZ3RoID0gemlwX2NvbmZpZ3VyYXRpb25fdGFibGVbemlwX2NvbXByX2xldmVsXS5tYXhfY2hhaW47XG5cbiAgICB6aXBfc3Ryc3RhcnQgPSAwO1xuICAgIHppcF9ibG9ja19zdGFydCA9IDA7XG5cbiAgICB6aXBfbG9va2FoZWFkID0gemlwX3JlYWRfYnVmZih6aXBfd2luZG93LCAwLCAyICogemlwX1dTSVpFKTtcbiAgICBpZih6aXBfbG9va2FoZWFkIDw9IDApIHtcblx0emlwX2VvZmlsZSA9IHRydWU7XG5cdHppcF9sb29rYWhlYWQgPSAwO1xuXHRyZXR1cm47XG4gICAgfVxuICAgIHppcF9lb2ZpbGUgPSBmYWxzZTtcbiAgICAvKiBNYWtlIHN1cmUgdGhhdCB3ZSBhbHdheXMgaGF2ZSBlbm91Z2ggbG9va2FoZWFkLiBUaGlzIGlzIGltcG9ydGFudFxuICAgICAqIGlmIGlucHV0IGNvbWVzIGZyb20gYSBkZXZpY2Ugc3VjaCBhcyBhIHR0eS5cbiAgICAgKi9cbiAgICB3aGlsZSh6aXBfbG9va2FoZWFkIDwgemlwX01JTl9MT09LQUhFQUQgJiYgIXppcF9lb2ZpbGUpXG5cdHppcF9maWxsX3dpbmRvdygpO1xuXG4gICAgLyogSWYgbG9va2FoZWFkIDwgTUlOX01BVENILCBpbnNfaCBpcyBnYXJiYWdlLCBidXQgdGhpcyBpc1xuICAgICAqIG5vdCBpbXBvcnRhbnQgc2luY2Ugb25seSBsaXRlcmFsIGJ5dGVzIHdpbGwgYmUgZW1pdHRlZC5cbiAgICAgKi9cbiAgICB6aXBfaW5zX2ggPSAwO1xuICAgIGZvcihqID0gMDsgaiA8IHppcF9NSU5fTUFUQ0ggLSAxOyBqKyspIHtcbi8vICAgICAgVVBEQVRFX0hBU0goaW5zX2gsIHdpbmRvd1tqXSk7XG5cdHppcF9pbnNfaCA9ICgoemlwX2luc19oIDw8IHppcF9IX1NISUZUKSBeICh6aXBfd2luZG93W2pdICYgMHhmZikpICYgemlwX0hBU0hfTUFTSztcbiAgICB9XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBTZXQgbWF0Y2hfc3RhcnQgdG8gdGhlIGxvbmdlc3QgbWF0Y2ggc3RhcnRpbmcgYXQgdGhlIGdpdmVuIHN0cmluZyBhbmRcbiAqIHJldHVybiBpdHMgbGVuZ3RoLiBNYXRjaGVzIHNob3J0ZXIgb3IgZXF1YWwgdG8gcHJldl9sZW5ndGggYXJlIGRpc2NhcmRlZCxcbiAqIGluIHdoaWNoIGNhc2UgdGhlIHJlc3VsdCBpcyBlcXVhbCB0byBwcmV2X2xlbmd0aCBhbmQgbWF0Y2hfc3RhcnQgaXNcbiAqIGdhcmJhZ2UuXG4gKiBJTiBhc3NlcnRpb25zOiBjdXJfbWF0Y2ggaXMgdGhlIGhlYWQgb2YgdGhlIGhhc2ggY2hhaW4gZm9yIHRoZSBjdXJyZW50XG4gKiAgIHN0cmluZyAoc3Ryc3RhcnQpIGFuZCBpdHMgZGlzdGFuY2UgaXMgPD0gTUFYX0RJU1QsIGFuZCBwcmV2X2xlbmd0aCA+PSAxXG4gKi9cbnZhciB6aXBfbG9uZ2VzdF9tYXRjaCA9IGZ1bmN0aW9uKGN1cl9tYXRjaCkge1xuICAgIHZhciBjaGFpbl9sZW5ndGggPSB6aXBfbWF4X2NoYWluX2xlbmd0aDsgLy8gbWF4IGhhc2ggY2hhaW4gbGVuZ3RoXG4gICAgdmFyIHNjYW5wID0gemlwX3N0cnN0YXJ0OyAvLyBjdXJyZW50IHN0cmluZ1xuICAgIHZhciBtYXRjaHA7XHRcdC8vIG1hdGNoZWQgc3RyaW5nXG4gICAgdmFyIGxlbjtcdFx0Ly8gbGVuZ3RoIG9mIGN1cnJlbnQgbWF0Y2hcbiAgICB2YXIgYmVzdF9sZW4gPSB6aXBfcHJldl9sZW5ndGg7XHQvLyBiZXN0IG1hdGNoIGxlbmd0aCBzbyBmYXJcblxuICAgIC8qIFN0b3Agd2hlbiBjdXJfbWF0Y2ggYmVjb21lcyA8PSBsaW1pdC4gVG8gc2ltcGxpZnkgdGhlIGNvZGUsXG4gICAgICogd2UgcHJldmVudCBtYXRjaGVzIHdpdGggdGhlIHN0cmluZyBvZiB3aW5kb3cgaW5kZXggMC5cbiAgICAgKi9cbiAgICB2YXIgbGltaXQgPSAoemlwX3N0cnN0YXJ0ID4gemlwX01BWF9ESVNUID8gemlwX3N0cnN0YXJ0IC0gemlwX01BWF9ESVNUIDogemlwX05JTCk7XG5cbiAgICB2YXIgc3RyZW5kcCA9IHppcF9zdHJzdGFydCArIHppcF9NQVhfTUFUQ0g7XG4gICAgdmFyIHNjYW5fZW5kMSA9IHppcF93aW5kb3dbc2NhbnAgKyBiZXN0X2xlbiAtIDFdO1xuICAgIHZhciBzY2FuX2VuZCAgPSB6aXBfd2luZG93W3NjYW5wICsgYmVzdF9sZW5dO1xuXG4gICAgLyogRG8gbm90IHdhc3RlIHRvbyBtdWNoIHRpbWUgaWYgd2UgYWxyZWFkeSBoYXZlIGEgZ29vZCBtYXRjaDogKi9cbiAgICBpZih6aXBfcHJldl9sZW5ndGggPj0gemlwX2dvb2RfbWF0Y2gpXG5cdGNoYWluX2xlbmd0aCA+Pj0gMjtcblxuLy8gIEFzc2VydChlbmNvZGVyLT5zdHJzdGFydCA8PSB3aW5kb3dfc2l6ZS1NSU5fTE9PS0FIRUFELCBcImluc3VmZmljaWVudCBsb29rYWhlYWRcIik7XG5cbiAgICBkbyB7XG4vLyAgICBBc3NlcnQoY3VyX21hdGNoIDwgZW5jb2Rlci0+c3Ryc3RhcnQsIFwibm8gZnV0dXJlXCIpO1xuXHRtYXRjaHAgPSBjdXJfbWF0Y2g7XG5cblx0LyogU2tpcCB0byBuZXh0IG1hdGNoIGlmIHRoZSBtYXRjaCBsZW5ndGggY2Fubm90IGluY3JlYXNlXG5cdCAgICAqIG9yIGlmIHRoZSBtYXRjaCBsZW5ndGggaXMgbGVzcyB0aGFuIDI6XG5cdCovXG5cdGlmKHppcF93aW5kb3dbbWF0Y2hwICsgYmVzdF9sZW5dXHQhPSBzY2FuX2VuZCAgfHxcblx0ICAgemlwX3dpbmRvd1ttYXRjaHAgKyBiZXN0X2xlbiAtIDFdXHQhPSBzY2FuX2VuZDEgfHxcblx0ICAgemlwX3dpbmRvd1ttYXRjaHBdXHRcdFx0IT0gemlwX3dpbmRvd1tzY2FucF0gfHxcblx0ICAgemlwX3dpbmRvd1srK21hdGNocF1cdFx0XHQhPSB6aXBfd2luZG93W3NjYW5wICsgMV0pIHtcblx0ICAgIGNvbnRpbnVlO1xuXHR9XG5cblx0LyogVGhlIGNoZWNrIGF0IGJlc3RfbGVuLTEgY2FuIGJlIHJlbW92ZWQgYmVjYXVzZSBpdCB3aWxsIGJlIG1hZGVcbiAgICAgICAgICogYWdhaW4gbGF0ZXIuIChUaGlzIGhldXJpc3RpYyBpcyBub3QgYWx3YXlzIGEgd2luLilcbiAgICAgICAgICogSXQgaXMgbm90IG5lY2Vzc2FyeSB0byBjb21wYXJlIHNjYW5bMl0gYW5kIG1hdGNoWzJdIHNpbmNlIHRoZXlcbiAgICAgICAgICogYXJlIGFsd2F5cyBlcXVhbCB3aGVuIHRoZSBvdGhlciBieXRlcyBtYXRjaCwgZ2l2ZW4gdGhhdFxuICAgICAgICAgKiB0aGUgaGFzaCBrZXlzIGFyZSBlcXVhbCBhbmQgdGhhdCBIQVNIX0JJVFMgPj0gOC5cbiAgICAgICAgICovXG5cdHNjYW5wICs9IDI7XG5cdG1hdGNocCsrO1xuXG5cdC8qIFdlIGNoZWNrIGZvciBpbnN1ZmZpY2llbnQgbG9va2FoZWFkIG9ubHkgZXZlcnkgOHRoIGNvbXBhcmlzb247XG4gICAgICAgICAqIHRoZSAyNTZ0aCBjaGVjayB3aWxsIGJlIG1hZGUgYXQgc3Ryc3RhcnQrMjU4LlxuICAgICAgICAgKi9cblx0ZG8ge1xuXHR9IHdoaWxlKHppcF93aW5kb3dbKytzY2FucF0gPT0gemlwX3dpbmRvd1srK21hdGNocF0gJiZcblx0XHR6aXBfd2luZG93Wysrc2NhbnBdID09IHppcF93aW5kb3dbKyttYXRjaHBdICYmXG5cdFx0emlwX3dpbmRvd1srK3NjYW5wXSA9PSB6aXBfd2luZG93WysrbWF0Y2hwXSAmJlxuXHRcdHppcF93aW5kb3dbKytzY2FucF0gPT0gemlwX3dpbmRvd1srK21hdGNocF0gJiZcblx0XHR6aXBfd2luZG93Wysrc2NhbnBdID09IHppcF93aW5kb3dbKyttYXRjaHBdICYmXG5cdFx0emlwX3dpbmRvd1srK3NjYW5wXSA9PSB6aXBfd2luZG93WysrbWF0Y2hwXSAmJlxuXHRcdHppcF93aW5kb3dbKytzY2FucF0gPT0gemlwX3dpbmRvd1srK21hdGNocF0gJiZcblx0XHR6aXBfd2luZG93Wysrc2NhbnBdID09IHppcF93aW5kb3dbKyttYXRjaHBdICYmXG5cdFx0c2NhbnAgPCBzdHJlbmRwKTtcblxuICAgICAgbGVuID0gemlwX01BWF9NQVRDSCAtIChzdHJlbmRwIC0gc2NhbnApO1xuICAgICAgc2NhbnAgPSBzdHJlbmRwIC0gemlwX01BWF9NQVRDSDtcblxuICAgICAgaWYobGVuID4gYmVzdF9sZW4pIHtcblx0ICB6aXBfbWF0Y2hfc3RhcnQgPSBjdXJfbWF0Y2g7XG5cdCAgYmVzdF9sZW4gPSBsZW47XG5cdCAgaWYoemlwX0ZVTExfU0VBUkNIKSB7XG5cdCAgICAgIGlmKGxlbiA+PSB6aXBfTUFYX01BVENIKSBicmVhaztcblx0ICB9IGVsc2Uge1xuXHQgICAgICBpZihsZW4gPj0gemlwX25pY2VfbWF0Y2gpIGJyZWFrO1xuXHQgIH1cblxuXHQgIHNjYW5fZW5kMSAgPSB6aXBfd2luZG93W3NjYW5wICsgYmVzdF9sZW4tMV07XG5cdCAgc2Nhbl9lbmQgICA9IHppcF93aW5kb3dbc2NhbnAgKyBiZXN0X2xlbl07XG4gICAgICB9XG4gICAgfSB3aGlsZSgoY3VyX21hdGNoID0gemlwX3ByZXZbY3VyX21hdGNoICYgemlwX1dNQVNLXSkgPiBsaW1pdFxuXHQgICAgJiYgLS1jaGFpbl9sZW5ndGggIT0gMCk7XG5cbiAgICByZXR1cm4gYmVzdF9sZW47XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBGaWxsIHRoZSB3aW5kb3cgd2hlbiB0aGUgbG9va2FoZWFkIGJlY29tZXMgaW5zdWZmaWNpZW50LlxuICogVXBkYXRlcyBzdHJzdGFydCBhbmQgbG9va2FoZWFkLCBhbmQgc2V0cyBlb2ZpbGUgaWYgZW5kIG9mIGlucHV0IGZpbGUuXG4gKiBJTiBhc3NlcnRpb246IGxvb2thaGVhZCA8IE1JTl9MT09LQUhFQUQgJiYgc3Ryc3RhcnQgKyBsb29rYWhlYWQgPiAwXG4gKiBPVVQgYXNzZXJ0aW9uczogYXQgbGVhc3Qgb25lIGJ5dGUgaGFzIGJlZW4gcmVhZCwgb3IgZW9maWxlIGlzIHNldDtcbiAqICAgIGZpbGUgcmVhZHMgYXJlIHBlcmZvcm1lZCBmb3IgYXQgbGVhc3QgdHdvIGJ5dGVzIChyZXF1aXJlZCBmb3IgdGhlXG4gKiAgICB0cmFuc2xhdGVfZW9sIG9wdGlvbikuXG4gKi9cbnZhciB6aXBfZmlsbF93aW5kb3cgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgbiwgbTtcblxuICAgIC8vIEFtb3VudCBvZiBmcmVlIHNwYWNlIGF0IHRoZSBlbmQgb2YgdGhlIHdpbmRvdy5cbiAgICB2YXIgbW9yZSA9IHppcF93aW5kb3dfc2l6ZSAtIHppcF9sb29rYWhlYWQgLSB6aXBfc3Ryc3RhcnQ7XG5cbiAgICAvKiBJZiB0aGUgd2luZG93IGlzIGFsbW9zdCBmdWxsIGFuZCB0aGVyZSBpcyBpbnN1ZmZpY2llbnQgbG9va2FoZWFkLFxuICAgICAqIG1vdmUgdGhlIHVwcGVyIGhhbGYgdG8gdGhlIGxvd2VyIG9uZSB0byBtYWtlIHJvb20gaW4gdGhlIHVwcGVyIGhhbGYuXG4gICAgICovXG4gICAgaWYobW9yZSA9PSAtMSkge1xuXHQvKiBWZXJ5IHVubGlrZWx5LCBidXQgcG9zc2libGUgb24gMTYgYml0IG1hY2hpbmUgaWYgc3Ryc3RhcnQgPT0gMFxuICAgICAgICAgKiBhbmQgbG9va2FoZWFkID09IDEgKGlucHV0IGRvbmUgb25lIGJ5dGUgYXQgdGltZSlcbiAgICAgICAgICovXG5cdG1vcmUtLTtcbiAgICB9IGVsc2UgaWYoemlwX3N0cnN0YXJ0ID49IHppcF9XU0laRSArIHppcF9NQVhfRElTVCkge1xuXHQvKiBCeSB0aGUgSU4gYXNzZXJ0aW9uLCB0aGUgd2luZG93IGlzIG5vdCBlbXB0eSBzbyB3ZSBjYW4ndCBjb25mdXNlXG4gICAgICAgICAqIG1vcmUgPT0gMCB3aXRoIG1vcmUgPT0gNjRLIG9uIGEgMTYgYml0IG1hY2hpbmUuXG4gICAgICAgICAqL1xuLy9cdEFzc2VydCh3aW5kb3dfc2l6ZSA9PSAodWxnKTIqV1NJWkUsIFwibm8gc2xpZGluZyB3aXRoIEJJR19NRU1cIik7XG5cbi8vXHRTeXN0ZW0uYXJyYXljb3B5KHdpbmRvdywgV1NJWkUsIHdpbmRvdywgMCwgV1NJWkUpO1xuXHRmb3IobiA9IDA7IG4gPCB6aXBfV1NJWkU7IG4rKylcblx0ICAgIHppcF93aW5kb3dbbl0gPSB6aXBfd2luZG93W24gKyB6aXBfV1NJWkVdO1xuICAgICAgXG5cdHppcF9tYXRjaF9zdGFydCAtPSB6aXBfV1NJWkU7XG5cdHppcF9zdHJzdGFydCAgICAtPSB6aXBfV1NJWkU7IC8qIHdlIG5vdyBoYXZlIHN0cnN0YXJ0ID49IE1BWF9ESVNUOiAqL1xuXHR6aXBfYmxvY2tfc3RhcnQgLT0gemlwX1dTSVpFO1xuXG5cdGZvcihuID0gMDsgbiA8IHppcF9IQVNIX1NJWkU7IG4rKykge1xuXHQgICAgbSA9IHppcF9oZWFkMShuKTtcblx0ICAgIHppcF9oZWFkMihuLCBtID49IHppcF9XU0laRSA/IG0gLSB6aXBfV1NJWkUgOiB6aXBfTklMKTtcblx0fVxuXHRmb3IobiA9IDA7IG4gPCB6aXBfV1NJWkU7IG4rKykge1xuXHQgICAgLyogSWYgbiBpcyBub3Qgb24gYW55IGhhc2ggY2hhaW4sIHByZXZbbl0gaXMgZ2FyYmFnZSBidXRcblx0ICAgICAqIGl0cyB2YWx1ZSB3aWxsIG5ldmVyIGJlIHVzZWQuXG5cdCAgICAgKi9cblx0ICAgIG0gPSB6aXBfcHJldltuXTtcblx0ICAgIHppcF9wcmV2W25dID0gKG0gPj0gemlwX1dTSVpFID8gbSAtIHppcF9XU0laRSA6IHppcF9OSUwpO1xuXHR9XG5cdG1vcmUgKz0gemlwX1dTSVpFO1xuICAgIH1cbiAgICAvLyBBdCB0aGlzIHBvaW50LCBtb3JlID49IDJcbiAgICBpZighemlwX2VvZmlsZSkge1xuXHRuID0gemlwX3JlYWRfYnVmZih6aXBfd2luZG93LCB6aXBfc3Ryc3RhcnQgKyB6aXBfbG9va2FoZWFkLCBtb3JlKTtcblx0aWYobiA8PSAwKVxuXHQgICAgemlwX2VvZmlsZSA9IHRydWU7XG5cdGVsc2Vcblx0ICAgIHppcF9sb29rYWhlYWQgKz0gbjtcbiAgICB9XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBQcm9jZXNzZXMgYSBuZXcgaW5wdXQgZmlsZSBhbmQgcmV0dXJuIGl0cyBjb21wcmVzc2VkIGxlbmd0aC4gVGhpc1xuICogZnVuY3Rpb24gZG9lcyBub3QgcGVyZm9ybSBsYXp5IGV2YWx1YXRpb25vZiBtYXRjaGVzIGFuZCBpbnNlcnRzXG4gKiBuZXcgc3RyaW5ncyBpbiB0aGUgZGljdGlvbmFyeSBvbmx5IGZvciB1bm1hdGNoZWQgc3RyaW5ncyBvciBmb3Igc2hvcnRcbiAqIG1hdGNoZXMuIEl0IGlzIHVzZWQgb25seSBmb3IgdGhlIGZhc3QgY29tcHJlc3Npb24gb3B0aW9ucy5cbiAqL1xudmFyIHppcF9kZWZsYXRlX2Zhc3QgPSBmdW5jdGlvbigpIHtcbiAgICB3aGlsZSh6aXBfbG9va2FoZWFkICE9IDAgJiYgemlwX3FoZWFkID09IG51bGwpIHtcblx0dmFyIGZsdXNoOyAvLyBzZXQgaWYgY3VycmVudCBibG9jayBtdXN0IGJlIGZsdXNoZWRcblxuXHQvKiBJbnNlcnQgdGhlIHN0cmluZyB3aW5kb3dbc3Ryc3RhcnQgLi4gc3Ryc3RhcnQrMl0gaW4gdGhlXG5cdCAqIGRpY3Rpb25hcnksIGFuZCBzZXQgaGFzaF9oZWFkIHRvIHRoZSBoZWFkIG9mIHRoZSBoYXNoIGNoYWluOlxuXHQgKi9cblx0emlwX0lOU0VSVF9TVFJJTkcoKTtcblxuXHQvKiBGaW5kIHRoZSBsb25nZXN0IG1hdGNoLCBkaXNjYXJkaW5nIHRob3NlIDw9IHByZXZfbGVuZ3RoLlxuXHQgKiBBdCB0aGlzIHBvaW50IHdlIGhhdmUgYWx3YXlzIG1hdGNoX2xlbmd0aCA8IE1JTl9NQVRDSFxuXHQgKi9cblx0aWYoemlwX2hhc2hfaGVhZCAhPSB6aXBfTklMICYmXG5cdCAgIHppcF9zdHJzdGFydCAtIHppcF9oYXNoX2hlYWQgPD0gemlwX01BWF9ESVNUKSB7XG5cdCAgICAvKiBUbyBzaW1wbGlmeSB0aGUgY29kZSwgd2UgcHJldmVudCBtYXRjaGVzIHdpdGggdGhlIHN0cmluZ1xuXHQgICAgICogb2Ygd2luZG93IGluZGV4IDAgKGluIHBhcnRpY3VsYXIgd2UgaGF2ZSB0byBhdm9pZCBhIG1hdGNoXG5cdCAgICAgKiBvZiB0aGUgc3RyaW5nIHdpdGggaXRzZWxmIGF0IHRoZSBzdGFydCBvZiB0aGUgaW5wdXQgZmlsZSkuXG5cdCAgICAgKi9cblx0ICAgIHppcF9tYXRjaF9sZW5ndGggPSB6aXBfbG9uZ2VzdF9tYXRjaCh6aXBfaGFzaF9oZWFkKTtcblx0ICAgIC8qIGxvbmdlc3RfbWF0Y2goKSBzZXRzIG1hdGNoX3N0YXJ0ICovXG5cdCAgICBpZih6aXBfbWF0Y2hfbGVuZ3RoID4gemlwX2xvb2thaGVhZClcblx0XHR6aXBfbWF0Y2hfbGVuZ3RoID0gemlwX2xvb2thaGVhZDtcblx0fVxuXHRpZih6aXBfbWF0Y2hfbGVuZ3RoID49IHppcF9NSU5fTUFUQ0gpIHtcbi8vXHQgICAgY2hlY2tfbWF0Y2goc3Ryc3RhcnQsIG1hdGNoX3N0YXJ0LCBtYXRjaF9sZW5ndGgpO1xuXG5cdCAgICBmbHVzaCA9IHppcF9jdF90YWxseSh6aXBfc3Ryc3RhcnQgLSB6aXBfbWF0Y2hfc3RhcnQsXG5cdFx0XHRcdCB6aXBfbWF0Y2hfbGVuZ3RoIC0gemlwX01JTl9NQVRDSCk7XG5cdCAgICB6aXBfbG9va2FoZWFkIC09IHppcF9tYXRjaF9sZW5ndGg7XG5cblx0ICAgIC8qIEluc2VydCBuZXcgc3RyaW5ncyBpbiB0aGUgaGFzaCB0YWJsZSBvbmx5IGlmIHRoZSBtYXRjaCBsZW5ndGhcblx0ICAgICAqIGlzIG5vdCB0b28gbGFyZ2UuIFRoaXMgc2F2ZXMgdGltZSBidXQgZGVncmFkZXMgY29tcHJlc3Npb24uXG5cdCAgICAgKi9cblx0ICAgIGlmKHppcF9tYXRjaF9sZW5ndGggPD0gemlwX21heF9sYXp5X21hdGNoKSB7XG5cdFx0emlwX21hdGNoX2xlbmd0aC0tOyAvLyBzdHJpbmcgYXQgc3Ryc3RhcnQgYWxyZWFkeSBpbiBoYXNoIHRhYmxlXG5cdFx0ZG8ge1xuXHRcdCAgICB6aXBfc3Ryc3RhcnQrKztcblx0XHQgICAgemlwX0lOU0VSVF9TVFJJTkcoKTtcblx0XHQgICAgLyogc3Ryc3RhcnQgbmV2ZXIgZXhjZWVkcyBXU0laRS1NQVhfTUFUQ0gsIHNvIHRoZXJlIGFyZVxuXHRcdCAgICAgKiBhbHdheXMgTUlOX01BVENIIGJ5dGVzIGFoZWFkLiBJZiBsb29rYWhlYWQgPCBNSU5fTUFUQ0hcblx0XHQgICAgICogdGhlc2UgYnl0ZXMgYXJlIGdhcmJhZ2UsIGJ1dCBpdCBkb2VzIG5vdCBtYXR0ZXIgc2luY2Vcblx0XHQgICAgICogdGhlIG5leHQgbG9va2FoZWFkIGJ5dGVzIHdpbGwgYmUgZW1pdHRlZCBhcyBsaXRlcmFscy5cblx0XHQgICAgICovXG5cdFx0fSB3aGlsZSgtLXppcF9tYXRjaF9sZW5ndGggIT0gMCk7XG5cdFx0emlwX3N0cnN0YXJ0Kys7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHppcF9zdHJzdGFydCArPSB6aXBfbWF0Y2hfbGVuZ3RoO1xuXHRcdHppcF9tYXRjaF9sZW5ndGggPSAwO1xuXHRcdHppcF9pbnNfaCA9IHppcF93aW5kb3dbemlwX3N0cnN0YXJ0XSAmIDB4ZmY7XG4vL1x0XHRVUERBVEVfSEFTSChpbnNfaCwgd2luZG93W3N0cnN0YXJ0ICsgMV0pO1xuXHRcdHppcF9pbnNfaCA9ICgoemlwX2luc19oPDx6aXBfSF9TSElGVCkgXiAoemlwX3dpbmRvd1t6aXBfc3Ryc3RhcnQgKyAxXSAmIDB4ZmYpKSAmIHppcF9IQVNIX01BU0s7XG5cbi8vI2lmIE1JTl9NQVRDSCAhPSAzXG4vL1x0XHRDYWxsIFVQREFURV9IQVNIKCkgTUlOX01BVENILTMgbW9yZSB0aW1lc1xuLy8jZW5kaWZcblxuXHQgICAgfVxuXHR9IGVsc2Uge1xuXHQgICAgLyogTm8gbWF0Y2gsIG91dHB1dCBhIGxpdGVyYWwgYnl0ZSAqL1xuXHQgICAgZmx1c2ggPSB6aXBfY3RfdGFsbHkoMCwgemlwX3dpbmRvd1t6aXBfc3Ryc3RhcnRdICYgMHhmZik7XG5cdCAgICB6aXBfbG9va2FoZWFkLS07XG5cdCAgICB6aXBfc3Ryc3RhcnQrKztcblx0fVxuXHRpZihmbHVzaCkge1xuXHQgICAgemlwX2ZsdXNoX2Jsb2NrKDApO1xuXHQgICAgemlwX2Jsb2NrX3N0YXJ0ID0gemlwX3N0cnN0YXJ0O1xuXHR9XG5cblx0LyogTWFrZSBzdXJlIHRoYXQgd2UgYWx3YXlzIGhhdmUgZW5vdWdoIGxvb2thaGVhZCwgZXhjZXB0XG5cdCAqIGF0IHRoZSBlbmQgb2YgdGhlIGlucHV0IGZpbGUuIFdlIG5lZWQgTUFYX01BVENIIGJ5dGVzXG5cdCAqIGZvciB0aGUgbmV4dCBtYXRjaCwgcGx1cyBNSU5fTUFUQ0ggYnl0ZXMgdG8gaW5zZXJ0IHRoZVxuXHQgKiBzdHJpbmcgZm9sbG93aW5nIHRoZSBuZXh0IG1hdGNoLlxuXHQgKi9cblx0d2hpbGUoemlwX2xvb2thaGVhZCA8IHppcF9NSU5fTE9PS0FIRUFEICYmICF6aXBfZW9maWxlKVxuXHQgICAgemlwX2ZpbGxfd2luZG93KCk7XG4gICAgfVxufVxuXG52YXIgemlwX2RlZmxhdGVfYmV0dGVyID0gZnVuY3Rpb24oKSB7XG4gICAgLyogUHJvY2VzcyB0aGUgaW5wdXQgYmxvY2suICovXG4gICAgd2hpbGUoemlwX2xvb2thaGVhZCAhPSAwICYmIHppcF9xaGVhZCA9PSBudWxsKSB7XG5cdC8qIEluc2VydCB0aGUgc3RyaW5nIHdpbmRvd1tzdHJzdGFydCAuLiBzdHJzdGFydCsyXSBpbiB0aGVcblx0ICogZGljdGlvbmFyeSwgYW5kIHNldCBoYXNoX2hlYWQgdG8gdGhlIGhlYWQgb2YgdGhlIGhhc2ggY2hhaW46XG5cdCAqL1xuXHR6aXBfSU5TRVJUX1NUUklORygpO1xuXG5cdC8qIEZpbmQgdGhlIGxvbmdlc3QgbWF0Y2gsIGRpc2NhcmRpbmcgdGhvc2UgPD0gcHJldl9sZW5ndGguXG5cdCAqL1xuXHR6aXBfcHJldl9sZW5ndGggPSB6aXBfbWF0Y2hfbGVuZ3RoO1xuXHR6aXBfcHJldl9tYXRjaCA9IHppcF9tYXRjaF9zdGFydDtcblx0emlwX21hdGNoX2xlbmd0aCA9IHppcF9NSU5fTUFUQ0ggLSAxO1xuXG5cdGlmKHppcF9oYXNoX2hlYWQgIT0gemlwX05JTCAmJlxuXHQgICB6aXBfcHJldl9sZW5ndGggPCB6aXBfbWF4X2xhenlfbWF0Y2ggJiZcblx0ICAgemlwX3N0cnN0YXJ0IC0gemlwX2hhc2hfaGVhZCA8PSB6aXBfTUFYX0RJU1QpIHtcblx0ICAgIC8qIFRvIHNpbXBsaWZ5IHRoZSBjb2RlLCB3ZSBwcmV2ZW50IG1hdGNoZXMgd2l0aCB0aGUgc3RyaW5nXG5cdCAgICAgKiBvZiB3aW5kb3cgaW5kZXggMCAoaW4gcGFydGljdWxhciB3ZSBoYXZlIHRvIGF2b2lkIGEgbWF0Y2hcblx0ICAgICAqIG9mIHRoZSBzdHJpbmcgd2l0aCBpdHNlbGYgYXQgdGhlIHN0YXJ0IG9mIHRoZSBpbnB1dCBmaWxlKS5cblx0ICAgICAqL1xuXHQgICAgemlwX21hdGNoX2xlbmd0aCA9IHppcF9sb25nZXN0X21hdGNoKHppcF9oYXNoX2hlYWQpO1xuXHQgICAgLyogbG9uZ2VzdF9tYXRjaCgpIHNldHMgbWF0Y2hfc3RhcnQgKi9cblx0ICAgIGlmKHppcF9tYXRjaF9sZW5ndGggPiB6aXBfbG9va2FoZWFkKVxuXHRcdHppcF9tYXRjaF9sZW5ndGggPSB6aXBfbG9va2FoZWFkO1xuXG5cdCAgICAvKiBJZ25vcmUgYSBsZW5ndGggMyBtYXRjaCBpZiBpdCBpcyB0b28gZGlzdGFudDogKi9cblx0ICAgIGlmKHppcF9tYXRjaF9sZW5ndGggPT0gemlwX01JTl9NQVRDSCAmJlxuXHQgICAgICAgemlwX3N0cnN0YXJ0IC0gemlwX21hdGNoX3N0YXJ0ID4gemlwX1RPT19GQVIpIHtcblx0XHQvKiBJZiBwcmV2X21hdGNoIGlzIGFsc28gTUlOX01BVENILCBtYXRjaF9zdGFydCBpcyBnYXJiYWdlXG5cdFx0ICogYnV0IHdlIHdpbGwgaWdub3JlIHRoZSBjdXJyZW50IG1hdGNoIGFueXdheS5cblx0XHQgKi9cblx0XHR6aXBfbWF0Y2hfbGVuZ3RoLS07XG5cdCAgICB9XG5cdH1cblx0LyogSWYgdGhlcmUgd2FzIGEgbWF0Y2ggYXQgdGhlIHByZXZpb3VzIHN0ZXAgYW5kIHRoZSBjdXJyZW50XG5cdCAqIG1hdGNoIGlzIG5vdCBiZXR0ZXIsIG91dHB1dCB0aGUgcHJldmlvdXMgbWF0Y2g6XG5cdCAqL1xuXHRpZih6aXBfcHJldl9sZW5ndGggPj0gemlwX01JTl9NQVRDSCAmJlxuXHQgICB6aXBfbWF0Y2hfbGVuZ3RoIDw9IHppcF9wcmV2X2xlbmd0aCkge1xuXHQgICAgdmFyIGZsdXNoOyAvLyBzZXQgaWYgY3VycmVudCBibG9jayBtdXN0IGJlIGZsdXNoZWRcblxuLy9cdCAgICBjaGVja19tYXRjaChzdHJzdGFydCAtIDEsIHByZXZfbWF0Y2gsIHByZXZfbGVuZ3RoKTtcblx0ICAgIGZsdXNoID0gemlwX2N0X3RhbGx5KHppcF9zdHJzdGFydCAtIDEgLSB6aXBfcHJldl9tYXRjaCxcblx0XHRcdFx0IHppcF9wcmV2X2xlbmd0aCAtIHppcF9NSU5fTUFUQ0gpO1xuXG5cdCAgICAvKiBJbnNlcnQgaW4gaGFzaCB0YWJsZSBhbGwgc3RyaW5ncyB1cCB0byB0aGUgZW5kIG9mIHRoZSBtYXRjaC5cblx0ICAgICAqIHN0cnN0YXJ0LTEgYW5kIHN0cnN0YXJ0IGFyZSBhbHJlYWR5IGluc2VydGVkLlxuXHQgICAgICovXG5cdCAgICB6aXBfbG9va2FoZWFkIC09IHppcF9wcmV2X2xlbmd0aCAtIDE7XG5cdCAgICB6aXBfcHJldl9sZW5ndGggLT0gMjtcblx0ICAgIGRvIHtcblx0XHR6aXBfc3Ryc3RhcnQrKztcblx0XHR6aXBfSU5TRVJUX1NUUklORygpO1xuXHRcdC8qIHN0cnN0YXJ0IG5ldmVyIGV4Y2VlZHMgV1NJWkUtTUFYX01BVENILCBzbyB0aGVyZSBhcmVcblx0XHQgKiBhbHdheXMgTUlOX01BVENIIGJ5dGVzIGFoZWFkLiBJZiBsb29rYWhlYWQgPCBNSU5fTUFUQ0hcblx0XHQgKiB0aGVzZSBieXRlcyBhcmUgZ2FyYmFnZSwgYnV0IGl0IGRvZXMgbm90IG1hdHRlciBzaW5jZSB0aGVcblx0XHQgKiBuZXh0IGxvb2thaGVhZCBieXRlcyB3aWxsIGFsd2F5cyBiZSBlbWl0dGVkIGFzIGxpdGVyYWxzLlxuXHRcdCAqL1xuXHQgICAgfSB3aGlsZSgtLXppcF9wcmV2X2xlbmd0aCAhPSAwKTtcblx0ICAgIHppcF9tYXRjaF9hdmFpbGFibGUgPSAwO1xuXHQgICAgemlwX21hdGNoX2xlbmd0aCA9IHppcF9NSU5fTUFUQ0ggLSAxO1xuXHQgICAgemlwX3N0cnN0YXJ0Kys7XG5cdCAgICBpZihmbHVzaCkge1xuXHRcdHppcF9mbHVzaF9ibG9jaygwKTtcblx0XHR6aXBfYmxvY2tfc3RhcnQgPSB6aXBfc3Ryc3RhcnQ7XG5cdCAgICB9XG5cdH0gZWxzZSBpZih6aXBfbWF0Y2hfYXZhaWxhYmxlICE9IDApIHtcblx0ICAgIC8qIElmIHRoZXJlIHdhcyBubyBtYXRjaCBhdCB0aGUgcHJldmlvdXMgcG9zaXRpb24sIG91dHB1dCBhXG5cdCAgICAgKiBzaW5nbGUgbGl0ZXJhbC4gSWYgdGhlcmUgd2FzIGEgbWF0Y2ggYnV0IHRoZSBjdXJyZW50IG1hdGNoXG5cdCAgICAgKiBpcyBsb25nZXIsIHRydW5jYXRlIHRoZSBwcmV2aW91cyBtYXRjaCB0byBhIHNpbmdsZSBsaXRlcmFsLlxuXHQgICAgICovXG5cdCAgICBpZih6aXBfY3RfdGFsbHkoMCwgemlwX3dpbmRvd1t6aXBfc3Ryc3RhcnQgLSAxXSAmIDB4ZmYpKSB7XG5cdFx0emlwX2ZsdXNoX2Jsb2NrKDApO1xuXHRcdHppcF9ibG9ja19zdGFydCA9IHppcF9zdHJzdGFydDtcblx0ICAgIH1cblx0ICAgIHppcF9zdHJzdGFydCsrO1xuXHQgICAgemlwX2xvb2thaGVhZC0tO1xuXHR9IGVsc2Uge1xuXHQgICAgLyogVGhlcmUgaXMgbm8gcHJldmlvdXMgbWF0Y2ggdG8gY29tcGFyZSB3aXRoLCB3YWl0IGZvclxuXHQgICAgICogdGhlIG5leHQgc3RlcCB0byBkZWNpZGUuXG5cdCAgICAgKi9cblx0ICAgIHppcF9tYXRjaF9hdmFpbGFibGUgPSAxO1xuXHQgICAgemlwX3N0cnN0YXJ0Kys7XG5cdCAgICB6aXBfbG9va2FoZWFkLS07XG5cdH1cblxuXHQvKiBNYWtlIHN1cmUgdGhhdCB3ZSBhbHdheXMgaGF2ZSBlbm91Z2ggbG9va2FoZWFkLCBleGNlcHRcblx0ICogYXQgdGhlIGVuZCBvZiB0aGUgaW5wdXQgZmlsZS4gV2UgbmVlZCBNQVhfTUFUQ0ggYnl0ZXNcblx0ICogZm9yIHRoZSBuZXh0IG1hdGNoLCBwbHVzIE1JTl9NQVRDSCBieXRlcyB0byBpbnNlcnQgdGhlXG5cdCAqIHN0cmluZyBmb2xsb3dpbmcgdGhlIG5leHQgbWF0Y2guXG5cdCAqL1xuXHR3aGlsZSh6aXBfbG9va2FoZWFkIDwgemlwX01JTl9MT09LQUhFQUQgJiYgIXppcF9lb2ZpbGUpXG5cdCAgICB6aXBfZmlsbF93aW5kb3coKTtcbiAgICB9XG59XG5cbnZhciB6aXBfaW5pdF9kZWZsYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgaWYoemlwX2VvZmlsZSlcblx0cmV0dXJuO1xuICAgIHppcF9iaV9idWYgPSAwO1xuICAgIHppcF9iaV92YWxpZCA9IDA7XG4gICAgemlwX2N0X2luaXQoKTtcbiAgICB6aXBfbG1faW5pdCgpO1xuXG4gICAgemlwX3FoZWFkID0gbnVsbDtcbiAgICB6aXBfb3V0Y250ID0gMDtcbiAgICB6aXBfb3V0b2ZmID0gMDtcbiAgICB6aXBfbWF0Y2hfYXZhaWxhYmxlID0gMDtcblxuICAgIGlmKHppcF9jb21wcl9sZXZlbCA8PSAzKVxuICAgIHtcblx0emlwX3ByZXZfbGVuZ3RoID0gemlwX01JTl9NQVRDSCAtIDE7XG5cdHppcF9tYXRjaF9sZW5ndGggPSAwO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuXHR6aXBfbWF0Y2hfbGVuZ3RoID0gemlwX01JTl9NQVRDSCAtIDE7XG5cdHppcF9tYXRjaF9hdmFpbGFibGUgPSAwO1xuICAgICAgICB6aXBfbWF0Y2hfYXZhaWxhYmxlID0gMDtcbiAgICB9XG5cbiAgICB6aXBfY29tcGxldGUgPSBmYWxzZTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFNhbWUgYXMgYWJvdmUsIGJ1dCBhY2hpZXZlcyBiZXR0ZXIgY29tcHJlc3Npb24uIFdlIHVzZSBhIGxhenlcbiAqIGV2YWx1YXRpb24gZm9yIG1hdGNoZXM6IGEgbWF0Y2ggaXMgZmluYWxseSBhZG9wdGVkIG9ubHkgaWYgdGhlcmUgaXNcbiAqIG5vIGJldHRlciBtYXRjaCBhdCB0aGUgbmV4dCB3aW5kb3cgcG9zaXRpb24uXG4gKi9cbnZhciB6aXBfZGVmbGF0ZV9pbnRlcm5hbCA9IGZ1bmN0aW9uKGJ1ZmYsIG9mZiwgYnVmZl9zaXplKSB7XG4gICAgdmFyIG47XG5cbiAgICBpZighemlwX2luaXRmbGFnKVxuICAgIHtcblx0emlwX2luaXRfZGVmbGF0ZSgpO1xuXHR6aXBfaW5pdGZsYWcgPSB0cnVlO1xuXHRpZih6aXBfbG9va2FoZWFkID09IDApIHsgLy8gZW1wdHlcblx0ICAgIHppcF9jb21wbGV0ZSA9IHRydWU7XG5cdCAgICByZXR1cm4gMDtcblx0fVxuICAgIH1cblxuICAgIGlmKChuID0gemlwX3Fjb3B5KGJ1ZmYsIG9mZiwgYnVmZl9zaXplKSkgPT0gYnVmZl9zaXplKVxuXHRyZXR1cm4gYnVmZl9zaXplO1xuXG4gICAgaWYoemlwX2NvbXBsZXRlKVxuXHRyZXR1cm4gbjtcblxuICAgIGlmKHppcF9jb21wcl9sZXZlbCA8PSAzKSAvLyBvcHRpbWl6ZWQgZm9yIHNwZWVkXG5cdHppcF9kZWZsYXRlX2Zhc3QoKTtcbiAgICBlbHNlXG5cdHppcF9kZWZsYXRlX2JldHRlcigpO1xuICAgIGlmKHppcF9sb29rYWhlYWQgPT0gMCkge1xuXHRpZih6aXBfbWF0Y2hfYXZhaWxhYmxlICE9IDApXG5cdCAgICB6aXBfY3RfdGFsbHkoMCwgemlwX3dpbmRvd1t6aXBfc3Ryc3RhcnQgLSAxXSAmIDB4ZmYpO1xuXHR6aXBfZmx1c2hfYmxvY2soMSk7XG5cdHppcF9jb21wbGV0ZSA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBuICsgemlwX3Fjb3B5KGJ1ZmYsIG4gKyBvZmYsIGJ1ZmZfc2l6ZSAtIG4pO1xufVxuXG52YXIgemlwX3Fjb3B5ID0gZnVuY3Rpb24oYnVmZiwgb2ZmLCBidWZmX3NpemUpIHtcbiAgICB2YXIgbiwgaSwgajtcblxuICAgIG4gPSAwO1xuICAgIHdoaWxlKHppcF9xaGVhZCAhPSBudWxsICYmIG4gPCBidWZmX3NpemUpXG4gICAge1xuXHRpID0gYnVmZl9zaXplIC0gbjtcblx0aWYoaSA+IHppcF9xaGVhZC5sZW4pXG5cdCAgICBpID0gemlwX3FoZWFkLmxlbjtcbi8vICAgICAgU3lzdGVtLmFycmF5Y29weShxaGVhZC5wdHIsIHFoZWFkLm9mZiwgYnVmZiwgb2ZmICsgbiwgaSk7XG5cdGZvcihqID0gMDsgaiA8IGk7IGorKylcblx0ICAgIGJ1ZmZbb2ZmICsgbiArIGpdID0gemlwX3FoZWFkLnB0clt6aXBfcWhlYWQub2ZmICsgal07XG5cdFxuXHR6aXBfcWhlYWQub2ZmICs9IGk7XG5cdHppcF9xaGVhZC5sZW4gLT0gaTtcblx0biArPSBpO1xuXHRpZih6aXBfcWhlYWQubGVuID09IDApIHtcblx0ICAgIHZhciBwO1xuXHQgICAgcCA9IHppcF9xaGVhZDtcblx0ICAgIHppcF9xaGVhZCA9IHppcF9xaGVhZC5uZXh0O1xuXHQgICAgemlwX3JldXNlX3F1ZXVlKHApO1xuXHR9XG4gICAgfVxuXG4gICAgaWYobiA9PSBidWZmX3NpemUpXG5cdHJldHVybiBuO1xuXG4gICAgaWYoemlwX291dG9mZiA8IHppcF9vdXRjbnQpIHtcblx0aSA9IGJ1ZmZfc2l6ZSAtIG47XG5cdGlmKGkgPiB6aXBfb3V0Y250IC0gemlwX291dG9mZilcblx0ICAgIGkgPSB6aXBfb3V0Y250IC0gemlwX291dG9mZjtcblx0Ly8gU3lzdGVtLmFycmF5Y29weShvdXRidWYsIG91dG9mZiwgYnVmZiwgb2ZmICsgbiwgaSk7XG5cdGZvcihqID0gMDsgaiA8IGk7IGorKylcblx0ICAgIGJ1ZmZbb2ZmICsgbiArIGpdID0gemlwX291dGJ1Zlt6aXBfb3V0b2ZmICsgal07XG5cdHppcF9vdXRvZmYgKz0gaTtcblx0biArPSBpO1xuXHRpZih6aXBfb3V0Y250ID09IHppcF9vdXRvZmYpXG5cdCAgICB6aXBfb3V0Y250ID0gemlwX291dG9mZiA9IDA7XG4gICAgfVxuICAgIHJldHVybiBuO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogQWxsb2NhdGUgdGhlIG1hdGNoIGJ1ZmZlciwgaW5pdGlhbGl6ZSB0aGUgdmFyaW91cyB0YWJsZXMgYW5kIHNhdmUgdGhlXG4gKiBsb2NhdGlvbiBvZiB0aGUgaW50ZXJuYWwgZmlsZSBhdHRyaWJ1dGUgKGFzY2lpL2JpbmFyeSkgYW5kIG1ldGhvZFxuICogKERFRkxBVEUvU1RPUkUpLlxuICovXG52YXIgemlwX2N0X2luaXQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgbjtcdC8vIGl0ZXJhdGVzIG92ZXIgdHJlZSBlbGVtZW50c1xuICAgIHZhciBiaXRzO1x0Ly8gYml0IGNvdW50ZXJcbiAgICB2YXIgbGVuZ3RoO1x0Ly8gbGVuZ3RoIHZhbHVlXG4gICAgdmFyIGNvZGU7XHQvLyBjb2RlIHZhbHVlXG4gICAgdmFyIGRpc3Q7XHQvLyBkaXN0YW5jZSBpbmRleFxuXG4gICAgaWYoemlwX3N0YXRpY19kdHJlZVswXS5kbCAhPSAwKSByZXR1cm47IC8vIGN0X2luaXQgYWxyZWFkeSBjYWxsZWRcblxuICAgIHppcF9sX2Rlc2MuZHluX3RyZWVcdFx0PSB6aXBfZHluX2x0cmVlO1xuICAgIHppcF9sX2Rlc2Muc3RhdGljX3RyZWVcdD0gemlwX3N0YXRpY19sdHJlZTtcbiAgICB6aXBfbF9kZXNjLmV4dHJhX2JpdHNcdD0gemlwX2V4dHJhX2xiaXRzO1xuICAgIHppcF9sX2Rlc2MuZXh0cmFfYmFzZVx0PSB6aXBfTElURVJBTFMgKyAxO1xuICAgIHppcF9sX2Rlc2MuZWxlbXNcdFx0PSB6aXBfTF9DT0RFUztcbiAgICB6aXBfbF9kZXNjLm1heF9sZW5ndGhcdD0gemlwX01BWF9CSVRTO1xuICAgIHppcF9sX2Rlc2MubWF4X2NvZGVcdFx0PSAwO1xuXG4gICAgemlwX2RfZGVzYy5keW5fdHJlZVx0XHQ9IHppcF9keW5fZHRyZWU7XG4gICAgemlwX2RfZGVzYy5zdGF0aWNfdHJlZVx0PSB6aXBfc3RhdGljX2R0cmVlO1xuICAgIHppcF9kX2Rlc2MuZXh0cmFfYml0c1x0PSB6aXBfZXh0cmFfZGJpdHM7XG4gICAgemlwX2RfZGVzYy5leHRyYV9iYXNlXHQ9IDA7XG4gICAgemlwX2RfZGVzYy5lbGVtc1x0XHQ9IHppcF9EX0NPREVTO1xuICAgIHppcF9kX2Rlc2MubWF4X2xlbmd0aFx0PSB6aXBfTUFYX0JJVFM7XG4gICAgemlwX2RfZGVzYy5tYXhfY29kZVx0XHQ9IDA7XG5cbiAgICB6aXBfYmxfZGVzYy5keW5fdHJlZVx0PSB6aXBfYmxfdHJlZTtcbiAgICB6aXBfYmxfZGVzYy5zdGF0aWNfdHJlZVx0PSBudWxsO1xuICAgIHppcF9ibF9kZXNjLmV4dHJhX2JpdHNcdD0gemlwX2V4dHJhX2JsYml0cztcbiAgICB6aXBfYmxfZGVzYy5leHRyYV9iYXNlXHQ9IDA7XG4gICAgemlwX2JsX2Rlc2MuZWxlbXNcdFx0PSB6aXBfQkxfQ09ERVM7XG4gICAgemlwX2JsX2Rlc2MubWF4X2xlbmd0aFx0PSB6aXBfTUFYX0JMX0JJVFM7XG4gICAgemlwX2JsX2Rlc2MubWF4X2NvZGVcdD0gMDtcblxuICAgIC8vIEluaXRpYWxpemUgdGhlIG1hcHBpbmcgbGVuZ3RoICgwLi4yNTUpIC0+IGxlbmd0aCBjb2RlICgwLi4yOClcbiAgICBsZW5ndGggPSAwO1xuICAgIGZvcihjb2RlID0gMDsgY29kZSA8IHppcF9MRU5HVEhfQ09ERVMtMTsgY29kZSsrKSB7XG5cdHppcF9iYXNlX2xlbmd0aFtjb2RlXSA9IGxlbmd0aDtcblx0Zm9yKG4gPSAwOyBuIDwgKDE8PHppcF9leHRyYV9sYml0c1tjb2RlXSk7IG4rKylcblx0ICAgIHppcF9sZW5ndGhfY29kZVtsZW5ndGgrK10gPSBjb2RlO1xuICAgIH1cbiAgICAvLyBBc3NlcnQgKGxlbmd0aCA9PSAyNTYsIFwiY3RfaW5pdDogbGVuZ3RoICE9IDI1NlwiKTtcblxuICAgIC8qIE5vdGUgdGhhdCB0aGUgbGVuZ3RoIDI1NSAobWF0Y2ggbGVuZ3RoIDI1OCkgY2FuIGJlIHJlcHJlc2VudGVkXG4gICAgICogaW4gdHdvIGRpZmZlcmVudCB3YXlzOiBjb2RlIDI4NCArIDUgYml0cyBvciBjb2RlIDI4NSwgc28gd2VcbiAgICAgKiBvdmVyd3JpdGUgbGVuZ3RoX2NvZGVbMjU1XSB0byB1c2UgdGhlIGJlc3QgZW5jb2Rpbmc6XG4gICAgICovXG4gICAgemlwX2xlbmd0aF9jb2RlW2xlbmd0aC0xXSA9IGNvZGU7XG5cbiAgICAvKiBJbml0aWFsaXplIHRoZSBtYXBwaW5nIGRpc3QgKDAuLjMySykgLT4gZGlzdCBjb2RlICgwLi4yOSkgKi9cbiAgICBkaXN0ID0gMDtcbiAgICBmb3IoY29kZSA9IDAgOyBjb2RlIDwgMTY7IGNvZGUrKykge1xuXHR6aXBfYmFzZV9kaXN0W2NvZGVdID0gZGlzdDtcblx0Zm9yKG4gPSAwOyBuIDwgKDE8PHppcF9leHRyYV9kYml0c1tjb2RlXSk7IG4rKykge1xuXHQgICAgemlwX2Rpc3RfY29kZVtkaXN0KytdID0gY29kZTtcblx0fVxuICAgIH1cbiAgICAvLyBBc3NlcnQgKGRpc3QgPT0gMjU2LCBcImN0X2luaXQ6IGRpc3QgIT0gMjU2XCIpO1xuICAgIGRpc3QgPj49IDc7IC8vIGZyb20gbm93IG9uLCBhbGwgZGlzdGFuY2VzIGFyZSBkaXZpZGVkIGJ5IDEyOFxuICAgIGZvciggOyBjb2RlIDwgemlwX0RfQ09ERVM7IGNvZGUrKykge1xuXHR6aXBfYmFzZV9kaXN0W2NvZGVdID0gZGlzdCA8PCA3O1xuXHRmb3IobiA9IDA7IG4gPCAoMTw8KHppcF9leHRyYV9kYml0c1tjb2RlXS03KSk7IG4rKylcblx0ICAgIHppcF9kaXN0X2NvZGVbMjU2ICsgZGlzdCsrXSA9IGNvZGU7XG4gICAgfVxuICAgIC8vIEFzc2VydCAoZGlzdCA9PSAyNTYsIFwiY3RfaW5pdDogMjU2K2Rpc3QgIT0gNTEyXCIpO1xuXG4gICAgLy8gQ29uc3RydWN0IHRoZSBjb2RlcyBvZiB0aGUgc3RhdGljIGxpdGVyYWwgdHJlZVxuICAgIGZvcihiaXRzID0gMDsgYml0cyA8PSB6aXBfTUFYX0JJVFM7IGJpdHMrKylcblx0emlwX2JsX2NvdW50W2JpdHNdID0gMDtcbiAgICBuID0gMDtcbiAgICB3aGlsZShuIDw9IDE0MykgeyB6aXBfc3RhdGljX2x0cmVlW24rK10uZGwgPSA4OyB6aXBfYmxfY291bnRbOF0rKzsgfVxuICAgIHdoaWxlKG4gPD0gMjU1KSB7IHppcF9zdGF0aWNfbHRyZWVbbisrXS5kbCA9IDk7IHppcF9ibF9jb3VudFs5XSsrOyB9XG4gICAgd2hpbGUobiA8PSAyNzkpIHsgemlwX3N0YXRpY19sdHJlZVtuKytdLmRsID0gNzsgemlwX2JsX2NvdW50WzddKys7IH1cbiAgICB3aGlsZShuIDw9IDI4NykgeyB6aXBfc3RhdGljX2x0cmVlW24rK10uZGwgPSA4OyB6aXBfYmxfY291bnRbOF0rKzsgfVxuICAgIC8qIENvZGVzIDI4NiBhbmQgMjg3IGRvIG5vdCBleGlzdCwgYnV0IHdlIG11c3QgaW5jbHVkZSB0aGVtIGluIHRoZVxuICAgICAqIHRyZWUgY29uc3RydWN0aW9uIHRvIGdldCBhIGNhbm9uaWNhbCBIdWZmbWFuIHRyZWUgKGxvbmdlc3QgY29kZVxuICAgICAqIGFsbCBvbmVzKVxuICAgICAqL1xuICAgIHppcF9nZW5fY29kZXMoemlwX3N0YXRpY19sdHJlZSwgemlwX0xfQ09ERVMgKyAxKTtcblxuICAgIC8qIFRoZSBzdGF0aWMgZGlzdGFuY2UgdHJlZSBpcyB0cml2aWFsOiAqL1xuICAgIGZvcihuID0gMDsgbiA8IHppcF9EX0NPREVTOyBuKyspIHtcblx0emlwX3N0YXRpY19kdHJlZVtuXS5kbCA9IDU7XG5cdHppcF9zdGF0aWNfZHRyZWVbbl0uZmMgPSB6aXBfYmlfcmV2ZXJzZShuLCA1KTtcbiAgICB9XG5cbiAgICAvLyBJbml0aWFsaXplIHRoZSBmaXJzdCBibG9jayBvZiB0aGUgZmlyc3QgZmlsZTpcbiAgICB6aXBfaW5pdF9ibG9jaygpO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogSW5pdGlhbGl6ZSBhIG5ldyBibG9jay5cbiAqL1xudmFyIHppcF9pbml0X2Jsb2NrID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG47IC8vIGl0ZXJhdGVzIG92ZXIgdHJlZSBlbGVtZW50c1xuXG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgdHJlZXMuXG4gICAgZm9yKG4gPSAwOyBuIDwgemlwX0xfQ09ERVM7ICBuKyspIHppcF9keW5fbHRyZWVbbl0uZmMgPSAwO1xuICAgIGZvcihuID0gMDsgbiA8IHppcF9EX0NPREVTOyAgbisrKSB6aXBfZHluX2R0cmVlW25dLmZjID0gMDtcbiAgICBmb3IobiA9IDA7IG4gPCB6aXBfQkxfQ09ERVM7IG4rKykgemlwX2JsX3RyZWVbbl0uZmMgPSAwO1xuXG4gICAgemlwX2R5bl9sdHJlZVt6aXBfRU5EX0JMT0NLXS5mYyA9IDE7XG4gICAgemlwX29wdF9sZW4gPSB6aXBfc3RhdGljX2xlbiA9IDA7XG4gICAgemlwX2xhc3RfbGl0ID0gemlwX2xhc3RfZGlzdCA9IHppcF9sYXN0X2ZsYWdzID0gMDtcbiAgICB6aXBfZmxhZ3MgPSAwO1xuICAgIHppcF9mbGFnX2JpdCA9IDE7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBSZXN0b3JlIHRoZSBoZWFwIHByb3BlcnR5IGJ5IG1vdmluZyBkb3duIHRoZSB0cmVlIHN0YXJ0aW5nIGF0IG5vZGUgayxcbiAqIGV4Y2hhbmdpbmcgYSBub2RlIHdpdGggdGhlIHNtYWxsZXN0IG9mIGl0cyB0d28gc29ucyBpZiBuZWNlc3NhcnksIHN0b3BwaW5nXG4gKiB3aGVuIHRoZSBoZWFwIHByb3BlcnR5IGlzIHJlLWVzdGFibGlzaGVkIChlYWNoIGZhdGhlciBzbWFsbGVyIHRoYW4gaXRzXG4gKiB0d28gc29ucykuXG4gKi9cbnZhciB6aXBfcHFkb3duaGVhcCA9IGZ1bmN0aW9uKFxuICAgIHRyZWUsXHQvLyB0aGUgdHJlZSB0byByZXN0b3JlXG4gICAgaykge1x0Ly8gbm9kZSB0byBtb3ZlIGRvd25cbiAgICB2YXIgdiA9IHppcF9oZWFwW2tdO1xuICAgIHZhciBqID0gayA8PCAxO1x0Ly8gbGVmdCBzb24gb2Yga1xuXG4gICAgd2hpbGUoaiA8PSB6aXBfaGVhcF9sZW4pIHtcblx0Ly8gU2V0IGogdG8gdGhlIHNtYWxsZXN0IG9mIHRoZSB0d28gc29uczpcblx0aWYoaiA8IHppcF9oZWFwX2xlbiAmJlxuXHQgICB6aXBfU01BTExFUih0cmVlLCB6aXBfaGVhcFtqICsgMV0sIHppcF9oZWFwW2pdKSlcblx0ICAgIGorKztcblxuXHQvLyBFeGl0IGlmIHYgaXMgc21hbGxlciB0aGFuIGJvdGggc29uc1xuXHRpZih6aXBfU01BTExFUih0cmVlLCB2LCB6aXBfaGVhcFtqXSkpXG5cdCAgICBicmVhaztcblxuXHQvLyBFeGNoYW5nZSB2IHdpdGggdGhlIHNtYWxsZXN0IHNvblxuXHR6aXBfaGVhcFtrXSA9IHppcF9oZWFwW2pdO1xuXHRrID0gajtcblxuXHQvLyBBbmQgY29udGludWUgZG93biB0aGUgdHJlZSwgc2V0dGluZyBqIHRvIHRoZSBsZWZ0IHNvbiBvZiBrXG5cdGogPDw9IDE7XG4gICAgfVxuICAgIHppcF9oZWFwW2tdID0gdjtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIENvbXB1dGUgdGhlIG9wdGltYWwgYml0IGxlbmd0aHMgZm9yIGEgdHJlZSBhbmQgdXBkYXRlIHRoZSB0b3RhbCBiaXQgbGVuZ3RoXG4gKiBmb3IgdGhlIGN1cnJlbnQgYmxvY2suXG4gKiBJTiBhc3NlcnRpb246IHRoZSBmaWVsZHMgZnJlcSBhbmQgZGFkIGFyZSBzZXQsIGhlYXBbaGVhcF9tYXhdIGFuZFxuICogICAgYWJvdmUgYXJlIHRoZSB0cmVlIG5vZGVzIHNvcnRlZCBieSBpbmNyZWFzaW5nIGZyZXF1ZW5jeS5cbiAqIE9VVCBhc3NlcnRpb25zOiB0aGUgZmllbGQgbGVuIGlzIHNldCB0byB0aGUgb3B0aW1hbCBiaXQgbGVuZ3RoLCB0aGVcbiAqICAgICBhcnJheSBibF9jb3VudCBjb250YWlucyB0aGUgZnJlcXVlbmNpZXMgZm9yIGVhY2ggYml0IGxlbmd0aC5cbiAqICAgICBUaGUgbGVuZ3RoIG9wdF9sZW4gaXMgdXBkYXRlZDsgc3RhdGljX2xlbiBpcyBhbHNvIHVwZGF0ZWQgaWYgc3RyZWUgaXNcbiAqICAgICBub3QgbnVsbC5cbiAqL1xudmFyIHppcF9nZW5fYml0bGVuID0gZnVuY3Rpb24oZGVzYykgeyAvLyB0aGUgdHJlZSBkZXNjcmlwdG9yXG4gICAgdmFyIHRyZWVcdFx0PSBkZXNjLmR5bl90cmVlO1xuICAgIHZhciBleHRyYVx0XHQ9IGRlc2MuZXh0cmFfYml0cztcbiAgICB2YXIgYmFzZVx0XHQ9IGRlc2MuZXh0cmFfYmFzZTtcbiAgICB2YXIgbWF4X2NvZGVcdD0gZGVzYy5tYXhfY29kZTtcbiAgICB2YXIgbWF4X2xlbmd0aFx0PSBkZXNjLm1heF9sZW5ndGg7XG4gICAgdmFyIHN0cmVlXHRcdD0gZGVzYy5zdGF0aWNfdHJlZTtcbiAgICB2YXIgaDtcdFx0Ly8gaGVhcCBpbmRleFxuICAgIHZhciBuLCBtO1x0XHQvLyBpdGVyYXRlIG92ZXIgdGhlIHRyZWUgZWxlbWVudHNcbiAgICB2YXIgYml0cztcdFx0Ly8gYml0IGxlbmd0aFxuICAgIHZhciB4Yml0cztcdFx0Ly8gZXh0cmEgYml0c1xuICAgIHZhciBmO1x0XHQvLyBmcmVxdWVuY3lcbiAgICB2YXIgb3ZlcmZsb3cgPSAwO1x0Ly8gbnVtYmVyIG9mIGVsZW1lbnRzIHdpdGggYml0IGxlbmd0aCB0b28gbGFyZ2VcblxuICAgIGZvcihiaXRzID0gMDsgYml0cyA8PSB6aXBfTUFYX0JJVFM7IGJpdHMrKylcblx0emlwX2JsX2NvdW50W2JpdHNdID0gMDtcblxuICAgIC8qIEluIGEgZmlyc3QgcGFzcywgY29tcHV0ZSB0aGUgb3B0aW1hbCBiaXQgbGVuZ3RocyAod2hpY2ggbWF5XG4gICAgICogb3ZlcmZsb3cgaW4gdGhlIGNhc2Ugb2YgdGhlIGJpdCBsZW5ndGggdHJlZSkuXG4gICAgICovXG4gICAgdHJlZVt6aXBfaGVhcFt6aXBfaGVhcF9tYXhdXS5kbCA9IDA7IC8vIHJvb3Qgb2YgdGhlIGhlYXBcblxuICAgIGZvcihoID0gemlwX2hlYXBfbWF4ICsgMTsgaCA8IHppcF9IRUFQX1NJWkU7IGgrKykge1xuXHRuID0gemlwX2hlYXBbaF07XG5cdGJpdHMgPSB0cmVlW3RyZWVbbl0uZGxdLmRsICsgMTtcblx0aWYoYml0cyA+IG1heF9sZW5ndGgpIHtcblx0ICAgIGJpdHMgPSBtYXhfbGVuZ3RoO1xuXHQgICAgb3ZlcmZsb3crKztcblx0fVxuXHR0cmVlW25dLmRsID0gYml0cztcblx0Ly8gV2Ugb3ZlcndyaXRlIHRyZWVbbl0uZGwgd2hpY2ggaXMgbm8gbG9uZ2VyIG5lZWRlZFxuXG5cdGlmKG4gPiBtYXhfY29kZSlcblx0ICAgIGNvbnRpbnVlOyAvLyBub3QgYSBsZWFmIG5vZGVcblxuXHR6aXBfYmxfY291bnRbYml0c10rKztcblx0eGJpdHMgPSAwO1xuXHRpZihuID49IGJhc2UpXG5cdCAgICB4Yml0cyA9IGV4dHJhW24gLSBiYXNlXTtcblx0ZiA9IHRyZWVbbl0uZmM7XG5cdHppcF9vcHRfbGVuICs9IGYgKiAoYml0cyArIHhiaXRzKTtcblx0aWYoc3RyZWUgIT0gbnVsbClcblx0ICAgIHppcF9zdGF0aWNfbGVuICs9IGYgKiAoc3RyZWVbbl0uZGwgKyB4Yml0cyk7XG4gICAgfVxuICAgIGlmKG92ZXJmbG93ID09IDApXG5cdHJldHVybjtcblxuICAgIC8vIFRoaXMgaGFwcGVucyBmb3IgZXhhbXBsZSBvbiBvYmoyIGFuZCBwaWMgb2YgdGhlIENhbGdhcnkgY29ycHVzXG5cbiAgICAvLyBGaW5kIHRoZSBmaXJzdCBiaXQgbGVuZ3RoIHdoaWNoIGNvdWxkIGluY3JlYXNlOlxuICAgIGRvIHtcblx0Yml0cyA9IG1heF9sZW5ndGggLSAxO1xuXHR3aGlsZSh6aXBfYmxfY291bnRbYml0c10gPT0gMClcblx0ICAgIGJpdHMtLTtcblx0emlwX2JsX2NvdW50W2JpdHNdLS07XHRcdC8vIG1vdmUgb25lIGxlYWYgZG93biB0aGUgdHJlZVxuXHR6aXBfYmxfY291bnRbYml0cyArIDFdICs9IDI7XHQvLyBtb3ZlIG9uZSBvdmVyZmxvdyBpdGVtIGFzIGl0cyBicm90aGVyXG5cdHppcF9ibF9jb3VudFttYXhfbGVuZ3RoXS0tO1xuXHQvKiBUaGUgYnJvdGhlciBvZiB0aGUgb3ZlcmZsb3cgaXRlbSBhbHNvIG1vdmVzIG9uZSBzdGVwIHVwLFxuXHQgKiBidXQgdGhpcyBkb2VzIG5vdCBhZmZlY3QgYmxfY291bnRbbWF4X2xlbmd0aF1cblx0ICovXG5cdG92ZXJmbG93IC09IDI7XG4gICAgfSB3aGlsZShvdmVyZmxvdyA+IDApO1xuXG4gICAgLyogTm93IHJlY29tcHV0ZSBhbGwgYml0IGxlbmd0aHMsIHNjYW5uaW5nIGluIGluY3JlYXNpbmcgZnJlcXVlbmN5LlxuICAgICAqIGggaXMgc3RpbGwgZXF1YWwgdG8gSEVBUF9TSVpFLiAoSXQgaXMgc2ltcGxlciB0byByZWNvbnN0cnVjdCBhbGxcbiAgICAgKiBsZW5ndGhzIGluc3RlYWQgb2YgZml4aW5nIG9ubHkgdGhlIHdyb25nIG9uZXMuIFRoaXMgaWRlYSBpcyB0YWtlblxuICAgICAqIGZyb20gJ2FyJyB3cml0dGVuIGJ5IEhhcnVoaWtvIE9rdW11cmEuKVxuICAgICAqL1xuICAgIGZvcihiaXRzID0gbWF4X2xlbmd0aDsgYml0cyAhPSAwOyBiaXRzLS0pIHtcblx0biA9IHppcF9ibF9jb3VudFtiaXRzXTtcblx0d2hpbGUobiAhPSAwKSB7XG5cdCAgICBtID0gemlwX2hlYXBbLS1oXTtcblx0ICAgIGlmKG0gPiBtYXhfY29kZSlcblx0XHRjb250aW51ZTtcblx0ICAgIGlmKHRyZWVbbV0uZGwgIT0gYml0cykge1xuXHRcdHppcF9vcHRfbGVuICs9IChiaXRzIC0gdHJlZVttXS5kbCkgKiB0cmVlW21dLmZjO1xuXHRcdHRyZWVbbV0uZmMgPSBiaXRzO1xuXHQgICAgfVxuXHQgICAgbi0tO1xuXHR9XG4gICAgfVxufVxuXG4gIC8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAqIEdlbmVyYXRlIHRoZSBjb2RlcyBmb3IgYSBnaXZlbiB0cmVlIGFuZCBiaXQgY291bnRzICh3aGljaCBuZWVkIG5vdCBiZVxuICAgKiBvcHRpbWFsKS5cbiAgICogSU4gYXNzZXJ0aW9uOiB0aGUgYXJyYXkgYmxfY291bnQgY29udGFpbnMgdGhlIGJpdCBsZW5ndGggc3RhdGlzdGljcyBmb3JcbiAgICogdGhlIGdpdmVuIHRyZWUgYW5kIHRoZSBmaWVsZCBsZW4gaXMgc2V0IGZvciBhbGwgdHJlZSBlbGVtZW50cy5cbiAgICogT1VUIGFzc2VydGlvbjogdGhlIGZpZWxkIGNvZGUgaXMgc2V0IGZvciBhbGwgdHJlZSBlbGVtZW50cyBvZiBub25cbiAgICogICAgIHplcm8gY29kZSBsZW5ndGguXG4gICAqL1xudmFyIHppcF9nZW5fY29kZXMgPSBmdW5jdGlvbih0cmVlLFx0Ly8gdGhlIHRyZWUgdG8gZGVjb3JhdGVcblx0XHQgICBtYXhfY29kZSkge1x0Ly8gbGFyZ2VzdCBjb2RlIHdpdGggbm9uIHplcm8gZnJlcXVlbmN5XG4gICAgdmFyIG5leHRfY29kZSA9IG5ldyBBcnJheSh6aXBfTUFYX0JJVFMrMSk7IC8vIG5leHQgY29kZSB2YWx1ZSBmb3IgZWFjaCBiaXQgbGVuZ3RoXG4gICAgdmFyIGNvZGUgPSAwO1x0XHQvLyBydW5uaW5nIGNvZGUgdmFsdWVcbiAgICB2YXIgYml0cztcdFx0XHQvLyBiaXQgaW5kZXhcbiAgICB2YXIgbjtcdFx0XHQvLyBjb2RlIGluZGV4XG5cbiAgICAvKiBUaGUgZGlzdHJpYnV0aW9uIGNvdW50cyBhcmUgZmlyc3QgdXNlZCB0byBnZW5lcmF0ZSB0aGUgY29kZSB2YWx1ZXNcbiAgICAgKiB3aXRob3V0IGJpdCByZXZlcnNhbC5cbiAgICAgKi9cbiAgICBmb3IoYml0cyA9IDE7IGJpdHMgPD0gemlwX01BWF9CSVRTOyBiaXRzKyspIHtcblx0Y29kZSA9ICgoY29kZSArIHppcF9ibF9jb3VudFtiaXRzLTFdKSA8PCAxKTtcblx0bmV4dF9jb2RlW2JpdHNdID0gY29kZTtcbiAgICB9XG5cbiAgICAvKiBDaGVjayB0aGF0IHRoZSBiaXQgY291bnRzIGluIGJsX2NvdW50IGFyZSBjb25zaXN0ZW50LiBUaGUgbGFzdCBjb2RlXG4gICAgICogbXVzdCBiZSBhbGwgb25lcy5cbiAgICAgKi9cbi8vICAgIEFzc2VydCAoY29kZSArIGVuY29kZXItPmJsX2NvdW50W01BWF9CSVRTXS0xID09ICgxPDxNQVhfQklUUyktMSxcbi8vXHQgICAgXCJpbmNvbnNpc3RlbnQgYml0IGNvdW50c1wiKTtcbi8vICAgIFRyYWNldigoc3RkZXJyLFwiXFxuZ2VuX2NvZGVzOiBtYXhfY29kZSAlZCBcIiwgbWF4X2NvZGUpKTtcblxuICAgIGZvcihuID0gMDsgbiA8PSBtYXhfY29kZTsgbisrKSB7XG5cdHZhciBsZW4gPSB0cmVlW25dLmRsO1xuXHRpZihsZW4gPT0gMClcblx0ICAgIGNvbnRpbnVlO1xuXHQvLyBOb3cgcmV2ZXJzZSB0aGUgYml0c1xuXHR0cmVlW25dLmZjID0gemlwX2JpX3JldmVyc2UobmV4dF9jb2RlW2xlbl0rKywgbGVuKTtcblxuLy8gICAgICBUcmFjZWModHJlZSAhPSBzdGF0aWNfbHRyZWUsIChzdGRlcnIsXCJcXG5uICUzZCAlYyBsICUyZCBjICU0eCAoJXgpIFwiLFxuLy9cdCAgbiwgKGlzZ3JhcGgobikgPyBuIDogJyAnKSwgbGVuLCB0cmVlW25dLmZjLCBuZXh0X2NvZGVbbGVuXS0xKSk7XG4gICAgfVxufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogQ29uc3RydWN0IG9uZSBIdWZmbWFuIHRyZWUgYW5kIGFzc2lnbnMgdGhlIGNvZGUgYml0IHN0cmluZ3MgYW5kIGxlbmd0aHMuXG4gKiBVcGRhdGUgdGhlIHRvdGFsIGJpdCBsZW5ndGggZm9yIHRoZSBjdXJyZW50IGJsb2NrLlxuICogSU4gYXNzZXJ0aW9uOiB0aGUgZmllbGQgZnJlcSBpcyBzZXQgZm9yIGFsbCB0cmVlIGVsZW1lbnRzLlxuICogT1VUIGFzc2VydGlvbnM6IHRoZSBmaWVsZHMgbGVuIGFuZCBjb2RlIGFyZSBzZXQgdG8gdGhlIG9wdGltYWwgYml0IGxlbmd0aFxuICogICAgIGFuZCBjb3JyZXNwb25kaW5nIGNvZGUuIFRoZSBsZW5ndGggb3B0X2xlbiBpcyB1cGRhdGVkOyBzdGF0aWNfbGVuIGlzXG4gKiAgICAgYWxzbyB1cGRhdGVkIGlmIHN0cmVlIGlzIG5vdCBudWxsLiBUaGUgZmllbGQgbWF4X2NvZGUgaXMgc2V0LlxuICovXG52YXIgemlwX2J1aWxkX3RyZWUgPSBmdW5jdGlvbihkZXNjKSB7IC8vIHRoZSB0cmVlIGRlc2NyaXB0b3JcbiAgICB2YXIgdHJlZVx0PSBkZXNjLmR5bl90cmVlO1xuICAgIHZhciBzdHJlZVx0PSBkZXNjLnN0YXRpY190cmVlO1xuICAgIHZhciBlbGVtc1x0PSBkZXNjLmVsZW1zO1xuICAgIHZhciBuLCBtO1x0XHQvLyBpdGVyYXRlIG92ZXIgaGVhcCBlbGVtZW50c1xuICAgIHZhciBtYXhfY29kZSA9IC0xO1x0Ly8gbGFyZ2VzdCBjb2RlIHdpdGggbm9uIHplcm8gZnJlcXVlbmN5XG4gICAgdmFyIG5vZGUgPSBlbGVtcztcdC8vIG5leHQgaW50ZXJuYWwgbm9kZSBvZiB0aGUgdHJlZVxuXG4gICAgLyogQ29uc3RydWN0IHRoZSBpbml0aWFsIGhlYXAsIHdpdGggbGVhc3QgZnJlcXVlbnQgZWxlbWVudCBpblxuICAgICAqIGhlYXBbU01BTExFU1RdLiBUaGUgc29ucyBvZiBoZWFwW25dIGFyZSBoZWFwWzIqbl0gYW5kIGhlYXBbMipuKzFdLlxuICAgICAqIGhlYXBbMF0gaXMgbm90IHVzZWQuXG4gICAgICovXG4gICAgemlwX2hlYXBfbGVuID0gMDtcbiAgICB6aXBfaGVhcF9tYXggPSB6aXBfSEVBUF9TSVpFO1xuXG4gICAgZm9yKG4gPSAwOyBuIDwgZWxlbXM7IG4rKykge1xuXHRpZih0cmVlW25dLmZjICE9IDApIHtcblx0ICAgIHppcF9oZWFwWysremlwX2hlYXBfbGVuXSA9IG1heF9jb2RlID0gbjtcblx0ICAgIHppcF9kZXB0aFtuXSA9IDA7XG5cdH0gZWxzZVxuXHQgICAgdHJlZVtuXS5kbCA9IDA7XG4gICAgfVxuXG4gICAgLyogVGhlIHBremlwIGZvcm1hdCByZXF1aXJlcyB0aGF0IGF0IGxlYXN0IG9uZSBkaXN0YW5jZSBjb2RlIGV4aXN0cyxcbiAgICAgKiBhbmQgdGhhdCBhdCBsZWFzdCBvbmUgYml0IHNob3VsZCBiZSBzZW50IGV2ZW4gaWYgdGhlcmUgaXMgb25seSBvbmVcbiAgICAgKiBwb3NzaWJsZSBjb2RlLiBTbyB0byBhdm9pZCBzcGVjaWFsIGNoZWNrcyBsYXRlciBvbiB3ZSBmb3JjZSBhdCBsZWFzdFxuICAgICAqIHR3byBjb2RlcyBvZiBub24gemVybyBmcmVxdWVuY3kuXG4gICAgICovXG4gICAgd2hpbGUoemlwX2hlYXBfbGVuIDwgMikge1xuXHR2YXIgeG5ldyA9IHppcF9oZWFwWysremlwX2hlYXBfbGVuXSA9IChtYXhfY29kZSA8IDIgPyArK21heF9jb2RlIDogMCk7XG5cdHRyZWVbeG5ld10uZmMgPSAxO1xuXHR6aXBfZGVwdGhbeG5ld10gPSAwO1xuXHR6aXBfb3B0X2xlbi0tO1xuXHRpZihzdHJlZSAhPSBudWxsKVxuXHQgICAgemlwX3N0YXRpY19sZW4gLT0gc3RyZWVbeG5ld10uZGw7XG5cdC8vIG5ldyBpcyAwIG9yIDEgc28gaXQgZG9lcyBub3QgaGF2ZSBleHRyYSBiaXRzXG4gICAgfVxuICAgIGRlc2MubWF4X2NvZGUgPSBtYXhfY29kZTtcblxuICAgIC8qIFRoZSBlbGVtZW50cyBoZWFwW2hlYXBfbGVuLzIrMSAuLiBoZWFwX2xlbl0gYXJlIGxlYXZlcyBvZiB0aGUgdHJlZSxcbiAgICAgKiBlc3RhYmxpc2ggc3ViLWhlYXBzIG9mIGluY3JlYXNpbmcgbGVuZ3RoczpcbiAgICAgKi9cbiAgICBmb3IobiA9IHppcF9oZWFwX2xlbiA+PiAxOyBuID49IDE7IG4tLSlcblx0emlwX3BxZG93bmhlYXAodHJlZSwgbik7XG5cbiAgICAvKiBDb25zdHJ1Y3QgdGhlIEh1ZmZtYW4gdHJlZSBieSByZXBlYXRlZGx5IGNvbWJpbmluZyB0aGUgbGVhc3QgdHdvXG4gICAgICogZnJlcXVlbnQgbm9kZXMuXG4gICAgICovXG4gICAgZG8ge1xuXHRuID0gemlwX2hlYXBbemlwX1NNQUxMRVNUXTtcblx0emlwX2hlYXBbemlwX1NNQUxMRVNUXSA9IHppcF9oZWFwW3ppcF9oZWFwX2xlbi0tXTtcblx0emlwX3BxZG93bmhlYXAodHJlZSwgemlwX1NNQUxMRVNUKTtcblxuXHRtID0gemlwX2hlYXBbemlwX1NNQUxMRVNUXTsgIC8vIG0gPSBub2RlIG9mIG5leHQgbGVhc3QgZnJlcXVlbmN5XG5cblx0Ly8ga2VlcCB0aGUgbm9kZXMgc29ydGVkIGJ5IGZyZXF1ZW5jeVxuXHR6aXBfaGVhcFstLXppcF9oZWFwX21heF0gPSBuO1xuXHR6aXBfaGVhcFstLXppcF9oZWFwX21heF0gPSBtO1xuXG5cdC8vIENyZWF0ZSBhIG5ldyBub2RlIGZhdGhlciBvZiBuIGFuZCBtXG5cdHRyZWVbbm9kZV0uZmMgPSB0cmVlW25dLmZjICsgdHJlZVttXS5mYztcbi8vXHRkZXB0aFtub2RlXSA9IChjaGFyKShNQVgoZGVwdGhbbl0sIGRlcHRoW21dKSArIDEpO1xuXHRpZih6aXBfZGVwdGhbbl0gPiB6aXBfZGVwdGhbbV0gKyAxKVxuXHQgICAgemlwX2RlcHRoW25vZGVdID0gemlwX2RlcHRoW25dO1xuXHRlbHNlXG5cdCAgICB6aXBfZGVwdGhbbm9kZV0gPSB6aXBfZGVwdGhbbV0gKyAxO1xuXHR0cmVlW25dLmRsID0gdHJlZVttXS5kbCA9IG5vZGU7XG5cblx0Ly8gYW5kIGluc2VydCB0aGUgbmV3IG5vZGUgaW4gdGhlIGhlYXBcblx0emlwX2hlYXBbemlwX1NNQUxMRVNUXSA9IG5vZGUrKztcblx0emlwX3BxZG93bmhlYXAodHJlZSwgemlwX1NNQUxMRVNUKTtcblxuICAgIH0gd2hpbGUoemlwX2hlYXBfbGVuID49IDIpO1xuXG4gICAgemlwX2hlYXBbLS16aXBfaGVhcF9tYXhdID0gemlwX2hlYXBbemlwX1NNQUxMRVNUXTtcblxuICAgIC8qIEF0IHRoaXMgcG9pbnQsIHRoZSBmaWVsZHMgZnJlcSBhbmQgZGFkIGFyZSBzZXQuIFdlIGNhbiBub3dcbiAgICAgKiBnZW5lcmF0ZSB0aGUgYml0IGxlbmd0aHMuXG4gICAgICovXG4gICAgemlwX2dlbl9iaXRsZW4oZGVzYyk7XG5cbiAgICAvLyBUaGUgZmllbGQgbGVuIGlzIG5vdyBzZXQsIHdlIGNhbiBnZW5lcmF0ZSB0aGUgYml0IGNvZGVzXG4gICAgemlwX2dlbl9jb2Rlcyh0cmVlLCBtYXhfY29kZSk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBTY2FuIGEgbGl0ZXJhbCBvciBkaXN0YW5jZSB0cmVlIHRvIGRldGVybWluZSB0aGUgZnJlcXVlbmNpZXMgb2YgdGhlIGNvZGVzXG4gKiBpbiB0aGUgYml0IGxlbmd0aCB0cmVlLiBVcGRhdGVzIG9wdF9sZW4gdG8gdGFrZSBpbnRvIGFjY291bnQgdGhlIHJlcGVhdFxuICogY291bnRzLiAoVGhlIGNvbnRyaWJ1dGlvbiBvZiB0aGUgYml0IGxlbmd0aCBjb2RlcyB3aWxsIGJlIGFkZGVkIGxhdGVyXG4gKiBkdXJpbmcgdGhlIGNvbnN0cnVjdGlvbiBvZiBibF90cmVlLilcbiAqL1xudmFyIHppcF9zY2FuX3RyZWUgPSBmdW5jdGlvbih0cmVlLC8vIHRoZSB0cmVlIHRvIGJlIHNjYW5uZWRcblx0XHQgICAgICAgbWF4X2NvZGUpIHsgIC8vIGFuZCBpdHMgbGFyZ2VzdCBjb2RlIG9mIG5vbiB6ZXJvIGZyZXF1ZW5jeVxuICAgIHZhciBuO1x0XHRcdC8vIGl0ZXJhdGVzIG92ZXIgYWxsIHRyZWUgZWxlbWVudHNcbiAgICB2YXIgcHJldmxlbiA9IC0xO1x0XHQvLyBsYXN0IGVtaXR0ZWQgbGVuZ3RoXG4gICAgdmFyIGN1cmxlbjtcdFx0XHQvLyBsZW5ndGggb2YgY3VycmVudCBjb2RlXG4gICAgdmFyIG5leHRsZW4gPSB0cmVlWzBdLmRsO1x0Ly8gbGVuZ3RoIG9mIG5leHQgY29kZVxuICAgIHZhciBjb3VudCA9IDA7XHRcdC8vIHJlcGVhdCBjb3VudCBvZiB0aGUgY3VycmVudCBjb2RlXG4gICAgdmFyIG1heF9jb3VudCA9IDc7XHRcdC8vIG1heCByZXBlYXQgY291bnRcbiAgICB2YXIgbWluX2NvdW50ID0gNDtcdFx0Ly8gbWluIHJlcGVhdCBjb3VudFxuXG4gICAgaWYobmV4dGxlbiA9PSAwKSB7XG5cdG1heF9jb3VudCA9IDEzODtcblx0bWluX2NvdW50ID0gMztcbiAgICB9XG4gICAgdHJlZVttYXhfY29kZSArIDFdLmRsID0gMHhmZmZmOyAvLyBndWFyZFxuXG4gICAgZm9yKG4gPSAwOyBuIDw9IG1heF9jb2RlOyBuKyspIHtcblx0Y3VybGVuID0gbmV4dGxlbjtcblx0bmV4dGxlbiA9IHRyZWVbbiArIDFdLmRsO1xuXHRpZigrK2NvdW50IDwgbWF4X2NvdW50ICYmIGN1cmxlbiA9PSBuZXh0bGVuKVxuXHQgICAgY29udGludWU7XG5cdGVsc2UgaWYoY291bnQgPCBtaW5fY291bnQpXG5cdCAgICB6aXBfYmxfdHJlZVtjdXJsZW5dLmZjICs9IGNvdW50O1xuXHRlbHNlIGlmKGN1cmxlbiAhPSAwKSB7XG5cdCAgICBpZihjdXJsZW4gIT0gcHJldmxlbilcblx0XHR6aXBfYmxfdHJlZVtjdXJsZW5dLmZjKys7XG5cdCAgICB6aXBfYmxfdHJlZVt6aXBfUkVQXzNfNl0uZmMrKztcblx0fSBlbHNlIGlmKGNvdW50IDw9IDEwKVxuXHQgICAgemlwX2JsX3RyZWVbemlwX1JFUFpfM18xMF0uZmMrKztcblx0ZWxzZVxuXHQgICAgemlwX2JsX3RyZWVbemlwX1JFUFpfMTFfMTM4XS5mYysrO1xuXHRjb3VudCA9IDA7IHByZXZsZW4gPSBjdXJsZW47XG5cdGlmKG5leHRsZW4gPT0gMCkge1xuXHQgICAgbWF4X2NvdW50ID0gMTM4O1xuXHQgICAgbWluX2NvdW50ID0gMztcblx0fSBlbHNlIGlmKGN1cmxlbiA9PSBuZXh0bGVuKSB7XG5cdCAgICBtYXhfY291bnQgPSA2O1xuXHQgICAgbWluX2NvdW50ID0gMztcblx0fSBlbHNlIHtcblx0ICAgIG1heF9jb3VudCA9IDc7XG5cdCAgICBtaW5fY291bnQgPSA0O1xuXHR9XG4gICAgfVxufVxuXG4gIC8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAqIFNlbmQgYSBsaXRlcmFsIG9yIGRpc3RhbmNlIHRyZWUgaW4gY29tcHJlc3NlZCBmb3JtLCB1c2luZyB0aGUgY29kZXMgaW5cbiAgICogYmxfdHJlZS5cbiAgICovXG52YXIgemlwX3NlbmRfdHJlZSA9IGZ1bmN0aW9uKHRyZWUsIC8vIHRoZSB0cmVlIHRvIGJlIHNjYW5uZWRcblx0XHQgICBtYXhfY29kZSkgeyAvLyBhbmQgaXRzIGxhcmdlc3QgY29kZSBvZiBub24gemVybyBmcmVxdWVuY3lcbiAgICB2YXIgbjtcdFx0XHQvLyBpdGVyYXRlcyBvdmVyIGFsbCB0cmVlIGVsZW1lbnRzXG4gICAgdmFyIHByZXZsZW4gPSAtMTtcdFx0Ly8gbGFzdCBlbWl0dGVkIGxlbmd0aFxuICAgIHZhciBjdXJsZW47XHRcdFx0Ly8gbGVuZ3RoIG9mIGN1cnJlbnQgY29kZVxuICAgIHZhciBuZXh0bGVuID0gdHJlZVswXS5kbDtcdC8vIGxlbmd0aCBvZiBuZXh0IGNvZGVcbiAgICB2YXIgY291bnQgPSAwO1x0XHQvLyByZXBlYXQgY291bnQgb2YgdGhlIGN1cnJlbnQgY29kZVxuICAgIHZhciBtYXhfY291bnQgPSA3O1x0XHQvLyBtYXggcmVwZWF0IGNvdW50XG4gICAgdmFyIG1pbl9jb3VudCA9IDQ7XHRcdC8vIG1pbiByZXBlYXQgY291bnRcblxuICAgIC8qIHRyZWVbbWF4X2NvZGUrMV0uZGwgPSAtMTsgKi8gIC8qIGd1YXJkIGFscmVhZHkgc2V0ICovXG4gICAgaWYobmV4dGxlbiA9PSAwKSB7XG4gICAgICBtYXhfY291bnQgPSAxMzg7XG4gICAgICBtaW5fY291bnQgPSAzO1xuICAgIH1cblxuICAgIGZvcihuID0gMDsgbiA8PSBtYXhfY29kZTsgbisrKSB7XG5cdGN1cmxlbiA9IG5leHRsZW47XG5cdG5leHRsZW4gPSB0cmVlW24rMV0uZGw7XG5cdGlmKCsrY291bnQgPCBtYXhfY291bnQgJiYgY3VybGVuID09IG5leHRsZW4pIHtcblx0ICAgIGNvbnRpbnVlO1xuXHR9IGVsc2UgaWYoY291bnQgPCBtaW5fY291bnQpIHtcblx0ICAgIGRvIHsgemlwX1NFTkRfQ09ERShjdXJsZW4sIHppcF9ibF90cmVlKTsgfSB3aGlsZSgtLWNvdW50ICE9IDApO1xuXHR9IGVsc2UgaWYoY3VybGVuICE9IDApIHtcblx0ICAgIGlmKGN1cmxlbiAhPSBwcmV2bGVuKSB7XG5cdFx0emlwX1NFTkRfQ09ERShjdXJsZW4sIHppcF9ibF90cmVlKTtcblx0XHRjb3VudC0tO1xuXHQgICAgfVxuXHQgICAgLy8gQXNzZXJ0KGNvdW50ID49IDMgJiYgY291bnQgPD0gNiwgXCIgM182P1wiKTtcblx0ICAgIHppcF9TRU5EX0NPREUoemlwX1JFUF8zXzYsIHppcF9ibF90cmVlKTtcblx0ICAgIHppcF9zZW5kX2JpdHMoY291bnQgLSAzLCAyKTtcblx0fSBlbHNlIGlmKGNvdW50IDw9IDEwKSB7XG5cdCAgICB6aXBfU0VORF9DT0RFKHppcF9SRVBaXzNfMTAsIHppcF9ibF90cmVlKTtcblx0ICAgIHppcF9zZW5kX2JpdHMoY291bnQtMywgMyk7XG5cdH0gZWxzZSB7XG5cdCAgICB6aXBfU0VORF9DT0RFKHppcF9SRVBaXzExXzEzOCwgemlwX2JsX3RyZWUpO1xuXHQgICAgemlwX3NlbmRfYml0cyhjb3VudC0xMSwgNyk7XG5cdH1cblx0Y291bnQgPSAwO1xuXHRwcmV2bGVuID0gY3VybGVuO1xuXHRpZihuZXh0bGVuID09IDApIHtcblx0ICAgIG1heF9jb3VudCA9IDEzODtcblx0ICAgIG1pbl9jb3VudCA9IDM7XG5cdH0gZWxzZSBpZihjdXJsZW4gPT0gbmV4dGxlbikge1xuXHQgICAgbWF4X2NvdW50ID0gNjtcblx0ICAgIG1pbl9jb3VudCA9IDM7XG5cdH0gZWxzZSB7XG5cdCAgICBtYXhfY291bnQgPSA3O1xuXHQgICAgbWluX2NvdW50ID0gNDtcblx0fVxuICAgIH1cbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIENvbnN0cnVjdCB0aGUgSHVmZm1hbiB0cmVlIGZvciB0aGUgYml0IGxlbmd0aHMgYW5kIHJldHVybiB0aGUgaW5kZXggaW5cbiAqIGJsX29yZGVyIG9mIHRoZSBsYXN0IGJpdCBsZW5ndGggY29kZSB0byBzZW5kLlxuICovXG52YXIgemlwX2J1aWxkX2JsX3RyZWUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgbWF4X2JsaW5kZXg7ICAvLyBpbmRleCBvZiBsYXN0IGJpdCBsZW5ndGggY29kZSBvZiBub24gemVybyBmcmVxXG5cbiAgICAvLyBEZXRlcm1pbmUgdGhlIGJpdCBsZW5ndGggZnJlcXVlbmNpZXMgZm9yIGxpdGVyYWwgYW5kIGRpc3RhbmNlIHRyZWVzXG4gICAgemlwX3NjYW5fdHJlZSh6aXBfZHluX2x0cmVlLCB6aXBfbF9kZXNjLm1heF9jb2RlKTtcbiAgICB6aXBfc2Nhbl90cmVlKHppcF9keW5fZHRyZWUsIHppcF9kX2Rlc2MubWF4X2NvZGUpO1xuXG4gICAgLy8gQnVpbGQgdGhlIGJpdCBsZW5ndGggdHJlZTpcbiAgICB6aXBfYnVpbGRfdHJlZSh6aXBfYmxfZGVzYyk7XG4gICAgLyogb3B0X2xlbiBub3cgaW5jbHVkZXMgdGhlIGxlbmd0aCBvZiB0aGUgdHJlZSByZXByZXNlbnRhdGlvbnMsIGV4Y2VwdFxuICAgICAqIHRoZSBsZW5ndGhzIG9mIHRoZSBiaXQgbGVuZ3RocyBjb2RlcyBhbmQgdGhlIDUrNSs0IGJpdHMgZm9yIHRoZSBjb3VudHMuXG4gICAgICovXG5cbiAgICAvKiBEZXRlcm1pbmUgdGhlIG51bWJlciBvZiBiaXQgbGVuZ3RoIGNvZGVzIHRvIHNlbmQuIFRoZSBwa3ppcCBmb3JtYXRcbiAgICAgKiByZXF1aXJlcyB0aGF0IGF0IGxlYXN0IDQgYml0IGxlbmd0aCBjb2RlcyBiZSBzZW50LiAoYXBwbm90ZS50eHQgc2F5c1xuICAgICAqIDMgYnV0IHRoZSBhY3R1YWwgdmFsdWUgdXNlZCBpcyA0LilcbiAgICAgKi9cbiAgICBmb3IobWF4X2JsaW5kZXggPSB6aXBfQkxfQ09ERVMtMTsgbWF4X2JsaW5kZXggPj0gMzsgbWF4X2JsaW5kZXgtLSkge1xuXHRpZih6aXBfYmxfdHJlZVt6aXBfYmxfb3JkZXJbbWF4X2JsaW5kZXhdXS5kbCAhPSAwKSBicmVhaztcbiAgICB9XG4gICAgLyogVXBkYXRlIG9wdF9sZW4gdG8gaW5jbHVkZSB0aGUgYml0IGxlbmd0aCB0cmVlIGFuZCBjb3VudHMgKi9cbiAgICB6aXBfb3B0X2xlbiArPSAzKihtYXhfYmxpbmRleCsxKSArIDUrNSs0O1xuLy8gICAgVHJhY2V2KChzdGRlcnIsIFwiXFxuZHluIHRyZWVzOiBkeW4gJWxkLCBzdGF0ICVsZFwiLFxuLy9cdCAgICBlbmNvZGVyLT5vcHRfbGVuLCBlbmNvZGVyLT5zdGF0aWNfbGVuKSk7XG5cbiAgICByZXR1cm4gbWF4X2JsaW5kZXg7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBTZW5kIHRoZSBoZWFkZXIgZm9yIGEgYmxvY2sgdXNpbmcgZHluYW1pYyBIdWZmbWFuIHRyZWVzOiB0aGUgY291bnRzLCB0aGVcbiAqIGxlbmd0aHMgb2YgdGhlIGJpdCBsZW5ndGggY29kZXMsIHRoZSBsaXRlcmFsIHRyZWUgYW5kIHRoZSBkaXN0YW5jZSB0cmVlLlxuICogSU4gYXNzZXJ0aW9uOiBsY29kZXMgPj0gMjU3LCBkY29kZXMgPj0gMSwgYmxjb2RlcyA+PSA0LlxuICovXG52YXIgemlwX3NlbmRfYWxsX3RyZWVzID0gZnVuY3Rpb24obGNvZGVzLCBkY29kZXMsIGJsY29kZXMpIHsgLy8gbnVtYmVyIG9mIGNvZGVzIGZvciBlYWNoIHRyZWVcbiAgICB2YXIgcmFuazsgLy8gaW5kZXggaW4gYmxfb3JkZXJcblxuLy8gICAgQXNzZXJ0IChsY29kZXMgPj0gMjU3ICYmIGRjb2RlcyA+PSAxICYmIGJsY29kZXMgPj0gNCwgXCJub3QgZW5vdWdoIGNvZGVzXCIpO1xuLy8gICAgQXNzZXJ0IChsY29kZXMgPD0gTF9DT0RFUyAmJiBkY29kZXMgPD0gRF9DT0RFUyAmJiBibGNvZGVzIDw9IEJMX0NPREVTLFxuLy9cdCAgICBcInRvbyBtYW55IGNvZGVzXCIpO1xuLy8gICAgVHJhY2V2KChzdGRlcnIsIFwiXFxuYmwgY291bnRzOiBcIikpO1xuICAgIHppcF9zZW5kX2JpdHMobGNvZGVzLTI1NywgNSk7IC8vIG5vdCArMjU1IGFzIHN0YXRlZCBpbiBhcHBub3RlLnR4dFxuICAgIHppcF9zZW5kX2JpdHMoZGNvZGVzLTEsICAgNSk7XG4gICAgemlwX3NlbmRfYml0cyhibGNvZGVzLTQsICA0KTsgLy8gbm90IC0zIGFzIHN0YXRlZCBpbiBhcHBub3RlLnR4dFxuICAgIGZvcihyYW5rID0gMDsgcmFuayA8IGJsY29kZXM7IHJhbmsrKykge1xuLy8gICAgICBUcmFjZXYoKHN0ZGVyciwgXCJcXG5ibCBjb2RlICUyZCBcIiwgYmxfb3JkZXJbcmFua10pKTtcblx0emlwX3NlbmRfYml0cyh6aXBfYmxfdHJlZVt6aXBfYmxfb3JkZXJbcmFua11dLmRsLCAzKTtcbiAgICB9XG5cbiAgICAvLyBzZW5kIHRoZSBsaXRlcmFsIHRyZWVcbiAgICB6aXBfc2VuZF90cmVlKHppcF9keW5fbHRyZWUsbGNvZGVzLTEpO1xuXG4gICAgLy8gc2VuZCB0aGUgZGlzdGFuY2UgdHJlZVxuICAgIHppcF9zZW5kX3RyZWUoemlwX2R5bl9kdHJlZSxkY29kZXMtMSk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBEZXRlcm1pbmUgdGhlIGJlc3QgZW5jb2RpbmcgZm9yIHRoZSBjdXJyZW50IGJsb2NrOiBkeW5hbWljIHRyZWVzLCBzdGF0aWNcbiAqIHRyZWVzIG9yIHN0b3JlLCBhbmQgb3V0cHV0IHRoZSBlbmNvZGVkIGJsb2NrIHRvIHRoZSB6aXAgZmlsZS5cbiAqL1xudmFyIHppcF9mbHVzaF9ibG9jayA9IGZ1bmN0aW9uKGVvZikgeyAvLyB0cnVlIGlmIHRoaXMgaXMgdGhlIGxhc3QgYmxvY2sgZm9yIGEgZmlsZVxuICAgIHZhciBvcHRfbGVuYiwgc3RhdGljX2xlbmI7IC8vIG9wdF9sZW4gYW5kIHN0YXRpY19sZW4gaW4gYnl0ZXNcbiAgICB2YXIgbWF4X2JsaW5kZXg7XHQvLyBpbmRleCBvZiBsYXN0IGJpdCBsZW5ndGggY29kZSBvZiBub24gemVybyBmcmVxXG4gICAgdmFyIHN0b3JlZF9sZW47XHQvLyBsZW5ndGggb2YgaW5wdXQgYmxvY2tcblxuICAgIHN0b3JlZF9sZW4gPSB6aXBfc3Ryc3RhcnQgLSB6aXBfYmxvY2tfc3RhcnQ7XG4gICAgemlwX2ZsYWdfYnVmW3ppcF9sYXN0X2ZsYWdzXSA9IHppcF9mbGFnczsgLy8gU2F2ZSB0aGUgZmxhZ3MgZm9yIHRoZSBsYXN0IDggaXRlbXNcblxuICAgIC8vIENvbnN0cnVjdCB0aGUgbGl0ZXJhbCBhbmQgZGlzdGFuY2UgdHJlZXNcbiAgICB6aXBfYnVpbGRfdHJlZSh6aXBfbF9kZXNjKTtcbi8vICAgIFRyYWNldigoc3RkZXJyLCBcIlxcbmxpdCBkYXRhOiBkeW4gJWxkLCBzdGF0ICVsZFwiLFxuLy9cdCAgICBlbmNvZGVyLT5vcHRfbGVuLCBlbmNvZGVyLT5zdGF0aWNfbGVuKSk7XG5cbiAgICB6aXBfYnVpbGRfdHJlZSh6aXBfZF9kZXNjKTtcbi8vICAgIFRyYWNldigoc3RkZXJyLCBcIlxcbmRpc3QgZGF0YTogZHluICVsZCwgc3RhdCAlbGRcIixcbi8vXHQgICAgZW5jb2Rlci0+b3B0X2xlbiwgZW5jb2Rlci0+c3RhdGljX2xlbikpO1xuICAgIC8qIEF0IHRoaXMgcG9pbnQsIG9wdF9sZW4gYW5kIHN0YXRpY19sZW4gYXJlIHRoZSB0b3RhbCBiaXQgbGVuZ3RocyBvZlxuICAgICAqIHRoZSBjb21wcmVzc2VkIGJsb2NrIGRhdGEsIGV4Y2x1ZGluZyB0aGUgdHJlZSByZXByZXNlbnRhdGlvbnMuXG4gICAgICovXG5cbiAgICAvKiBCdWlsZCB0aGUgYml0IGxlbmd0aCB0cmVlIGZvciB0aGUgYWJvdmUgdHdvIHRyZWVzLCBhbmQgZ2V0IHRoZSBpbmRleFxuICAgICAqIGluIGJsX29yZGVyIG9mIHRoZSBsYXN0IGJpdCBsZW5ndGggY29kZSB0byBzZW5kLlxuICAgICAqL1xuICAgIG1heF9ibGluZGV4ID0gemlwX2J1aWxkX2JsX3RyZWUoKTtcblxuICAgIC8vIERldGVybWluZSB0aGUgYmVzdCBlbmNvZGluZy4gQ29tcHV0ZSBmaXJzdCB0aGUgYmxvY2sgbGVuZ3RoIGluIGJ5dGVzXG4gICAgb3B0X2xlbmJcdD0gKHppcF9vcHRfbGVuICAgKzMrNyk+PjM7XG4gICAgc3RhdGljX2xlbmIgPSAoemlwX3N0YXRpY19sZW4rMys3KT4+MztcblxuLy8gICAgVHJhY2UoKHN0ZGVyciwgXCJcXG5vcHQgJWx1KCVsdSkgc3RhdCAlbHUoJWx1KSBzdG9yZWQgJWx1IGxpdCAldSBkaXN0ICV1IFwiLFxuLy9cdCAgIG9wdF9sZW5iLCBlbmNvZGVyLT5vcHRfbGVuLFxuLy9cdCAgIHN0YXRpY19sZW5iLCBlbmNvZGVyLT5zdGF0aWNfbGVuLCBzdG9yZWRfbGVuLFxuLy9cdCAgIGVuY29kZXItPmxhc3RfbGl0LCBlbmNvZGVyLT5sYXN0X2Rpc3QpKTtcblxuICAgIGlmKHN0YXRpY19sZW5iIDw9IG9wdF9sZW5iKVxuXHRvcHRfbGVuYiA9IHN0YXRpY19sZW5iO1xuICAgIGlmKHN0b3JlZF9sZW4gKyA0IDw9IG9wdF9sZW5iIC8vIDQ6IHR3byB3b3JkcyBmb3IgdGhlIGxlbmd0aHNcbiAgICAgICAmJiB6aXBfYmxvY2tfc3RhcnQgPj0gMCkge1xuXHR2YXIgaTtcblxuXHQvKiBUaGUgdGVzdCBidWYgIT0gTlVMTCBpcyBvbmx5IG5lY2Vzc2FyeSBpZiBMSVRfQlVGU0laRSA+IFdTSVpFLlxuXHQgKiBPdGhlcndpc2Ugd2UgY2FuJ3QgaGF2ZSBwcm9jZXNzZWQgbW9yZSB0aGFuIFdTSVpFIGlucHV0IGJ5dGVzIHNpbmNlXG5cdCAqIHRoZSBsYXN0IGJsb2NrIGZsdXNoLCBiZWNhdXNlIGNvbXByZXNzaW9uIHdvdWxkIGhhdmUgYmVlblxuXHQgKiBzdWNjZXNzZnVsLiBJZiBMSVRfQlVGU0laRSA8PSBXU0laRSwgaXQgaXMgbmV2ZXIgdG9vIGxhdGUgdG9cblx0ICogdHJhbnNmb3JtIGEgYmxvY2sgaW50byBhIHN0b3JlZCBibG9jay5cblx0ICovXG5cdHppcF9zZW5kX2JpdHMoKHppcF9TVE9SRURfQkxPQ0s8PDEpK2VvZiwgMyk7ICAvKiBzZW5kIGJsb2NrIHR5cGUgKi9cblx0emlwX2JpX3dpbmR1cCgpO1x0XHQgLyogYWxpZ24gb24gYnl0ZSBib3VuZGFyeSAqL1xuXHR6aXBfcHV0X3Nob3J0KHN0b3JlZF9sZW4pO1xuXHR6aXBfcHV0X3Nob3J0KH5zdG9yZWRfbGVuKTtcblxuICAgICAgLy8gY29weSBibG9ja1xuLypcbiAgICAgIHAgPSAmd2luZG93W2Jsb2NrX3N0YXJ0XTtcbiAgICAgIGZvcihpID0gMDsgaSA8IHN0b3JlZF9sZW47IGkrKylcblx0cHV0X2J5dGUocFtpXSk7XG4qL1xuXHRmb3IoaSA9IDA7IGkgPCBzdG9yZWRfbGVuOyBpKyspXG5cdCAgICB6aXBfcHV0X2J5dGUoemlwX3dpbmRvd1t6aXBfYmxvY2tfc3RhcnQgKyBpXSk7XG5cbiAgICB9IGVsc2UgaWYoc3RhdGljX2xlbmIgPT0gb3B0X2xlbmIpIHtcblx0emlwX3NlbmRfYml0cygoemlwX1NUQVRJQ19UUkVFUzw8MSkrZW9mLCAzKTtcblx0emlwX2NvbXByZXNzX2Jsb2NrKHppcF9zdGF0aWNfbHRyZWUsIHppcF9zdGF0aWNfZHRyZWUpO1xuICAgIH0gZWxzZSB7XG5cdHppcF9zZW5kX2JpdHMoKHppcF9EWU5fVFJFRVM8PDEpK2VvZiwgMyk7XG5cdHppcF9zZW5kX2FsbF90cmVlcyh6aXBfbF9kZXNjLm1heF9jb2RlKzEsXG5cdFx0XHQgICB6aXBfZF9kZXNjLm1heF9jb2RlKzEsXG5cdFx0XHQgICBtYXhfYmxpbmRleCsxKTtcblx0emlwX2NvbXByZXNzX2Jsb2NrKHppcF9keW5fbHRyZWUsIHppcF9keW5fZHRyZWUpO1xuICAgIH1cblxuICAgIHppcF9pbml0X2Jsb2NrKCk7XG5cbiAgICBpZihlb2YgIT0gMClcblx0emlwX2JpX3dpbmR1cCgpO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogU2F2ZSB0aGUgbWF0Y2ggaW5mbyBhbmQgdGFsbHkgdGhlIGZyZXF1ZW5jeSBjb3VudHMuIFJldHVybiB0cnVlIGlmXG4gKiB0aGUgY3VycmVudCBibG9jayBtdXN0IGJlIGZsdXNoZWQuXG4gKi9cbnZhciB6aXBfY3RfdGFsbHkgPSBmdW5jdGlvbihcblx0ZGlzdCwgLy8gZGlzdGFuY2Ugb2YgbWF0Y2hlZCBzdHJpbmdcblx0bGMpIHsgLy8gbWF0Y2ggbGVuZ3RoLU1JTl9NQVRDSCBvciB1bm1hdGNoZWQgY2hhciAoaWYgZGlzdD09MClcbiAgICB6aXBfbF9idWZbemlwX2xhc3RfbGl0KytdID0gbGM7XG4gICAgaWYoZGlzdCA9PSAwKSB7XG5cdC8vIGxjIGlzIHRoZSB1bm1hdGNoZWQgY2hhclxuXHR6aXBfZHluX2x0cmVlW2xjXS5mYysrO1xuICAgIH0gZWxzZSB7XG5cdC8vIEhlcmUsIGxjIGlzIHRoZSBtYXRjaCBsZW5ndGggLSBNSU5fTUFUQ0hcblx0ZGlzdC0tO1x0XHQgICAgLy8gZGlzdCA9IG1hdGNoIGRpc3RhbmNlIC0gMVxuLy8gICAgICBBc3NlcnQoKHVzaClkaXN0IDwgKHVzaClNQVhfRElTVCAmJlxuLy9cdCAgICAgKHVzaClsYyA8PSAodXNoKShNQVhfTUFUQ0gtTUlOX01BVENIKSAmJlxuLy9cdCAgICAgKHVzaClEX0NPREUoZGlzdCkgPCAodXNoKURfQ09ERVMsICBcImN0X3RhbGx5OiBiYWQgbWF0Y2hcIik7XG5cblx0emlwX2R5bl9sdHJlZVt6aXBfbGVuZ3RoX2NvZGVbbGNdK3ppcF9MSVRFUkFMUysxXS5mYysrO1xuXHR6aXBfZHluX2R0cmVlW3ppcF9EX0NPREUoZGlzdCldLmZjKys7XG5cblx0emlwX2RfYnVmW3ppcF9sYXN0X2Rpc3QrK10gPSBkaXN0O1xuXHR6aXBfZmxhZ3MgfD0gemlwX2ZsYWdfYml0O1xuICAgIH1cbiAgICB6aXBfZmxhZ19iaXQgPDw9IDE7XG5cbiAgICAvLyBPdXRwdXQgdGhlIGZsYWdzIGlmIHRoZXkgZmlsbCBhIGJ5dGVcbiAgICBpZigoemlwX2xhc3RfbGl0ICYgNykgPT0gMCkge1xuXHR6aXBfZmxhZ19idWZbemlwX2xhc3RfZmxhZ3MrK10gPSB6aXBfZmxhZ3M7XG5cdHppcF9mbGFncyA9IDA7XG5cdHppcF9mbGFnX2JpdCA9IDE7XG4gICAgfVxuICAgIC8vIFRyeSB0byBndWVzcyBpZiBpdCBpcyBwcm9maXRhYmxlIHRvIHN0b3AgdGhlIGN1cnJlbnQgYmxvY2sgaGVyZVxuICAgIGlmKHppcF9jb21wcl9sZXZlbCA+IDIgJiYgKHppcF9sYXN0X2xpdCAmIDB4ZmZmKSA9PSAwKSB7XG5cdC8vIENvbXB1dGUgYW4gdXBwZXIgYm91bmQgZm9yIHRoZSBjb21wcmVzc2VkIGxlbmd0aFxuXHR2YXIgb3V0X2xlbmd0aCA9IHppcF9sYXN0X2xpdCAqIDg7XG5cdHZhciBpbl9sZW5ndGggPSB6aXBfc3Ryc3RhcnQgLSB6aXBfYmxvY2tfc3RhcnQ7XG5cdHZhciBkY29kZTtcblxuXHRmb3IoZGNvZGUgPSAwOyBkY29kZSA8IHppcF9EX0NPREVTOyBkY29kZSsrKSB7XG5cdCAgICBvdXRfbGVuZ3RoICs9IHppcF9keW5fZHRyZWVbZGNvZGVdLmZjICogKDUgKyB6aXBfZXh0cmFfZGJpdHNbZGNvZGVdKTtcblx0fVxuXHRvdXRfbGVuZ3RoID4+PSAzO1xuLy8gICAgICBUcmFjZSgoc3RkZXJyLFwiXFxubGFzdF9saXQgJXUsIGxhc3RfZGlzdCAldSwgaW4gJWxkLCBvdXQgfiVsZCglbGQlJSkgXCIsXG4vL1x0ICAgICBlbmNvZGVyLT5sYXN0X2xpdCwgZW5jb2Rlci0+bGFzdF9kaXN0LCBpbl9sZW5ndGgsIG91dF9sZW5ndGgsXG4vL1x0ICAgICAxMDBMIC0gb3V0X2xlbmd0aCoxMDBML2luX2xlbmd0aCkpO1xuXHRpZih6aXBfbGFzdF9kaXN0IDwgcGFyc2VJbnQoemlwX2xhc3RfbGl0LzIpICYmXG5cdCAgIG91dF9sZW5ndGggPCBwYXJzZUludChpbl9sZW5ndGgvMikpXG5cdCAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuICh6aXBfbGFzdF9saXQgPT0gemlwX0xJVF9CVUZTSVpFLTEgfHxcblx0ICAgIHppcF9sYXN0X2Rpc3QgPT0gemlwX0RJU1RfQlVGU0laRSk7XG4gICAgLyogV2UgYXZvaWQgZXF1YWxpdHkgd2l0aCBMSVRfQlVGU0laRSBiZWNhdXNlIG9mIHdyYXBhcm91bmQgYXQgNjRLXG4gICAgICogb24gMTYgYml0IG1hY2hpbmVzIGFuZCBiZWNhdXNlIHN0b3JlZCBibG9ja3MgYXJlIHJlc3RyaWN0ZWQgdG9cbiAgICAgKiA2NEstMSBieXRlcy5cbiAgICAgKi9cbn1cblxuICAvKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgKiBTZW5kIHRoZSBibG9jayBkYXRhIGNvbXByZXNzZWQgdXNpbmcgdGhlIGdpdmVuIEh1ZmZtYW4gdHJlZXNcbiAgICovXG52YXIgemlwX2NvbXByZXNzX2Jsb2NrID0gZnVuY3Rpb24oXG5cdGx0cmVlLFx0Ly8gbGl0ZXJhbCB0cmVlXG5cdGR0cmVlKSB7XHQvLyBkaXN0YW5jZSB0cmVlXG4gICAgdmFyIGRpc3Q7XHRcdC8vIGRpc3RhbmNlIG9mIG1hdGNoZWQgc3RyaW5nXG4gICAgdmFyIGxjO1x0XHQvLyBtYXRjaCBsZW5ndGggb3IgdW5tYXRjaGVkIGNoYXIgKGlmIGRpc3QgPT0gMClcbiAgICB2YXIgbHggPSAwO1x0XHQvLyBydW5uaW5nIGluZGV4IGluIGxfYnVmXG4gICAgdmFyIGR4ID0gMDtcdFx0Ly8gcnVubmluZyBpbmRleCBpbiBkX2J1ZlxuICAgIHZhciBmeCA9IDA7XHRcdC8vIHJ1bm5pbmcgaW5kZXggaW4gZmxhZ19idWZcbiAgICB2YXIgZmxhZyA9IDA7XHQvLyBjdXJyZW50IGZsYWdzXG4gICAgdmFyIGNvZGU7XHRcdC8vIHRoZSBjb2RlIHRvIHNlbmRcbiAgICB2YXIgZXh0cmE7XHRcdC8vIG51bWJlciBvZiBleHRyYSBiaXRzIHRvIHNlbmRcblxuICAgIGlmKHppcF9sYXN0X2xpdCAhPSAwKSBkbyB7XG5cdGlmKChseCAmIDcpID09IDApXG5cdCAgICBmbGFnID0gemlwX2ZsYWdfYnVmW2Z4KytdO1xuXHRsYyA9IHppcF9sX2J1ZltseCsrXSAmIDB4ZmY7XG5cdGlmKChmbGFnICYgMSkgPT0gMCkge1xuXHQgICAgemlwX1NFTkRfQ09ERShsYywgbHRyZWUpOyAvKiBzZW5kIGEgbGl0ZXJhbCBieXRlICovXG4vL1x0VHJhY2Vjdihpc2dyYXBoKGxjKSwgKHN0ZGVycixcIiAnJWMnIFwiLCBsYykpO1xuXHR9IGVsc2Uge1xuXHQgICAgLy8gSGVyZSwgbGMgaXMgdGhlIG1hdGNoIGxlbmd0aCAtIE1JTl9NQVRDSFxuXHQgICAgY29kZSA9IHppcF9sZW5ndGhfY29kZVtsY107XG5cdCAgICB6aXBfU0VORF9DT0RFKGNvZGUremlwX0xJVEVSQUxTKzEsIGx0cmVlKTsgLy8gc2VuZCB0aGUgbGVuZ3RoIGNvZGVcblx0ICAgIGV4dHJhID0gemlwX2V4dHJhX2xiaXRzW2NvZGVdO1xuXHQgICAgaWYoZXh0cmEgIT0gMCkge1xuXHRcdGxjIC09IHppcF9iYXNlX2xlbmd0aFtjb2RlXTtcblx0XHR6aXBfc2VuZF9iaXRzKGxjLCBleHRyYSk7IC8vIHNlbmQgdGhlIGV4dHJhIGxlbmd0aCBiaXRzXG5cdCAgICB9XG5cdCAgICBkaXN0ID0gemlwX2RfYnVmW2R4KytdO1xuXHQgICAgLy8gSGVyZSwgZGlzdCBpcyB0aGUgbWF0Y2ggZGlzdGFuY2UgLSAxXG5cdCAgICBjb2RlID0gemlwX0RfQ09ERShkaXN0KTtcbi8vXHRBc3NlcnQgKGNvZGUgPCBEX0NPREVTLCBcImJhZCBkX2NvZGVcIik7XG5cblx0ICAgIHppcF9TRU5EX0NPREUoY29kZSwgZHRyZWUpO1x0ICAvLyBzZW5kIHRoZSBkaXN0YW5jZSBjb2RlXG5cdCAgICBleHRyYSA9IHppcF9leHRyYV9kYml0c1tjb2RlXTtcblx0ICAgIGlmKGV4dHJhICE9IDApIHtcblx0XHRkaXN0IC09IHppcF9iYXNlX2Rpc3RbY29kZV07XG5cdFx0emlwX3NlbmRfYml0cyhkaXN0LCBleHRyYSk7ICAgLy8gc2VuZCB0aGUgZXh0cmEgZGlzdGFuY2UgYml0c1xuXHQgICAgfVxuXHR9IC8vIGxpdGVyYWwgb3IgbWF0Y2ggcGFpciA/XG5cdGZsYWcgPj49IDE7XG4gICAgfSB3aGlsZShseCA8IHppcF9sYXN0X2xpdCk7XG5cbiAgICB6aXBfU0VORF9DT0RFKHppcF9FTkRfQkxPQ0ssIGx0cmVlKTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFNlbmQgYSB2YWx1ZSBvbiBhIGdpdmVuIG51bWJlciBvZiBiaXRzLlxuICogSU4gYXNzZXJ0aW9uOiBsZW5ndGggPD0gMTYgYW5kIHZhbHVlIGZpdHMgaW4gbGVuZ3RoIGJpdHMuXG4gKi9cbnZhciB6aXBfQnVmX3NpemUgPSAxNjsgLy8gYml0IHNpemUgb2YgYmlfYnVmXG52YXIgemlwX3NlbmRfYml0cyA9IGZ1bmN0aW9uKFxuXHR2YWx1ZSxcdC8vIHZhbHVlIHRvIHNlbmRcblx0bGVuZ3RoKSB7XHQvLyBudW1iZXIgb2YgYml0c1xuICAgIC8qIElmIG5vdCBlbm91Z2ggcm9vbSBpbiBiaV9idWYsIHVzZSAodmFsaWQpIGJpdHMgZnJvbSBiaV9idWYgYW5kXG4gICAgICogKDE2IC0gYmlfdmFsaWQpIGJpdHMgZnJvbSB2YWx1ZSwgbGVhdmluZyAod2lkdGggLSAoMTYtYmlfdmFsaWQpKVxuICAgICAqIHVudXNlZCBiaXRzIGluIHZhbHVlLlxuICAgICAqL1xuICAgIGlmKHppcF9iaV92YWxpZCA+IHppcF9CdWZfc2l6ZSAtIGxlbmd0aCkge1xuXHR6aXBfYmlfYnVmIHw9ICh2YWx1ZSA8PCB6aXBfYmlfdmFsaWQpO1xuXHR6aXBfcHV0X3Nob3J0KHppcF9iaV9idWYpO1xuXHR6aXBfYmlfYnVmID0gKHZhbHVlID4+ICh6aXBfQnVmX3NpemUgLSB6aXBfYmlfdmFsaWQpKTtcblx0emlwX2JpX3ZhbGlkICs9IGxlbmd0aCAtIHppcF9CdWZfc2l6ZTtcbiAgICB9IGVsc2Uge1xuXHR6aXBfYmlfYnVmIHw9IHZhbHVlIDw8IHppcF9iaV92YWxpZDtcblx0emlwX2JpX3ZhbGlkICs9IGxlbmd0aDtcbiAgICB9XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBSZXZlcnNlIHRoZSBmaXJzdCBsZW4gYml0cyBvZiBhIGNvZGUsIHVzaW5nIHN0cmFpZ2h0Zm9yd2FyZCBjb2RlIChhIGZhc3RlclxuICogbWV0aG9kIHdvdWxkIHVzZSBhIHRhYmxlKVxuICogSU4gYXNzZXJ0aW9uOiAxIDw9IGxlbiA8PSAxNVxuICovXG52YXIgemlwX2JpX3JldmVyc2UgPSBmdW5jdGlvbihcblx0Y29kZSxcdC8vIHRoZSB2YWx1ZSB0byBpbnZlcnRcblx0bGVuKSB7XHQvLyBpdHMgYml0IGxlbmd0aFxuICAgIHZhciByZXMgPSAwO1xuICAgIGRvIHtcblx0cmVzIHw9IGNvZGUgJiAxO1xuXHRjb2RlID4+PSAxO1xuXHRyZXMgPDw9IDE7XG4gICAgfSB3aGlsZSgtLWxlbiA+IDApO1xuICAgIHJldHVybiByZXMgPj4gMTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFdyaXRlIG91dCBhbnkgcmVtYWluaW5nIGJpdHMgaW4gYW4gaW5jb21wbGV0ZSBieXRlLlxuICovXG52YXIgemlwX2JpX3dpbmR1cCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmKHppcF9iaV92YWxpZCA+IDgpIHtcblx0emlwX3B1dF9zaG9ydCh6aXBfYmlfYnVmKTtcbiAgICB9IGVsc2UgaWYoemlwX2JpX3ZhbGlkID4gMCkge1xuXHR6aXBfcHV0X2J5dGUoemlwX2JpX2J1Zik7XG4gICAgfVxuICAgIHppcF9iaV9idWYgPSAwO1xuICAgIHppcF9iaV92YWxpZCA9IDA7XG59XG5cbnZhciB6aXBfcW91dGJ1ZiA9IGZ1bmN0aW9uKCkge1xuICAgIGlmKHppcF9vdXRjbnQgIT0gMCkge1xuXHR2YXIgcSwgaTtcblx0cSA9IHppcF9uZXdfcXVldWUoKTtcblx0aWYoemlwX3FoZWFkID09IG51bGwpXG5cdCAgICB6aXBfcWhlYWQgPSB6aXBfcXRhaWwgPSBxO1xuXHRlbHNlXG5cdCAgICB6aXBfcXRhaWwgPSB6aXBfcXRhaWwubmV4dCA9IHE7XG5cdHEubGVuID0gemlwX291dGNudCAtIHppcF9vdXRvZmY7XG4vLyAgICAgIFN5c3RlbS5hcnJheWNvcHkoemlwX291dGJ1ZiwgemlwX291dG9mZiwgcS5wdHIsIDAsIHEubGVuKTtcblx0Zm9yKGkgPSAwOyBpIDwgcS5sZW47IGkrKylcblx0ICAgIHEucHRyW2ldID0gemlwX291dGJ1Zlt6aXBfb3V0b2ZmICsgaV07XG5cdHppcF9vdXRjbnQgPSB6aXBfb3V0b2ZmID0gMDtcbiAgICB9XG59XG5cbnZhciB6aXBfZGVmbGF0ZSA9IGZ1bmN0aW9uKHN0ciwgbGV2ZWwpIHtcbiAgICB2YXIgaSwgajtcblxuICAgIHppcF9kZWZsYXRlX2RhdGEgPSBzdHI7XG4gICAgemlwX2RlZmxhdGVfcG9zID0gMDtcbiAgICBpZih0eXBlb2YgbGV2ZWwgPT0gXCJ1bmRlZmluZWRcIilcblx0bGV2ZWwgPSB6aXBfREVGQVVMVF9MRVZFTDtcbiAgICB6aXBfZGVmbGF0ZV9zdGFydChsZXZlbCk7XG5cbiAgICB2YXIgYnVmZiA9IG5ldyBBcnJheSgxMDI0KTtcbiAgICB2YXIgYW91dCA9IFtdO1xuICAgIHdoaWxlKChpID0gemlwX2RlZmxhdGVfaW50ZXJuYWwoYnVmZiwgMCwgYnVmZi5sZW5ndGgpKSA+IDApIHtcblx0dmFyIGNidWYgPSBuZXcgQXJyYXkoaSk7XG5cdGZvcihqID0gMDsgaiA8IGk7IGorKyl7XG5cdCAgICBjYnVmW2pdID0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZmW2pdKTtcblx0fVxuXHRhb3V0W2FvdXQubGVuZ3RoXSA9IGNidWYuam9pbihcIlwiKTtcbiAgICB9XG4gICAgemlwX2RlZmxhdGVfZGF0YSA9IG51bGw7IC8vIEcuQy5cbiAgICByZXR1cm4gYW91dC5qb2luKFwiXCIpO1xufVxuXG5pZiAoISBjdHguUmF3RGVmbGF0ZSkgY3R4LlJhd0RlZmxhdGUgPSB7fTtcbmN0eC5SYXdEZWZsYXRlLmRlZmxhdGUgPSB6aXBfZGVmbGF0ZTtcblxufSkodGhpcyk7XG4iLCIvKlxuICogJElkOiByYXdpbmZsYXRlLmpzLHYgMC4zIDIwMTMvMDQvMDkgMTQ6MjU6MzggZGFua29nYWkgRXhwIGRhbmtvZ2FpICRcbiAqXG4gKiBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSwgdmVyc2lvbiAyIChHUEwtMi4wKVxuICogICBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvR1BMLTIuMFxuICogb3JpZ2luYWw6XG4gKiAgIGh0dHA6Ly93d3cub25pY29zLmNvbS9zdGFmZi9pei9hbXVzZS9qYXZhc2NyaXB0L2V4cGVydC9pbmZsYXRlLnR4dFxuICovXG5cbihmdW5jdGlvbihjdHgpe1xuXG4vKiBDb3B5cmlnaHQgKEMpIDE5OTkgTWFzYW5hbyBJenVtbyA8aXpAb25pY29zLmNvLmpwPlxuICogVmVyc2lvbjogMS4wLjAuMVxuICogTGFzdE1vZGlmaWVkOiBEZWMgMjUgMTk5OVxuICovXG5cbi8qIEludGVyZmFjZTpcbiAqIGRhdGEgPSB6aXBfaW5mbGF0ZShzcmMpO1xuICovXG5cbi8qIGNvbnN0YW50IHBhcmFtZXRlcnMgKi9cbnZhciB6aXBfV1NJWkUgPSAzMjc2ODtcdFx0Ly8gU2xpZGluZyBXaW5kb3cgc2l6ZVxudmFyIHppcF9TVE9SRURfQkxPQ0sgPSAwO1xudmFyIHppcF9TVEFUSUNfVFJFRVMgPSAxO1xudmFyIHppcF9EWU5fVFJFRVMgICAgPSAyO1xuXG4vKiBmb3IgaW5mbGF0ZSAqL1xudmFyIHppcF9sYml0cyA9IDk7IFx0XHQvLyBiaXRzIGluIGJhc2UgbGl0ZXJhbC9sZW5ndGggbG9va3VwIHRhYmxlXG52YXIgemlwX2RiaXRzID0gNjsgXHRcdC8vIGJpdHMgaW4gYmFzZSBkaXN0YW5jZSBsb29rdXAgdGFibGVcbnZhciB6aXBfSU5CVUZTSVogPSAzMjc2ODtcdC8vIElucHV0IGJ1ZmZlciBzaXplXG52YXIgemlwX0lOQlVGX0VYVFJBID0gNjQ7XHQvLyBFeHRyYSBidWZmZXJcblxuLyogdmFyaWFibGVzIChpbmZsYXRlKSAqL1xudmFyIHppcF9zbGlkZTtcbnZhciB6aXBfd3A7XHRcdFx0Ly8gY3VycmVudCBwb3NpdGlvbiBpbiBzbGlkZVxudmFyIHppcF9maXhlZF90bCA9IG51bGw7XHQvLyBpbmZsYXRlIHN0YXRpY1xudmFyIHppcF9maXhlZF90ZDtcdFx0Ly8gaW5mbGF0ZSBzdGF0aWNcbnZhciB6aXBfZml4ZWRfYmwsIHppcF9maXhlZF9iZDtcdC8vIGluZmxhdGUgc3RhdGljXG52YXIgemlwX2JpdF9idWY7XHRcdC8vIGJpdCBidWZmZXJcbnZhciB6aXBfYml0X2xlbjtcdFx0Ly8gYml0cyBpbiBiaXQgYnVmZmVyXG52YXIgemlwX21ldGhvZDtcbnZhciB6aXBfZW9mO1xudmFyIHppcF9jb3B5X2xlbmc7XG52YXIgemlwX2NvcHlfZGlzdDtcbnZhciB6aXBfdGwsIHppcF90ZDtcdC8vIGxpdGVyYWwvbGVuZ3RoIGFuZCBkaXN0YW5jZSBkZWNvZGVyIHRhYmxlc1xudmFyIHppcF9ibCwgemlwX2JkO1x0Ly8gbnVtYmVyIG9mIGJpdHMgZGVjb2RlZCBieSB0bCBhbmQgdGRcblxudmFyIHppcF9pbmZsYXRlX2RhdGE7XG52YXIgemlwX2luZmxhdGVfcG9zO1xuXG5cbi8qIGNvbnN0YW50IHRhYmxlcyAoaW5mbGF0ZSkgKi9cbnZhciB6aXBfTUFTS19CSVRTID0gbmV3IEFycmF5KFxuICAgIDB4MDAwMCxcbiAgICAweDAwMDEsIDB4MDAwMywgMHgwMDA3LCAweDAwMGYsIDB4MDAxZiwgMHgwMDNmLCAweDAwN2YsIDB4MDBmZixcbiAgICAweDAxZmYsIDB4MDNmZiwgMHgwN2ZmLCAweDBmZmYsIDB4MWZmZiwgMHgzZmZmLCAweDdmZmYsIDB4ZmZmZik7XG4vLyBUYWJsZXMgZm9yIGRlZmxhdGUgZnJvbSBQS1pJUCdzIGFwcG5vdGUudHh0LlxudmFyIHppcF9jcGxlbnMgPSBuZXcgQXJyYXkoIC8vIENvcHkgbGVuZ3RocyBmb3IgbGl0ZXJhbCBjb2RlcyAyNTcuLjI4NVxuICAgIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwLCAxMSwgMTMsIDE1LCAxNywgMTksIDIzLCAyNywgMzEsXG4gICAgMzUsIDQzLCA1MSwgNTksIDY3LCA4MywgOTksIDExNSwgMTMxLCAxNjMsIDE5NSwgMjI3LCAyNTgsIDAsIDApO1xuLyogbm90ZTogc2VlIG5vdGUgIzEzIGFib3ZlIGFib3V0IHRoZSAyNTggaW4gdGhpcyBsaXN0LiAqL1xudmFyIHppcF9jcGxleHQgPSBuZXcgQXJyYXkoIC8vIEV4dHJhIGJpdHMgZm9yIGxpdGVyYWwgY29kZXMgMjU3Li4yODVcbiAgICAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAxLCAxLCAxLCAxLCAyLCAyLCAyLCAyLFxuICAgIDMsIDMsIDMsIDMsIDQsIDQsIDQsIDQsIDUsIDUsIDUsIDUsIDAsIDk5LCA5OSk7IC8vIDk5PT1pbnZhbGlkXG52YXIgemlwX2NwZGlzdCA9IG5ldyBBcnJheSggLy8gQ29weSBvZmZzZXRzIGZvciBkaXN0YW5jZSBjb2RlcyAwLi4yOVxuICAgIDEsIDIsIDMsIDQsIDUsIDcsIDksIDEzLCAxNywgMjUsIDMzLCA0OSwgNjUsIDk3LCAxMjksIDE5MyxcbiAgICAyNTcsIDM4NSwgNTEzLCA3NjksIDEwMjUsIDE1MzcsIDIwNDksIDMwNzMsIDQwOTcsIDYxNDUsXG4gICAgODE5MywgMTIyODksIDE2Mzg1LCAyNDU3Nyk7XG52YXIgemlwX2NwZGV4dCA9IG5ldyBBcnJheSggLy8gRXh0cmEgYml0cyBmb3IgZGlzdGFuY2UgY29kZXNcbiAgICAwLCAwLCAwLCAwLCAxLCAxLCAyLCAyLCAzLCAzLCA0LCA0LCA1LCA1LCA2LCA2LFxuICAgIDcsIDcsIDgsIDgsIDksIDksIDEwLCAxMCwgMTEsIDExLFxuICAgIDEyLCAxMiwgMTMsIDEzKTtcbnZhciB6aXBfYm9yZGVyID0gbmV3IEFycmF5KCAgLy8gT3JkZXIgb2YgdGhlIGJpdCBsZW5ndGggY29kZSBsZW5ndGhzXG4gICAgMTYsIDE3LCAxOCwgMCwgOCwgNywgOSwgNiwgMTAsIDUsIDExLCA0LCAxMiwgMywgMTMsIDIsIDE0LCAxLCAxNSk7XG4vKiBvYmplY3RzIChpbmZsYXRlKSAqL1xuXG52YXIgemlwX0h1ZnRMaXN0ID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5uZXh0ID0gbnVsbDtcbiAgICB0aGlzLmxpc3QgPSBudWxsO1xufVxuXG52YXIgemlwX0h1ZnROb2RlID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5lID0gMDsgLy8gbnVtYmVyIG9mIGV4dHJhIGJpdHMgb3Igb3BlcmF0aW9uXG4gICAgdGhpcy5iID0gMDsgLy8gbnVtYmVyIG9mIGJpdHMgaW4gdGhpcyBjb2RlIG9yIHN1YmNvZGVcblxuICAgIC8vIHVuaW9uXG4gICAgdGhpcy5uID0gMDsgLy8gbGl0ZXJhbCwgbGVuZ3RoIGJhc2UsIG9yIGRpc3RhbmNlIGJhc2VcbiAgICB0aGlzLnQgPSBudWxsOyAvLyAoemlwX0h1ZnROb2RlKSBwb2ludGVyIHRvIG5leHQgbGV2ZWwgb2YgdGFibGVcbn1cblxudmFyIHppcF9IdWZ0QnVpbGQgPSBmdW5jdGlvbihiLFx0Ly8gY29kZSBsZW5ndGhzIGluIGJpdHMgKGFsbCBhc3N1bWVkIDw9IEJNQVgpXG5cdFx0ICAgICAgIG4sXHQvLyBudW1iZXIgb2YgY29kZXMgKGFzc3VtZWQgPD0gTl9NQVgpXG5cdFx0ICAgICAgIHMsXHQvLyBudW1iZXIgb2Ygc2ltcGxlLXZhbHVlZCBjb2RlcyAoMC4ucy0xKVxuXHRcdCAgICAgICBkLFx0Ly8gbGlzdCBvZiBiYXNlIHZhbHVlcyBmb3Igbm9uLXNpbXBsZSBjb2Rlc1xuXHRcdCAgICAgICBlLFx0Ly8gbGlzdCBvZiBleHRyYSBiaXRzIGZvciBub24tc2ltcGxlIGNvZGVzXG5cdFx0ICAgICAgIG1tXHQvLyBtYXhpbXVtIGxvb2t1cCBiaXRzXG5cdFx0ICAgKSB7XG4gICAgdGhpcy5CTUFYID0gMTY7ICAgLy8gbWF4aW11bSBiaXQgbGVuZ3RoIG9mIGFueSBjb2RlXG4gICAgdGhpcy5OX01BWCA9IDI4ODsgLy8gbWF4aW11bSBudW1iZXIgb2YgY29kZXMgaW4gYW55IHNldFxuICAgIHRoaXMuc3RhdHVzID0gMDtcdC8vIDA6IHN1Y2Nlc3MsIDE6IGluY29tcGxldGUgdGFibGUsIDI6IGJhZCBpbnB1dFxuICAgIHRoaXMucm9vdCA9IG51bGw7XHQvLyAoemlwX0h1ZnRMaXN0KSBzdGFydGluZyB0YWJsZVxuICAgIHRoaXMubSA9IDA7XHRcdC8vIG1heGltdW0gbG9va3VwIGJpdHMsIHJldHVybnMgYWN0dWFsXG5cbi8qIEdpdmVuIGEgbGlzdCBvZiBjb2RlIGxlbmd0aHMgYW5kIGEgbWF4aW11bSB0YWJsZSBzaXplLCBtYWtlIGEgc2V0IG9mXG4gICB0YWJsZXMgdG8gZGVjb2RlIHRoYXQgc2V0IG9mIGNvZGVzLlx0UmV0dXJuIHplcm8gb24gc3VjY2Vzcywgb25lIGlmXG4gICB0aGUgZ2l2ZW4gY29kZSBzZXQgaXMgaW5jb21wbGV0ZSAodGhlIHRhYmxlcyBhcmUgc3RpbGwgYnVpbHQgaW4gdGhpc1xuICAgY2FzZSksIHR3byBpZiB0aGUgaW5wdXQgaXMgaW52YWxpZCAoYWxsIHplcm8gbGVuZ3RoIGNvZGVzIG9yIGFuXG4gICBvdmVyc3Vic2NyaWJlZCBzZXQgb2YgbGVuZ3RocyksIGFuZCB0aHJlZSBpZiBub3QgZW5vdWdoIG1lbW9yeS5cbiAgIFRoZSBjb2RlIHdpdGggdmFsdWUgMjU2IGlzIHNwZWNpYWwsIGFuZCB0aGUgdGFibGVzIGFyZSBjb25zdHJ1Y3RlZFxuICAgc28gdGhhdCBubyBiaXRzIGJleW9uZCB0aGF0IGNvZGUgYXJlIGZldGNoZWQgd2hlbiB0aGF0IGNvZGUgaXNcbiAgIGRlY29kZWQuICovXG4gICAge1xuXHR2YXIgYTtcdFx0XHQvLyBjb3VudGVyIGZvciBjb2RlcyBvZiBsZW5ndGgga1xuXHR2YXIgYyA9IG5ldyBBcnJheSh0aGlzLkJNQVgrMSk7XHQvLyBiaXQgbGVuZ3RoIGNvdW50IHRhYmxlXG5cdHZhciBlbDtcdFx0XHQvLyBsZW5ndGggb2YgRU9CIGNvZGUgKHZhbHVlIDI1Nilcblx0dmFyIGY7XHRcdFx0Ly8gaSByZXBlYXRzIGluIHRhYmxlIGV2ZXJ5IGYgZW50cmllc1xuXHR2YXIgZztcdFx0XHQvLyBtYXhpbXVtIGNvZGUgbGVuZ3RoXG5cdHZhciBoO1x0XHRcdC8vIHRhYmxlIGxldmVsXG5cdHZhciBpO1x0XHRcdC8vIGNvdW50ZXIsIGN1cnJlbnQgY29kZVxuXHR2YXIgajtcdFx0XHQvLyBjb3VudGVyXG5cdHZhciBrO1x0XHRcdC8vIG51bWJlciBvZiBiaXRzIGluIGN1cnJlbnQgY29kZVxuXHR2YXIgbHggPSBuZXcgQXJyYXkodGhpcy5CTUFYKzEpO1x0Ly8gc3RhY2sgb2YgYml0cyBwZXIgdGFibGVcblx0dmFyIHA7XHRcdFx0Ly8gcG9pbnRlciBpbnRvIGNbXSwgYltdLCBvciB2W11cblx0dmFyIHBpZHg7XHRcdC8vIGluZGV4IG9mIHBcblx0dmFyIHE7XHRcdFx0Ly8gKHppcF9IdWZ0Tm9kZSkgcG9pbnRzIHRvIGN1cnJlbnQgdGFibGVcblx0dmFyIHIgPSBuZXcgemlwX0h1ZnROb2RlKCk7IC8vIHRhYmxlIGVudHJ5IGZvciBzdHJ1Y3R1cmUgYXNzaWdubWVudFxuXHR2YXIgdSA9IG5ldyBBcnJheSh0aGlzLkJNQVgpOyAvLyB6aXBfSHVmdE5vZGVbQk1BWF1bXSAgdGFibGUgc3RhY2tcblx0dmFyIHYgPSBuZXcgQXJyYXkodGhpcy5OX01BWCk7IC8vIHZhbHVlcyBpbiBvcmRlciBvZiBiaXQgbGVuZ3RoXG5cdHZhciB3O1xuXHR2YXIgeCA9IG5ldyBBcnJheSh0aGlzLkJNQVgrMSk7Ly8gYml0IG9mZnNldHMsIHRoZW4gY29kZSBzdGFja1xuXHR2YXIgeHA7XHRcdFx0Ly8gcG9pbnRlciBpbnRvIHggb3IgY1xuXHR2YXIgeTtcdFx0XHQvLyBudW1iZXIgb2YgZHVtbXkgY29kZXMgYWRkZWRcblx0dmFyIHo7XHRcdFx0Ly8gbnVtYmVyIG9mIGVudHJpZXMgaW4gY3VycmVudCB0YWJsZVxuXHR2YXIgbztcblx0dmFyIHRhaWw7XHRcdC8vICh6aXBfSHVmdExpc3QpXG5cblx0dGFpbCA9IHRoaXMucm9vdCA9IG51bGw7XG5cdGZvcihpID0gMDsgaSA8IGMubGVuZ3RoOyBpKyspXG5cdCAgICBjW2ldID0gMDtcblx0Zm9yKGkgPSAwOyBpIDwgbHgubGVuZ3RoOyBpKyspXG5cdCAgICBseFtpXSA9IDA7XG5cdGZvcihpID0gMDsgaSA8IHUubGVuZ3RoOyBpKyspXG5cdCAgICB1W2ldID0gbnVsbDtcblx0Zm9yKGkgPSAwOyBpIDwgdi5sZW5ndGg7IGkrKylcblx0ICAgIHZbaV0gPSAwO1xuXHRmb3IoaSA9IDA7IGkgPCB4Lmxlbmd0aDsgaSsrKVxuXHQgICAgeFtpXSA9IDA7XG5cblx0Ly8gR2VuZXJhdGUgY291bnRzIGZvciBlYWNoIGJpdCBsZW5ndGhcblx0ZWwgPSBuID4gMjU2ID8gYlsyNTZdIDogdGhpcy5CTUFYOyAvLyBzZXQgbGVuZ3RoIG9mIEVPQiBjb2RlLCBpZiBhbnlcblx0cCA9IGI7IHBpZHggPSAwO1xuXHRpID0gbjtcblx0ZG8ge1xuXHQgICAgY1twW3BpZHhdXSsrO1x0Ly8gYXNzdW1lIGFsbCBlbnRyaWVzIDw9IEJNQVhcblx0ICAgIHBpZHgrKztcblx0fSB3aGlsZSgtLWkgPiAwKTtcblx0aWYoY1swXSA9PSBuKSB7XHQvLyBudWxsIGlucHV0LS1hbGwgemVybyBsZW5ndGggY29kZXNcblx0ICAgIHRoaXMucm9vdCA9IG51bGw7XG5cdCAgICB0aGlzLm0gPSAwO1xuXHQgICAgdGhpcy5zdGF0dXMgPSAwO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0Ly8gRmluZCBtaW5pbXVtIGFuZCBtYXhpbXVtIGxlbmd0aCwgYm91bmQgKm0gYnkgdGhvc2Vcblx0Zm9yKGogPSAxOyBqIDw9IHRoaXMuQk1BWDsgaisrKVxuXHQgICAgaWYoY1tqXSAhPSAwKVxuXHRcdGJyZWFrO1xuXHRrID0gajtcdFx0XHQvLyBtaW5pbXVtIGNvZGUgbGVuZ3RoXG5cdGlmKG1tIDwgailcblx0ICAgIG1tID0gajtcblx0Zm9yKGkgPSB0aGlzLkJNQVg7IGkgIT0gMDsgaS0tKVxuXHQgICAgaWYoY1tpXSAhPSAwKVxuXHRcdGJyZWFrO1xuXHRnID0gaTtcdFx0XHQvLyBtYXhpbXVtIGNvZGUgbGVuZ3RoXG5cdGlmKG1tID4gaSlcblx0ICAgIG1tID0gaTtcblxuXHQvLyBBZGp1c3QgbGFzdCBsZW5ndGggY291bnQgdG8gZmlsbCBvdXQgY29kZXMsIGlmIG5lZWRlZFxuXHRmb3IoeSA9IDEgPDwgajsgaiA8IGk7IGorKywgeSA8PD0gMSlcblx0ICAgIGlmKCh5IC09IGNbal0pIDwgMCkge1xuXHRcdHRoaXMuc3RhdHVzID0gMjtcdC8vIGJhZCBpbnB1dDogbW9yZSBjb2RlcyB0aGFuIGJpdHNcblx0XHR0aGlzLm0gPSBtbTtcblx0XHRyZXR1cm47XG5cdCAgICB9XG5cdGlmKCh5IC09IGNbaV0pIDwgMCkge1xuXHQgICAgdGhpcy5zdGF0dXMgPSAyO1xuXHQgICAgdGhpcy5tID0gbW07XG5cdCAgICByZXR1cm47XG5cdH1cblx0Y1tpXSArPSB5O1xuXG5cdC8vIEdlbmVyYXRlIHN0YXJ0aW5nIG9mZnNldHMgaW50byB0aGUgdmFsdWUgdGFibGUgZm9yIGVhY2ggbGVuZ3RoXG5cdHhbMV0gPSBqID0gMDtcblx0cCA9IGM7XG5cdHBpZHggPSAxO1xuXHR4cCA9IDI7XG5cdHdoaWxlKC0taSA+IDApXHRcdC8vIG5vdGUgdGhhdCBpID09IGcgZnJvbSBhYm92ZVxuXHQgICAgeFt4cCsrXSA9IChqICs9IHBbcGlkeCsrXSk7XG5cblx0Ly8gTWFrZSBhIHRhYmxlIG9mIHZhbHVlcyBpbiBvcmRlciBvZiBiaXQgbGVuZ3Roc1xuXHRwID0gYjsgcGlkeCA9IDA7XG5cdGkgPSAwO1xuXHRkbyB7XG5cdCAgICBpZigoaiA9IHBbcGlkeCsrXSkgIT0gMClcblx0XHR2W3hbal0rK10gPSBpO1xuXHR9IHdoaWxlKCsraSA8IG4pO1xuXHRuID0geFtnXTtcdFx0XHQvLyBzZXQgbiB0byBsZW5ndGggb2YgdlxuXG5cdC8vIEdlbmVyYXRlIHRoZSBIdWZmbWFuIGNvZGVzIGFuZCBmb3IgZWFjaCwgbWFrZSB0aGUgdGFibGUgZW50cmllc1xuXHR4WzBdID0gaSA9IDA7XHRcdC8vIGZpcnN0IEh1ZmZtYW4gY29kZSBpcyB6ZXJvXG5cdHAgPSB2OyBwaWR4ID0gMDtcdFx0Ly8gZ3JhYiB2YWx1ZXMgaW4gYml0IG9yZGVyXG5cdGggPSAtMTtcdFx0XHQvLyBubyB0YWJsZXMgeWV0LS1sZXZlbCAtMVxuXHR3ID0gbHhbMF0gPSAwO1x0XHQvLyBubyBiaXRzIGRlY29kZWQgeWV0XG5cdHEgPSBudWxsO1x0XHRcdC8vIGRpdHRvXG5cdHogPSAwO1x0XHRcdC8vIGRpdHRvXG5cblx0Ly8gZ28gdGhyb3VnaCB0aGUgYml0IGxlbmd0aHMgKGsgYWxyZWFkeSBpcyBiaXRzIGluIHNob3J0ZXN0IGNvZGUpXG5cdGZvcig7IGsgPD0gZzsgaysrKSB7XG5cdCAgICBhID0gY1trXTtcblx0ICAgIHdoaWxlKGEtLSA+IDApIHtcblx0XHQvLyBoZXJlIGkgaXMgdGhlIEh1ZmZtYW4gY29kZSBvZiBsZW5ndGggayBiaXRzIGZvciB2YWx1ZSBwW3BpZHhdXG5cdFx0Ly8gbWFrZSB0YWJsZXMgdXAgdG8gcmVxdWlyZWQgbGV2ZWxcblx0XHR3aGlsZShrID4gdyArIGx4WzEgKyBoXSkge1xuXHRcdCAgICB3ICs9IGx4WzEgKyBoXTsgLy8gYWRkIGJpdHMgYWxyZWFkeSBkZWNvZGVkXG5cdFx0ICAgIGgrKztcblxuXHRcdCAgICAvLyBjb21wdXRlIG1pbmltdW0gc2l6ZSB0YWJsZSBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gKm0gYml0c1xuXHRcdCAgICB6ID0gKHogPSBnIC0gdykgPiBtbSA/IG1tIDogejsgLy8gdXBwZXIgbGltaXRcblx0XHQgICAgaWYoKGYgPSAxIDw8IChqID0gayAtIHcpKSA+IGEgKyAxKSB7IC8vIHRyeSBhIGstdyBiaXQgdGFibGVcblx0XHRcdC8vIHRvbyBmZXcgY29kZXMgZm9yIGstdyBiaXQgdGFibGVcblx0XHRcdGYgLT0gYSArIDE7XHQvLyBkZWR1Y3QgY29kZXMgZnJvbSBwYXR0ZXJucyBsZWZ0XG5cdFx0XHR4cCA9IGs7XG5cdFx0XHR3aGlsZSgrK2ogPCB6KSB7IC8vIHRyeSBzbWFsbGVyIHRhYmxlcyB1cCB0byB6IGJpdHNcblx0XHRcdCAgICBpZigoZiA8PD0gMSkgPD0gY1srK3hwXSlcblx0XHRcdFx0YnJlYWs7XHQvLyBlbm91Z2ggY29kZXMgdG8gdXNlIHVwIGogYml0c1xuXHRcdFx0ICAgIGYgLT0gY1t4cF07XHQvLyBlbHNlIGRlZHVjdCBjb2RlcyBmcm9tIHBhdHRlcm5zXG5cdFx0XHR9XG5cdFx0ICAgIH1cblx0XHQgICAgaWYodyArIGogPiBlbCAmJiB3IDwgZWwpXG5cdFx0XHRqID0gZWwgLSB3O1x0Ly8gbWFrZSBFT0IgY29kZSBlbmQgYXQgdGFibGVcblx0XHQgICAgeiA9IDEgPDwgajtcdC8vIHRhYmxlIGVudHJpZXMgZm9yIGotYml0IHRhYmxlXG5cdFx0ICAgIGx4WzEgKyBoXSA9IGo7IC8vIHNldCB0YWJsZSBzaXplIGluIHN0YWNrXG5cblx0XHQgICAgLy8gYWxsb2NhdGUgYW5kIGxpbmsgaW4gbmV3IHRhYmxlXG5cdFx0ICAgIHEgPSBuZXcgQXJyYXkoeik7XG5cdFx0ICAgIGZvcihvID0gMDsgbyA8IHo7IG8rKykge1xuXHRcdFx0cVtvXSA9IG5ldyB6aXBfSHVmdE5vZGUoKTtcblx0XHQgICAgfVxuXG5cdFx0ICAgIGlmKHRhaWwgPT0gbnVsbClcblx0XHRcdHRhaWwgPSB0aGlzLnJvb3QgPSBuZXcgemlwX0h1ZnRMaXN0KCk7XG5cdFx0ICAgIGVsc2Vcblx0XHRcdHRhaWwgPSB0YWlsLm5leHQgPSBuZXcgemlwX0h1ZnRMaXN0KCk7XG5cdFx0ICAgIHRhaWwubmV4dCA9IG51bGw7XG5cdFx0ICAgIHRhaWwubGlzdCA9IHE7XG5cdFx0ICAgIHVbaF0gPSBxO1x0Ly8gdGFibGUgc3RhcnRzIGFmdGVyIGxpbmtcblxuXHRcdCAgICAvKiBjb25uZWN0IHRvIGxhc3QgdGFibGUsIGlmIHRoZXJlIGlzIG9uZSAqL1xuXHRcdCAgICBpZihoID4gMCkge1xuXHRcdFx0eFtoXSA9IGk7XHRcdC8vIHNhdmUgcGF0dGVybiBmb3IgYmFja2luZyB1cFxuXHRcdFx0ci5iID0gbHhbaF07XHQvLyBiaXRzIHRvIGR1bXAgYmVmb3JlIHRoaXMgdGFibGVcblx0XHRcdHIuZSA9IDE2ICsgajtcdC8vIGJpdHMgaW4gdGhpcyB0YWJsZVxuXHRcdFx0ci50ID0gcTtcdFx0Ly8gcG9pbnRlciB0byB0aGlzIHRhYmxlXG5cdFx0XHRqID0gKGkgJiAoKDEgPDwgdykgLSAxKSkgPj4gKHcgLSBseFtoXSk7XG5cdFx0XHR1W2gtMV1bal0uZSA9IHIuZTtcblx0XHRcdHVbaC0xXVtqXS5iID0gci5iO1xuXHRcdFx0dVtoLTFdW2pdLm4gPSByLm47XG5cdFx0XHR1W2gtMV1bal0udCA9IHIudDtcblx0XHQgICAgfVxuXHRcdH1cblxuXHRcdC8vIHNldCB1cCB0YWJsZSBlbnRyeSBpbiByXG5cdFx0ci5iID0gayAtIHc7XG5cdFx0aWYocGlkeCA+PSBuKVxuXHRcdCAgICByLmUgPSA5OTtcdFx0Ly8gb3V0IG9mIHZhbHVlcy0taW52YWxpZCBjb2RlXG5cdFx0ZWxzZSBpZihwW3BpZHhdIDwgcykge1xuXHRcdCAgICByLmUgPSAocFtwaWR4XSA8IDI1NiA/IDE2IDogMTUpOyAvLyAyNTYgaXMgZW5kLW9mLWJsb2NrIGNvZGVcblx0XHQgICAgci5uID0gcFtwaWR4KytdO1x0Ly8gc2ltcGxlIGNvZGUgaXMganVzdCB0aGUgdmFsdWVcblx0XHR9IGVsc2Uge1xuXHRcdCAgICByLmUgPSBlW3BbcGlkeF0gLSBzXTtcdC8vIG5vbi1zaW1wbGUtLWxvb2sgdXAgaW4gbGlzdHNcblx0XHQgICAgci5uID0gZFtwW3BpZHgrK10gLSBzXTtcblx0XHR9XG5cblx0XHQvLyBmaWxsIGNvZGUtbGlrZSBlbnRyaWVzIHdpdGggciAvL1xuXHRcdGYgPSAxIDw8IChrIC0gdyk7XG5cdFx0Zm9yKGogPSBpID4+IHc7IGogPCB6OyBqICs9IGYpIHtcblx0XHQgICAgcVtqXS5lID0gci5lO1xuXHRcdCAgICBxW2pdLmIgPSByLmI7XG5cdFx0ICAgIHFbal0ubiA9IHIubjtcblx0XHQgICAgcVtqXS50ID0gci50O1xuXHRcdH1cblxuXHRcdC8vIGJhY2t3YXJkcyBpbmNyZW1lbnQgdGhlIGstYml0IGNvZGUgaVxuXHRcdGZvcihqID0gMSA8PCAoayAtIDEpOyAoaSAmIGopICE9IDA7IGogPj49IDEpXG5cdFx0ICAgIGkgXj0gajtcblx0XHRpIF49IGo7XG5cblx0XHQvLyBiYWNrdXAgb3ZlciBmaW5pc2hlZCB0YWJsZXNcblx0XHR3aGlsZSgoaSAmICgoMSA8PCB3KSAtIDEpKSAhPSB4W2hdKSB7XG5cdFx0ICAgIHcgLT0gbHhbaF07XHRcdC8vIGRvbid0IG5lZWQgdG8gdXBkYXRlIHFcblx0XHQgICAgaC0tO1xuXHRcdH1cblx0ICAgIH1cblx0fVxuXG5cdC8qIHJldHVybiBhY3R1YWwgc2l6ZSBvZiBiYXNlIHRhYmxlICovXG5cdHRoaXMubSA9IGx4WzFdO1xuXG5cdC8qIFJldHVybiB0cnVlICgxKSBpZiB3ZSB3ZXJlIGdpdmVuIGFuIGluY29tcGxldGUgdGFibGUgKi9cblx0dGhpcy5zdGF0dXMgPSAoKHkgIT0gMCAmJiBnICE9IDEpID8gMSA6IDApO1xuICAgIH0gLyogZW5kIG9mIGNvbnN0cnVjdG9yICovXG59XG5cblxuLyogcm91dGluZXMgKGluZmxhdGUpICovXG5cbnZhciB6aXBfR0VUX0JZVEUgPSBmdW5jdGlvbigpIHtcbiAgICBpZih6aXBfaW5mbGF0ZV9kYXRhLmxlbmd0aCA9PSB6aXBfaW5mbGF0ZV9wb3MpXG5cdHJldHVybiAtMTtcbiAgICByZXR1cm4gemlwX2luZmxhdGVfZGF0YS5jaGFyQ29kZUF0KHppcF9pbmZsYXRlX3BvcysrKSAmIDB4ZmY7XG59XG5cbnZhciB6aXBfTkVFREJJVFMgPSBmdW5jdGlvbihuKSB7XG4gICAgd2hpbGUoemlwX2JpdF9sZW4gPCBuKSB7XG5cdHppcF9iaXRfYnVmIHw9IHppcF9HRVRfQllURSgpIDw8IHppcF9iaXRfbGVuO1xuXHR6aXBfYml0X2xlbiArPSA4O1xuICAgIH1cbn1cblxudmFyIHppcF9HRVRCSVRTID0gZnVuY3Rpb24obikge1xuICAgIHJldHVybiB6aXBfYml0X2J1ZiAmIHppcF9NQVNLX0JJVFNbbl07XG59XG5cbnZhciB6aXBfRFVNUEJJVFMgPSBmdW5jdGlvbihuKSB7XG4gICAgemlwX2JpdF9idWYgPj49IG47XG4gICAgemlwX2JpdF9sZW4gLT0gbjtcbn1cblxudmFyIHppcF9pbmZsYXRlX2NvZGVzID0gZnVuY3Rpb24oYnVmZiwgb2ZmLCBzaXplKSB7XG4gICAgLyogaW5mbGF0ZSAoZGVjb21wcmVzcykgdGhlIGNvZGVzIGluIGEgZGVmbGF0ZWQgKGNvbXByZXNzZWQpIGJsb2NrLlxuICAgICAgIFJldHVybiBhbiBlcnJvciBjb2RlIG9yIHplcm8gaWYgaXQgYWxsIGdvZXMgb2suICovXG4gICAgdmFyIGU7XHRcdC8vIHRhYmxlIGVudHJ5IGZsYWcvbnVtYmVyIG9mIGV4dHJhIGJpdHNcbiAgICB2YXIgdDtcdFx0Ly8gKHppcF9IdWZ0Tm9kZSkgcG9pbnRlciB0byB0YWJsZSBlbnRyeVxuICAgIHZhciBuO1xuXG4gICAgaWYoc2l6ZSA9PSAwKVxuICAgICAgcmV0dXJuIDA7XG5cbiAgICAvLyBpbmZsYXRlIHRoZSBjb2RlZCBkYXRhXG4gICAgbiA9IDA7XG4gICAgZm9yKDs7KSB7XHRcdFx0Ly8gZG8gdW50aWwgZW5kIG9mIGJsb2NrXG5cdHppcF9ORUVEQklUUyh6aXBfYmwpO1xuXHR0ID0gemlwX3RsLmxpc3RbemlwX0dFVEJJVFMoemlwX2JsKV07XG5cdGUgPSB0LmU7XG5cdHdoaWxlKGUgPiAxNikge1xuXHQgICAgaWYoZSA9PSA5OSlcblx0XHRyZXR1cm4gLTE7XG5cdCAgICB6aXBfRFVNUEJJVFModC5iKTtcblx0ICAgIGUgLT0gMTY7XG5cdCAgICB6aXBfTkVFREJJVFMoZSk7XG5cdCAgICB0ID0gdC50W3ppcF9HRVRCSVRTKGUpXTtcblx0ICAgIGUgPSB0LmU7XG5cdH1cblx0emlwX0RVTVBCSVRTKHQuYik7XG5cblx0aWYoZSA9PSAxNikge1x0XHQvLyB0aGVuIGl0J3MgYSBsaXRlcmFsXG5cdCAgICB6aXBfd3AgJj0gemlwX1dTSVpFIC0gMTtcblx0ICAgIGJ1ZmZbb2ZmICsgbisrXSA9IHppcF9zbGlkZVt6aXBfd3ArK10gPSB0Lm47XG5cdCAgICBpZihuID09IHNpemUpXG5cdFx0cmV0dXJuIHNpemU7XG5cdCAgICBjb250aW51ZTtcblx0fVxuXG5cdC8vIGV4aXQgaWYgZW5kIG9mIGJsb2NrXG5cdGlmKGUgPT0gMTUpXG5cdCAgICBicmVhaztcblxuXHQvLyBpdCdzIGFuIEVPQiBvciBhIGxlbmd0aFxuXG5cdC8vIGdldCBsZW5ndGggb2YgYmxvY2sgdG8gY29weVxuXHR6aXBfTkVFREJJVFMoZSk7XG5cdHppcF9jb3B5X2xlbmcgPSB0Lm4gKyB6aXBfR0VUQklUUyhlKTtcblx0emlwX0RVTVBCSVRTKGUpO1xuXG5cdC8vIGRlY29kZSBkaXN0YW5jZSBvZiBibG9jayB0byBjb3B5XG5cdHppcF9ORUVEQklUUyh6aXBfYmQpO1xuXHR0ID0gemlwX3RkLmxpc3RbemlwX0dFVEJJVFMoemlwX2JkKV07XG5cdGUgPSB0LmU7XG5cblx0d2hpbGUoZSA+IDE2KSB7XG5cdCAgICBpZihlID09IDk5KVxuXHRcdHJldHVybiAtMTtcblx0ICAgIHppcF9EVU1QQklUUyh0LmIpO1xuXHQgICAgZSAtPSAxNjtcblx0ICAgIHppcF9ORUVEQklUUyhlKTtcblx0ICAgIHQgPSB0LnRbemlwX0dFVEJJVFMoZSldO1xuXHQgICAgZSA9IHQuZTtcblx0fVxuXHR6aXBfRFVNUEJJVFModC5iKTtcblx0emlwX05FRURCSVRTKGUpO1xuXHR6aXBfY29weV9kaXN0ID0gemlwX3dwIC0gdC5uIC0gemlwX0dFVEJJVFMoZSk7XG5cdHppcF9EVU1QQklUUyhlKTtcblxuXHQvLyBkbyB0aGUgY29weVxuXHR3aGlsZSh6aXBfY29weV9sZW5nID4gMCAmJiBuIDwgc2l6ZSkge1xuXHQgICAgemlwX2NvcHlfbGVuZy0tO1xuXHQgICAgemlwX2NvcHlfZGlzdCAmPSB6aXBfV1NJWkUgLSAxO1xuXHQgICAgemlwX3dwICY9IHppcF9XU0laRSAtIDE7XG5cdCAgICBidWZmW29mZiArIG4rK10gPSB6aXBfc2xpZGVbemlwX3dwKytdXG5cdFx0PSB6aXBfc2xpZGVbemlwX2NvcHlfZGlzdCsrXTtcblx0fVxuXG5cdGlmKG4gPT0gc2l6ZSlcblx0ICAgIHJldHVybiBzaXplO1xuICAgIH1cblxuICAgIHppcF9tZXRob2QgPSAtMTsgLy8gZG9uZVxuICAgIHJldHVybiBuO1xufVxuXG52YXIgemlwX2luZmxhdGVfc3RvcmVkID0gZnVuY3Rpb24oYnVmZiwgb2ZmLCBzaXplKSB7XG4gICAgLyogXCJkZWNvbXByZXNzXCIgYW4gaW5mbGF0ZWQgdHlwZSAwIChzdG9yZWQpIGJsb2NrLiAqL1xuICAgIHZhciBuO1xuXG4gICAgLy8gZ28gdG8gYnl0ZSBib3VuZGFyeVxuICAgIG4gPSB6aXBfYml0X2xlbiAmIDc7XG4gICAgemlwX0RVTVBCSVRTKG4pO1xuXG4gICAgLy8gZ2V0IHRoZSBsZW5ndGggYW5kIGl0cyBjb21wbGVtZW50XG4gICAgemlwX05FRURCSVRTKDE2KTtcbiAgICBuID0gemlwX0dFVEJJVFMoMTYpO1xuICAgIHppcF9EVU1QQklUUygxNik7XG4gICAgemlwX05FRURCSVRTKDE2KTtcbiAgICBpZihuICE9ICgofnppcF9iaXRfYnVmKSAmIDB4ZmZmZikpXG5cdHJldHVybiAtMTtcdFx0XHQvLyBlcnJvciBpbiBjb21wcmVzc2VkIGRhdGFcbiAgICB6aXBfRFVNUEJJVFMoMTYpO1xuXG4gICAgLy8gcmVhZCBhbmQgb3V0cHV0IHRoZSBjb21wcmVzc2VkIGRhdGFcbiAgICB6aXBfY29weV9sZW5nID0gbjtcblxuICAgIG4gPSAwO1xuICAgIHdoaWxlKHppcF9jb3B5X2xlbmcgPiAwICYmIG4gPCBzaXplKSB7XG5cdHppcF9jb3B5X2xlbmctLTtcblx0emlwX3dwICY9IHppcF9XU0laRSAtIDE7XG5cdHppcF9ORUVEQklUUyg4KTtcblx0YnVmZltvZmYgKyBuKytdID0gemlwX3NsaWRlW3ppcF93cCsrXSA9XG5cdCAgICB6aXBfR0VUQklUUyg4KTtcblx0emlwX0RVTVBCSVRTKDgpO1xuICAgIH1cblxuICAgIGlmKHppcF9jb3B5X2xlbmcgPT0gMClcbiAgICAgIHppcF9tZXRob2QgPSAtMTsgLy8gZG9uZVxuICAgIHJldHVybiBuO1xufVxuXG52YXIgemlwX2luZmxhdGVfZml4ZWQgPSBmdW5jdGlvbihidWZmLCBvZmYsIHNpemUpIHtcbiAgICAvKiBkZWNvbXByZXNzIGFuIGluZmxhdGVkIHR5cGUgMSAoZml4ZWQgSHVmZm1hbiBjb2RlcykgYmxvY2suICBXZSBzaG91bGRcbiAgICAgICBlaXRoZXIgcmVwbGFjZSB0aGlzIHdpdGggYSBjdXN0b20gZGVjb2Rlciwgb3IgYXQgbGVhc3QgcHJlY29tcHV0ZSB0aGVcbiAgICAgICBIdWZmbWFuIHRhYmxlcy4gKi9cblxuICAgIC8vIGlmIGZpcnN0IHRpbWUsIHNldCB1cCB0YWJsZXMgZm9yIGZpeGVkIGJsb2Nrc1xuICAgIGlmKHppcF9maXhlZF90bCA9PSBudWxsKSB7XG5cdHZhciBpO1x0XHRcdC8vIHRlbXBvcmFyeSB2YXJpYWJsZVxuXHR2YXIgbCA9IG5ldyBBcnJheSgyODgpO1x0Ly8gbGVuZ3RoIGxpc3QgZm9yIGh1ZnRfYnVpbGRcblx0dmFyIGg7XHQvLyB6aXBfSHVmdEJ1aWxkXG5cblx0Ly8gbGl0ZXJhbCB0YWJsZVxuXHRmb3IoaSA9IDA7IGkgPCAxNDQ7IGkrKylcblx0ICAgIGxbaV0gPSA4O1xuXHRmb3IoOyBpIDwgMjU2OyBpKyspXG5cdCAgICBsW2ldID0gOTtcblx0Zm9yKDsgaSA8IDI4MDsgaSsrKVxuXHQgICAgbFtpXSA9IDc7XG5cdGZvcig7IGkgPCAyODg7IGkrKylcdC8vIG1ha2UgYSBjb21wbGV0ZSwgYnV0IHdyb25nIGNvZGUgc2V0XG5cdCAgICBsW2ldID0gODtcblx0emlwX2ZpeGVkX2JsID0gNztcblxuXHRoID0gbmV3IHppcF9IdWZ0QnVpbGQobCwgMjg4LCAyNTcsIHppcF9jcGxlbnMsIHppcF9jcGxleHQsXG5cdFx0XHQgICAgICB6aXBfZml4ZWRfYmwpO1xuXHRpZihoLnN0YXR1cyAhPSAwKSB7XG5cdCAgICBhbGVydChcIkh1ZkJ1aWxkIGVycm9yOiBcIitoLnN0YXR1cyk7XG5cdCAgICByZXR1cm4gLTE7XG5cdH1cblx0emlwX2ZpeGVkX3RsID0gaC5yb290O1xuXHR6aXBfZml4ZWRfYmwgPSBoLm07XG5cblx0Ly8gZGlzdGFuY2UgdGFibGVcblx0Zm9yKGkgPSAwOyBpIDwgMzA7IGkrKylcdC8vIG1ha2UgYW4gaW5jb21wbGV0ZSBjb2RlIHNldFxuXHQgICAgbFtpXSA9IDU7XG5cdHppcF9maXhlZF9iZCA9IDU7XG5cblx0aCA9IG5ldyB6aXBfSHVmdEJ1aWxkKGwsIDMwLCAwLCB6aXBfY3BkaXN0LCB6aXBfY3BkZXh0LCB6aXBfZml4ZWRfYmQpO1xuXHRpZihoLnN0YXR1cyA+IDEpIHtcblx0ICAgIHppcF9maXhlZF90bCA9IG51bGw7XG5cdCAgICBhbGVydChcIkh1ZkJ1aWxkIGVycm9yOiBcIitoLnN0YXR1cyk7XG5cdCAgICByZXR1cm4gLTE7XG5cdH1cblx0emlwX2ZpeGVkX3RkID0gaC5yb290O1xuXHR6aXBfZml4ZWRfYmQgPSBoLm07XG4gICAgfVxuXG4gICAgemlwX3RsID0gemlwX2ZpeGVkX3RsO1xuICAgIHppcF90ZCA9IHppcF9maXhlZF90ZDtcbiAgICB6aXBfYmwgPSB6aXBfZml4ZWRfYmw7XG4gICAgemlwX2JkID0gemlwX2ZpeGVkX2JkO1xuICAgIHJldHVybiB6aXBfaW5mbGF0ZV9jb2RlcyhidWZmLCBvZmYsIHNpemUpO1xufVxuXG52YXIgemlwX2luZmxhdGVfZHluYW1pYyA9IGZ1bmN0aW9uKGJ1ZmYsIG9mZiwgc2l6ZSkge1xuICAgIC8vIGRlY29tcHJlc3MgYW4gaW5mbGF0ZWQgdHlwZSAyIChkeW5hbWljIEh1ZmZtYW4gY29kZXMpIGJsb2NrLlxuICAgIHZhciBpO1x0XHQvLyB0ZW1wb3JhcnkgdmFyaWFibGVzXG4gICAgdmFyIGo7XG4gICAgdmFyIGw7XHRcdC8vIGxhc3QgbGVuZ3RoXG4gICAgdmFyIG47XHRcdC8vIG51bWJlciBvZiBsZW5ndGhzIHRvIGdldFxuICAgIHZhciB0O1x0XHQvLyAoemlwX0h1ZnROb2RlKSBsaXRlcmFsL2xlbmd0aCBjb2RlIHRhYmxlXG4gICAgdmFyIG5iO1x0XHQvLyBudW1iZXIgb2YgYml0IGxlbmd0aCBjb2Rlc1xuICAgIHZhciBubDtcdFx0Ly8gbnVtYmVyIG9mIGxpdGVyYWwvbGVuZ3RoIGNvZGVzXG4gICAgdmFyIG5kO1x0XHQvLyBudW1iZXIgb2YgZGlzdGFuY2UgY29kZXNcbiAgICB2YXIgbGwgPSBuZXcgQXJyYXkoMjg2KzMwKTsgLy8gbGl0ZXJhbC9sZW5ndGggYW5kIGRpc3RhbmNlIGNvZGUgbGVuZ3Roc1xuICAgIHZhciBoO1x0XHQvLyAoemlwX0h1ZnRCdWlsZClcblxuICAgIGZvcihpID0gMDsgaSA8IGxsLmxlbmd0aDsgaSsrKVxuXHRsbFtpXSA9IDA7XG5cbiAgICAvLyByZWFkIGluIHRhYmxlIGxlbmd0aHNcbiAgICB6aXBfTkVFREJJVFMoNSk7XG4gICAgbmwgPSAyNTcgKyB6aXBfR0VUQklUUyg1KTtcdC8vIG51bWJlciBvZiBsaXRlcmFsL2xlbmd0aCBjb2Rlc1xuICAgIHppcF9EVU1QQklUUyg1KTtcbiAgICB6aXBfTkVFREJJVFMoNSk7XG4gICAgbmQgPSAxICsgemlwX0dFVEJJVFMoNSk7XHQvLyBudW1iZXIgb2YgZGlzdGFuY2UgY29kZXNcbiAgICB6aXBfRFVNUEJJVFMoNSk7XG4gICAgemlwX05FRURCSVRTKDQpO1xuICAgIG5iID0gNCArIHppcF9HRVRCSVRTKDQpO1x0Ly8gbnVtYmVyIG9mIGJpdCBsZW5ndGggY29kZXNcbiAgICB6aXBfRFVNUEJJVFMoNCk7XG4gICAgaWYobmwgPiAyODYgfHwgbmQgPiAzMClcbiAgICAgIHJldHVybiAtMTtcdFx0Ly8gYmFkIGxlbmd0aHNcblxuICAgIC8vIHJlYWQgaW4gYml0LWxlbmd0aC1jb2RlIGxlbmd0aHNcbiAgICBmb3IoaiA9IDA7IGogPCBuYjsgaisrKVxuICAgIHtcblx0emlwX05FRURCSVRTKDMpO1xuXHRsbFt6aXBfYm9yZGVyW2pdXSA9IHppcF9HRVRCSVRTKDMpO1xuXHR6aXBfRFVNUEJJVFMoMyk7XG4gICAgfVxuICAgIGZvcig7IGogPCAxOTsgaisrKVxuXHRsbFt6aXBfYm9yZGVyW2pdXSA9IDA7XG5cbiAgICAvLyBidWlsZCBkZWNvZGluZyB0YWJsZSBmb3IgdHJlZXMtLXNpbmdsZSBsZXZlbCwgNyBiaXQgbG9va3VwXG4gICAgemlwX2JsID0gNztcbiAgICBoID0gbmV3IHppcF9IdWZ0QnVpbGQobGwsIDE5LCAxOSwgbnVsbCwgbnVsbCwgemlwX2JsKTtcbiAgICBpZihoLnN0YXR1cyAhPSAwKVxuXHRyZXR1cm4gLTE7XHQvLyBpbmNvbXBsZXRlIGNvZGUgc2V0XG5cbiAgICB6aXBfdGwgPSBoLnJvb3Q7XG4gICAgemlwX2JsID0gaC5tO1xuXG4gICAgLy8gcmVhZCBpbiBsaXRlcmFsIGFuZCBkaXN0YW5jZSBjb2RlIGxlbmd0aHNcbiAgICBuID0gbmwgKyBuZDtcbiAgICBpID0gbCA9IDA7XG4gICAgd2hpbGUoaSA8IG4pIHtcblx0emlwX05FRURCSVRTKHppcF9ibCk7XG5cdHQgPSB6aXBfdGwubGlzdFt6aXBfR0VUQklUUyh6aXBfYmwpXTtcblx0aiA9IHQuYjtcblx0emlwX0RVTVBCSVRTKGopO1xuXHRqID0gdC5uO1xuXHRpZihqIDwgMTYpXHRcdC8vIGxlbmd0aCBvZiBjb2RlIGluIGJpdHMgKDAuLjE1KVxuXHQgICAgbGxbaSsrXSA9IGwgPSBqO1x0Ly8gc2F2ZSBsYXN0IGxlbmd0aCBpbiBsXG5cdGVsc2UgaWYoaiA9PSAxNikge1x0Ly8gcmVwZWF0IGxhc3QgbGVuZ3RoIDMgdG8gNiB0aW1lc1xuXHQgICAgemlwX05FRURCSVRTKDIpO1xuXHQgICAgaiA9IDMgKyB6aXBfR0VUQklUUygyKTtcblx0ICAgIHppcF9EVU1QQklUUygyKTtcblx0ICAgIGlmKGkgKyBqID4gbilcblx0XHRyZXR1cm4gLTE7XG5cdCAgICB3aGlsZShqLS0gPiAwKVxuXHRcdGxsW2krK10gPSBsO1xuXHR9IGVsc2UgaWYoaiA9PSAxNykge1x0Ly8gMyB0byAxMCB6ZXJvIGxlbmd0aCBjb2Rlc1xuXHQgICAgemlwX05FRURCSVRTKDMpO1xuXHQgICAgaiA9IDMgKyB6aXBfR0VUQklUUygzKTtcblx0ICAgIHppcF9EVU1QQklUUygzKTtcblx0ICAgIGlmKGkgKyBqID4gbilcblx0XHRyZXR1cm4gLTE7XG5cdCAgICB3aGlsZShqLS0gPiAwKVxuXHRcdGxsW2krK10gPSAwO1xuXHQgICAgbCA9IDA7XG5cdH0gZWxzZSB7XHRcdC8vIGogPT0gMTg6IDExIHRvIDEzOCB6ZXJvIGxlbmd0aCBjb2Rlc1xuXHQgICAgemlwX05FRURCSVRTKDcpO1xuXHQgICAgaiA9IDExICsgemlwX0dFVEJJVFMoNyk7XG5cdCAgICB6aXBfRFVNUEJJVFMoNyk7XG5cdCAgICBpZihpICsgaiA+IG4pXG5cdFx0cmV0dXJuIC0xO1xuXHQgICAgd2hpbGUoai0tID4gMClcblx0XHRsbFtpKytdID0gMDtcblx0ICAgIGwgPSAwO1xuXHR9XG4gICAgfVxuXG4gICAgLy8gYnVpbGQgdGhlIGRlY29kaW5nIHRhYmxlcyBmb3IgbGl0ZXJhbC9sZW5ndGggYW5kIGRpc3RhbmNlIGNvZGVzXG4gICAgemlwX2JsID0gemlwX2xiaXRzO1xuICAgIGggPSBuZXcgemlwX0h1ZnRCdWlsZChsbCwgbmwsIDI1NywgemlwX2NwbGVucywgemlwX2NwbGV4dCwgemlwX2JsKTtcbiAgICBpZih6aXBfYmwgPT0gMClcdC8vIG5vIGxpdGVyYWxzIG9yIGxlbmd0aHNcblx0aC5zdGF0dXMgPSAxO1xuICAgIGlmKGguc3RhdHVzICE9IDApIHtcblx0aWYoaC5zdGF0dXMgPT0gMSlcblx0ICAgIDsvLyAqKmluY29tcGxldGUgbGl0ZXJhbCB0cmVlKipcblx0cmV0dXJuIC0xO1x0XHQvLyBpbmNvbXBsZXRlIGNvZGUgc2V0XG4gICAgfVxuICAgIHppcF90bCA9IGgucm9vdDtcbiAgICB6aXBfYmwgPSBoLm07XG5cbiAgICBmb3IoaSA9IDA7IGkgPCBuZDsgaSsrKVxuXHRsbFtpXSA9IGxsW2kgKyBubF07XG4gICAgemlwX2JkID0gemlwX2RiaXRzO1xuICAgIGggPSBuZXcgemlwX0h1ZnRCdWlsZChsbCwgbmQsIDAsIHppcF9jcGRpc3QsIHppcF9jcGRleHQsIHppcF9iZCk7XG4gICAgemlwX3RkID0gaC5yb290O1xuICAgIHppcF9iZCA9IGgubTtcblxuICAgIGlmKHppcF9iZCA9PSAwICYmIG5sID4gMjU3KSB7ICAgLy8gbGVuZ3RocyBidXQgbm8gZGlzdGFuY2VzXG5cdC8vICoqaW5jb21wbGV0ZSBkaXN0YW5jZSB0cmVlKipcblx0cmV0dXJuIC0xO1xuICAgIH1cblxuICAgIGlmKGguc3RhdHVzID09IDEpIHtcblx0Oy8vICoqaW5jb21wbGV0ZSBkaXN0YW5jZSB0cmVlKipcbiAgICB9XG4gICAgaWYoaC5zdGF0dXMgIT0gMClcblx0cmV0dXJuIC0xO1xuXG4gICAgLy8gZGVjb21wcmVzcyB1bnRpbCBhbiBlbmQtb2YtYmxvY2sgY29kZVxuICAgIHJldHVybiB6aXBfaW5mbGF0ZV9jb2RlcyhidWZmLCBvZmYsIHNpemUpO1xufVxuXG52YXIgemlwX2luZmxhdGVfc3RhcnQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgaTtcblxuICAgIGlmKHppcF9zbGlkZSA9PSBudWxsKVxuXHR6aXBfc2xpZGUgPSBuZXcgQXJyYXkoMiAqIHppcF9XU0laRSk7XG4gICAgemlwX3dwID0gMDtcbiAgICB6aXBfYml0X2J1ZiA9IDA7XG4gICAgemlwX2JpdF9sZW4gPSAwO1xuICAgIHppcF9tZXRob2QgPSAtMTtcbiAgICB6aXBfZW9mID0gZmFsc2U7XG4gICAgemlwX2NvcHlfbGVuZyA9IHppcF9jb3B5X2Rpc3QgPSAwO1xuICAgIHppcF90bCA9IG51bGw7XG59XG5cbnZhciB6aXBfaW5mbGF0ZV9pbnRlcm5hbCA9IGZ1bmN0aW9uKGJ1ZmYsIG9mZiwgc2l6ZSkge1xuICAgIC8vIGRlY29tcHJlc3MgYW4gaW5mbGF0ZWQgZW50cnlcbiAgICB2YXIgbiwgaTtcblxuICAgIG4gPSAwO1xuICAgIHdoaWxlKG4gPCBzaXplKSB7XG5cdGlmKHppcF9lb2YgJiYgemlwX21ldGhvZCA9PSAtMSlcblx0ICAgIHJldHVybiBuO1xuXG5cdGlmKHppcF9jb3B5X2xlbmcgPiAwKSB7XG5cdCAgICBpZih6aXBfbWV0aG9kICE9IHppcF9TVE9SRURfQkxPQ0spIHtcblx0XHQvLyBTVEFUSUNfVFJFRVMgb3IgRFlOX1RSRUVTXG5cdFx0d2hpbGUoemlwX2NvcHlfbGVuZyA+IDAgJiYgbiA8IHNpemUpIHtcblx0XHQgICAgemlwX2NvcHlfbGVuZy0tO1xuXHRcdCAgICB6aXBfY29weV9kaXN0ICY9IHppcF9XU0laRSAtIDE7XG5cdFx0ICAgIHppcF93cCAmPSB6aXBfV1NJWkUgLSAxO1xuXHRcdCAgICBidWZmW29mZiArIG4rK10gPSB6aXBfc2xpZGVbemlwX3dwKytdID1cblx0XHRcdHppcF9zbGlkZVt6aXBfY29weV9kaXN0KytdO1xuXHRcdH1cblx0ICAgIH0gZWxzZSB7XG5cdFx0d2hpbGUoemlwX2NvcHlfbGVuZyA+IDAgJiYgbiA8IHNpemUpIHtcblx0XHQgICAgemlwX2NvcHlfbGVuZy0tO1xuXHRcdCAgICB6aXBfd3AgJj0gemlwX1dTSVpFIC0gMTtcblx0XHQgICAgemlwX05FRURCSVRTKDgpO1xuXHRcdCAgICBidWZmW29mZiArIG4rK10gPSB6aXBfc2xpZGVbemlwX3dwKytdID0gemlwX0dFVEJJVFMoOCk7XG5cdFx0ICAgIHppcF9EVU1QQklUUyg4KTtcblx0XHR9XG5cdFx0aWYoemlwX2NvcHlfbGVuZyA9PSAwKVxuXHRcdCAgICB6aXBfbWV0aG9kID0gLTE7IC8vIGRvbmVcblx0ICAgIH1cblx0ICAgIGlmKG4gPT0gc2l6ZSlcblx0XHRyZXR1cm4gbjtcblx0fVxuXG5cdGlmKHppcF9tZXRob2QgPT0gLTEpIHtcblx0ICAgIGlmKHppcF9lb2YpXG5cdFx0YnJlYWs7XG5cblx0ICAgIC8vIHJlYWQgaW4gbGFzdCBibG9jayBiaXRcblx0ICAgIHppcF9ORUVEQklUUygxKTtcblx0ICAgIGlmKHppcF9HRVRCSVRTKDEpICE9IDApXG5cdFx0emlwX2VvZiA9IHRydWU7XG5cdCAgICB6aXBfRFVNUEJJVFMoMSk7XG5cblx0ICAgIC8vIHJlYWQgaW4gYmxvY2sgdHlwZVxuXHQgICAgemlwX05FRURCSVRTKDIpO1xuXHQgICAgemlwX21ldGhvZCA9IHppcF9HRVRCSVRTKDIpO1xuXHQgICAgemlwX0RVTVBCSVRTKDIpO1xuXHQgICAgemlwX3RsID0gbnVsbDtcblx0ICAgIHppcF9jb3B5X2xlbmcgPSAwO1xuXHR9XG5cblx0c3dpdGNoKHppcF9tZXRob2QpIHtcblx0ICBjYXNlIDA6IC8vIHppcF9TVE9SRURfQkxPQ0tcblx0ICAgIGkgPSB6aXBfaW5mbGF0ZV9zdG9yZWQoYnVmZiwgb2ZmICsgbiwgc2l6ZSAtIG4pO1xuXHQgICAgYnJlYWs7XG5cblx0ICBjYXNlIDE6IC8vIHppcF9TVEFUSUNfVFJFRVNcblx0ICAgIGlmKHppcF90bCAhPSBudWxsKVxuXHRcdGkgPSB6aXBfaW5mbGF0ZV9jb2RlcyhidWZmLCBvZmYgKyBuLCBzaXplIC0gbik7XG5cdCAgICBlbHNlXG5cdFx0aSA9IHppcF9pbmZsYXRlX2ZpeGVkKGJ1ZmYsIG9mZiArIG4sIHNpemUgLSBuKTtcblx0ICAgIGJyZWFrO1xuXG5cdCAgY2FzZSAyOiAvLyB6aXBfRFlOX1RSRUVTXG5cdCAgICBpZih6aXBfdGwgIT0gbnVsbClcblx0XHRpID0gemlwX2luZmxhdGVfY29kZXMoYnVmZiwgb2ZmICsgbiwgc2l6ZSAtIG4pO1xuXHQgICAgZWxzZVxuXHRcdGkgPSB6aXBfaW5mbGF0ZV9keW5hbWljKGJ1ZmYsIG9mZiArIG4sIHNpemUgLSBuKTtcblx0ICAgIGJyZWFrO1xuXG5cdCAgZGVmYXVsdDogLy8gZXJyb3Jcblx0ICAgIGkgPSAtMTtcblx0ICAgIGJyZWFrO1xuXHR9XG5cblx0aWYoaSA9PSAtMSkge1xuXHQgICAgaWYoemlwX2VvZilcblx0XHRyZXR1cm4gMDtcblx0ICAgIHJldHVybiAtMTtcblx0fVxuXHRuICs9IGk7XG4gICAgfVxuICAgIHJldHVybiBuO1xufVxuXG52YXIgemlwX2luZmxhdGUgPSBmdW5jdGlvbihzdHIpIHtcbiAgICB2YXIgaSwgajtcblxuICAgIHppcF9pbmZsYXRlX3N0YXJ0KCk7XG4gICAgemlwX2luZmxhdGVfZGF0YSA9IHN0cjtcbiAgICB6aXBfaW5mbGF0ZV9wb3MgPSAwO1xuXG4gICAgdmFyIGJ1ZmYgPSBuZXcgQXJyYXkoMTAyNCk7XG4gICAgdmFyIGFvdXQgPSBbXTtcbiAgICB3aGlsZSgoaSA9IHppcF9pbmZsYXRlX2ludGVybmFsKGJ1ZmYsIDAsIGJ1ZmYubGVuZ3RoKSkgPiAwKSB7XG5cdHZhciBjYnVmID0gbmV3IEFycmF5KGkpO1xuXHRmb3IoaiA9IDA7IGogPCBpOyBqKyspe1xuXHQgICAgY2J1ZltqXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmZltqXSk7XG5cdH1cblx0YW91dFthb3V0Lmxlbmd0aF0gPSBjYnVmLmpvaW4oXCJcIik7XG4gICAgfVxuICAgIHppcF9pbmZsYXRlX2RhdGEgPSBudWxsOyAvLyBHLkMuXG4gICAgcmV0dXJuIGFvdXQuam9pbihcIlwiKTtcbn1cblxuaWYgKCEgY3R4LlJhd0RlZmxhdGUpIGN0eC5SYXdEZWZsYXRlID0ge307XG5jdHguUmF3RGVmbGF0ZS5pbmZsYXRlID0gemlwX2luZmxhdGU7XG5cbn0pKHRoaXMpO1xuIiwiLypcbiAqICRJZDogYmFzZTY0LmpzLHYgMi4xNSAyMDE0LzA0LzA1IDEyOjU4OjU3IGRhbmtvZ2FpIEV4cCBkYW5rb2dhaSAkXG4gKlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cbiAqICAgIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZVxuICpcbiAqICBSZWZlcmVuY2VzOlxuICogICAgaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9CYXNlNjRcbiAqL1xuXG4oZnVuY3Rpb24oZ2xvYmFsKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuICAgIC8vIGV4aXN0aW5nIHZlcnNpb24gZm9yIG5vQ29uZmxpY3QoKVxuICAgIHZhciBfQmFzZTY0ID0gZ2xvYmFsLkJhc2U2NDtcbiAgICB2YXIgdmVyc2lvbiA9IFwiMi4xLjVcIjtcbiAgICAvLyBpZiBub2RlLmpzLCB3ZSB1c2UgQnVmZmVyXG4gICAgdmFyIGJ1ZmZlcjtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgICAgYnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyO1xuICAgIH1cbiAgICAvLyBjb25zdGFudHNcbiAgICB2YXIgYjY0Y2hhcnNcbiAgICAgICAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG4gICAgdmFyIGI2NHRhYiA9IGZ1bmN0aW9uKGJpbikge1xuICAgICAgICB2YXIgdCA9IHt9O1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IGJpbi5sZW5ndGg7IGkgPCBsOyBpKyspIHRbYmluLmNoYXJBdChpKV0gPSBpO1xuICAgICAgICByZXR1cm4gdDtcbiAgICB9KGI2NGNoYXJzKTtcbiAgICB2YXIgZnJvbUNoYXJDb2RlID0gU3RyaW5nLmZyb21DaGFyQ29kZTtcbiAgICAvLyBlbmNvZGVyIHN0dWZmXG4gICAgdmFyIGNiX3V0b2IgPSBmdW5jdGlvbihjKSB7XG4gICAgICAgIGlmIChjLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIHZhciBjYyA9IGMuY2hhckNvZGVBdCgwKTtcbiAgICAgICAgICAgIHJldHVybiBjYyA8IDB4ODAgPyBjXG4gICAgICAgICAgICAgICAgOiBjYyA8IDB4ODAwID8gKGZyb21DaGFyQ29kZSgweGMwIHwgKGNjID4+PiA2KSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyBmcm9tQ2hhckNvZGUoMHg4MCB8IChjYyAmIDB4M2YpKSlcbiAgICAgICAgICAgICAgICA6IChmcm9tQ2hhckNvZGUoMHhlMCB8ICgoY2MgPj4+IDEyKSAmIDB4MGYpKVxuICAgICAgICAgICAgICAgICAgICsgZnJvbUNoYXJDb2RlKDB4ODAgfCAoKGNjID4+PiAgNikgJiAweDNmKSlcbiAgICAgICAgICAgICAgICAgICArIGZyb21DaGFyQ29kZSgweDgwIHwgKCBjYyAgICAgICAgICYgMHgzZikpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBjYyA9IDB4MTAwMDBcbiAgICAgICAgICAgICAgICArIChjLmNoYXJDb2RlQXQoMCkgLSAweEQ4MDApICogMHg0MDBcbiAgICAgICAgICAgICAgICArIChjLmNoYXJDb2RlQXQoMSkgLSAweERDMDApO1xuICAgICAgICAgICAgcmV0dXJuIChmcm9tQ2hhckNvZGUoMHhmMCB8ICgoY2MgPj4+IDE4KSAmIDB4MDcpKVxuICAgICAgICAgICAgICAgICAgICArIGZyb21DaGFyQ29kZSgweDgwIHwgKChjYyA+Pj4gMTIpICYgMHgzZikpXG4gICAgICAgICAgICAgICAgICAgICsgZnJvbUNoYXJDb2RlKDB4ODAgfCAoKGNjID4+PiAgNikgJiAweDNmKSlcbiAgICAgICAgICAgICAgICAgICAgKyBmcm9tQ2hhckNvZGUoMHg4MCB8ICggY2MgICAgICAgICAmIDB4M2YpKSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHZhciByZV91dG9iID0gL1tcXHVEODAwLVxcdURCRkZdW1xcdURDMDAtXFx1REZGRkZdfFteXFx4MDAtXFx4N0ZdL2c7XG4gICAgdmFyIHV0b2IgPSBmdW5jdGlvbih1KSB7XG4gICAgICAgIHJldHVybiB1LnJlcGxhY2UocmVfdXRvYiwgY2JfdXRvYik7XG4gICAgfTtcbiAgICB2YXIgY2JfZW5jb2RlID0gZnVuY3Rpb24oY2NjKSB7XG4gICAgICAgIHZhciBwYWRsZW4gPSBbMCwgMiwgMV1bY2NjLmxlbmd0aCAlIDNdLFxuICAgICAgICBvcmQgPSBjY2MuY2hhckNvZGVBdCgwKSA8PCAxNlxuICAgICAgICAgICAgfCAoKGNjYy5sZW5ndGggPiAxID8gY2NjLmNoYXJDb2RlQXQoMSkgOiAwKSA8PCA4KVxuICAgICAgICAgICAgfCAoKGNjYy5sZW5ndGggPiAyID8gY2NjLmNoYXJDb2RlQXQoMikgOiAwKSksXG4gICAgICAgIGNoYXJzID0gW1xuICAgICAgICAgICAgYjY0Y2hhcnMuY2hhckF0KCBvcmQgPj4+IDE4KSxcbiAgICAgICAgICAgIGI2NGNoYXJzLmNoYXJBdCgob3JkID4+PiAxMikgJiA2MyksXG4gICAgICAgICAgICBwYWRsZW4gPj0gMiA/ICc9JyA6IGI2NGNoYXJzLmNoYXJBdCgob3JkID4+PiA2KSAmIDYzKSxcbiAgICAgICAgICAgIHBhZGxlbiA+PSAxID8gJz0nIDogYjY0Y2hhcnMuY2hhckF0KG9yZCAmIDYzKVxuICAgICAgICBdO1xuICAgICAgICByZXR1cm4gY2hhcnMuam9pbignJyk7XG4gICAgfTtcbiAgICB2YXIgYnRvYSA9IGdsb2JhbC5idG9hID8gZnVuY3Rpb24oYikge1xuICAgICAgICByZXR1cm4gZ2xvYmFsLmJ0b2EoYik7XG4gICAgfSA6IGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgcmV0dXJuIGIucmVwbGFjZSgvW1xcc1xcU117MSwzfS9nLCBjYl9lbmNvZGUpO1xuICAgIH07XG4gICAgdmFyIF9lbmNvZGUgPSBidWZmZXJcbiAgICAgICAgPyBmdW5jdGlvbiAodSkgeyByZXR1cm4gKG5ldyBidWZmZXIodSkpLnRvU3RyaW5nKCdiYXNlNjQnKSB9IFxuICAgIDogZnVuY3Rpb24gKHUpIHsgcmV0dXJuIGJ0b2EodXRvYih1KSkgfVxuICAgIDtcbiAgICB2YXIgZW5jb2RlID0gZnVuY3Rpb24odSwgdXJpc2FmZSkge1xuICAgICAgICByZXR1cm4gIXVyaXNhZmUgXG4gICAgICAgICAgICA/IF9lbmNvZGUodSlcbiAgICAgICAgICAgIDogX2VuY29kZSh1KS5yZXBsYWNlKC9bK1xcL10vZywgZnVuY3Rpb24obTApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbTAgPT0gJysnID8gJy0nIDogJ18nO1xuICAgICAgICAgICAgfSkucmVwbGFjZSgvPS9nLCAnJyk7XG4gICAgfTtcbiAgICB2YXIgZW5jb2RlVVJJID0gZnVuY3Rpb24odSkgeyByZXR1cm4gZW5jb2RlKHUsIHRydWUpIH07XG4gICAgLy8gZGVjb2RlciBzdHVmZlxuICAgIHZhciByZV9idG91ID0gbmV3IFJlZ0V4cChbXG4gICAgICAgICdbXFx4QzAtXFx4REZdW1xceDgwLVxceEJGXScsXG4gICAgICAgICdbXFx4RTAtXFx4RUZdW1xceDgwLVxceEJGXXsyfScsXG4gICAgICAgICdbXFx4RjAtXFx4RjddW1xceDgwLVxceEJGXXszfSdcbiAgICBdLmpvaW4oJ3wnKSwgJ2cnKTtcbiAgICB2YXIgY2JfYnRvdSA9IGZ1bmN0aW9uKGNjY2MpIHtcbiAgICAgICAgc3dpdGNoKGNjY2MubGVuZ3RoKSB7XG4gICAgICAgIGNhc2UgNDpcbiAgICAgICAgICAgIHZhciBjcCA9ICgoMHgwNyAmIGNjY2MuY2hhckNvZGVBdCgwKSkgPDwgMTgpXG4gICAgICAgICAgICAgICAgfCAgICAoKDB4M2YgJiBjY2NjLmNoYXJDb2RlQXQoMSkpIDw8IDEyKVxuICAgICAgICAgICAgICAgIHwgICAgKCgweDNmICYgY2NjYy5jaGFyQ29kZUF0KDIpKSA8PCAgNilcbiAgICAgICAgICAgICAgICB8ICAgICAoMHgzZiAmIGNjY2MuY2hhckNvZGVBdCgzKSksXG4gICAgICAgICAgICBvZmZzZXQgPSBjcCAtIDB4MTAwMDA7XG4gICAgICAgICAgICByZXR1cm4gKGZyb21DaGFyQ29kZSgob2Zmc2V0ICA+Pj4gMTApICsgMHhEODAwKVxuICAgICAgICAgICAgICAgICAgICArIGZyb21DaGFyQ29kZSgob2Zmc2V0ICYgMHgzRkYpICsgMHhEQzAwKSk7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgIHJldHVybiBmcm9tQ2hhckNvZGUoXG4gICAgICAgICAgICAgICAgKCgweDBmICYgY2NjYy5jaGFyQ29kZUF0KDApKSA8PCAxMilcbiAgICAgICAgICAgICAgICAgICAgfCAoKDB4M2YgJiBjY2NjLmNoYXJDb2RlQXQoMSkpIDw8IDYpXG4gICAgICAgICAgICAgICAgICAgIHwgICgweDNmICYgY2NjYy5jaGFyQ29kZUF0KDIpKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiAgZnJvbUNoYXJDb2RlKFxuICAgICAgICAgICAgICAgICgoMHgxZiAmIGNjY2MuY2hhckNvZGVBdCgwKSkgPDwgNilcbiAgICAgICAgICAgICAgICAgICAgfCAgKDB4M2YgJiBjY2NjLmNoYXJDb2RlQXQoMSkpXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgfTtcbiAgICB2YXIgYnRvdSA9IGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgcmV0dXJuIGIucmVwbGFjZShyZV9idG91LCBjYl9idG91KTtcbiAgICB9O1xuICAgIHZhciBjYl9kZWNvZGUgPSBmdW5jdGlvbihjY2NjKSB7XG4gICAgICAgIHZhciBsZW4gPSBjY2NjLmxlbmd0aCxcbiAgICAgICAgcGFkbGVuID0gbGVuICUgNCxcbiAgICAgICAgbiA9IChsZW4gPiAwID8gYjY0dGFiW2NjY2MuY2hhckF0KDApXSA8PCAxOCA6IDApXG4gICAgICAgICAgICB8IChsZW4gPiAxID8gYjY0dGFiW2NjY2MuY2hhckF0KDEpXSA8PCAxMiA6IDApXG4gICAgICAgICAgICB8IChsZW4gPiAyID8gYjY0dGFiW2NjY2MuY2hhckF0KDIpXSA8PCAgNiA6IDApXG4gICAgICAgICAgICB8IChsZW4gPiAzID8gYjY0dGFiW2NjY2MuY2hhckF0KDMpXSAgICAgICA6IDApLFxuICAgICAgICBjaGFycyA9IFtcbiAgICAgICAgICAgIGZyb21DaGFyQ29kZSggbiA+Pj4gMTYpLFxuICAgICAgICAgICAgZnJvbUNoYXJDb2RlKChuID4+PiAgOCkgJiAweGZmKSxcbiAgICAgICAgICAgIGZyb21DaGFyQ29kZSggbiAgICAgICAgICYgMHhmZilcbiAgICAgICAgXTtcbiAgICAgICAgY2hhcnMubGVuZ3RoIC09IFswLCAwLCAyLCAxXVtwYWRsZW5dO1xuICAgICAgICByZXR1cm4gY2hhcnMuam9pbignJyk7XG4gICAgfTtcbiAgICB2YXIgYXRvYiA9IGdsb2JhbC5hdG9iID8gZnVuY3Rpb24oYSkge1xuICAgICAgICByZXR1cm4gZ2xvYmFsLmF0b2IoYSk7XG4gICAgfSA6IGZ1bmN0aW9uKGEpe1xuICAgICAgICByZXR1cm4gYS5yZXBsYWNlKC9bXFxzXFxTXXsxLDR9L2csIGNiX2RlY29kZSk7XG4gICAgfTtcbiAgICB2YXIgX2RlY29kZSA9IGJ1ZmZlclxuICAgICAgICA/IGZ1bmN0aW9uKGEpIHsgcmV0dXJuIChuZXcgYnVmZmVyKGEsICdiYXNlNjQnKSkudG9TdHJpbmcoKSB9XG4gICAgOiBmdW5jdGlvbihhKSB7IHJldHVybiBidG91KGF0b2IoYSkpIH07XG4gICAgdmFyIGRlY29kZSA9IGZ1bmN0aW9uKGEpe1xuICAgICAgICByZXR1cm4gX2RlY29kZShcbiAgICAgICAgICAgIGEucmVwbGFjZSgvWy1fXS9nLCBmdW5jdGlvbihtMCkgeyByZXR1cm4gbTAgPT0gJy0nID8gJysnIDogJy8nIH0pXG4gICAgICAgICAgICAgICAgLnJlcGxhY2UoL1teQS1aYS16MC05XFwrXFwvXS9nLCAnJylcbiAgICAgICAgKTtcbiAgICB9O1xuICAgIHZhciBub0NvbmZsaWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBCYXNlNjQgPSBnbG9iYWwuQmFzZTY0O1xuICAgICAgICBnbG9iYWwuQmFzZTY0ID0gX0Jhc2U2NDtcbiAgICAgICAgcmV0dXJuIEJhc2U2NDtcbiAgICB9O1xuICAgIC8vIGV4cG9ydCBCYXNlNjRcbiAgICBnbG9iYWwuQmFzZTY0ID0ge1xuICAgICAgICBWRVJTSU9OOiB2ZXJzaW9uLFxuICAgICAgICBhdG9iOiBhdG9iLFxuICAgICAgICBidG9hOiBidG9hLFxuICAgICAgICBmcm9tQmFzZTY0OiBkZWNvZGUsXG4gICAgICAgIHRvQmFzZTY0OiBlbmNvZGUsXG4gICAgICAgIHV0b2I6IHV0b2IsXG4gICAgICAgIGVuY29kZTogZW5jb2RlLFxuICAgICAgICBlbmNvZGVVUkk6IGVuY29kZVVSSSxcbiAgICAgICAgYnRvdTogYnRvdSxcbiAgICAgICAgZGVjb2RlOiBkZWNvZGUsXG4gICAgICAgIG5vQ29uZmxpY3Q6IG5vQ29uZmxpY3RcbiAgICB9O1xuICAgIC8vIGlmIEVTNSBpcyBhdmFpbGFibGUsIG1ha2UgQmFzZTY0LmV4dGVuZFN0cmluZygpIGF2YWlsYWJsZVxuICAgIGlmICh0eXBlb2YgT2JqZWN0LmRlZmluZVByb3BlcnR5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHZhciBub0VudW0gPSBmdW5jdGlvbih2KXtcbiAgICAgICAgICAgIHJldHVybiB7dmFsdWU6dixlbnVtZXJhYmxlOmZhbHNlLHdyaXRhYmxlOnRydWUsY29uZmlndXJhYmxlOnRydWV9O1xuICAgICAgICB9O1xuICAgICAgICBnbG9iYWwuQmFzZTY0LmV4dGVuZFN0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShcbiAgICAgICAgICAgICAgICBTdHJpbmcucHJvdG90eXBlLCAnZnJvbUJhc2U2NCcsIG5vRW51bShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkZWNvZGUodGhpcylcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoXG4gICAgICAgICAgICAgICAgU3RyaW5nLnByb3RvdHlwZSwgJ3RvQmFzZTY0Jywgbm9FbnVtKGZ1bmN0aW9uICh1cmlzYWZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlbmNvZGUodGhpcywgdXJpc2FmZSlcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoXG4gICAgICAgICAgICAgICAgU3RyaW5nLnByb3RvdHlwZSwgJ3RvQmFzZTY0VVJJJywgbm9FbnVtKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVuY29kZSh0aGlzLCB0cnVlKVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgLy8gdGhhdCdzIGl0IVxufSkodGhpcyk7XG5cbmlmICh0aGlzWydNZXRlb3InXSkge1xuICAgIEJhc2U2NCA9IGdsb2JhbC5CYXNlNjQ7IC8vIGZvciBub3JtYWwgZXhwb3J0IGluIE1ldGVvci5qc1xufVxuIiwiLyoqIVxuICogU29ydGFibGVcbiAqIEBhdXRob3JcdFJ1YmFYYSAgIDx0cmFzaEBydWJheGEub3JnPlxuICogQGxpY2Vuc2UgTUlUXG4gKi9cblxuXG4oZnVuY3Rpb24gKGZhY3Rvcnkpe1xuXHRcInVzZSBzdHJpY3RcIjtcblxuXHRpZiggdHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQgKXtcblx0XHRkZWZpbmUoZmFjdG9yeSk7XG5cdH1cblx0ZWxzZSBpZiggdHlwZW9mIG1vZHVsZSAhPSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBtb2R1bGUuZXhwb3J0cyAhPSBcInVuZGVmaW5lZFwiICl7XG5cdFx0bW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XG5cdH1cblx0ZWxzZSB7XG5cdFx0d2luZG93W1wiU29ydGFibGVcIl0gPSBmYWN0b3J5KCk7XG5cdH1cbn0pKGZ1bmN0aW9uICgpe1xuXHRcInVzZSBzdHJpY3RcIjtcblxuXHR2YXJcblx0XHQgIGRyYWdFbFxuXHRcdCwgZ2hvc3RFbFxuXHRcdCwgcm9vdEVsXG5cdFx0LCBuZXh0RWxcblxuXHRcdCwgbGFzdEVsXG5cdFx0LCBsYXN0Q1NTXG5cdFx0LCBsYXN0UmVjdFxuXG5cdFx0LCBhY3RpdmVHcm91cFxuXG5cdFx0LCB0YXBFdnRcblx0XHQsIHRvdWNoRXZ0XG5cblx0XHQsIGV4cGFuZG8gPSAnU29ydGFibGUnICsgKG5ldyBEYXRlKS5nZXRUaW1lKClcblxuXHRcdCwgd2luID0gd2luZG93XG5cdFx0LCBkb2N1bWVudCA9IHdpbi5kb2N1bWVudFxuXHRcdCwgcGFyc2VJbnQgPSB3aW4ucGFyc2VJbnRcblx0XHQsIHN1cHBvcnRJRWRuZCA9ICEhZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykuZHJhZ0Ryb3BcblxuXHRcdCwgX3NpbGVudCA9IGZhbHNlXG5cblx0XHQsIF9jcmVhdGVFdmVudCA9IGZ1bmN0aW9uIChldmVudC8qKlN0cmluZyovLCBpdGVtLyoqSFRNTEVsZW1lbnQqLyl7XG5cdFx0XHR2YXIgZXZ0ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0V2ZW50Jyk7XG5cdFx0XHRldnQuaW5pdEV2ZW50KGV2ZW50LCB0cnVlLCB0cnVlKTtcblx0XHRcdGV2dC5pdGVtID0gaXRlbTtcblx0XHRcdHJldHVybiBldnQ7XG5cdFx0fVxuXG5cdFx0LCBfZGlzcGF0Y2hFdmVudCA9IGZ1bmN0aW9uIChyb290RWwsIG5hbWUsIHRhcmdldEVsKSB7XG5cdFx0XHRyb290RWwuZGlzcGF0Y2hFdmVudChfY3JlYXRlRXZlbnQobmFtZSwgdGFyZ2V0RWwgfHwgcm9vdEVsKSk7XG5cdFx0fVxuXG5cdFx0LCBfY3VzdG9tRXZlbnRzID0gJ29uQWRkIG9uVXBkYXRlIG9uUmVtb3ZlIG9uU3RhcnQgb25FbmQgb25GaWx0ZXInLnNwbGl0KCcgJylcblxuXHRcdCwgbm9vcCA9IGZ1bmN0aW9uICgpe31cblx0XHQsIHNsaWNlID0gW10uc2xpY2VcblxuXHRcdCwgdG91Y2hEcmFnT3Zlckxpc3RlbmVycyA9IFtdXG5cdDtcblxuXG5cblx0LyoqXG5cdCAqIEBjbGFzcyAgU29ydGFibGVcblx0ICogQHBhcmFtICB7SFRNTEVsZW1lbnR9ICBlbFxuXHQgKiBAcGFyYW0gIHtPYmplY3R9ICAgICAgIFtvcHRpb25zXVxuXHQgKi9cblx0ZnVuY3Rpb24gU29ydGFibGUoZWwsIG9wdGlvbnMpe1xuXHRcdHRoaXMuZWwgPSBlbDsgLy8gcm9vdCBlbGVtZW50XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucyA9IChvcHRpb25zIHx8IHt9KTtcblxuXG5cdFx0Ly8gRGVmYXVsdHNcblx0XHR2YXIgZGVmYXVsdHMgPSB7XG5cdFx0XHRncm91cDogTWF0aC5yYW5kb20oKSxcblx0XHRcdHN0b3JlOiBudWxsLFxuXHRcdFx0aGFuZGxlOiBudWxsLFxuXHRcdFx0ZHJhZ2dhYmxlOiBlbC5jaGlsZHJlblswXSAmJiBlbC5jaGlsZHJlblswXS5ub2RlTmFtZSB8fCAoL1t1b11sL2kudGVzdChlbC5ub2RlTmFtZSkgPyAnbGknIDogJyonKSxcblx0XHRcdGdob3N0Q2xhc3M6ICdzb3J0YWJsZS1naG9zdCcsXG5cdFx0XHRpZ25vcmU6ICdhLCBpbWcnLFxuXHRcdFx0ZmlsdGVyOiBudWxsXG5cdFx0fTtcblxuXHRcdC8vIFNldCBkZWZhdWx0IG9wdGlvbnNcblx0XHRmb3IgKHZhciBuYW1lIGluIGRlZmF1bHRzKSB7XG5cdFx0XHRvcHRpb25zW25hbWVdID0gb3B0aW9uc1tuYW1lXSB8fCBkZWZhdWx0c1tuYW1lXTtcblx0XHR9XG5cblxuXHRcdC8vIERlZmluZSBldmVudHNcblx0XHRfY3VzdG9tRXZlbnRzLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcblx0XHRcdG9wdGlvbnNbbmFtZV0gPSBfYmluZCh0aGlzLCBvcHRpb25zW25hbWVdIHx8IG5vb3ApO1xuXHRcdFx0X29uKGVsLCBuYW1lLnN1YnN0cigyKS50b0xvd2VyQ2FzZSgpLCBvcHRpb25zW25hbWVdKTtcblx0XHR9LCB0aGlzKTtcblxuXG5cdFx0Ly8gRXhwb3J0IGdyb3VwIG5hbWVcblx0XHRlbFtleHBhbmRvXSA9IG9wdGlvbnMuZ3JvdXA7XG5cblxuXHRcdC8vIEJpbmQgYWxsIHByaXZhdGUgbWV0aG9kc1xuXHRcdGZvciggdmFyIGZuIGluIHRoaXMgKXtcblx0XHRcdGlmKCBmbi5jaGFyQXQoMCkgPT09ICdfJyApe1xuXHRcdFx0XHR0aGlzW2ZuXSA9IF9iaW5kKHRoaXMsIHRoaXNbZm5dKTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdC8vIEJpbmQgZXZlbnRzXG5cdFx0X29uKGVsLCAnbW91c2Vkb3duJywgdGhpcy5fb25UYXBTdGFydCk7XG5cdFx0X29uKGVsLCAndG91Y2hzdGFydCcsIHRoaXMuX29uVGFwU3RhcnQpO1xuXHRcdHN1cHBvcnRJRWRuZCAmJiBfb24oZWwsICdzZWxlY3RzdGFydCcsIHRoaXMuX29uVGFwU3RhcnQpO1xuXG5cdFx0X29uKGVsLCAnZHJhZ292ZXInLCB0aGlzLl9vbkRyYWdPdmVyKTtcblx0XHRfb24oZWwsICdkcmFnZW50ZXInLCB0aGlzLl9vbkRyYWdPdmVyKTtcblxuXHRcdHRvdWNoRHJhZ092ZXJMaXN0ZW5lcnMucHVzaCh0aGlzLl9vbkRyYWdPdmVyKTtcblxuXHRcdC8vIFJlc3RvcmUgc29ydGluZ1xuXHRcdG9wdGlvbnMuc3RvcmUgJiYgdGhpcy5zb3J0KG9wdGlvbnMuc3RvcmUuZ2V0KHRoaXMpKTtcblx0fVxuXG5cblx0U29ydGFibGUucHJvdG90eXBlID0gLyoqIEBsZW5kcyBTb3J0YWJsZS5wcm90b3R5cGUgKi8ge1xuXHRcdGNvbnN0cnVjdG9yOiBTb3J0YWJsZSxcblxuXG5cdFx0X2FwcGx5RWZmZWN0czogZnVuY3Rpb24gKCl7XG5cdFx0XHRfdG9nZ2xlQ2xhc3MoZHJhZ0VsLCB0aGlzLm9wdGlvbnMuZ2hvc3RDbGFzcywgdHJ1ZSk7XG5cdFx0fSxcblxuXG5cdFx0X29uVGFwU3RhcnQ6IGZ1bmN0aW9uIChldnQvKipFdmVudHxUb3VjaEV2ZW50Ki8pe1xuXHRcdFx0dmFyXG5cdFx0XHRcdCAgdG91Y2ggPSBldnQudG91Y2hlcyAmJiBldnQudG91Y2hlc1swXVxuXHRcdFx0XHQsIHRhcmdldCA9ICh0b3VjaCB8fCBldnQpLnRhcmdldFxuXHRcdFx0XHQsIG9wdGlvbnMgPSAgdGhpcy5vcHRpb25zXG5cdFx0XHRcdCwgZWwgPSB0aGlzLmVsXG5cdFx0XHRcdCwgZmlsdGVyID0gb3B0aW9ucy5maWx0ZXJcblx0XHRcdDtcblxuXHRcdFx0aWYoIGV2dC50eXBlID09PSAnbW91c2Vkb3duJyAmJiBldnQuYnV0dG9uICE9PSAwICkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG9ubHkgbGVmdCBidXR0b25cblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgZmlsdGVyXG5cdFx0XHRpZiggdHlwZW9mIGZpbHRlciA9PT0gJ2Z1bmN0aW9uJyApe1xuXHRcdFx0XHRpZiggZmlsdGVyLmNhbGwodGhpcywgdGFyZ2V0LCB0aGlzKSApe1xuXHRcdFx0XHRcdF9kaXNwYXRjaEV2ZW50KGVsLCAnZmlsdGVyJywgdGFyZ2V0KTtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGNhbmNlbCBkbmRcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiggZmlsdGVyICl7XG5cdFx0XHRcdGZpbHRlciA9IGZpbHRlci5zcGxpdCgnLCcpLmZpbHRlcihmdW5jdGlvbiAoY3JpdGVyaWEpIHtcblx0XHRcdFx0XHRyZXR1cm4gX2Nsb3Nlc3QodGFyZ2V0LCBjcml0ZXJpYS50cmltKCksIGVsKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKGZpbHRlci5sZW5ndGgpIHtcblx0XHRcdFx0XHRfZGlzcGF0Y2hFdmVudChlbCwgJ2ZpbHRlcicsIHRhcmdldCk7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBjYW5jZWwgZG5kXG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYoIG9wdGlvbnMuaGFuZGxlICl7XG5cdFx0XHRcdHRhcmdldCA9IF9jbG9zZXN0KHRhcmdldCwgb3B0aW9ucy5oYW5kbGUsIGVsKTtcblx0XHRcdH1cblxuXHRcdFx0dGFyZ2V0ID0gX2Nsb3Nlc3QodGFyZ2V0LCBvcHRpb25zLmRyYWdnYWJsZSwgZWwpO1xuXG5cdFx0XHQvLyBJRSA5IFN1cHBvcnRcblx0XHRcdGlmKCB0YXJnZXQgJiYgZXZ0LnR5cGUgPT0gJ3NlbGVjdHN0YXJ0JyApe1xuXHRcdFx0XHRpZiggdGFyZ2V0LnRhZ05hbWUgIT0gJ0EnICYmIHRhcmdldC50YWdOYW1lICE9ICdJTUcnKXtcblx0XHRcdFx0XHR0YXJnZXQuZHJhZ0Ryb3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiggdGFyZ2V0ICYmICFkcmFnRWwgJiYgKHRhcmdldC5wYXJlbnROb2RlID09PSBlbCkgKXtcblx0XHRcdFx0dGFwRXZ0ID0gZXZ0O1xuXG5cdFx0XHRcdHJvb3RFbCA9IHRoaXMuZWw7XG5cdFx0XHRcdGRyYWdFbCA9IHRhcmdldDtcblx0XHRcdFx0bmV4dEVsID0gZHJhZ0VsLm5leHRTaWJsaW5nO1xuXHRcdFx0XHRhY3RpdmVHcm91cCA9IHRoaXMub3B0aW9ucy5ncm91cDtcblxuXHRcdFx0XHRkcmFnRWwuZHJhZ2dhYmxlID0gdHJ1ZTtcblxuXHRcdFx0XHQvLyBEaXNhYmxlIFwiZHJhZ2dhYmxlXCJcblx0XHRcdFx0b3B0aW9ucy5pZ25vcmUuc3BsaXQoJywnKS5mb3JFYWNoKGZ1bmN0aW9uIChjcml0ZXJpYSkge1xuXHRcdFx0XHRcdF9maW5kKHRhcmdldCwgY3JpdGVyaWEudHJpbSgpLCBfZGlzYWJsZURyYWdnYWJsZSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmKCB0b3VjaCApe1xuXHRcdFx0XHRcdC8vIFRvdWNoIGRldmljZSBzdXBwb3J0XG5cdFx0XHRcdFx0dGFwRXZ0ID0ge1xuXHRcdFx0XHRcdFx0ICB0YXJnZXQ6ICB0YXJnZXRcblx0XHRcdFx0XHRcdCwgY2xpZW50WDogdG91Y2guY2xpZW50WFxuXHRcdFx0XHRcdFx0LCBjbGllbnRZOiB0b3VjaC5jbGllbnRZXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdHRoaXMuX29uRHJhZ1N0YXJ0KHRhcEV2dCwgdHJ1ZSk7XG5cdFx0XHRcdFx0ZXZ0LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRfb24oZG9jdW1lbnQsICdtb3VzZXVwJywgdGhpcy5fb25Ecm9wKTtcblx0XHRcdFx0X29uKGRvY3VtZW50LCAndG91Y2hlbmQnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdFx0XHRfb24oZG9jdW1lbnQsICd0b3VjaGNhbmNlbCcsIHRoaXMuX29uRHJvcCk7XG5cblx0XHRcdFx0X29uKHRoaXMuZWwsICdkcmFnc3RhcnQnLCB0aGlzLl9vbkRyYWdTdGFydCk7XG5cdFx0XHRcdF9vbih0aGlzLmVsLCAnZHJhZ2VuZCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHRcdF9vbihkb2N1bWVudCwgJ2RyYWdvdmVyJywgX2dsb2JhbERyYWdPdmVyKTtcblxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYoIGRvY3VtZW50LnNlbGVjdGlvbiApe1xuXHRcdFx0XHRcdFx0ZG9jdW1lbnQuc2VsZWN0aW9uLmVtcHR5KCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHdpbmRvdy5nZXRTZWxlY3Rpb24oKS5yZW1vdmVBbGxSYW5nZXMoKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKXsgfVxuXG5cblx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQoZHJhZ0VsLCAnc3RhcnQnKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X2VtdWxhdGVEcmFnT3ZlcjogZnVuY3Rpb24gKCl7XG5cdFx0XHRpZiggdG91Y2hFdnQgKXtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnZGlzcGxheScsICdub25lJyk7XG5cblx0XHRcdFx0dmFyXG5cdFx0XHRcdFx0ICB0YXJnZXQgPSBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KHRvdWNoRXZ0LmNsaWVudFgsIHRvdWNoRXZ0LmNsaWVudFkpXG5cdFx0XHRcdFx0LCBwYXJlbnQgPSB0YXJnZXRcblx0XHRcdFx0XHQsIGdyb3VwID0gdGhpcy5vcHRpb25zLmdyb3VwXG5cdFx0XHRcdFx0LCBpID0gdG91Y2hEcmFnT3Zlckxpc3RlbmVycy5sZW5ndGhcblx0XHRcdFx0O1xuXG5cdFx0XHRcdGlmKCBwYXJlbnQgKXtcblx0XHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0XHRpZiggcGFyZW50W2V4cGFuZG9dID09PSBncm91cCApe1xuXHRcdFx0XHRcdFx0XHR3aGlsZSggaS0tICl7XG5cdFx0XHRcdFx0XHRcdFx0dG91Y2hEcmFnT3Zlckxpc3RlbmVyc1tpXSh7XG5cdFx0XHRcdFx0XHRcdFx0XHRjbGllbnRYOiB0b3VjaEV2dC5jbGllbnRYLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2xpZW50WTogdG91Y2hFdnQuY2xpZW50WSxcblx0XHRcdFx0XHRcdFx0XHRcdHRhcmdldDogdGFyZ2V0LFxuXHRcdFx0XHRcdFx0XHRcdFx0cm9vdEVsOiBwYXJlbnRcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGFyZ2V0ID0gcGFyZW50OyAvLyBzdG9yZSBsYXN0IGVsZW1lbnRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0d2hpbGUoIHBhcmVudCA9IHBhcmVudC5wYXJlbnROb2RlICk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdkaXNwbGF5JywgJycpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblxuXHRcdF9vblRvdWNoTW92ZTogZnVuY3Rpb24gKGV2dC8qKlRvdWNoRXZlbnQqLyl7XG5cdFx0XHRpZiggdGFwRXZ0ICl7XG5cdFx0XHRcdHZhclxuXHRcdFx0XHRcdCAgdG91Y2ggPSBldnQudG91Y2hlc1swXVxuXHRcdFx0XHRcdCwgZHggPSB0b3VjaC5jbGllbnRYIC0gdGFwRXZ0LmNsaWVudFhcblx0XHRcdFx0XHQsIGR5ID0gdG91Y2guY2xpZW50WSAtIHRhcEV2dC5jbGllbnRZXG5cdFx0XHRcdFx0LCB0cmFuc2xhdGUzZCA9ICd0cmFuc2xhdGUzZCgnICsgZHggKyAncHgsJyArIGR5ICsgJ3B4LDApJ1xuXHRcdFx0XHQ7XG5cblx0XHRcdFx0dG91Y2hFdnQgPSB0b3VjaDtcblxuXHRcdFx0XHRfY3NzKGdob3N0RWwsICd3ZWJraXRUcmFuc2Zvcm0nLCB0cmFuc2xhdGUzZCk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ21velRyYW5zZm9ybScsIHRyYW5zbGF0ZTNkKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnbXNUcmFuc2Zvcm0nLCB0cmFuc2xhdGUzZCk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ3RyYW5zZm9ybScsIHRyYW5zbGF0ZTNkKTtcblxuXHRcdFx0XHRldnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cblx0XHRfb25EcmFnU3RhcnQ6IGZ1bmN0aW9uIChldnQvKipFdmVudCovLCBpc1RvdWNoLyoqQm9vbGVhbiovKXtcblx0XHRcdHZhciBkYXRhVHJhbnNmZXIgPSBldnQuZGF0YVRyYW5zZmVyO1xuXG5cdFx0XHR0aGlzLl9vZmZVcEV2ZW50cygpO1xuXG5cdFx0XHRpZiggaXNUb3VjaCApe1xuXHRcdFx0XHR2YXJcblx0XHRcdFx0XHQgIHJlY3QgPSBkcmFnRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcblx0XHRcdFx0XHQsIGNzcyA9IF9jc3MoZHJhZ0VsKVxuXHRcdFx0XHRcdCwgZ2hvc3RSZWN0XG5cdFx0XHRcdDtcblxuXHRcdFx0XHRnaG9zdEVsID0gZHJhZ0VsLmNsb25lTm9kZSh0cnVlKTtcblxuXHRcdFx0XHRfY3NzKGdob3N0RWwsICd0b3AnLCByZWN0LnRvcCAtIHBhcnNlSW50KGNzcy5tYXJnaW5Ub3AsIDEwKSk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ2xlZnQnLCByZWN0LmxlZnQgLSBwYXJzZUludChjc3MubWFyZ2luTGVmdCwgMTApKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnd2lkdGgnLCByZWN0LndpZHRoKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnaGVpZ2h0JywgcmVjdC5oZWlnaHQpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdvcGFjaXR5JywgJzAuOCcpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdwb3NpdGlvbicsICdmaXhlZCcpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICd6SW5kZXgnLCAnMTAwMDAwJyk7XG5cblx0XHRcdFx0cm9vdEVsLmFwcGVuZENoaWxkKGdob3N0RWwpO1xuXG5cdFx0XHRcdC8vIEZpeGluZyBkaW1lbnNpb25zLlxuXHRcdFx0XHRnaG9zdFJlY3QgPSBnaG9zdEVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICd3aWR0aCcsIHJlY3Qud2lkdGgqMiAtIGdob3N0UmVjdC53aWR0aCk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ2hlaWdodCcsIHJlY3QuaGVpZ2h0KjIgLSBnaG9zdFJlY3QuaGVpZ2h0KTtcblxuXHRcdFx0XHQvLyBCaW5kIHRvdWNoIGV2ZW50c1xuXHRcdFx0XHRfb24oZG9jdW1lbnQsICd0b3VjaG1vdmUnLCB0aGlzLl9vblRvdWNoTW92ZSk7XG5cdFx0XHRcdF9vbihkb2N1bWVudCwgJ3RvdWNoZW5kJywgdGhpcy5fb25Ecm9wKTtcblx0XHRcdFx0X29uKGRvY3VtZW50LCAndG91Y2hjYW5jZWwnLCB0aGlzLl9vbkRyb3ApO1xuXG5cdFx0XHRcdHRoaXMuX2xvb3BJZCA9IHNldEludGVydmFsKHRoaXMuX2VtdWxhdGVEcmFnT3ZlciwgMTUwKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRkYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdtb3ZlJztcblx0XHRcdFx0ZGF0YVRyYW5zZmVyLnNldERhdGEoJ1RleHQnLCBkcmFnRWwudGV4dENvbnRlbnQpO1xuXG5cdFx0XHRcdF9vbihkb2N1bWVudCwgJ2Ryb3AnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXRUaW1lb3V0KHRoaXMuX2FwcGx5RWZmZWN0cyk7XG5cdFx0fSxcblxuXG5cdFx0X29uRHJhZ092ZXI6IGZ1bmN0aW9uIChldnQvKipFdmVudCovKXtcblx0XHRcdGlmKCAhX3NpbGVudCAmJiAoYWN0aXZlR3JvdXAgPT09IHRoaXMub3B0aW9ucy5ncm91cCkgJiYgKGV2dC5yb290RWwgPT09IHZvaWQgMCB8fCBldnQucm9vdEVsID09PSB0aGlzLmVsKSApe1xuXHRcdFx0XHR2YXJcblx0XHRcdFx0XHQgIGVsID0gdGhpcy5lbFxuXHRcdFx0XHRcdCwgdGFyZ2V0ID0gX2Nsb3Nlc3QoZXZ0LnRhcmdldCwgdGhpcy5vcHRpb25zLmRyYWdnYWJsZSwgZWwpXG5cdFx0XHRcdDtcblxuXHRcdFx0XHRpZiggZWwuY2hpbGRyZW4ubGVuZ3RoID09PSAwIHx8IGVsLmNoaWxkcmVuWzBdID09PSBnaG9zdEVsIHx8IChlbCA9PT0gZXZ0LnRhcmdldCkgJiYgX2dob3N0SW5Cb3R0b20oZWwsIGV2dCkgKXtcblx0XHRcdFx0XHRlbC5hcHBlbmRDaGlsZChkcmFnRWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYoIHRhcmdldCAmJiB0YXJnZXQgIT09IGRyYWdFbCAmJiAodGFyZ2V0LnBhcmVudE5vZGVbZXhwYW5kb10gIT09IHZvaWQgMCkgKXtcblx0XHRcdFx0XHRpZiggbGFzdEVsICE9PSB0YXJnZXQgKXtcblx0XHRcdFx0XHRcdGxhc3RFbCA9IHRhcmdldDtcblx0XHRcdFx0XHRcdGxhc3RDU1MgPSBfY3NzKHRhcmdldCk7XG5cdFx0XHRcdFx0XHRsYXN0UmVjdCA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0XHR9XG5cblxuXHRcdFx0XHRcdHZhclxuXHRcdFx0XHRcdFx0ICByZWN0ID0gbGFzdFJlY3Rcblx0XHRcdFx0XHRcdCwgd2lkdGggPSByZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0XG5cdFx0XHRcdFx0XHQsIGhlaWdodCA9IHJlY3QuYm90dG9tIC0gcmVjdC50b3Bcblx0XHRcdFx0XHRcdCwgZmxvYXRpbmcgPSAvbGVmdHxyaWdodHxpbmxpbmUvLnRlc3QobGFzdENTUy5jc3NGbG9hdCArIGxhc3RDU1MuZGlzcGxheSlcblx0XHRcdFx0XHRcdCwgaXNXaWRlID0gKHRhcmdldC5vZmZzZXRXaWR0aCA+IGRyYWdFbC5vZmZzZXRXaWR0aClcblx0XHRcdFx0XHRcdCwgaXNMb25nID0gKHRhcmdldC5vZmZzZXRIZWlnaHQgPiBkcmFnRWwub2Zmc2V0SGVpZ2h0KVxuXHRcdFx0XHRcdFx0LCBoYWxmd2F5ID0gKGZsb2F0aW5nID8gKGV2dC5jbGllbnRYIC0gcmVjdC5sZWZ0KS93aWR0aCA6IChldnQuY2xpZW50WSAtIHJlY3QudG9wKS9oZWlnaHQpID4gLjVcblx0XHRcdFx0XHRcdCwgbmV4dFNpYmxpbmcgPSB0YXJnZXQubmV4dEVsZW1lbnRTaWJsaW5nXG5cdFx0XHRcdFx0XHQsIGFmdGVyXG5cdFx0XHRcdFx0O1xuXG5cdFx0XHRcdFx0X3NpbGVudCA9IHRydWU7XG5cdFx0XHRcdFx0c2V0VGltZW91dChfdW5zaWxlbnQsIDMwKTtcblxuXHRcdFx0XHRcdGlmKCBmbG9hdGluZyApe1xuXHRcdFx0XHRcdFx0YWZ0ZXIgPSAodGFyZ2V0LnByZXZpb3VzRWxlbWVudFNpYmxpbmcgPT09IGRyYWdFbCkgJiYgIWlzV2lkZSB8fCBoYWxmd2F5ICYmIGlzV2lkZVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhZnRlciA9IChuZXh0U2libGluZyAhPT0gZHJhZ0VsKSAmJiAhaXNMb25nIHx8IGhhbGZ3YXkgJiYgaXNMb25nO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmKCBhZnRlciAmJiAhbmV4dFNpYmxpbmcgKXtcblx0XHRcdFx0XHRcdGVsLmFwcGVuZENoaWxkKGRyYWdFbCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRhcmdldC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShkcmFnRWwsIGFmdGVyID8gbmV4dFNpYmxpbmcgOiB0YXJnZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfb2ZmVXBFdmVudHM6IGZ1bmN0aW9uICgpIHtcblx0XHRcdF9vZmYoZG9jdW1lbnQsICdtb3VzZXVwJywgdGhpcy5fb25Ecm9wKTtcblx0XHRcdF9vZmYoZG9jdW1lbnQsICd0b3VjaG1vdmUnLCB0aGlzLl9vblRvdWNoTW92ZSk7XG5cdFx0XHRfb2ZmKGRvY3VtZW50LCAndG91Y2hlbmQnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdFx0X29mZihkb2N1bWVudCwgJ3RvdWNoY2FuY2VsJywgdGhpcy5fb25Ecm9wKTtcblx0XHR9LFxuXG5cdFx0X29uRHJvcDogZnVuY3Rpb24gKGV2dC8qKkV2ZW50Ki8pe1xuXHRcdFx0Y2xlYXJJbnRlcnZhbCh0aGlzLl9sb29wSWQpO1xuXG5cdFx0XHQvLyBVbmJpbmQgZXZlbnRzXG5cdFx0XHRfb2ZmKGRvY3VtZW50LCAnZHJvcCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHRfb2ZmKGRvY3VtZW50LCAnZHJhZ292ZXInLCBfZ2xvYmFsRHJhZ092ZXIpO1xuXG5cdFx0XHRfb2ZmKHRoaXMuZWwsICdkcmFnZW5kJywgdGhpcy5fb25Ecm9wKTtcblx0XHRcdF9vZmYodGhpcy5lbCwgJ2RyYWdzdGFydCcsIHRoaXMuX29uRHJhZ1N0YXJ0KTtcblx0XHRcdF9vZmYodGhpcy5lbCwgJ3NlbGVjdHN0YXJ0JywgdGhpcy5fb25UYXBTdGFydCk7XG5cblx0XHRcdHRoaXMuX29mZlVwRXZlbnRzKCk7XG5cblx0XHRcdGlmKCBldnQgKXtcblx0XHRcdFx0ZXZ0LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2dC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdFx0XHRpZiggZ2hvc3RFbCApe1xuXHRcdFx0XHRcdGdob3N0RWwucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChnaG9zdEVsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmKCBkcmFnRWwgKXtcblx0XHRcdFx0XHRfZGlzYWJsZURyYWdnYWJsZShkcmFnRWwpO1xuXHRcdFx0XHRcdF90b2dnbGVDbGFzcyhkcmFnRWwsIHRoaXMub3B0aW9ucy5naG9zdENsYXNzLCBmYWxzZSk7XG5cblx0XHRcdFx0XHRpZiggIXJvb3RFbC5jb250YWlucyhkcmFnRWwpICl7XG5cdFx0XHRcdFx0XHQvLyBSZW1vdmUgZXZlbnRcblx0XHRcdFx0XHRcdF9kaXNwYXRjaEV2ZW50KHJvb3RFbCwgJ3JlbW92ZScsIGRyYWdFbCk7XG5cblx0XHRcdFx0XHRcdC8vIEFkZCBldmVudFxuXHRcdFx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQoZHJhZ0VsLCAnYWRkJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2UgaWYoIGRyYWdFbC5uZXh0U2libGluZyAhPT0gbmV4dEVsICl7XG5cdFx0XHRcdFx0XHQvLyBVcGRhdGUgZXZlbnRcblx0XHRcdFx0XHRcdF9kaXNwYXRjaEV2ZW50KGRyYWdFbCwgJ3VwZGF0ZScpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdF9kaXNwYXRjaEV2ZW50KGRyYWdFbCwgJ2VuZCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2V0IE5VTExcblx0XHRcdFx0cm9vdEVsID1cblx0XHRcdFx0ZHJhZ0VsID1cblx0XHRcdFx0Z2hvc3RFbCA9XG5cdFx0XHRcdG5leHRFbCA9XG5cblx0XHRcdFx0dGFwRXZ0ID1cblx0XHRcdFx0dG91Y2hFdnQgPVxuXG5cdFx0XHRcdGxhc3RFbCA9XG5cdFx0XHRcdGxhc3RDU1MgPVxuXG5cdFx0XHRcdGFjdGl2ZUdyb3VwID0gbnVsbDtcblxuXHRcdFx0XHQvLyBTYXZlIHNvcnRpbmdcblx0XHRcdFx0dGhpcy5vcHRpb25zLnN0b3JlICYmIHRoaXMub3B0aW9ucy5zdG9yZS5zZXQodGhpcyk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXG5cdFx0LyoqXG5cdFx0ICogU2VyaWFsaXplcyB0aGUgaXRlbSBpbnRvIGFuIGFycmF5IG9mIHN0cmluZy5cblx0XHQgKiBAcmV0dXJucyB7U3RyaW5nW119XG5cdFx0ICovXG5cdFx0dG9BcnJheTogZnVuY3Rpb24gKCkge1xuXHRcdFx0dmFyIG9yZGVyID0gW10sXG5cdFx0XHRcdGVsLFxuXHRcdFx0XHRjaGlsZHJlbiA9IHRoaXMuZWwuY2hpbGRyZW4sXG5cdFx0XHRcdGkgPSAwLFxuXHRcdFx0XHRuID0gY2hpbGRyZW4ubGVuZ3RoXG5cdFx0XHQ7XG5cblx0XHRcdGZvciAoOyBpIDwgbjsgaSsrKSB7XG5cdFx0XHRcdGVsID0gY2hpbGRyZW5baV07XG5cdFx0XHRcdGlmIChfY2xvc2VzdChlbCwgdGhpcy5vcHRpb25zLmRyYWdnYWJsZSwgdGhpcy5lbCkpIHtcblx0XHRcdFx0XHRvcmRlci5wdXNoKGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1pZCcpIHx8IF9nZW5lcmF0ZUlkKGVsKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG9yZGVyO1xuXHRcdH0sXG5cblxuXHRcdC8qKlxuXHRcdCAqIFNvcnRzIHRoZSBlbGVtZW50cyBhY2NvcmRpbmcgdG8gdGhlIGFycmF5LlxuXHRcdCAqIEBwYXJhbSAge1N0cmluZ1tdfSAgb3JkZXIgIG9yZGVyIG9mIHRoZSBpdGVtc1xuXHRcdCAqL1xuXHRcdHNvcnQ6IGZ1bmN0aW9uIChvcmRlcikge1xuXHRcdFx0dmFyIGl0ZW1zID0ge30sIHJvb3RFbCA9IHRoaXMuZWw7XG5cblx0XHRcdHRoaXMudG9BcnJheSgpLmZvckVhY2goZnVuY3Rpb24gKGlkLCBpKSB7XG5cdFx0XHRcdHZhciBlbCA9IHJvb3RFbC5jaGlsZHJlbltpXTtcblxuXHRcdFx0XHRpZiAoX2Nsb3Nlc3QoZWwsIHRoaXMub3B0aW9ucy5kcmFnZ2FibGUsIHJvb3RFbCkpIHtcblx0XHRcdFx0XHRpdGVtc1tpZF0gPSBlbDtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdGhpcyk7XG5cblxuXHRcdFx0b3JkZXIuZm9yRWFjaChmdW5jdGlvbiAoaWQpIHtcblx0XHRcdFx0aWYgKGl0ZW1zW2lkXSkge1xuXHRcdFx0XHRcdHJvb3RFbC5yZW1vdmVDaGlsZChpdGVtc1tpZF0pO1xuXHRcdFx0XHRcdHJvb3RFbC5hcHBlbmRDaGlsZChpdGVtc1tpZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBGb3IgZWFjaCBlbGVtZW50IGluIHRoZSBzZXQsIGdldCB0aGUgZmlyc3QgZWxlbWVudCB0aGF0IG1hdGNoZXMgdGhlIHNlbGVjdG9yIGJ5IHRlc3RpbmcgdGhlIGVsZW1lbnQgaXRzZWxmIGFuZCB0cmF2ZXJzaW5nIHVwIHRocm91Z2ggaXRzIGFuY2VzdG9ycyBpbiB0aGUgRE9NIHRyZWUuXG5cdFx0ICogQHBhcmFtICAge0hUTUxFbGVtZW50fSAgZWxcblx0XHQgKiBAcGFyYW0gICB7U3RyaW5nfSAgICAgICBbc2VsZWN0b3JdICBkZWZhdWx0OiBgb3B0aW9ucy5kcmFnZ2FibGVgXG5cdFx0ICogQHJldHVybnMge0hUTUxFbGVtZW50fG51bGx9XG5cdFx0ICovXG5cdFx0Y2xvc2VzdDogZnVuY3Rpb24gKGVsLCBzZWxlY3Rvcikge1xuXHRcdFx0cmV0dXJuIF9jbG9zZXN0KGVsLCBzZWxlY3RvciB8fCB0aGlzLm9wdGlvbnMuZHJhZ2dhYmxlLCB0aGlzLmVsKTtcblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBEZXN0cm95XG5cdFx0ICovXG5cdFx0ZGVzdHJveTogZnVuY3Rpb24gKCkge1xuXHRcdFx0dmFyIGVsID0gdGhpcy5lbCwgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcblxuXHRcdFx0X2N1c3RvbUV2ZW50cy5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XG5cdFx0XHRcdF9vZmYoZWwsIG5hbWUuc3Vic3RyKDIpLnRvTG93ZXJDYXNlKCksIG9wdGlvbnNbbmFtZV0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdF9vZmYoZWwsICdtb3VzZWRvd24nLCB0aGlzLl9vblRhcFN0YXJ0KTtcblx0XHRcdF9vZmYoZWwsICd0b3VjaHN0YXJ0JywgdGhpcy5fb25UYXBTdGFydCk7XG5cdFx0XHRfb2ZmKGVsLCAnc2VsZWN0c3RhcnQnLCB0aGlzLl9vblRhcFN0YXJ0KTtcblxuXHRcdFx0X29mZihlbCwgJ2RyYWdvdmVyJywgdGhpcy5fb25EcmFnT3Zlcik7XG5cdFx0XHRfb2ZmKGVsLCAnZHJhZ2VudGVyJywgdGhpcy5fb25EcmFnT3Zlcik7XG5cblx0XHRcdC8vcmVtb3ZlIGRyYWdnYWJsZSBhdHRyaWJ1dGVzXG5cdFx0XHRBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKGVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkcmFnZ2FibGVdJyksIGZ1bmN0aW9uKGVsKSB7XG5cdFx0XHRcdGVsLnJlbW92ZUF0dHJpYnV0ZSgnZHJhZ2dhYmxlJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dG91Y2hEcmFnT3Zlckxpc3RlbmVycy5zcGxpY2UodG91Y2hEcmFnT3Zlckxpc3RlbmVycy5pbmRleE9mKHRoaXMuX29uRHJhZ092ZXIpLCAxKTtcblxuXHRcdFx0dGhpcy5fb25Ecm9wKCk7XG5cblx0XHRcdHRoaXMuZWwgPSBudWxsO1xuXHRcdH1cblx0fTtcblxuXG5cdGZ1bmN0aW9uIF9iaW5kKGN0eCwgZm4pe1xuXHRcdHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuXHRcdHJldHVyblx0Zm4uYmluZCA/IGZuLmJpbmQuYXBwbHkoZm4sIFtjdHhdLmNvbmNhdChhcmdzKSkgOiBmdW5jdGlvbiAoKXtcblx0XHRcdHJldHVybiBmbi5hcHBseShjdHgsIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuXHRcdH07XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF9jbG9zZXN0KGVsLCBzZWxlY3RvciwgY3R4KXtcblx0XHRpZiggc2VsZWN0b3IgPT09ICcqJyApe1xuXHRcdFx0cmV0dXJuIGVsO1xuXHRcdH1cblx0XHRlbHNlIGlmKCBlbCApe1xuXHRcdFx0Y3R4ID0gY3R4IHx8IGRvY3VtZW50O1xuXHRcdFx0c2VsZWN0b3IgPSBzZWxlY3Rvci5zcGxpdCgnLicpO1xuXG5cdFx0XHR2YXJcblx0XHRcdFx0ICB0YWcgPSBzZWxlY3Rvci5zaGlmdCgpLnRvVXBwZXJDYXNlKClcblx0XHRcdFx0LCByZSA9IG5ldyBSZWdFeHAoJ1xcXFxzKCcrc2VsZWN0b3Iuam9pbignfCcpKycpXFxcXHMnLCAnZycpXG5cdFx0XHQ7XG5cblx0XHRcdGRvIHtcblx0XHRcdFx0aWYoXG5cdFx0XHRcdFx0ICAgKHRhZyA9PT0gJycgfHwgZWwubm9kZU5hbWUgPT0gdGFnKVxuXHRcdFx0XHRcdCYmICghc2VsZWN0b3IubGVuZ3RoIHx8ICgoJyAnK2VsLmNsYXNzTmFtZSsnICcpLm1hdGNoKHJlKSB8fCBbXSkubGVuZ3RoID09IHNlbGVjdG9yLmxlbmd0aClcblx0XHRcdFx0KXtcblx0XHRcdFx0XHRyZXR1cm5cdGVsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR3aGlsZSggZWwgIT09IGN0eCAmJiAoZWwgPSBlbC5wYXJlbnROb2RlKSApO1xuXHRcdH1cblxuXHRcdHJldHVyblx0bnVsbDtcblx0fVxuXG5cblx0ZnVuY3Rpb24gX2dsb2JhbERyYWdPdmVyKGV2dCl7XG5cdFx0ZXZ0LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ21vdmUnO1xuXHRcdGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfb24oZWwsIGV2ZW50LCBmbil7XG5cdFx0ZWwuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgZm4sIGZhbHNlKTtcblx0fVxuXG5cblx0ZnVuY3Rpb24gX29mZihlbCwgZXZlbnQsIGZuKXtcblx0XHRlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBmbiwgZmFsc2UpO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfdG9nZ2xlQ2xhc3MoZWwsIG5hbWUsIHN0YXRlKXtcblx0XHRpZiggZWwgKXtcblx0XHRcdGlmKCBlbC5jbGFzc0xpc3QgKXtcblx0XHRcdFx0ZWwuY2xhc3NMaXN0W3N0YXRlID8gJ2FkZCcgOiAncmVtb3ZlJ10obmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dmFyIGNsYXNzTmFtZSA9ICgnICcrZWwuY2xhc3NOYW1lKycgJykucmVwbGFjZSgvXFxzKy9nLCAnICcpLnJlcGxhY2UoJyAnK25hbWUrJyAnLCAnJyk7XG5cdFx0XHRcdGVsLmNsYXNzTmFtZSA9IGNsYXNzTmFtZSArIChzdGF0ZSA/ICcgJytuYW1lIDogJycpXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblxuXHRmdW5jdGlvbiBfY3NzKGVsLCBwcm9wLCB2YWwpe1xuXHRcdGlmKCBlbCAmJiBlbC5zdHlsZSApe1xuXHRcdFx0aWYoIHZhbCA9PT0gdm9pZCAwICl7XG5cdFx0XHRcdGlmKCBkb2N1bWVudC5kZWZhdWx0VmlldyAmJiBkb2N1bWVudC5kZWZhdWx0Vmlldy5nZXRDb21wdXRlZFN0eWxlICl7XG5cdFx0XHRcdFx0dmFsID0gZG9jdW1lbnQuZGVmYXVsdFZpZXcuZ2V0Q29tcHV0ZWRTdHlsZShlbCwgJycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYoIGVsLmN1cnJlbnRTdHlsZSApe1xuXHRcdFx0XHRcdHZhbFx0PSBlbC5jdXJyZW50U3R5bGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuXHRwcm9wID09PSB2b2lkIDAgPyB2YWwgOiB2YWxbcHJvcF07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbC5zdHlsZVtwcm9wXSA9IHZhbCArICh0eXBlb2YgdmFsID09PSAnc3RyaW5nJyA/ICcnIDogJ3B4Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblxuXHRmdW5jdGlvbiBfZmluZChjdHgsIHRhZ05hbWUsIGl0ZXJhdG9yKXtcblx0XHRpZiggY3R4ICl7XG5cdFx0XHR2YXIgbGlzdCA9IGN0eC5nZXRFbGVtZW50c0J5VGFnTmFtZSh0YWdOYW1lKSwgaSA9IDAsIG4gPSBsaXN0Lmxlbmd0aDtcblx0XHRcdGlmKCBpdGVyYXRvciApe1xuXHRcdFx0XHRmb3IoIDsgaSA8IG47IGkrKyApe1xuXHRcdFx0XHRcdGl0ZXJhdG9yKGxpc3RbaV0sIGkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm5cdGxpc3Q7XG5cdFx0fVxuXHRcdHJldHVyblx0W107XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF9kaXNhYmxlRHJhZ2dhYmxlKGVsKXtcblx0XHRyZXR1cm4gZWwuZHJhZ2dhYmxlID0gZmFsc2U7XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF91bnNpbGVudCgpe1xuXHRcdF9zaWxlbnQgPSBmYWxzZTtcblx0fVxuXG5cblx0ZnVuY3Rpb24gX2dob3N0SW5Cb3R0b20oZWwsIGV2dCl7XG5cdFx0dmFyIGxhc3QgPSBlbC5sYXN0RWxlbWVudENoaWxkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHJldHVybiBldnQuY2xpZW50WSAtIChsYXN0LnRvcCArIGxhc3QuaGVpZ2h0KSA+IDU7IC8vIG1pbiBkZWx0YVxuXHR9XG5cblxuXHQvKipcblx0ICogR2VuZXJhdGUgaWRcblx0ICogQHBhcmFtICAge0hUTUxFbGVtZW50fSBlbFxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfVxuXHQgKiBAcHJpdmF0ZVxuXHQgKi9cblx0ZnVuY3Rpb24gX2dlbmVyYXRlSWQoZWwpIHtcblx0XHR2YXIgc3RyID0gZWwudGFnTmFtZSArIGVsLmNsYXNzTmFtZSArIGVsLnNyYyArIGVsLmhyZWYgKyBlbC50ZXh0Q29udGVudCxcblx0XHRcdGkgPSBzdHIubGVuZ3RoLFxuXHRcdFx0c3VtID0gMFxuXHRcdDtcblxuXHRcdHdoaWxlIChpLS0pIHtcblx0XHRcdHN1bSArPSBzdHIuY2hhckNvZGVBdChpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VtLnRvU3RyaW5nKDM2KTtcblx0fVxuXG5cblx0Ly8gRXhwb3J0IHV0aWxzXG5cdFNvcnRhYmxlLnV0aWxzID0ge1xuXHRcdG9uOiBfb24sXG5cdFx0b2ZmOiBfb2ZmLFxuXHRcdGNzczogX2Nzcyxcblx0XHRmaW5kOiBfZmluZCxcblx0XHRiaW5kOiBfYmluZCxcblx0XHRjbG9zZXN0OiBfY2xvc2VzdCxcblx0XHR0b2dnbGVDbGFzczogX3RvZ2dsZUNsYXNzLFxuXHRcdGNyZWF0ZUV2ZW50OiBfY3JlYXRlRXZlbnQsXG5cdFx0ZGlzcGF0Y2hFdmVudDogX2Rpc3BhdGNoRXZlbnRcblx0fTtcblxuXG5cdFNvcnRhYmxlLnZlcnNpb24gPSAnMC41LjInO1xuXG5cblx0Ly8gRXhwb3J0XG5cdHJldHVybiBTb3J0YWJsZTtcbn0pO1xuIiwiKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICBhbmd1bGFyLm1vZHVsZSgnYXBwJywgWyd5b3V0dWJlLWVtYmVkJ10pO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgSGFzaCA9IGZ1bmN0aW9uKCR3aW5kb3cpIHtcblxuICAgIHJldHVybiB7XG5cbiAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBoYXNoID0gZGVjb2RlVVJJQ29tcG9uZW50KCR3aW5kb3cubG9jYXRpb24uaGFzaC5zdWJzdHJpbmcoMSkpO1xuICAgICAgICBpZiAoaGFzaC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFuZ3VsYXIuZnJvbUpzb24oQmFzZTY0LmJ0b3UoUmF3RGVmbGF0ZS5pbmZsYXRlKEJhc2U2NC5mcm9tQmFzZTY0KGhhc2gpKSkpO1xuICAgICAgfSxcblxuICAgICAgc2V0OiBmdW5jdGlvbihhcnIpIHtcbiAgICAgICAgJHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gYXJyLmxlbmd0aCA9PT0gMCA/ICcnIDogZW5jb2RlVVJJQ29tcG9uZW50KEJhc2U2NC50b0Jhc2U2NChSYXdEZWZsYXRlLmRlZmxhdGUoQmFzZTY0LnV0b2IoYW5ndWxhci50b0pzb24oYXJyKSkpKSk7XG4gICAgICB9LFxuXG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5mYWN0b3J5KCdIYXNoJywgWyckd2luZG93JywgSGFzaF0pO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgam9ja2V5ID0gcmVxdWlyZSgnam9ja2V5Jyk7XG5cbiAgdmFyIFBsYXlsaXN0TW9kZWwgPSBmdW5jdGlvbigkcm9vdFNjb3BlLCBIYXNoKSB7XG5cbiAgICB2YXIgaXRlbXMgPSBIYXNoLmdldCgpO1xuICAgIHZhciBjYnMgPSB7XG4gICAgICBvbk1vZGVsQ2hhbmdlOiBmdW5jdGlvbihpdGVtcykge1xuICAgICAgICBIYXNoLnNldChpdGVtcyk7XG4gICAgICB9LFxuICAgICAgb25TdGF0ZUNoYW5nZTogZnVuY3Rpb24oc3RhdGUsIGN1cnJlbnRJdGVtKSB7XG4gICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChzdGF0ZSwgY3VycmVudEl0ZW0pO1xuICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIGpvY2tleShpdGVtcywgY2JzKTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5mYWN0b3J5KCdQbGF5bGlzdE1vZGVsJywgWyckcm9vdFNjb3BlJywgJ0hhc2gnLCBQbGF5bGlzdE1vZGVsXSk7XG5cbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBUElfS0VZID0gJ0FJemFTeUNpNjdFVGk4eVBkeU9jbGo4VDcwUHJJM3o4V0VvZTlmbyc7XG5cbiAgdmFyIG1hcCA9IGZ1bmN0aW9uKGFyciwgY2IpIHtcbiAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgdmFyIGkgPSAtMTtcbiAgICB2YXIgbGVuID0gYXJyLmxlbmd0aDtcbiAgICB3aGlsZSAoKytpIDwgbGVuKSB7XG4gICAgICByZXN1bHQucHVzaChjYihhcnJbaV0sIGkpKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICB2YXIgemVyb1BhZCA9IGZ1bmN0aW9uKG4pIHtcbiAgICBuID0gbiA/IG4gKyAnJyA6ICcnO1xuICAgIHJldHVybiBuLmxlbmd0aCA+PSAyID8gbiA6IG5ldyBBcnJheSgyIC0gbi5sZW5ndGggKyAxKS5qb2luKCcwJykgKyBuO1xuICB9O1xuXG4gIHZhciBmb3JtYXREdXJhdGlvbiA9IGZ1bmN0aW9uKHN0ciwgZGVsaW1ldGVyKSB7XG4gICAgdmFyIG1hdGNoZXMgPSBzdHIubWF0Y2goL15QVCg/OihcXGQrKUgpPyg/OihcXGQrKU0pPyg/OihcXGQrKVMpPyQvKS5zbGljZSgxLCA0KTtcbiAgICB2YXIgaSA9IC0xO1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB3aGlsZSAoKytpIDwgMykge1xuICAgICAgaWYgKGkgPT09IDAgJiYgYW5ndWxhci5pc1VuZGVmaW5lZChtYXRjaGVzW2ldKSkge1xuICAgICAgICAvLyBza2lwIGhvdXJzIGlmIHVuZGVmaW5lZFxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wdXNoKHplcm9QYWQobWF0Y2hlc1tpXSB8fCAnMDAnKSk7IC8vIG1pbnV0ZXMgYW5kIHNlY29uZHNcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdC5qb2luKGRlbGltZXRlcik7XG4gIH07XG5cbiAgdmFyIFlvdVR1YmVBUEkgPSBmdW5jdGlvbigkaHR0cCkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNlYXJjaDogZnVuY3Rpb24ocXVlcnkpIHtcbiAgICAgICAgcXVlcnkgPSBlbmNvZGVVUklDb21wb25lbnQocXVlcnkpLnJlcGxhY2UoLyUyMC9nLCAnKycpO1xuICAgICAgICB2YXIgZW5kcG9pbnQgPSAnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20veW91dHViZS92My9zZWFyY2g/cGFydD1zbmlwcGV0JmZpZWxkcz1pdGVtcyhpZCUyQ3NuaXBwZXQpJm1heFJlc3VsdHM9NTAmb3JkZXI9dmlld0NvdW50JnE9JyArIHF1ZXJ5ICsgJyZ0eXBlPXZpZGVvJnZpZGVvRW1iZWRkYWJsZT10cnVlJnZpZGVvU3luZGljYXRlZD10cnVlJmtleT0nICsgQVBJX0tFWTtcbiAgICAgICAgcmV0dXJuICRodHRwLmdldChlbmRwb2ludClcbiAgICAgICAgICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXAocmVzcG9uc2UuZGF0YS5pdGVtcywgZnVuY3Rpb24oaXRlbSkge1xuICAgICAgICAgICAgICByZXR1cm4gaXRlbS5pZC52aWRlb0lkO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihmdW5jdGlvbihpZHMpIHtcbiAgICAgICAgICAgIHZhciBlbmRwb2ludCA9ICdodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS95b3V0dWJlL3YzL3ZpZGVvcz9wYXJ0PWlkJTJDY29udGVudERldGFpbHMlMkNzbmlwcGV0JmlkPScgKyBpZHMuam9pbignJTJDJykgKyAnJmZpZWxkcz1pdGVtcyhpZCUyQ2NvbnRlbnREZXRhaWxzJTJDc25pcHBldCkma2V5PScgKyBBUElfS0VZO1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldChlbmRwb2ludCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXAocmVzcG9uc2UuZGF0YS5pdGVtcywgZnVuY3Rpb24oaXRlbSkge1xuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGlkOiBpdGVtLmlkLFxuICAgICAgICAgICAgICAgIHRpdGxlOiBpdGVtLnNuaXBwZXQudGl0bGUsXG4gICAgICAgICAgICAgICAgZHVyYXRpb246IGZvcm1hdER1cmF0aW9uKGl0ZW0uY29udGVudERldGFpbHMuZHVyYXRpb24sICc6JylcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuICAgIH07XG5cbiAgfTtcblxuICBhbmd1bGFyLm1vZHVsZSgnYXBwJykuZmFjdG9yeSgnWW91VHViZUFQSScsIFsnJGh0dHAnLCBZb3VUdWJlQVBJXSk7XG5cbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciB5cUVkaXRhYmxlID0gZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgc2NvcGUgPSB7XG4gICAgICBjYWxsYmFjazogJz15cUVkaXRhYmxlJ1xuICAgIH07XG5cbiAgICB2YXIgbGluayA9IGZ1bmN0aW9uKHNjb3BlLCBlbGVtZW50KSB7XG4gICAgICBlbGVtZW50Lm9uKCdrZXlwcmVzcycsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgaWYgKGUua2V5Q29kZSA9PT0gMTMgfHwgZS5rZXlDb2RlID09PSAyNykge1xuICAgICAgICAgIGUudGFyZ2V0LmJsdXIoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBlbGVtZW50Lm9uKCdibHVyJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNjb3BlLmNhbGxiYWNrKHNjb3BlLiRwYXJlbnQuJGluZGV4LCBlbGVtZW50LnRleHQoKSk7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICBzY29wZTogc2NvcGUsXG4gICAgICBsaW5rOiBsaW5rXG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5kaXJlY3RpdmUoJ3lxRWRpdGFibGUnLCBbeXFFZGl0YWJsZV0pO1xuXG59KSgpO1xuIiwiLyogZ2xvYmFscyBTb3J0YWJsZSAqL1xuKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgeXFTb3J0YWJsZSA9IGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHNjb3BlID0ge1xuICAgICAgY2FsbGJhY2s6ICc9eXFTb3J0YWJsZScsXG4gICAgICBoYW5kbGU6ICdAeXFTb3J0YWJsZUhhbmRsZScsXG4gICAgICBnaG9zdENsYXNzOiAnQHlxU29ydGFibGVHaG9zdENsYXNzJyxcbiAgICB9O1xuXG4gICAgdmFyIGxpbmsgPSBmdW5jdGlvbihzY29wZSwgZWxlbWVudCkge1xuICAgICAgdmFyIG9uVXBkYXRlID0gZnVuY3Rpb24oZSkge1xuICAgICAgICB2YXIgaXRlbXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChlbGVtZW50LmNoaWxkcmVuKCkpO1xuICAgICAgICB2YXIgbW92ZWRJdGVtID0gZS5pdGVtO1xuICAgICAgICB2YXIgb2xkSW5kZXggPSBhbmd1bGFyLmVsZW1lbnQobW92ZWRJdGVtKS5zY29wZSgpLiRpbmRleDtcbiAgICAgICAgdmFyIG5ld0luZGV4ID0gaXRlbXMuaW5kZXhPZihtb3ZlZEl0ZW0pO1xuICAgICAgICBzY29wZS5jYWxsYmFjayhvbGRJbmRleCwgbmV3SW5kZXgpO1xuICAgICAgfTtcbiAgICAgIG5ldyBTb3J0YWJsZShlbGVtZW50WzBdLCB7XG4gICAgICAgIGhhbmRsZTogc2NvcGUuaGFuZGxlLFxuICAgICAgICBnaG9zdENsYXNzOiBzY29wZS5naG9zdENsYXNzLFxuICAgICAgICBvblVwZGF0ZTogb25VcGRhdGUsXG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICBzY29wZTogc2NvcGUsXG4gICAgICBsaW5rOiBsaW5rXG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5kaXJlY3RpdmUoJ3lxU29ydGFibGUnLCBbeXFTb3J0YWJsZV0pO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgeXFTeW5jRm9jdXMgPSBmdW5jdGlvbigpIHtcblxuICAgIHZhciBzY29wZSA9IHtcbiAgICAgIHZhbDogJz15cVN5bmNGb2N1cydcbiAgICB9O1xuXG4gICAgdmFyIGxpbmsgPSBmdW5jdGlvbigkc2NvcGUsICRlbGVtZW50KSB7XG4gICAgICAkc2NvcGUuJHdhdGNoKCd2YWwnLCBmdW5jdGlvbihjdXJyZW50VmFsLCBwcmV2aW91c1ZhbCkge1xuICAgICAgICBpZiAoY3VycmVudFZhbCAmJiAhcHJldmlvdXNWYWwpIHtcbiAgICAgICAgICAkZWxlbWVudFswXS5mb2N1cygpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWN1cnJlbnRWYWwgJiYgcHJldmlvdXNWYWwpIHtcbiAgICAgICAgICAkZWxlbWVudFswXS5ibHVyKCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgIHNjb3BlOiBzY29wZSxcbiAgICAgIGxpbms6IGxpbmtcbiAgICB9O1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmRpcmVjdGl2ZSgneXFTeW5jRm9jdXMnLCBbeXFTeW5jRm9jdXNdKTtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIFRJVExFID0gJ1hPWE8nO1xuXG4gIHZhciBNYWluQ3RybCA9IGZ1bmN0aW9uKCRzY29wZSwgUGxheWxpc3RNb2RlbCkge1xuXG4gICAgJHNjb3BlLmlzU2VhcmNoT3BlbiA9IGZhbHNlO1xuICAgICRzY29wZS5pc1ZpZGVvVmlzaWJsZSA9IGZhbHNlO1xuXG4gICAgJHNjb3BlLnRpdGxlID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoUGxheWxpc3RNb2RlbC5pc1BsYXlpbmcoKSkge1xuICAgICAgICByZXR1cm4gJ1xcdTI1QjYgJyArIFRJVExFO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFRJVExFO1xuICAgIH07XG5cbiAgICAkc2NvcGUuaXNTdG9wcGVkID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gUGxheWxpc3RNb2RlbC5pc1N0b3BwZWQoKTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnRvZ2dsZVNlYXJjaCA9IGZ1bmN0aW9uKCkge1xuICAgICAgJHNjb3BlLmlzU2VhcmNoT3BlbiA9ICEkc2NvcGUuaXNTZWFyY2hPcGVuO1xuICAgIH07XG5cbiAgICAkc2NvcGUudG9nZ2xlVmlkZW8gPSBmdW5jdGlvbigpIHtcbiAgICAgICRzY29wZS5pc1ZpZGVvVmlzaWJsZSA9ICEkc2NvcGUuaXNWaWRlb1Zpc2libGU7XG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5jb250cm9sbGVyKCdNYWluQ3RybCcsIFsnJHNjb3BlJywgJ1BsYXlsaXN0TW9kZWwnLCBNYWluQ3RybF0pO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgUGxheWVyQ3RybCA9IGZ1bmN0aW9uKCRzY29wZSwgLyogJGludGVydmFsLCAqLyAkdGltZW91dCwgUGxheWxpc3RNb2RlbCkge1xuXG4gICAgdmFyIFBMQVlJTkcgPSAxO1xuICAgIC8vIHZhciBfaW50ZXJ2YWwgPSBudWxsO1xuXG4gICAgJHNjb3BlLmlkID0gbnVsbDtcbiAgICAkc2NvcGUucGxheWVyID0gbnVsbDtcbiAgICAkc2NvcGUuaXNWaXNpYmxlID0gZmFsc2U7XG4gICAgLy8gJHNjb3BlLmVsYXBzZWQgPSAwO1xuXG4gICAgdmFyIF9pc01vdW50ZWQgPSBmdW5jdGlvbihpZCkge1xuICAgICAgaWYgKCRzY29wZS5wbGF5ZXIgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgaWYgKCFhbmd1bGFyLmlzVW5kZWZpbmVkKGlkKSkge1xuICAgICAgICByZXR1cm4gJHNjb3BlLmlkID09PSBpZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAkc2NvcGUuaWQgIT09IG51bGw7XG4gICAgfTtcblxuICAgIC8vIHZhciBfcmVzZXRQcm9ncmVzcyA9IGZ1bmN0aW9uKCkge1xuICAgIC8vICAgJGludGVydmFsLmNhbmNlbChfaW50ZXJ2YWwpO1xuICAgIC8vICAgX2ludGVydmFsID0gbnVsbDtcbiAgICAvLyAgICRzY29wZS5lbGFwc2VkID0gMDtcbiAgICAvLyB9O1xuXG4gICAgdmFyIF9zdG9wID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoX2lzTW91bnRlZCgpKSB7XG4gICAgICAgICRzY29wZS5wbGF5ZXIuc3RvcFZpZGVvKCk7XG4gICAgICAgICRzY29wZS5pZCA9IG51bGw7XG4gICAgICB9XG4gICAgICAvLyBfcmVzZXRQcm9ncmVzcygpO1xuICAgIH07XG5cbiAgICAkc2NvcGUudG9nZ2xlID0gZnVuY3Rpb24oKSB7XG4gICAgICAkc2NvcGUuaXNWaXNpYmxlID0gISRzY29wZS5pc1Zpc2libGU7XG4gICAgfTtcblxuICAgICRzY29wZS4kb24oJ3N0b3BwZWQnLCBmdW5jdGlvbigpIHtcbiAgICAgIF9zdG9wKCk7XG4gICAgfSk7XG5cbiAgICAkc2NvcGUuJG9uKCdwbGF5aW5nJywgZnVuY3Rpb24oXywgaXRlbSkge1xuICAgICAgdmFyIGlkID0gaXRlbS5pZDtcbiAgICAgIGlmIChfaXNNb3VudGVkKGlkKSkge1xuICAgICAgICBpZiAoJHNjb3BlLnBsYXllci5nZXRQbGF5ZXJTdGF0ZSgpICE9PSBQTEFZSU5HKSB7XG4gICAgICAgICAgJHNjb3BlLnBsYXllci5wbGF5VmlkZW8oKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgX3N0b3AoKTtcbiAgICAgICAgJHNjb3BlLmlkID0gaWQ7XG4gICAgICAgIGlmICgkc2NvcGUucGxheWVyICE9PSBudWxsKSB7XG4gICAgICAgICAgJHNjb3BlLnBsYXllci5sb2FkVmlkZW9CeUlkKGlkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgJHNjb3BlLiRvbigncGF1c2VkJywgZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoIV9pc01vdW50ZWQoKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICAkc2NvcGUucGxheWVyLnBhdXNlVmlkZW8oKTtcbiAgICB9KTtcblxuICAgICRzY29wZS4kb24oJ3lvdXR1YmUucGxheWVyLnJlYWR5JywgZnVuY3Rpb24oXywgcGxheWVyKSB7XG4gICAgICBwbGF5ZXIuc2V0Vm9sdW1lKDEwMCk7XG4gICAgICBwbGF5ZXIucGxheVZpZGVvKCk7XG4gICAgICAkc2NvcGUucGxheWVyID0gcGxheWVyO1xuICAgIH0pO1xuXG4gICAgJHNjb3BlLiRvbigneW91dHViZS5wbGF5ZXIucGF1c2VkJywgZnVuY3Rpb24oKSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLnBhdXNlKCk7XG4gICAgfSk7XG5cbiAgICAvLyAkc2NvcGUuJG9uKCd5b3V0dWJlLnBsYXllci5wbGF5aW5nJywgZnVuY3Rpb24oKSB7XG4gICAgLy8gICB2YXIgcGxheWVyID0gJHNjb3BlLnBsYXllcjtcbiAgICAvLyAgIF9yZXNldFByb2dyZXNzKCk7XG4gICAgLy8gICAkc2NvcGUuZWxhcHNlZCA9IChwbGF5ZXIuZ2V0Q3VycmVudFRpbWUoKSAvIHBsYXllci5nZXREdXJhdGlvbigpICogMTAwKTtcbiAgICAvLyAgIF9pbnRlcnZhbCA9ICRpbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAvLyAgICAgJHNjb3BlLmVsYXBzZWQgPSAocGxheWVyLmdldEN1cnJlbnRUaW1lKCkgLyBwbGF5ZXIuZ2V0RHVyYXRpb24oKSAqIDEwMCk7XG4gICAgLy8gICB9LCA0MDApO1xuICAgIC8vIH0pO1xuXG4gICAgJHNjb3BlLiRvbigneW91dHViZS5wbGF5ZXIuZW5kZWQnLCBmdW5jdGlvbigpIHtcbiAgICAgIC8vIF9yZXNldFByb2dyZXNzKCk7XG4gICAgICBQbGF5bGlzdE1vZGVsLm5leHQoKTtcbiAgICB9KTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5jb250cm9sbGVyKCdQbGF5ZXJDdHJsJywgWyckc2NvcGUnLCAvKiAnJGludGVydmFsJywgKi8gJyR0aW1lb3V0JywgJ1BsYXlsaXN0TW9kZWwnLCBQbGF5ZXJDdHJsXSk7XG5cbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBQbGF5bGlzdEN0cmwgPSBmdW5jdGlvbigkc2NvcGUsIFBsYXlsaXN0TW9kZWwpIHtcblxuICAgIC8vIHBsYXllciBzdGF0ZVxuICAgICRzY29wZS5pc1N0b3BwZWQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBQbGF5bGlzdE1vZGVsLmlzU3RvcHBlZCgpO1xuICAgIH07XG4gICAgJHNjb3BlLmlzUGxheWluZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFBsYXlsaXN0TW9kZWwuaXNQbGF5aW5nKCk7XG4gICAgfTtcbiAgICAkc2NvcGUuaXNQYXVzZWQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBQbGF5bGlzdE1vZGVsLmlzUGF1c2VkKCk7XG4gICAgfTtcbiAgICAkc2NvcGUuaXNSZXBlYXRpbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBQbGF5bGlzdE1vZGVsLmlzUmVwZWF0aW5nKCk7XG4gICAgfTtcbiAgICAkc2NvcGUuaXNTaHVmZmxpbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBQbGF5bGlzdE1vZGVsLmlzU2h1ZmZsaW5nKCk7XG4gICAgfTtcblxuICAgIC8vIGdldCBpdGVtcyBpbiBwbGF5bGlzdFxuICAgICRzY29wZS5nZXQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBQbGF5bGlzdE1vZGVsLmdldCgpO1xuICAgIH07XG4gICAgJHNjb3BlLmdldEN1cnJlbnRJbmRleCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFBsYXlsaXN0TW9kZWwuZ2V0Q3VycmVudEluZGV4KCk7XG4gICAgfTtcblxuICAgIC8vIGNoYW5nZSBwbGF5bGlzdCBzdGF0ZVxuICAgICRzY29wZS5wbGF5ID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKGluZGV4KSkge1xuICAgICAgICBpZiAoUGxheWxpc3RNb2RlbC5pc1BsYXlpbmcoKSkge1xuICAgICAgICAgIFBsYXlsaXN0TW9kZWwucGF1c2UoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBQbGF5bGlzdE1vZGVsLnBsYXkoKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgUGxheWxpc3RNb2RlbC5wbGF5KGluZGV4KTtcbiAgICAgIH1cbiAgICB9O1xuICAgICRzY29wZS5wcmV2aW91cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgUGxheWxpc3RNb2RlbC5wcmV2aW91cygpO1xuICAgIH07XG4gICAgJHNjb3BlLm5leHQgPSBmdW5jdGlvbigpIHtcbiAgICAgIFBsYXlsaXN0TW9kZWwubmV4dCgpO1xuICAgIH07XG4gICAgJHNjb3BlLnJlcGVhdCA9IGZ1bmN0aW9uKCkge1xuICAgICAgUGxheWxpc3RNb2RlbC5yZXBlYXQoKTtcbiAgICB9O1xuICAgICRzY29wZS5zaHVmZmxlID0gZnVuY3Rpb24oKSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLnNodWZmbGUoKTtcbiAgICB9O1xuXG4gICAgLy8gY2hhbmdlIHBsYXlsaXN0IG1vZGVsXG4gICAgJHNjb3BlLnJlbW92ZSA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLnJlbW92ZShpbmRleCk7XG4gICAgfTtcbiAgICAkc2NvcGUuc29ydGFibGVDYWxsYmFjayA9IGZ1bmN0aW9uKG9sZEluZGV4LCBuZXdJbmRleCkge1xuICAgICAgUGxheWxpc3RNb2RlbC5yZW9yZGVyKG9sZEluZGV4LCBuZXdJbmRleCk7XG4gICAgfTtcbiAgICAkc2NvcGUuZWRpdGFibGVDYWxsYmFjayA9IGZ1bmN0aW9uKGluZGV4LCBuZXdUaXRsZSkge1xuICAgICAgdmFyIGl0ZW0gPSBQbGF5bGlzdE1vZGVsLmdldChpbmRleCk7XG4gICAgICBpdGVtLnRpdGxlID0gbmV3VGl0bGU7XG4gICAgICBQbGF5bGlzdE1vZGVsLnNldChpbmRleCwgaXRlbSk7XG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5jb250cm9sbGVyKCdQbGF5bGlzdEN0cmwnLCBbJyRzY29wZScsICdQbGF5bGlzdE1vZGVsJywgUGxheWxpc3RDdHJsXSk7XG5cbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBTZWFyY2hDdHJsID0gZnVuY3Rpb24oJHNjb3BlLCBQbGF5bGlzdE1vZGVsLCBZb3VUdWJlQVBJKSB7XG5cbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuXG4gICAgJHNjb3BlLnF1ZXJ5ID0gJyc7XG4gICAgJHNjb3BlLmxvYWRpbmcgPSBmYWxzZTtcblxuICAgICRzY29wZS5hZGRUb1BsYXlsaXN0ID0gZnVuY3Rpb24oaXRlbSkge1xuICAgICAgUGxheWxpc3RNb2RlbC5hZGQoYW5ndWxhci5jb3B5KGl0ZW0pKTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnNlYXJjaCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmVzdWx0cyA9IFtdOyAvLyBjbGVhciBgcmVzdWx0c2BcbiAgICAgIGlmICgkc2NvcGUucXVlcnkgPT09ICcnKSB7XG4gICAgICAgICRzY29wZS5sb2FkaW5nID0gZmFsc2U7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgICRzY29wZS5sb2FkaW5nID0gdHJ1ZTtcbiAgICAgIFlvdVR1YmVBUEkuc2VhcmNoKCRzY29wZS5xdWVyeSkudGhlbihmdW5jdGlvbihyKSB7XG4gICAgICAgICRzY29wZS5sb2FkaW5nID0gZmFsc2U7XG4gICAgICAgIHJlc3VsdHMgPSByO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5nZXRSZXN1bHRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9O1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmNvbnRyb2xsZXIoJ1NlYXJjaEN0cmwnLCBbJyRzY29wZScsICdQbGF5bGlzdE1vZGVsJywgJ1lvdVR1YmVBUEknLCBTZWFyY2hDdHJsXSk7XG5cbn0pKCk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=