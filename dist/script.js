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

  var YouTubeAPI = function($http) {

    var zeroPad = function(n, width) {
      n = n ? n + '' : '';
      return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
    };

    var formatDuration = function(str, delimeter) {
      var matches = str.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/).slice(1, 4);
      var i = -1;
      var result = [];
      if (angular.isUndefined(matches[2])) {
        matches[2] = '0';
      }
      while (++i < 3) {
        var match = matches[i];
        if (!angular.isUndefined(match)) {
          result.push(zeroPad(match, 2));
        }
      }
      return result.join(delimeter);
    };

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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFuZ3VsYXIteW91dHViZS1lbWJlZC5qcyIsImpvY2tleS5qcyIsInJhd2RlZmxhdGUuanMiLCJyYXdpbmZsYXRlLmpzIiwiYmFzZTY0LmpzIiwiU29ydGFibGUuanMiLCJhcHAuanMiLCJIYXNoLmpzIiwiUGxheWxpc3RNb2RlbC5qcyIsIllvdVR1YmVBUEkuanMiLCJ5cUVkaXRhYmxlLmpzIiwieXFTb3J0YWJsZS5qcyIsInlxU3luY0ZvY3VzLmpzIiwiTWFpbkN0cmwuanMiLCJQbGF5ZXJDdHJsLmpzIiwiUGxheWxpc3RDdHJsLmpzIiwiU2VhcmNoQ3RybC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM1T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNwZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzNvREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbnZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzdMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzdGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJzY3JpcHQuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBnbG9iYWwgWVQgKi9cbmFuZ3VsYXIubW9kdWxlKCd5b3V0dWJlLWVtYmVkJywgWyduZyddKVxuLnNlcnZpY2UgKCd5b3V0dWJlRW1iZWRVdGlscycsIFsnJHdpbmRvdycsICckcm9vdFNjb3BlJywgZnVuY3Rpb24gKCR3aW5kb3csICRyb290U2NvcGUpIHtcbiAgICB2YXIgU2VydmljZSA9IHt9XG5cbiAgICAvLyBhZGFwdGVkIGZyb20gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvNTgzMTE5MS8xNjE0OTY3XG4gICAgdmFyIHlvdXR1YmVSZWdleHAgPSAvaHR0cHM/OlxcL1xcLyg/OlswLTlBLVotXStcXC4pPyg/OnlvdXR1XFwuYmVcXC98eW91dHViZSg/Oi1ub2Nvb2tpZSk/XFwuY29tXFxTKlteXFx3XFxzLV0pKFtcXHctXXsxMX0pKD89W15cXHctXXwkKSg/IVs/PSYrJVxcdy4tXSooPzpbJ1wiXVtePD5dKj58PFxcL2E+KSlbPz0mKyVcXHcuLV0qL2lnO1xuICAgIHZhciB0aW1lUmVnZXhwID0gL3Q9KFxcZCspW21zXT8oXFxkKyk/cz8vO1xuXG4gICAgZnVuY3Rpb24gY29udGFpbnMoc3RyLCBzdWJzdHIpIHtcbiAgICAgICAgcmV0dXJuIChzdHIuaW5kZXhPZihzdWJzdHIpID4gLTEpO1xuICAgIH1cblxuICAgIFNlcnZpY2UuZ2V0SWRGcm9tVVJMID0gZnVuY3Rpb24gZ2V0SWRGcm9tVVJMKHVybCkge1xuICAgICAgICB2YXIgaWQgPSB1cmwucmVwbGFjZSh5b3V0dWJlUmVnZXhwLCAnJDEnKTtcblxuICAgICAgICBpZiAoY29udGFpbnMoaWQsICc7JykpIHtcbiAgICAgICAgICAgIHZhciBwaWVjZXMgPSBpZC5zcGxpdCgnOycpO1xuXG4gICAgICAgICAgICBpZiAoY29udGFpbnMocGllY2VzWzFdLCAnJScpKSB7XG4gICAgICAgICAgICAgICAgLy8gbGlua3MgbGlrZSB0aGlzOlxuICAgICAgICAgICAgICAgIC8vIFwiaHR0cDovL3d3dy55b3V0dWJlLmNvbS9hdHRyaWJ1dGlvbl9saW5rP2E9cHhhNmdvSHF6YUEmYW1wO3U9JTJGd2F0Y2glM0Z2JTNEZFBkZ3gzMHc5c1UlMjZmZWF0dXJlJTNEc2hhcmVcIlxuICAgICAgICAgICAgICAgIC8vIGhhdmUgdGhlIHJlYWwgcXVlcnkgc3RyaW5nIFVSSSBlbmNvZGVkIGJlaGluZCBhICc7Jy5cbiAgICAgICAgICAgICAgICAvLyBhdCB0aGlzIHBvaW50LCBgaWQgaXMgJ3B4YTZnb0hxemFBO3U9JTJGd2F0Y2glM0Z2JTNEZFBkZ3gzMHc5c1UlMjZmZWF0dXJlJTNEc2hhcmUnXG4gICAgICAgICAgICAgICAgdmFyIHVyaUNvbXBvbmVudCA9IGRlY29kZVVSSUNvbXBvbmVudChpZC5zcGxpdCgnOycpWzFdKTtcbiAgICAgICAgICAgICAgICBpZCA9ICgnaHR0cDovL3lvdXR1YmUuY29tJyArIHVyaUNvbXBvbmVudClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKHlvdXR1YmVSZWdleHAsICckMScpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVZiTkY5WDF3YVNjJmFtcDtmZWF0dXJlPXlvdXR1LmJlXG4gICAgICAgICAgICAgICAgLy8gYGlkYCBsb29rcyBsaWtlICdWYk5GOVgxd2FTYztmZWF0dXJlPXlvdXR1LmJlJyBjdXJyZW50bHkuXG4gICAgICAgICAgICAgICAgLy8gc3RyaXAgdGhlICc7ZmVhdHVyZT15b3V0dS5iZSdcbiAgICAgICAgICAgICAgICBpZCA9IHBpZWNlc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChjb250YWlucyhpZCwgJyMnKSkge1xuICAgICAgICAgICAgLy8gaWQgbWlnaHQgbG9vayBsaWtlICc5M0x2VEtGX2pXMCN0PTEnXG4gICAgICAgICAgICAvLyBhbmQgd2Ugd2FudCAnOTNMdlRLRl9qVzAnXG4gICAgICAgICAgICBpZCA9IGlkLnNwbGl0KCcjJylbMF07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaWQ7XG4gICAgfTtcblxuICAgIFNlcnZpY2UuZ2V0VGltZUZyb21VUkwgPSBmdW5jdGlvbiBnZXRUaW1lRnJvbVVSTCh1cmwpIHtcbiAgICAgICAgdXJsID0gdXJsIHx8ICcnO1xuXG4gICAgICAgIC8vIHQ9NG0yMHNcbiAgICAgICAgLy8gcmV0dXJucyBbJ3Q9NG0yMHMnLCAnNCcsICcyMCddXG4gICAgICAgIC8vIHQ9NDZzXG4gICAgICAgIC8vIHJldHVybnMgWyd0PTQ2cycsICc0NiddXG4gICAgICAgIC8vIHQ9NDZcbiAgICAgICAgLy8gcmV0dXJucyBbJ3Q9NDYnLCAnNDYnXVxuICAgICAgICB2YXIgdGltZXMgPSB1cmwubWF0Y2godGltZVJlZ2V4cCk7XG5cbiAgICAgICAgaWYgKCF0aW1lcykge1xuICAgICAgICAgICAgLy8gemVybyBzZWNvbmRzXG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFzc3VtZSB0aGUgZmlyc3RcbiAgICAgICAgdmFyIGZ1bGwgPSB0aW1lc1swXSxcbiAgICAgICAgICAgIG1pbnV0ZXMgPSB0aW1lc1sxXSxcbiAgICAgICAgICAgIHNlY29uZHMgPSB0aW1lc1syXTtcblxuICAgICAgICAvLyB0PTRtMjBzXG4gICAgICAgIGlmICh0eXBlb2Ygc2Vjb25kcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHNlY29uZHMgPSBwYXJzZUludChzZWNvbmRzLCAxMCk7XG4gICAgICAgICAgICBtaW51dGVzID0gcGFyc2VJbnQobWludXRlcywgMTApO1xuXG4gICAgICAgIC8vIHQ9NG1cbiAgICAgICAgfSBlbHNlIGlmIChjb250YWlucyhmdWxsLCAnbScpKSB7XG4gICAgICAgICAgICBtaW51dGVzID0gcGFyc2VJbnQobWludXRlcywgMTApO1xuICAgICAgICAgICAgc2Vjb25kcyA9IDA7XG5cbiAgICAgICAgLy8gdD00c1xuICAgICAgICAvLyB0PTRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlY29uZHMgPSBwYXJzZUludChtaW51dGVzLCAxMCk7XG4gICAgICAgICAgICBtaW51dGVzID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGluIHNlY29uZHNcbiAgICAgICAgcmV0dXJuIHNlY29uZHMgKyAobWludXRlcyAqIDYwKTtcbiAgICB9O1xuXG4gICAgLy8gSW5qZWN0IFlvdVR1YmUncyBpRnJhbWUgQVBJXG4gICAgKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHZhbGlkUHJvdG9jb2xzID0gWydodHRwOicsICdodHRwczonXTtcbiAgICAgICAgdmFyIHVybCA9ICcvL3d3dy55b3V0dWJlLmNvbS9pZnJhbWVfYXBpJztcblxuICAgICAgICAvLyBXZSdkIHByZWZlciBhIHByb3RvY29sIHJlbGF0aXZlIHVybCwgYnV0IGxldCdzXG4gICAgICAgIC8vIGZhbGxiYWNrIHRvIGBodHRwOmAgZm9yIGludmFsaWQgcHJvdG9jb2xzXG4gICAgICAgIGlmICh2YWxpZFByb3RvY29scy5pbmRleE9mKHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCkgPCAwKSB7XG4gICAgICAgICAgICB1cmwgPSAnaHR0cDonICsgdXJsO1xuICAgICAgICB9XG4gICAgICAgIHZhciB0YWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICAgICAgdGFnLnNyYyA9IHVybDtcbiAgICAgICAgdmFyIGZpcnN0U2NyaXB0VGFnID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpWzBdO1xuICAgICAgICBmaXJzdFNjcmlwdFRhZy5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh0YWcsIGZpcnN0U2NyaXB0VGFnKTtcbiAgICB9KCkpO1xuXG4gICAgU2VydmljZS5yZWFkeSA9IGZhbHNlO1xuXG4gICAgLy8gWW91dHViZSBjYWxsYmFjayB3aGVuIEFQSSBpcyByZWFkeVxuICAgICR3aW5kb3cub25Zb3VUdWJlSWZyYW1lQVBJUmVhZHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICRyb290U2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIFNlcnZpY2UucmVhZHkgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIFNlcnZpY2U7XG59XSlcbi5kaXJlY3RpdmUoJ3lvdXR1YmVWaWRlbycsIFsneW91dHViZUVtYmVkVXRpbHMnLCBmdW5jdGlvbiAoeW91dHViZUVtYmVkVXRpbHMpIHtcbiAgICB2YXIgdW5pcUlkID0gMTtcblxuICAgIC8vIGZyb20gWVQuUGxheWVyU3RhdGVcbiAgICB2YXIgc3RhdGVOYW1lcyA9IHtcbiAgICAgICAgJy0xJzogJ3Vuc3RhcnRlZCcsXG4gICAgICAgIDA6ICdlbmRlZCcsXG4gICAgICAgIDE6ICdwbGF5aW5nJyxcbiAgICAgICAgMjogJ3BhdXNlZCcsXG4gICAgICAgIDM6ICdidWZmZXJpbmcnLFxuICAgICAgICA1OiAncXVldWVkJ1xuICAgIH07XG5cbiAgICB2YXIgZXZlbnRQcmVmaXggPSAneW91dHViZS5wbGF5ZXIuJztcblxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRUEnLFxuICAgICAgICBzY29wZToge1xuICAgICAgICAgICAgdmlkZW9JZDogJz0/JyxcbiAgICAgICAgICAgIHZpZGVvVXJsOiAnPT8nLFxuICAgICAgICAgICAgcGxheWVyOiAnPT8nLFxuICAgICAgICAgICAgcGxheWVyVmFyczogJz0/JyxcbiAgICAgICAgICAgIHBsYXllckhlaWdodDogJz0/JyxcbiAgICAgICAgICAgIHBsYXllcldpZHRoOiAnPT8nXG4gICAgICAgIH0sXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMpIHtcbiAgICAgICAgICAgIC8vIGFsbG93cyB1cyB0byAkd2F0Y2ggYHJlYWR5YFxuICAgICAgICAgICAgc2NvcGUudXRpbHMgPSB5b3V0dWJlRW1iZWRVdGlscztcblxuICAgICAgICAgICAgLy8gcGxheWVyLWlkIGF0dHIgPiBpZCBhdHRyID4gZGlyZWN0aXZlLWdlbmVyYXRlZCBJRFxuICAgICAgICAgICAgdmFyIHBsYXllcklkID0gYXR0cnMucGxheWVySWQgfHwgZWxlbWVudFswXS5pZCB8fCAndW5pcXVlLXlvdXR1YmUtZW1iZWQtaWQtJyArIHVuaXFJZCsrO1xuICAgICAgICAgICAgZWxlbWVudFswXS5pZCA9IHBsYXllcklkO1xuXG4gICAgICAgICAgICAvLyBBdHRhY2ggdG8gZWxlbWVudFxuICAgICAgICAgICAgc2NvcGUucGxheWVySGVpZ2h0ID0gc2NvcGUucGxheWVySGVpZ2h0IHx8IDM5MDtcbiAgICAgICAgICAgIHNjb3BlLnBsYXllcldpZHRoID0gc2NvcGUucGxheWVyV2lkdGggfHwgNjQwO1xuICAgICAgICAgICAgc2NvcGUucGxheWVyVmFycyA9IHNjb3BlLnBsYXllclZhcnMgfHwge307XG5cbiAgICAgICAgICAgIC8vIFlUIGNhbGxzIGNhbGxiYWNrcyBvdXRzaWRlIG9mIGRpZ2VzdCBjeWNsZVxuICAgICAgICAgICAgZnVuY3Rpb24gYXBwbHlCcm9hZGNhc3QgKCkge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBzY29wZS4kZW1pdC5hcHBseShzY29wZSwgYXJncyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG9uUGxheWVyU3RhdGVDaGFuZ2UgKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RhdGVOYW1lc1tldmVudC5kYXRhXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHN0YXRlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgICAgICBhcHBseUJyb2FkY2FzdChldmVudFByZWZpeCArIHN0YXRlLCBzY29wZS5wbGF5ZXIsIGV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUucGxheWVyLmN1cnJlbnRTdGF0ZSA9IHN0YXRlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBvblBsYXllclJlYWR5IChldmVudCkge1xuICAgICAgICAgICAgICAgIGFwcGx5QnJvYWRjYXN0KGV2ZW50UHJlZml4ICsgJ3JlYWR5Jywgc2NvcGUucGxheWVyLCBldmVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVBsYXllciAoKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBsYXllclZhcnMgPSBhbmd1bGFyLmNvcHkoc2NvcGUucGxheWVyVmFycyk7XG4gICAgICAgICAgICAgICAgcGxheWVyVmFycy5zdGFydCA9IHBsYXllclZhcnMuc3RhcnQgfHwgc2NvcGUudXJsU3RhcnRUaW1lO1xuICAgICAgICAgICAgICAgIHZhciBwbGF5ZXIgPSBuZXcgWVQuUGxheWVyKHBsYXllcklkLCB7XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogc2NvcGUucGxheWVySGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogc2NvcGUucGxheWVyV2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIHZpZGVvSWQ6IHNjb3BlLnZpZGVvSWQsXG4gICAgICAgICAgICAgICAgICAgIHBsYXllclZhcnM6IHBsYXllclZhcnMsXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50czoge1xuICAgICAgICAgICAgICAgICAgICAgICAgb25SZWFkeTogb25QbGF5ZXJSZWFkeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uU3RhdGVDaGFuZ2U6IG9uUGxheWVyU3RhdGVDaGFuZ2VcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgcGxheWVyLmlkID0gcGxheWVySWQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBsYXllcjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gbG9hZFBsYXllciAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBsYXllcklkICYmIHNjb3BlLnZpZGVvSWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjb3BlLnBsYXllciAmJiBzY29wZS5wbGF5ZXIuZCAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIHNjb3BlLnBsYXllci5kZXN0cm95ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY29wZS5wbGF5ZXIuZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgc2NvcGUucGxheWVyID0gY3JlYXRlUGxheWVyKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHN0b3BXYXRjaGluZ1JlYWR5ID0gc2NvcGUuJHdhdGNoKFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLnV0aWxzLnJlYWR5XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBXYWl0IHVudGlsIG9uZSBvZiB0aGVtIGlzIGRlZmluZWQuLi5cbiAgICAgICAgICAgICAgICAgICAgICAgICYmICh0eXBlb2Ygc2NvcGUudmlkZW9VcmwgIT09ICd1bmRlZmluZWQnXG4gICAgICAgICAgICAgICAgICAgICAgICB8fCAgdHlwZW9mIHNjb3BlLnZpZGVvSWQgIT09ICd1bmRlZmluZWQnKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChyZWFkeSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVhZHkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0b3BXYXRjaGluZ1JlYWR5KCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHVzZSBVUkwgaWYgeW91J3ZlIGdvdCBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBzY29wZS52aWRlb1VybCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS4kd2F0Y2goJ3ZpZGVvVXJsJywgZnVuY3Rpb24gKHVybCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS52aWRlb0lkID0gc2NvcGUudXRpbHMuZ2V0SWRGcm9tVVJMKHVybCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLnVybFN0YXJ0VGltZSA9IHNjb3BlLnV0aWxzLmdldFRpbWVGcm9tVVJMKHVybCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9hZFBsYXllcigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UsIHdhdGNoIHRoZSBpZFxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS4kd2F0Y2goJ3ZpZGVvSWQnLCBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUudXJsU3RhcnRUaW1lID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9hZFBsYXllcigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzY29wZS5wbGF5ZXIgJiYgc2NvcGUucGxheWVyLmRlc3Ryb3koKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcbn1dKTtcbiIsInJlcXVpcmU9KGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkoe1wiam9ja2V5XCI6W2Z1bmN0aW9uKHJlcXVpcmUsbW9kdWxlLGV4cG9ydHMpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgU1RPUFBFRCA9IDA7XG52YXIgUExBWUlORyA9IDE7XG52YXIgUEFVU0VEID0gMjtcblxudmFyIG5vb3AgPSBmdW5jdGlvbigpIHt9O1xuXG52YXIgZm9yRWFjaCA9IGZ1bmN0aW9uKGFyciwgZm4pIHtcbiAgdmFyIGk7XG4gIHZhciBsZW4gPSBhcnIubGVuZ3RoO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICBmbihhcnJbaV0sIGkpO1xuICB9XG59O1xuXG52YXIgam9ja2V5ID0gZnVuY3Rpb24oaXRlbXMsIGNicywgbW9ja1NodWZmbGUpIHtcblxuICBpdGVtcyA9IGl0ZW1zID8gaXRlbXMuc2xpY2UoKSA6IFtdO1xuXG4gIGNicyA9IGNicyB8fCB7fTtcbiAgZm9yRWFjaChbJ29uTW9kZWxDaGFuZ2UnLCAnb25TdGF0ZUNoYW5nZSddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgY2JzW25hbWVdID0gY2JzW25hbWVdIHx8IG5vb3A7XG4gIH0pO1xuXG4gIHZhciBwbGF5T3JkZXIgPSBbXTtcbiAgZm9yRWFjaChpdGVtcywgZnVuY3Rpb24oXywgaSkge1xuICAgIHBsYXlPcmRlci5wdXNoKGkpO1xuICB9KTtcblxuICB2YXIgcGxheU9yZGVySW5kZXggPSAtMTtcbiAgdmFyIHN0YXRlID0gU1RPUFBFRDtcbiAgdmFyIHJlcGVhdGluZyA9IGZhbHNlO1xuICB2YXIgc2h1ZmZsaW5nID0gZmFsc2U7XG5cbiAgdmFyIF9pc1ZhbGlkSW5kZXggPSBmdW5jdGlvbihpbmRleCkge1xuICAgIHJldHVybiBpbmRleCA+IC0xICYmIGl0ZW1zLmxlbmd0aCA+IGluZGV4O1xuICB9O1xuXG4gIHZhciBfZ2V0TmV4dFBsYXlPcmRlckluZGV4ID0gZnVuY3Rpb24oKSB7XG5cbiAgICAvLyBleGl0IGlmIG5vdCBwbGF5aW5nXG4gICAgaWYgKHN0YXRlID09PSBTVE9QUEVEKSB7XG4gICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgLy8gaW5jcmVtZW50XG4gICAgdmFyIG5leHRJbmRleCA9IHBsYXlPcmRlckluZGV4ICsgMTtcblxuICAgIC8vIHdyYXBhcm91bmQgaWYgcmVwZWF0aW5nXG4gICAgaWYgKG5leHRJbmRleCA9PT0gcGxheU9yZGVyLmxlbmd0aCAmJiByZXBlYXRpbmcpIHtcbiAgICAgIG5leHRJbmRleCA9IDA7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJuIGBuZXh0SW5kZXhgIGlmIHZhbGlkLCBlbHNlIHJldHVybiAtMVxuICAgIGlmIChuZXh0SW5kZXggPCBwbGF5T3JkZXIubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gbmV4dEluZGV4O1xuICAgIH1cbiAgICByZXR1cm4gLTE7XG5cbiAgfTtcblxuICB2YXIgX2dldFByZXZpb3VzUGxheU9yZGVySW5kZXggPSBmdW5jdGlvbigpIHtcblxuICAgIC8vIGV4aXQgaWYgbm90IHBsYXlpbmdcbiAgICBpZiAoc3RhdGUgPT09IFNUT1BQRUQpIHtcbiAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICAvLyBkZWNyZW1lbnRcbiAgICB2YXIgcHJldmlvdXNJbmRleCA9IHBsYXlPcmRlckluZGV4IC0gMTtcblxuICAgIC8vIHdyYXBhcm91bmQgaWYgcmVwZWF0aW5nXG4gICAgaWYgKHByZXZpb3VzSW5kZXggPT09IC0xICYmIHJlcGVhdGluZykge1xuICAgICAgcHJldmlvdXNJbmRleCA9IHBsYXlPcmRlci5sZW5ndGggLSAxO1xuICAgIH1cblxuICAgIC8vIHJldHVybiBgcHJldmlvdXNJbmRleGAgaWYgdmFsaWQsIGVsc2UgcmV0dXJuIC0xXG4gICAgaWYgKHByZXZpb3VzSW5kZXggPiAtMSkge1xuICAgICAgcmV0dXJuIHByZXZpb3VzSW5kZXg7XG4gICAgfVxuICAgIHJldHVybiAtMTtcblxuICB9O1xuXG4gIHZhciBfc3RvcCA9IGZ1bmN0aW9uKHNlbGYpIHtcbiAgICBwbGF5T3JkZXJJbmRleCA9IC0xO1xuICAgIHN0YXRlID0gU1RPUFBFRDtcbiAgICBjYnMub25TdGF0ZUNoYW5nZSgnc3RvcHBlZCcsIHNlbGYuZ2V0Q3VycmVudCgpKTtcbiAgICBpZiAoc2h1ZmZsaW5nKSB7XG4gICAgICBwbGF5T3JkZXIgPSBfc2h1ZmZsZShwbGF5T3JkZXIpO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICB2YXIgX3BsYXlCeVBsYXlPcmRlckluZGV4ID0gZnVuY3Rpb24oc2VsZiwgX3BsYXlPcmRlckluZGV4KSB7XG5cbiAgICBpZiAoX2lzVmFsaWRJbmRleChfcGxheU9yZGVySW5kZXgpKSB7XG4gICAgICBwbGF5T3JkZXJJbmRleCA9IF9wbGF5T3JkZXJJbmRleDtcbiAgICAgIHN0YXRlID0gUExBWUlORztcbiAgICAgIGNicy5vblN0YXRlQ2hhbmdlKCdwbGF5aW5nJywgc2VsZi5nZXRDdXJyZW50KCkpO1xuICAgICAgcmV0dXJuIGl0ZW1zW3BsYXlPcmRlcltwbGF5T3JkZXJJbmRleF1dO1xuICAgIH1cbiAgICByZXR1cm4gX3N0b3Aoc2VsZik7XG5cbiAgfTtcblxuICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICB2YXIgX3NodWZmbGUgPSBtb2NrU2h1ZmZsZSB8fCBmdW5jdGlvbihhcnIpIHtcblxuICAgIHZhciBpID0gYXJyLmxlbmd0aCAtIDE7XG4gICAgdmFyIGosIHRlbXA7XG4gICAgd2hpbGUgKGkgPiAwKSB7XG4gICAgICBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGkgKyAxKSk7XG4gICAgICB0ZW1wID0gYXJyW2ldO1xuICAgICAgYXJyW2ldID0gYXJyW2pdO1xuICAgICAgYXJyW2pdID0gdGVtcDtcbiAgICAgIGktLTtcbiAgICB9XG4gICAgcmV0dXJuIGFycjtcblxuICB9O1xuXG4gIHZhciBfc3BsaWNlVG9Gcm9udCA9IGZ1bmN0aW9uKGl0ZW1JbmRleCkge1xuICAgIHBsYXlPcmRlci5zb3J0KCk7XG4gICAgcGxheU9yZGVyLnNwbGljZShpdGVtSW5kZXgsIDEpO1xuICAgIHBsYXlPcmRlciA9IFtpdGVtSW5kZXhdLmNvbmNhdChfc2h1ZmZsZShwbGF5T3JkZXIpKTtcbiAgfTtcblxuICB2YXIgX3NwbGljZVRvRW5kID0gZnVuY3Rpb24oaXRlbUluZGV4KSB7XG4gICAgcGxheU9yZGVyLnNvcnQoKTtcbiAgICBwbGF5T3JkZXIuc3BsaWNlKGl0ZW1JbmRleCwgMSk7XG4gICAgcGxheU9yZGVyID0gX3NodWZmbGUocGxheU9yZGVyKS5jb25jYXQoW2l0ZW1JbmRleF0pO1xuICB9O1xuXG4gIHZhciBfZ2V0ID0gZnVuY3Rpb24oaW5kZXgpIHtcblxuICAgIGlmICh0eXBlb2YgaW5kZXggPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gaXRlbXM7XG4gICAgfVxuICAgIGlmIChpbmRleCA+IC0xICYmIGluZGV4IDwgaXRlbXMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gaXRlbXNbaW5kZXhdO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcblxuICB9O1xuXG4gIHJldHVybiB7XG5cbiAgICBhZGQ6IGZ1bmN0aW9uKGl0ZW0pIHtcblxuICAgICAgaXRlbXMucHVzaChpdGVtKTtcbiAgICAgIHBsYXlPcmRlci5wdXNoKGl0ZW1zLmxlbmd0aCAtIDEpO1xuXG4gICAgICAvLyBjYWxsIGBvbk1vZGVsQ2hhbmdlYCBjYWxsYmFja1xuICAgICAgY2JzLm9uTW9kZWxDaGFuZ2UoX2dldCgpKTtcblxuICAgICAgaWYgKHRoaXMuaXNTaHVmZmxpbmcoKSkge1xuICAgICAgICAvLyBzaHVmZmxlIHVucGxheWVkIGl0ZW1zIGluIGBwbGF5T3JkZXJgXG4gICAgICAgIHZhciB1bnBsYXllZEluZGljZXMgPSBwbGF5T3JkZXIuc3BsaWNlKHBsYXlPcmRlckluZGV4ICsgMSk7XG4gICAgICAgIHBsYXlPcmRlciA9IHBsYXlPcmRlci5jb25jYXQoX3NodWZmbGUodW5wbGF5ZWRJbmRpY2VzKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBpdGVtO1xuXG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24oaXRlbUluZGV4KSB7XG5cbiAgICAgIGlmICghX2lzVmFsaWRJbmRleChpdGVtSW5kZXgpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgdGhlIGl0ZW0gYXQgYGl0ZW1JbmRleGBcbiAgICAgIHZhciByZW1vdmVkSXRlbSA9IGl0ZW1zLnNwbGljZShpdGVtSW5kZXgsIDEpWzBdO1xuXG4gICAgICAvLyBjYWxsIGBvbk1vZGVsQ2hhbmdlYCBjYWxsYmFja1xuICAgICAgY2JzLm9uTW9kZWxDaGFuZ2UoX2dldCgpKTtcblxuICAgICAgLy8gc3RvcCBpZiBgcmVtb3ZlZEl0ZW1gIGlzIGN1cnJlbnRseSBwbGF5ZWQgb3IgcGF1c2VkXG4gICAgICBpZiAoaXRlbUluZGV4ID09PSBwbGF5T3JkZXJbcGxheU9yZGVySW5kZXhdKSB7XG4gICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgfVxuXG4gICAgICAvLyByZW1vdmUgYGl0ZW1JbmRleGAgZnJvbSBgcGxheU9yZGVyYCwgYW5kIG1vdmUgaW5kaWNlcyA+IGBpdGVtSW5kZXhgXG4gICAgICAvLyBsZWZ0IGJ5IDFcbiAgICAgIHZhciBuZXdQbGF5T3JkZXIgPSBbXTtcbiAgICAgIGZvckVhY2gocGxheU9yZGVyLCBmdW5jdGlvbihwbGF5T3JkZXJJbmRleCkge1xuICAgICAgICBpZiAocGxheU9yZGVySW5kZXggIT09IGl0ZW1JbmRleCkge1xuICAgICAgICAgIGlmIChwbGF5T3JkZXJJbmRleCA+IGl0ZW1JbmRleCkge1xuICAgICAgICAgICAgcGxheU9yZGVySW5kZXggPSBwbGF5T3JkZXJJbmRleCAtIDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIG5ld1BsYXlPcmRlci5wdXNoKHBsYXlPcmRlckluZGV4KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBwbGF5T3JkZXIgPSBuZXdQbGF5T3JkZXI7XG4gICAgICBpZiAocGxheU9yZGVySW5kZXggPiBpdGVtSW5kZXgpIHtcbiAgICAgICAgcGxheU9yZGVySW5kZXggPSBwbGF5T3JkZXJJbmRleCAtIDE7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZW1vdmVkSXRlbTtcblxuICAgIH0sXG5cbiAgICBzZXQ6IGZ1bmN0aW9uKGluZGV4LCBuZXdJdGVtKSB7XG5cbiAgICAgIGlmIChpbmRleCA+IC0xICYmIGluZGV4IDwgaXRlbXMubGVuZ3RoKSB7XG5cbiAgICAgICAgLy8gY2FsbCBgb25Nb2RlbENoYW5nZWAgY2FsbGJhY2tcbiAgICAgICAgY2JzLm9uTW9kZWxDaGFuZ2UoX2dldCgpKTtcblxuICAgICAgICBpdGVtc1tpbmRleF0gPSBuZXdJdGVtO1xuICAgICAgICByZXR1cm4gbmV3SXRlbTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICB9LFxuXG4gICAgZ2V0OiBfZ2V0LFxuXG4gICAgZ2V0Q3VycmVudEluZGV4OiBmdW5jdGlvbigpIHtcblxuICAgICAgaWYgKHBsYXlPcmRlckluZGV4ID09PSAtMSkge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgICB9XG4gICAgICByZXR1cm4gcGxheU9yZGVyW3BsYXlPcmRlckluZGV4XTtcblxuICAgIH0sXG5cbiAgICBnZXRDdXJyZW50OiBmdW5jdGlvbigpIHtcblxuICAgICAgcmV0dXJuIHRoaXMuZ2V0KHRoaXMuZ2V0Q3VycmVudEluZGV4KCkpO1xuXG4gICAgfSxcblxuICAgIGdldFBsYXlPcmRlcjogZnVuY3Rpb24oKSB7XG5cbiAgICAgIHJldHVybiBwbGF5T3JkZXI7XG5cbiAgICB9LFxuXG4gICAgcmVvcmRlcjogZnVuY3Rpb24ob2xkSW5kZXgsIG5ld0luZGV4KSB7XG5cbiAgICAgIC8vIGV4aXQgaWYgbm8gY2hhbmdlLCBvciBpbnZhbGlkIGluZGljZXNcbiAgICAgIGlmIChvbGRJbmRleCA9PT0gbmV3SW5kZXggfHwgIV9pc1ZhbGlkSW5kZXgob2xkSW5kZXgpIHx8ICFfaXNWYWxpZEluZGV4KG5ld0luZGV4KSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgLy8gbW92ZSBpdGVtIGZyb20gYG9sZEluZGV4YCB0byBgbmV3SW5kZXhgXG4gICAgICB2YXIgbW92ZWRJdGVtID0gaXRlbXMuc3BsaWNlKG9sZEluZGV4LCAxKVswXTtcbiAgICAgIGl0ZW1zLnNwbGljZShuZXdJbmRleCwgMCwgbW92ZWRJdGVtKTtcblxuICAgICAgLy8gY2FsbCBgb25Nb2RlbENoYW5nZWAgY2FsbGJhY2tcbiAgICAgIGNicy5vbk1vZGVsQ2hhbmdlKHRoaXMuZ2V0KCkpO1xuXG4gICAgICBpZiAodGhpcy5pc1NodWZmbGluZygpKSB7XG4gICAgICAgIC8vIGZpbmQgbGVmdCBhbmQgcmlnaHQgb3JkZXJpbmcgb2YgYG9sZEluZGV4YCBhbmQgYG5ld0luZGV4YFxuICAgICAgICB2YXIgbCwgciwgb2Zmc2V0O1xuICAgICAgICBpZiAob2xkSW5kZXggPCBuZXdJbmRleCkge1xuICAgICAgICAgIGwgPSBvbGRJbmRleDtcbiAgICAgICAgICByID0gbmV3SW5kZXg7XG4gICAgICAgICAgb2Zmc2V0ID0gLTE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbCA9IG5ld0luZGV4O1xuICAgICAgICAgIHIgPSBvbGRJbmRleDtcbiAgICAgICAgICBvZmZzZXQgPSAxO1xuICAgICAgICB9XG4gICAgICAgIC8vIGFkanVzdCBgcGxheU9yZGVyYCBpZiBzaHVmZmxpbmdcbiAgICAgICAgZm9yRWFjaChwbGF5T3JkZXIsIGZ1bmN0aW9uKHBsYXlPcmRlckluZGV4LCBpKSB7XG4gICAgICAgICAgaWYgKHBsYXlPcmRlckluZGV4ID49IGwgJiYgcGxheU9yZGVySW5kZXggPD0gcikge1xuICAgICAgICAgICAgaWYgKHBsYXlPcmRlckluZGV4ID09PSBvbGRJbmRleCkge1xuICAgICAgICAgICAgICBwbGF5T3JkZXJbaV0gPSBuZXdJbmRleDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBsYXlPcmRlcltpXSA9IHBsYXlPcmRlckluZGV4ICsgb2Zmc2V0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBhZGp1c3QgYHBsYXlPcmRlckluZGV4YCBpZiBub3Qgc2h1ZmZsaW5nXG4gICAgICAgIGlmIChwbGF5T3JkZXJJbmRleCA9PT0gb2xkSW5kZXgpIHtcbiAgICAgICAgICBwbGF5T3JkZXJJbmRleCA9IG5ld0luZGV4O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChwbGF5T3JkZXJJbmRleCA+PSBuZXdJbmRleCAmJiBwbGF5T3JkZXJJbmRleCA8IG9sZEluZGV4KSB7XG4gICAgICAgICAgICBwbGF5T3JkZXJJbmRleCA9IHBsYXlPcmRlckluZGV4ICsgMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHBsYXlPcmRlckluZGV4IDw9IG5ld0luZGV4ICYmIHBsYXlPcmRlckluZGV4ID4gb2xkSW5kZXgpIHtcbiAgICAgICAgICAgIHBsYXlPcmRlckluZGV4ID0gcGxheU9yZGVySW5kZXggLSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gaXRlbXNbbmV3SW5kZXhdO1xuXG4gICAgfSxcblxuICAgIGlzU3RvcHBlZDogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gc3RhdGUgPT09IFNUT1BQRUQ7XG4gICAgfSxcbiAgICBpc1BsYXlpbmc6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHN0YXRlID09PSBQTEFZSU5HO1xuICAgIH0sXG4gICAgaXNQYXVzZWQ6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHN0YXRlID09PSBQQVVTRUQ7XG4gICAgfSxcbiAgICBpc1JlcGVhdGluZzogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcmVwZWF0aW5nO1xuICAgIH0sXG4gICAgaXNTaHVmZmxpbmc6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHNodWZmbGluZztcbiAgICB9LFxuXG4gICAgc3RvcDogZnVuY3Rpb24oKSB7XG5cbiAgICAgIHJldHVybiBfc3RvcCh0aGlzKTtcblxuICAgIH0sXG5cbiAgICBwbGF5OiBmdW5jdGlvbihpdGVtSW5kZXgpIHtcblxuICAgICAgdmFyIGN1cnJlbnRJdGVtO1xuXG4gICAgICBpZiAodHlwZW9mIGl0ZW1JbmRleCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNTdG9wcGVkKCkpIHtcbiAgICAgICAgICBpdGVtSW5kZXggPSBwbGF5T3JkZXJbMF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaXRlbUluZGV4ID0gcGxheU9yZGVyW3BsYXlPcmRlckluZGV4XTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoX2lzVmFsaWRJbmRleChpdGVtSW5kZXgpKSB7XG4gICAgICAgICAgaWYgKHRoaXMuaXNTdG9wcGVkKCkpIHtcbiAgICAgICAgICAgIHBsYXlPcmRlckluZGV4ID0gMDsgLy8gcGxheU9yZGVyIDAgd2FzIHZhbGlkOyBzYXZlIGl0XG4gICAgICAgICAgfVxuICAgICAgICAgIHN0YXRlID0gUExBWUlORztcbiAgICAgICAgICBjdXJyZW50SXRlbSA9IHRoaXMuZ2V0Q3VycmVudCgpO1xuICAgICAgICAgIGNicy5vblN0YXRlQ2hhbmdlKCdwbGF5aW5nJywgY3VycmVudEl0ZW0pO1xuICAgICAgICAgIHJldHVybiBjdXJyZW50SXRlbTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKF9pc1ZhbGlkSW5kZXgoaXRlbUluZGV4KSkge1xuICAgICAgICAgIGlmICh0aGlzLmlzU2h1ZmZsaW5nKCkpIHtcbiAgICAgICAgICAgIC8vIG1vdmUgYGl0ZW1JbmRleGAgdG8gdGhlIGZyb250IG9mIGBwbGF5T3JkZXJgXG4gICAgICAgICAgICBfc3BsaWNlVG9Gcm9udChpdGVtSW5kZXgpO1xuICAgICAgICAgICAgcGxheU9yZGVySW5kZXggPSAwO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwbGF5T3JkZXJJbmRleCA9IGl0ZW1JbmRleDtcbiAgICAgICAgICB9XG4gICAgICAgICAgc3RhdGUgPSBQTEFZSU5HO1xuICAgICAgICAgIGN1cnJlbnRJdGVtID0gdGhpcy5nZXRDdXJyZW50KCk7XG4gICAgICAgICAgY2JzLm9uU3RhdGVDaGFuZ2UoJ3BsYXlpbmcnLCBjdXJyZW50SXRlbSk7XG4gICAgICAgICAgcmV0dXJuIGN1cnJlbnRJdGVtO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICB9LFxuXG4gICAgcGF1c2U6IGZ1bmN0aW9uKCkge1xuXG4gICAgICBpZiAoIXRoaXMuaXNTdG9wcGVkKCkpIHtcbiAgICAgICAgc3RhdGUgPSBQQVVTRUQ7XG4gICAgICAgIHZhciBjdXJyZW50SXRlbSA9IHRoaXMuZ2V0Q3VycmVudCgpO1xuICAgICAgICBjYnMub25TdGF0ZUNoYW5nZSgncGF1c2VkJywgdGhpcy5nZXRDdXJyZW50KCkpO1xuICAgICAgICByZXR1cm4gY3VycmVudEl0ZW07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgfSxcblxuICAgIGdldFByZXZpb3VzSW5kZXg6IGZ1bmN0aW9uKCkge1xuXG4gICAgICB2YXIgcGxheU9yZGVySW5kZXggPSBfZ2V0UHJldmlvdXNQbGF5T3JkZXJJbmRleCgpO1xuICAgICAgaWYgKF9pc1ZhbGlkSW5kZXgocGxheU9yZGVySW5kZXgpKSB7XG4gICAgICAgIHJldHVybiBwbGF5T3JkZXJbcGxheU9yZGVySW5kZXhdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuXG4gICAgfSxcblxuICAgIGdldFByZXZpb3VzOiBmdW5jdGlvbigpIHtcblxuICAgICAgdmFyIGl0ZW1JbmRleCA9IHRoaXMuZ2V0UHJldmlvdXNJbmRleCgpO1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0KGl0ZW1JbmRleCk7XG5cbiAgICB9LFxuXG4gICAgcHJldmlvdXM6IGZ1bmN0aW9uKCkge1xuXG4gICAgICB2YXIgcGxheU9yZGVySW5kZXggPSBfZ2V0UHJldmlvdXNQbGF5T3JkZXJJbmRleCgpO1xuXG4gICAgICBpZiAodGhpcy5pc1JlcGVhdGluZygpICYmIHBsYXlPcmRlckluZGV4ID09PSBwbGF5T3JkZXIubGVuZ3RoIC0gMSkge1xuICAgICAgICB2YXIgaXRlbUluZGV4ID0gcGxheU9yZGVyW3BsYXlPcmRlckluZGV4XTtcbiAgICAgICAgX3NwbGljZVRvRW5kKGl0ZW1JbmRleCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBfcGxheUJ5UGxheU9yZGVySW5kZXgodGhpcywgcGxheU9yZGVySW5kZXgpO1xuXG4gICAgfSxcblxuICAgIGdldE5leHRJbmRleDogZnVuY3Rpb24oKSB7XG5cbiAgICAgIHZhciBwbGF5T3JkZXJJbmRleCA9IF9nZXROZXh0UGxheU9yZGVySW5kZXgoKTtcbiAgICAgIGlmIChfaXNWYWxpZEluZGV4KHBsYXlPcmRlckluZGV4KSkge1xuICAgICAgICByZXR1cm4gcGxheU9yZGVyW3BsYXlPcmRlckluZGV4XTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcblxuICAgIH0sXG5cbiAgICBnZXROZXh0OiBmdW5jdGlvbigpIHtcblxuICAgICAgdmFyIGl0ZW1JbmRleCA9IHRoaXMuZ2V0TmV4dEluZGV4KCk7XG4gICAgICByZXR1cm4gdGhpcy5nZXQoaXRlbUluZGV4KTtcblxuICAgIH0sXG5cbiAgICBuZXh0OiBmdW5jdGlvbigpIHtcblxuICAgICAgdmFyIHBsYXlPcmRlckluZGV4ID0gX2dldE5leHRQbGF5T3JkZXJJbmRleCgpO1xuXG4gICAgICBpZiAodGhpcy5pc1JlcGVhdGluZygpICYmIHBsYXlPcmRlckluZGV4ID09PSAwKSB7XG4gICAgICAgIHZhciBpdGVtSW5kZXggPSBwbGF5T3JkZXJbcGxheU9yZGVySW5kZXhdO1xuICAgICAgICBfc3BsaWNlVG9Gcm9udChpdGVtSW5kZXgpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gX3BsYXlCeVBsYXlPcmRlckluZGV4KHRoaXMsIHBsYXlPcmRlckluZGV4KTtcblxuICAgIH0sXG5cbiAgICByZXBlYXQ6IGZ1bmN0aW9uKCkge1xuXG4gICAgICByZXBlYXRpbmcgPSAhcmVwZWF0aW5nO1xuICAgICAgcmV0dXJuIHJlcGVhdGluZztcblxuICAgIH0sXG5cbiAgICBzaHVmZmxlOiBmdW5jdGlvbigpIHtcblxuICAgICAgaWYgKHRoaXMuaXNTaHVmZmxpbmcoKSkge1xuICAgICAgICBwbGF5T3JkZXJJbmRleCA9IHBsYXlPcmRlcltwbGF5T3JkZXJJbmRleF07XG4gICAgICAgIHNodWZmbGluZyA9IGZhbHNlO1xuICAgICAgICBwbGF5T3JkZXIuc29ydCgpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIHNodWZmbGluZyA9IHRydWU7XG4gICAgICBpZiAodGhpcy5pc1N0b3BwZWQoKSkge1xuICAgICAgICAvLyBzaHVmZmxlIGVudGlyZSBgcGxheU9yZGVyYFxuICAgICAgICBwbGF5T3JkZXIgPSBfc2h1ZmZsZShwbGF5T3JkZXIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gbW92ZSBgcGxheU9yZGVySW5kZXhgIHRvIGZyb250XG4gICAgICAgIF9zcGxpY2VUb0Zyb250KHBsYXlPcmRlckluZGV4KTtcbiAgICAgICAgcGxheU9yZGVySW5kZXggPSAwO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICB9XG5cbiAgfTtcblxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzID0gam9ja2V5O1xuXG59LHt9XX0se30sW10pO1xuIiwiLypcbiAqICRJZDogcmF3ZGVmbGF0ZS5qcyx2IDAuNSAyMDEzLzA0LzA5IDE0OjI1OjM4IGRhbmtvZ2FpIEV4cCBkYW5rb2dhaSAkXG4gKlxuICogR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UsIHZlcnNpb24gMiAoR1BMLTIuMClcbiAqICAgaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0dQTC0yLjBcbiAqIE9yaWdpbmFsOlxuICogIGh0dHA6Ly93d3cub25pY29zLmNvbS9zdGFmZi9pei9hbXVzZS9qYXZhc2NyaXB0L2V4cGVydC9kZWZsYXRlLnR4dFxuICovXG5cbihmdW5jdGlvbihjdHgpe1xuXG4vKiBDb3B5cmlnaHQgKEMpIDE5OTkgTWFzYW5hbyBJenVtbyA8aXpAb25pY29zLmNvLmpwPlxuICogVmVyc2lvbjogMS4wLjFcbiAqIExhc3RNb2RpZmllZDogRGVjIDI1IDE5OTlcbiAqL1xuXG4vKiBJbnRlcmZhY2U6XG4gKiBkYXRhID0gemlwX2RlZmxhdGUoc3JjKTtcbiAqL1xuXG4vKiBjb25zdGFudCBwYXJhbWV0ZXJzICovXG52YXIgemlwX1dTSVpFID0gMzI3Njg7XHRcdC8vIFNsaWRpbmcgV2luZG93IHNpemVcbnZhciB6aXBfU1RPUkVEX0JMT0NLID0gMDtcbnZhciB6aXBfU1RBVElDX1RSRUVTID0gMTtcbnZhciB6aXBfRFlOX1RSRUVTICAgID0gMjtcblxuLyogZm9yIGRlZmxhdGUgKi9cbnZhciB6aXBfREVGQVVMVF9MRVZFTCA9IDY7XG52YXIgemlwX0ZVTExfU0VBUkNIID0gdHJ1ZTtcbnZhciB6aXBfSU5CVUZTSVogPSAzMjc2ODtcdC8vIElucHV0IGJ1ZmZlciBzaXplXG52YXIgemlwX0lOQlVGX0VYVFJBID0gNjQ7XHQvLyBFeHRyYSBidWZmZXJcbnZhciB6aXBfT1VUQlVGU0laID0gMTAyNCAqIDg7XG52YXIgemlwX3dpbmRvd19zaXplID0gMiAqIHppcF9XU0laRTtcbnZhciB6aXBfTUlOX01BVENIID0gMztcbnZhciB6aXBfTUFYX01BVENIID0gMjU4O1xudmFyIHppcF9CSVRTID0gMTY7XG4vLyBmb3IgU01BTExfTUVNXG52YXIgemlwX0xJVF9CVUZTSVpFID0gMHgyMDAwO1xudmFyIHppcF9IQVNIX0JJVFMgPSAxMztcbi8vIGZvciBNRURJVU1fTUVNXG4vLyB2YXIgemlwX0xJVF9CVUZTSVpFID0gMHg0MDAwO1xuLy8gdmFyIHppcF9IQVNIX0JJVFMgPSAxNDtcbi8vIGZvciBCSUdfTUVNXG4vLyB2YXIgemlwX0xJVF9CVUZTSVpFID0gMHg4MDAwO1xuLy8gdmFyIHppcF9IQVNIX0JJVFMgPSAxNTtcbmlmKHppcF9MSVRfQlVGU0laRSA+IHppcF9JTkJVRlNJWilcbiAgICBhbGVydChcImVycm9yOiB6aXBfSU5CVUZTSVogaXMgdG9vIHNtYWxsXCIpO1xuaWYoKHppcF9XU0laRTw8MSkgPiAoMTw8emlwX0JJVFMpKVxuICAgIGFsZXJ0KFwiZXJyb3I6IHppcF9XU0laRSBpcyB0b28gbGFyZ2VcIik7XG5pZih6aXBfSEFTSF9CSVRTID4gemlwX0JJVFMtMSlcbiAgICBhbGVydChcImVycm9yOiB6aXBfSEFTSF9CSVRTIGlzIHRvbyBsYXJnZVwiKTtcbmlmKHppcF9IQVNIX0JJVFMgPCA4IHx8IHppcF9NQVhfTUFUQ0ggIT0gMjU4KVxuICAgIGFsZXJ0KFwiZXJyb3I6IENvZGUgdG9vIGNsZXZlclwiKTtcbnZhciB6aXBfRElTVF9CVUZTSVpFID0gemlwX0xJVF9CVUZTSVpFO1xudmFyIHppcF9IQVNIX1NJWkUgPSAxIDw8IHppcF9IQVNIX0JJVFM7XG52YXIgemlwX0hBU0hfTUFTSyA9IHppcF9IQVNIX1NJWkUgLSAxO1xudmFyIHppcF9XTUFTSyA9IHppcF9XU0laRSAtIDE7XG52YXIgemlwX05JTCA9IDA7IC8vIFRhaWwgb2YgaGFzaCBjaGFpbnNcbnZhciB6aXBfVE9PX0ZBUiA9IDQwOTY7XG52YXIgemlwX01JTl9MT09LQUhFQUQgPSB6aXBfTUFYX01BVENIICsgemlwX01JTl9NQVRDSCArIDE7XG52YXIgemlwX01BWF9ESVNUID0gemlwX1dTSVpFIC0gemlwX01JTl9MT09LQUhFQUQ7XG52YXIgemlwX1NNQUxMRVNUID0gMTtcbnZhciB6aXBfTUFYX0JJVFMgPSAxNTtcbnZhciB6aXBfTUFYX0JMX0JJVFMgPSA3O1xudmFyIHppcF9MRU5HVEhfQ09ERVMgPSAyOTtcbnZhciB6aXBfTElURVJBTFMgPTI1NjtcbnZhciB6aXBfRU5EX0JMT0NLID0gMjU2O1xudmFyIHppcF9MX0NPREVTID0gemlwX0xJVEVSQUxTICsgMSArIHppcF9MRU5HVEhfQ09ERVM7XG52YXIgemlwX0RfQ09ERVMgPSAzMDtcbnZhciB6aXBfQkxfQ09ERVMgPSAxOTtcbnZhciB6aXBfUkVQXzNfNiA9IDE2O1xudmFyIHppcF9SRVBaXzNfMTAgPSAxNztcbnZhciB6aXBfUkVQWl8xMV8xMzggPSAxODtcbnZhciB6aXBfSEVBUF9TSVpFID0gMiAqIHppcF9MX0NPREVTICsgMTtcbnZhciB6aXBfSF9TSElGVCA9IHBhcnNlSW50KCh6aXBfSEFTSF9CSVRTICsgemlwX01JTl9NQVRDSCAtIDEpIC9cblx0XHRcdCAgIHppcF9NSU5fTUFUQ0gpO1xuXG4vKiB2YXJpYWJsZXMgKi9cbnZhciB6aXBfZnJlZV9xdWV1ZTtcbnZhciB6aXBfcWhlYWQsIHppcF9xdGFpbDtcbnZhciB6aXBfaW5pdGZsYWc7XG52YXIgemlwX291dGJ1ZiA9IG51bGw7XG52YXIgemlwX291dGNudCwgemlwX291dG9mZjtcbnZhciB6aXBfY29tcGxldGU7XG52YXIgemlwX3dpbmRvdztcbnZhciB6aXBfZF9idWY7XG52YXIgemlwX2xfYnVmO1xudmFyIHppcF9wcmV2O1xudmFyIHppcF9iaV9idWY7XG52YXIgemlwX2JpX3ZhbGlkO1xudmFyIHppcF9ibG9ja19zdGFydDtcbnZhciB6aXBfaW5zX2g7XG52YXIgemlwX2hhc2hfaGVhZDtcbnZhciB6aXBfcHJldl9tYXRjaDtcbnZhciB6aXBfbWF0Y2hfYXZhaWxhYmxlO1xudmFyIHppcF9tYXRjaF9sZW5ndGg7XG52YXIgemlwX3ByZXZfbGVuZ3RoO1xudmFyIHppcF9zdHJzdGFydDtcbnZhciB6aXBfbWF0Y2hfc3RhcnQ7XG52YXIgemlwX2VvZmlsZTtcbnZhciB6aXBfbG9va2FoZWFkO1xudmFyIHppcF9tYXhfY2hhaW5fbGVuZ3RoO1xudmFyIHppcF9tYXhfbGF6eV9tYXRjaDtcbnZhciB6aXBfY29tcHJfbGV2ZWw7XG52YXIgemlwX2dvb2RfbWF0Y2g7XG52YXIgemlwX25pY2VfbWF0Y2g7XG52YXIgemlwX2R5bl9sdHJlZTtcbnZhciB6aXBfZHluX2R0cmVlO1xudmFyIHppcF9zdGF0aWNfbHRyZWU7XG52YXIgemlwX3N0YXRpY19kdHJlZTtcbnZhciB6aXBfYmxfdHJlZTtcbnZhciB6aXBfbF9kZXNjO1xudmFyIHppcF9kX2Rlc2M7XG52YXIgemlwX2JsX2Rlc2M7XG52YXIgemlwX2JsX2NvdW50O1xudmFyIHppcF9oZWFwO1xudmFyIHppcF9oZWFwX2xlbjtcbnZhciB6aXBfaGVhcF9tYXg7XG52YXIgemlwX2RlcHRoO1xudmFyIHppcF9sZW5ndGhfY29kZTtcbnZhciB6aXBfZGlzdF9jb2RlO1xudmFyIHppcF9iYXNlX2xlbmd0aDtcbnZhciB6aXBfYmFzZV9kaXN0O1xudmFyIHppcF9mbGFnX2J1ZjtcbnZhciB6aXBfbGFzdF9saXQ7XG52YXIgemlwX2xhc3RfZGlzdDtcbnZhciB6aXBfbGFzdF9mbGFncztcbnZhciB6aXBfZmxhZ3M7XG52YXIgemlwX2ZsYWdfYml0O1xudmFyIHppcF9vcHRfbGVuO1xudmFyIHppcF9zdGF0aWNfbGVuO1xudmFyIHppcF9kZWZsYXRlX2RhdGE7XG52YXIgemlwX2RlZmxhdGVfcG9zO1xuXG4vKiBvYmplY3RzIChkZWZsYXRlKSAqL1xuXG52YXIgemlwX0RlZmxhdGVDVCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZmMgPSAwOyAvLyBmcmVxdWVuY3kgY291bnQgb3IgYml0IHN0cmluZ1xuICAgIHRoaXMuZGwgPSAwOyAvLyBmYXRoZXIgbm9kZSBpbiBIdWZmbWFuIHRyZWUgb3IgbGVuZ3RoIG9mIGJpdCBzdHJpbmdcbn1cblxudmFyIHppcF9EZWZsYXRlVHJlZURlc2MgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmR5bl90cmVlID0gbnVsbDtcdC8vIHRoZSBkeW5hbWljIHRyZWVcbiAgICB0aGlzLnN0YXRpY190cmVlID0gbnVsbDtcdC8vIGNvcnJlc3BvbmRpbmcgc3RhdGljIHRyZWUgb3IgTlVMTFxuICAgIHRoaXMuZXh0cmFfYml0cyA9IG51bGw7XHQvLyBleHRyYSBiaXRzIGZvciBlYWNoIGNvZGUgb3IgTlVMTFxuICAgIHRoaXMuZXh0cmFfYmFzZSA9IDA7XHQvLyBiYXNlIGluZGV4IGZvciBleHRyYV9iaXRzXG4gICAgdGhpcy5lbGVtcyA9IDA7XHRcdC8vIG1heCBudW1iZXIgb2YgZWxlbWVudHMgaW4gdGhlIHRyZWVcbiAgICB0aGlzLm1heF9sZW5ndGggPSAwO1x0Ly8gbWF4IGJpdCBsZW5ndGggZm9yIHRoZSBjb2Rlc1xuICAgIHRoaXMubWF4X2NvZGUgPSAwO1x0XHQvLyBsYXJnZXN0IGNvZGUgd2l0aCBub24gemVybyBmcmVxdWVuY3lcbn1cblxuLyogVmFsdWVzIGZvciBtYXhfbGF6eV9tYXRjaCwgZ29vZF9tYXRjaCBhbmQgbWF4X2NoYWluX2xlbmd0aCwgZGVwZW5kaW5nIG9uXG4gKiB0aGUgZGVzaXJlZCBwYWNrIGxldmVsICgwLi45KS4gVGhlIHZhbHVlcyBnaXZlbiBiZWxvdyBoYXZlIGJlZW4gdHVuZWQgdG9cbiAqIGV4Y2x1ZGUgd29yc3QgY2FzZSBwZXJmb3JtYW5jZSBmb3IgcGF0aG9sb2dpY2FsIGZpbGVzLiBCZXR0ZXIgdmFsdWVzIG1heSBiZVxuICogZm91bmQgZm9yIHNwZWNpZmljIGZpbGVzLlxuICovXG52YXIgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uID0gZnVuY3Rpb24oYSwgYiwgYywgZCkge1xuICAgIHRoaXMuZ29vZF9sZW5ndGggPSBhOyAvLyByZWR1Y2UgbGF6eSBzZWFyY2ggYWJvdmUgdGhpcyBtYXRjaCBsZW5ndGhcbiAgICB0aGlzLm1heF9sYXp5ID0gYjsgICAgLy8gZG8gbm90IHBlcmZvcm0gbGF6eSBzZWFyY2ggYWJvdmUgdGhpcyBtYXRjaCBsZW5ndGhcbiAgICB0aGlzLm5pY2VfbGVuZ3RoID0gYzsgLy8gcXVpdCBzZWFyY2ggYWJvdmUgdGhpcyBtYXRjaCBsZW5ndGhcbiAgICB0aGlzLm1heF9jaGFpbiA9IGQ7XG59XG5cbnZhciB6aXBfRGVmbGF0ZUJ1ZmZlciA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubmV4dCA9IG51bGw7XG4gICAgdGhpcy5sZW4gPSAwO1xuICAgIHRoaXMucHRyID0gbmV3IEFycmF5KHppcF9PVVRCVUZTSVopO1xuICAgIHRoaXMub2ZmID0gMDtcbn1cblxuLyogY29uc3RhbnQgdGFibGVzICovXG52YXIgemlwX2V4dHJhX2xiaXRzID0gbmV3IEFycmF5KFxuICAgIDAsMCwwLDAsMCwwLDAsMCwxLDEsMSwxLDIsMiwyLDIsMywzLDMsMyw0LDQsNCw0LDUsNSw1LDUsMCk7XG52YXIgemlwX2V4dHJhX2RiaXRzID0gbmV3IEFycmF5KFxuICAgIDAsMCwwLDAsMSwxLDIsMiwzLDMsNCw0LDUsNSw2LDYsNyw3LDgsOCw5LDksMTAsMTAsMTEsMTEsMTIsMTIsMTMsMTMpO1xudmFyIHppcF9leHRyYV9ibGJpdHMgPSBuZXcgQXJyYXkoXG4gICAgMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwyLDMsNyk7XG52YXIgemlwX2JsX29yZGVyID0gbmV3IEFycmF5KFxuICAgIDE2LDE3LDE4LDAsOCw3LDksNiwxMCw1LDExLDQsMTIsMywxMywyLDE0LDEsMTUpO1xudmFyIHppcF9jb25maWd1cmF0aW9uX3RhYmxlID0gbmV3IEFycmF5KFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDAsICAgIDAsICAgMCwgICAgMCksXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oNCwgICAgNCwgICA4LCAgICA0KSxcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbig0LCAgICA1LCAgMTYsICAgIDgpLFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDQsICAgIDYsICAzMiwgICAzMiksXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oNCwgICAgNCwgIDE2LCAgIDE2KSxcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbig4LCAgIDE2LCAgMzIsICAgMzIpLFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDgsICAgMTYsIDEyOCwgIDEyOCksXG5cdG5ldyB6aXBfRGVmbGF0ZUNvbmZpZ3VyYXRpb24oOCwgICAzMiwgMTI4LCAgMjU2KSxcblx0bmV3IHppcF9EZWZsYXRlQ29uZmlndXJhdGlvbigzMiwgMTI4LCAyNTgsIDEwMjQpLFxuXHRuZXcgemlwX0RlZmxhdGVDb25maWd1cmF0aW9uKDMyLCAyNTgsIDI1OCwgNDA5NikpO1xuXG5cbi8qIHJvdXRpbmVzIChkZWZsYXRlKSAqL1xuXG52YXIgemlwX2RlZmxhdGVfc3RhcnQgPSBmdW5jdGlvbihsZXZlbCkge1xuICAgIHZhciBpO1xuXG4gICAgaWYoIWxldmVsKVxuXHRsZXZlbCA9IHppcF9ERUZBVUxUX0xFVkVMO1xuICAgIGVsc2UgaWYobGV2ZWwgPCAxKVxuXHRsZXZlbCA9IDE7XG4gICAgZWxzZSBpZihsZXZlbCA+IDkpXG5cdGxldmVsID0gOTtcblxuICAgIHppcF9jb21wcl9sZXZlbCA9IGxldmVsO1xuICAgIHppcF9pbml0ZmxhZyA9IGZhbHNlO1xuICAgIHppcF9lb2ZpbGUgPSBmYWxzZTtcbiAgICBpZih6aXBfb3V0YnVmICE9IG51bGwpXG5cdHJldHVybjtcblxuICAgIHppcF9mcmVlX3F1ZXVlID0gemlwX3FoZWFkID0gemlwX3F0YWlsID0gbnVsbDtcbiAgICB6aXBfb3V0YnVmID0gbmV3IEFycmF5KHppcF9PVVRCVUZTSVopO1xuICAgIHppcF93aW5kb3cgPSBuZXcgQXJyYXkoemlwX3dpbmRvd19zaXplKTtcbiAgICB6aXBfZF9idWYgPSBuZXcgQXJyYXkoemlwX0RJU1RfQlVGU0laRSk7XG4gICAgemlwX2xfYnVmID0gbmV3IEFycmF5KHppcF9JTkJVRlNJWiArIHppcF9JTkJVRl9FWFRSQSk7XG4gICAgemlwX3ByZXYgPSBuZXcgQXJyYXkoMSA8PCB6aXBfQklUUyk7XG4gICAgemlwX2R5bl9sdHJlZSA9IG5ldyBBcnJheSh6aXBfSEVBUF9TSVpFKTtcbiAgICBmb3IoaSA9IDA7IGkgPCB6aXBfSEVBUF9TSVpFOyBpKyspXG5cdHppcF9keW5fbHRyZWVbaV0gPSBuZXcgemlwX0RlZmxhdGVDVCgpO1xuICAgIHppcF9keW5fZHRyZWUgPSBuZXcgQXJyYXkoMip6aXBfRF9DT0RFUysxKTtcbiAgICBmb3IoaSA9IDA7IGkgPCAyKnppcF9EX0NPREVTKzE7IGkrKylcblx0emlwX2R5bl9kdHJlZVtpXSA9IG5ldyB6aXBfRGVmbGF0ZUNUKCk7XG4gICAgemlwX3N0YXRpY19sdHJlZSA9IG5ldyBBcnJheSh6aXBfTF9DT0RFUysyKTtcbiAgICBmb3IoaSA9IDA7IGkgPCB6aXBfTF9DT0RFUysyOyBpKyspXG5cdHppcF9zdGF0aWNfbHRyZWVbaV0gPSBuZXcgemlwX0RlZmxhdGVDVCgpO1xuICAgIHppcF9zdGF0aWNfZHRyZWUgPSBuZXcgQXJyYXkoemlwX0RfQ09ERVMpO1xuICAgIGZvcihpID0gMDsgaSA8IHppcF9EX0NPREVTOyBpKyspXG5cdHppcF9zdGF0aWNfZHRyZWVbaV0gPSBuZXcgemlwX0RlZmxhdGVDVCgpO1xuICAgIHppcF9ibF90cmVlID0gbmV3IEFycmF5KDIqemlwX0JMX0NPREVTKzEpO1xuICAgIGZvcihpID0gMDsgaSA8IDIqemlwX0JMX0NPREVTKzE7IGkrKylcblx0emlwX2JsX3RyZWVbaV0gPSBuZXcgemlwX0RlZmxhdGVDVCgpO1xuICAgIHppcF9sX2Rlc2MgPSBuZXcgemlwX0RlZmxhdGVUcmVlRGVzYygpO1xuICAgIHppcF9kX2Rlc2MgPSBuZXcgemlwX0RlZmxhdGVUcmVlRGVzYygpO1xuICAgIHppcF9ibF9kZXNjID0gbmV3IHppcF9EZWZsYXRlVHJlZURlc2MoKTtcbiAgICB6aXBfYmxfY291bnQgPSBuZXcgQXJyYXkoemlwX01BWF9CSVRTKzEpO1xuICAgIHppcF9oZWFwID0gbmV3IEFycmF5KDIqemlwX0xfQ09ERVMrMSk7XG4gICAgemlwX2RlcHRoID0gbmV3IEFycmF5KDIqemlwX0xfQ09ERVMrMSk7XG4gICAgemlwX2xlbmd0aF9jb2RlID0gbmV3IEFycmF5KHppcF9NQVhfTUFUQ0gtemlwX01JTl9NQVRDSCsxKTtcbiAgICB6aXBfZGlzdF9jb2RlID0gbmV3IEFycmF5KDUxMik7XG4gICAgemlwX2Jhc2VfbGVuZ3RoID0gbmV3IEFycmF5KHppcF9MRU5HVEhfQ09ERVMpO1xuICAgIHppcF9iYXNlX2Rpc3QgPSBuZXcgQXJyYXkoemlwX0RfQ09ERVMpO1xuICAgIHppcF9mbGFnX2J1ZiA9IG5ldyBBcnJheShwYXJzZUludCh6aXBfTElUX0JVRlNJWkUgLyA4KSk7XG59XG5cbnZhciB6aXBfZGVmbGF0ZV9lbmQgPSBmdW5jdGlvbigpIHtcbiAgICB6aXBfZnJlZV9xdWV1ZSA9IHppcF9xaGVhZCA9IHppcF9xdGFpbCA9IG51bGw7XG4gICAgemlwX291dGJ1ZiA9IG51bGw7XG4gICAgemlwX3dpbmRvdyA9IG51bGw7XG4gICAgemlwX2RfYnVmID0gbnVsbDtcbiAgICB6aXBfbF9idWYgPSBudWxsO1xuICAgIHppcF9wcmV2ID0gbnVsbDtcbiAgICB6aXBfZHluX2x0cmVlID0gbnVsbDtcbiAgICB6aXBfZHluX2R0cmVlID0gbnVsbDtcbiAgICB6aXBfc3RhdGljX2x0cmVlID0gbnVsbDtcbiAgICB6aXBfc3RhdGljX2R0cmVlID0gbnVsbDtcbiAgICB6aXBfYmxfdHJlZSA9IG51bGw7XG4gICAgemlwX2xfZGVzYyA9IG51bGw7XG4gICAgemlwX2RfZGVzYyA9IG51bGw7XG4gICAgemlwX2JsX2Rlc2MgPSBudWxsO1xuICAgIHppcF9ibF9jb3VudCA9IG51bGw7XG4gICAgemlwX2hlYXAgPSBudWxsO1xuICAgIHppcF9kZXB0aCA9IG51bGw7XG4gICAgemlwX2xlbmd0aF9jb2RlID0gbnVsbDtcbiAgICB6aXBfZGlzdF9jb2RlID0gbnVsbDtcbiAgICB6aXBfYmFzZV9sZW5ndGggPSBudWxsO1xuICAgIHppcF9iYXNlX2Rpc3QgPSBudWxsO1xuICAgIHppcF9mbGFnX2J1ZiA9IG51bGw7XG59XG5cbnZhciB6aXBfcmV1c2VfcXVldWUgPSBmdW5jdGlvbihwKSB7XG4gICAgcC5uZXh0ID0gemlwX2ZyZWVfcXVldWU7XG4gICAgemlwX2ZyZWVfcXVldWUgPSBwO1xufVxuXG52YXIgemlwX25ld19xdWV1ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBwO1xuXG4gICAgaWYoemlwX2ZyZWVfcXVldWUgIT0gbnVsbClcbiAgICB7XG5cdHAgPSB6aXBfZnJlZV9xdWV1ZTtcblx0emlwX2ZyZWVfcXVldWUgPSB6aXBfZnJlZV9xdWV1ZS5uZXh0O1xuICAgIH1cbiAgICBlbHNlXG5cdHAgPSBuZXcgemlwX0RlZmxhdGVCdWZmZXIoKTtcbiAgICBwLm5leHQgPSBudWxsO1xuICAgIHAubGVuID0gcC5vZmYgPSAwO1xuXG4gICAgcmV0dXJuIHA7XG59XG5cbnZhciB6aXBfaGVhZDEgPSBmdW5jdGlvbihpKSB7XG4gICAgcmV0dXJuIHppcF9wcmV2W3ppcF9XU0laRSArIGldO1xufVxuXG52YXIgemlwX2hlYWQyID0gZnVuY3Rpb24oaSwgdmFsKSB7XG4gICAgcmV0dXJuIHppcF9wcmV2W3ppcF9XU0laRSArIGldID0gdmFsO1xufVxuXG4vKiBwdXRfYnl0ZSBpcyB1c2VkIGZvciB0aGUgY29tcHJlc3NlZCBvdXRwdXQsIHB1dF91Ynl0ZSBmb3IgdGhlXG4gKiB1bmNvbXByZXNzZWQgb3V0cHV0LiBIb3dldmVyIHVubHp3KCkgdXNlcyB3aW5kb3cgZm9yIGl0c1xuICogc3VmZml4IHRhYmxlIGluc3RlYWQgb2YgaXRzIG91dHB1dCBidWZmZXIsIHNvIGl0IGRvZXMgbm90IHVzZSBwdXRfdWJ5dGVcbiAqICh0byBiZSBjbGVhbmVkIHVwKS5cbiAqL1xudmFyIHppcF9wdXRfYnl0ZSA9IGZ1bmN0aW9uKGMpIHtcbiAgICB6aXBfb3V0YnVmW3ppcF9vdXRvZmYgKyB6aXBfb3V0Y250KytdID0gYztcbiAgICBpZih6aXBfb3V0b2ZmICsgemlwX291dGNudCA9PSB6aXBfT1VUQlVGU0laKVxuXHR6aXBfcW91dGJ1ZigpO1xufVxuXG4vKiBPdXRwdXQgYSAxNiBiaXQgdmFsdWUsIGxzYiBmaXJzdCAqL1xudmFyIHppcF9wdXRfc2hvcnQgPSBmdW5jdGlvbih3KSB7XG4gICAgdyAmPSAweGZmZmY7XG4gICAgaWYoemlwX291dG9mZiArIHppcF9vdXRjbnQgPCB6aXBfT1VUQlVGU0laIC0gMikge1xuXHR6aXBfb3V0YnVmW3ppcF9vdXRvZmYgKyB6aXBfb3V0Y250KytdID0gKHcgJiAweGZmKTtcblx0emlwX291dGJ1Zlt6aXBfb3V0b2ZmICsgemlwX291dGNudCsrXSA9ICh3ID4+PiA4KTtcbiAgICB9IGVsc2Uge1xuXHR6aXBfcHV0X2J5dGUodyAmIDB4ZmYpO1xuXHR6aXBfcHV0X2J5dGUodyA+Pj4gOCk7XG4gICAgfVxufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogSW5zZXJ0IHN0cmluZyBzIGluIHRoZSBkaWN0aW9uYXJ5IGFuZCBzZXQgbWF0Y2hfaGVhZCB0byB0aGUgcHJldmlvdXMgaGVhZFxuICogb2YgdGhlIGhhc2ggY2hhaW4gKHRoZSBtb3N0IHJlY2VudCBzdHJpbmcgd2l0aCBzYW1lIGhhc2gga2V5KS4gUmV0dXJuXG4gKiB0aGUgcHJldmlvdXMgbGVuZ3RoIG9mIHRoZSBoYXNoIGNoYWluLlxuICogSU4gIGFzc2VydGlvbjogYWxsIGNhbGxzIHRvIHRvIElOU0VSVF9TVFJJTkcgYXJlIG1hZGUgd2l0aCBjb25zZWN1dGl2ZVxuICogICAgaW5wdXQgY2hhcmFjdGVycyBhbmQgdGhlIGZpcnN0IE1JTl9NQVRDSCBieXRlcyBvZiBzIGFyZSB2YWxpZFxuICogICAgKGV4Y2VwdCBmb3IgdGhlIGxhc3QgTUlOX01BVENILTEgYnl0ZXMgb2YgdGhlIGlucHV0IGZpbGUpLlxuICovXG52YXIgemlwX0lOU0VSVF9TVFJJTkcgPSBmdW5jdGlvbigpIHtcbiAgICB6aXBfaW5zX2ggPSAoKHppcF9pbnNfaCA8PCB6aXBfSF9TSElGVClcblx0XHQgXiAoemlwX3dpbmRvd1t6aXBfc3Ryc3RhcnQgKyB6aXBfTUlOX01BVENIIC0gMV0gJiAweGZmKSlcblx0JiB6aXBfSEFTSF9NQVNLO1xuICAgIHppcF9oYXNoX2hlYWQgPSB6aXBfaGVhZDEoemlwX2luc19oKTtcbiAgICB6aXBfcHJldlt6aXBfc3Ryc3RhcnQgJiB6aXBfV01BU0tdID0gemlwX2hhc2hfaGVhZDtcbiAgICB6aXBfaGVhZDIoemlwX2luc19oLCB6aXBfc3Ryc3RhcnQpO1xufVxuXG4vKiBTZW5kIGEgY29kZSBvZiB0aGUgZ2l2ZW4gdHJlZS4gYyBhbmQgdHJlZSBtdXN0IG5vdCBoYXZlIHNpZGUgZWZmZWN0cyAqL1xudmFyIHppcF9TRU5EX0NPREUgPSBmdW5jdGlvbihjLCB0cmVlKSB7XG4gICAgemlwX3NlbmRfYml0cyh0cmVlW2NdLmZjLCB0cmVlW2NdLmRsKTtcbn1cblxuLyogTWFwcGluZyBmcm9tIGEgZGlzdGFuY2UgdG8gYSBkaXN0YW5jZSBjb2RlLiBkaXN0IGlzIHRoZSBkaXN0YW5jZSAtIDEgYW5kXG4gKiBtdXN0IG5vdCBoYXZlIHNpZGUgZWZmZWN0cy4gZGlzdF9jb2RlWzI1Nl0gYW5kIGRpc3RfY29kZVsyNTddIGFyZSBuZXZlclxuICogdXNlZC5cbiAqL1xudmFyIHppcF9EX0NPREUgPSBmdW5jdGlvbihkaXN0KSB7XG4gICAgcmV0dXJuIChkaXN0IDwgMjU2ID8gemlwX2Rpc3RfY29kZVtkaXN0XVxuXHQgICAgOiB6aXBfZGlzdF9jb2RlWzI1NiArIChkaXN0Pj43KV0pICYgMHhmZjtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIENvbXBhcmVzIHRvIHN1YnRyZWVzLCB1c2luZyB0aGUgdHJlZSBkZXB0aCBhcyB0aWUgYnJlYWtlciB3aGVuXG4gKiB0aGUgc3VidHJlZXMgaGF2ZSBlcXVhbCBmcmVxdWVuY3kuIFRoaXMgbWluaW1pemVzIHRoZSB3b3JzdCBjYXNlIGxlbmd0aC5cbiAqL1xudmFyIHppcF9TTUFMTEVSID0gZnVuY3Rpb24odHJlZSwgbiwgbSkge1xuICAgIHJldHVybiB0cmVlW25dLmZjIDwgdHJlZVttXS5mYyB8fFxuICAgICAgKHRyZWVbbl0uZmMgPT0gdHJlZVttXS5mYyAmJiB6aXBfZGVwdGhbbl0gPD0gemlwX2RlcHRoW21dKTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIHJlYWQgc3RyaW5nIGRhdGFcbiAqL1xudmFyIHppcF9yZWFkX2J1ZmYgPSBmdW5jdGlvbihidWZmLCBvZmZzZXQsIG4pIHtcbiAgICB2YXIgaTtcbiAgICBmb3IoaSA9IDA7IGkgPCBuICYmIHppcF9kZWZsYXRlX3BvcyA8IHppcF9kZWZsYXRlX2RhdGEubGVuZ3RoOyBpKyspXG5cdGJ1ZmZbb2Zmc2V0ICsgaV0gPVxuXHQgICAgemlwX2RlZmxhdGVfZGF0YS5jaGFyQ29kZUF0KHppcF9kZWZsYXRlX3BvcysrKSAmIDB4ZmY7XG4gICAgcmV0dXJuIGk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBJbml0aWFsaXplIHRoZSBcImxvbmdlc3QgbWF0Y2hcIiByb3V0aW5lcyBmb3IgYSBuZXcgZmlsZVxuICovXG52YXIgemlwX2xtX2luaXQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgajtcblxuICAgIC8qIEluaXRpYWxpemUgdGhlIGhhc2ggdGFibGUuICovXG4gICAgZm9yKGogPSAwOyBqIDwgemlwX0hBU0hfU0laRTsgaisrKVxuLy9cdHppcF9oZWFkMihqLCB6aXBfTklMKTtcblx0emlwX3ByZXZbemlwX1dTSVpFICsgal0gPSAwO1xuICAgIC8qIHByZXYgd2lsbCBiZSBpbml0aWFsaXplZCBvbiB0aGUgZmx5ICovXG5cbiAgICAvKiBTZXQgdGhlIGRlZmF1bHQgY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzOlxuICAgICAqL1xuICAgIHppcF9tYXhfbGF6eV9tYXRjaCA9IHppcF9jb25maWd1cmF0aW9uX3RhYmxlW3ppcF9jb21wcl9sZXZlbF0ubWF4X2xhenk7XG4gICAgemlwX2dvb2RfbWF0Y2ggICAgID0gemlwX2NvbmZpZ3VyYXRpb25fdGFibGVbemlwX2NvbXByX2xldmVsXS5nb29kX2xlbmd0aDtcbiAgICBpZighemlwX0ZVTExfU0VBUkNIKVxuXHR6aXBfbmljZV9tYXRjaCA9IHppcF9jb25maWd1cmF0aW9uX3RhYmxlW3ppcF9jb21wcl9sZXZlbF0ubmljZV9sZW5ndGg7XG4gICAgemlwX21heF9jaGFpbl9sZW5ndGggPSB6aXBfY29uZmlndXJhdGlvbl90YWJsZVt6aXBfY29tcHJfbGV2ZWxdLm1heF9jaGFpbjtcblxuICAgIHppcF9zdHJzdGFydCA9IDA7XG4gICAgemlwX2Jsb2NrX3N0YXJ0ID0gMDtcblxuICAgIHppcF9sb29rYWhlYWQgPSB6aXBfcmVhZF9idWZmKHppcF93aW5kb3csIDAsIDIgKiB6aXBfV1NJWkUpO1xuICAgIGlmKHppcF9sb29rYWhlYWQgPD0gMCkge1xuXHR6aXBfZW9maWxlID0gdHJ1ZTtcblx0emlwX2xvb2thaGVhZCA9IDA7XG5cdHJldHVybjtcbiAgICB9XG4gICAgemlwX2VvZmlsZSA9IGZhbHNlO1xuICAgIC8qIE1ha2Ugc3VyZSB0aGF0IHdlIGFsd2F5cyBoYXZlIGVub3VnaCBsb29rYWhlYWQuIFRoaXMgaXMgaW1wb3J0YW50XG4gICAgICogaWYgaW5wdXQgY29tZXMgZnJvbSBhIGRldmljZSBzdWNoIGFzIGEgdHR5LlxuICAgICAqL1xuICAgIHdoaWxlKHppcF9sb29rYWhlYWQgPCB6aXBfTUlOX0xPT0tBSEVBRCAmJiAhemlwX2VvZmlsZSlcblx0emlwX2ZpbGxfd2luZG93KCk7XG5cbiAgICAvKiBJZiBsb29rYWhlYWQgPCBNSU5fTUFUQ0gsIGluc19oIGlzIGdhcmJhZ2UsIGJ1dCB0aGlzIGlzXG4gICAgICogbm90IGltcG9ydGFudCBzaW5jZSBvbmx5IGxpdGVyYWwgYnl0ZXMgd2lsbCBiZSBlbWl0dGVkLlxuICAgICAqL1xuICAgIHppcF9pbnNfaCA9IDA7XG4gICAgZm9yKGogPSAwOyBqIDwgemlwX01JTl9NQVRDSCAtIDE7IGorKykge1xuLy8gICAgICBVUERBVEVfSEFTSChpbnNfaCwgd2luZG93W2pdKTtcblx0emlwX2luc19oID0gKCh6aXBfaW5zX2ggPDwgemlwX0hfU0hJRlQpIF4gKHppcF93aW5kb3dbal0gJiAweGZmKSkgJiB6aXBfSEFTSF9NQVNLO1xuICAgIH1cbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFNldCBtYXRjaF9zdGFydCB0byB0aGUgbG9uZ2VzdCBtYXRjaCBzdGFydGluZyBhdCB0aGUgZ2l2ZW4gc3RyaW5nIGFuZFxuICogcmV0dXJuIGl0cyBsZW5ndGguIE1hdGNoZXMgc2hvcnRlciBvciBlcXVhbCB0byBwcmV2X2xlbmd0aCBhcmUgZGlzY2FyZGVkLFxuICogaW4gd2hpY2ggY2FzZSB0aGUgcmVzdWx0IGlzIGVxdWFsIHRvIHByZXZfbGVuZ3RoIGFuZCBtYXRjaF9zdGFydCBpc1xuICogZ2FyYmFnZS5cbiAqIElOIGFzc2VydGlvbnM6IGN1cl9tYXRjaCBpcyB0aGUgaGVhZCBvZiB0aGUgaGFzaCBjaGFpbiBmb3IgdGhlIGN1cnJlbnRcbiAqICAgc3RyaW5nIChzdHJzdGFydCkgYW5kIGl0cyBkaXN0YW5jZSBpcyA8PSBNQVhfRElTVCwgYW5kIHByZXZfbGVuZ3RoID49IDFcbiAqL1xudmFyIHppcF9sb25nZXN0X21hdGNoID0gZnVuY3Rpb24oY3VyX21hdGNoKSB7XG4gICAgdmFyIGNoYWluX2xlbmd0aCA9IHppcF9tYXhfY2hhaW5fbGVuZ3RoOyAvLyBtYXggaGFzaCBjaGFpbiBsZW5ndGhcbiAgICB2YXIgc2NhbnAgPSB6aXBfc3Ryc3RhcnQ7IC8vIGN1cnJlbnQgc3RyaW5nXG4gICAgdmFyIG1hdGNocDtcdFx0Ly8gbWF0Y2hlZCBzdHJpbmdcbiAgICB2YXIgbGVuO1x0XHQvLyBsZW5ndGggb2YgY3VycmVudCBtYXRjaFxuICAgIHZhciBiZXN0X2xlbiA9IHppcF9wcmV2X2xlbmd0aDtcdC8vIGJlc3QgbWF0Y2ggbGVuZ3RoIHNvIGZhclxuXG4gICAgLyogU3RvcCB3aGVuIGN1cl9tYXRjaCBiZWNvbWVzIDw9IGxpbWl0LiBUbyBzaW1wbGlmeSB0aGUgY29kZSxcbiAgICAgKiB3ZSBwcmV2ZW50IG1hdGNoZXMgd2l0aCB0aGUgc3RyaW5nIG9mIHdpbmRvdyBpbmRleCAwLlxuICAgICAqL1xuICAgIHZhciBsaW1pdCA9ICh6aXBfc3Ryc3RhcnQgPiB6aXBfTUFYX0RJU1QgPyB6aXBfc3Ryc3RhcnQgLSB6aXBfTUFYX0RJU1QgOiB6aXBfTklMKTtcblxuICAgIHZhciBzdHJlbmRwID0gemlwX3N0cnN0YXJ0ICsgemlwX01BWF9NQVRDSDtcbiAgICB2YXIgc2Nhbl9lbmQxID0gemlwX3dpbmRvd1tzY2FucCArIGJlc3RfbGVuIC0gMV07XG4gICAgdmFyIHNjYW5fZW5kICA9IHppcF93aW5kb3dbc2NhbnAgKyBiZXN0X2xlbl07XG5cbiAgICAvKiBEbyBub3Qgd2FzdGUgdG9vIG11Y2ggdGltZSBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBnb29kIG1hdGNoOiAqL1xuICAgIGlmKHppcF9wcmV2X2xlbmd0aCA+PSB6aXBfZ29vZF9tYXRjaClcblx0Y2hhaW5fbGVuZ3RoID4+PSAyO1xuXG4vLyAgQXNzZXJ0KGVuY29kZXItPnN0cnN0YXJ0IDw9IHdpbmRvd19zaXplLU1JTl9MT09LQUhFQUQsIFwiaW5zdWZmaWNpZW50IGxvb2thaGVhZFwiKTtcblxuICAgIGRvIHtcbi8vICAgIEFzc2VydChjdXJfbWF0Y2ggPCBlbmNvZGVyLT5zdHJzdGFydCwgXCJubyBmdXR1cmVcIik7XG5cdG1hdGNocCA9IGN1cl9tYXRjaDtcblxuXHQvKiBTa2lwIHRvIG5leHQgbWF0Y2ggaWYgdGhlIG1hdGNoIGxlbmd0aCBjYW5ub3QgaW5jcmVhc2Vcblx0ICAgICogb3IgaWYgdGhlIG1hdGNoIGxlbmd0aCBpcyBsZXNzIHRoYW4gMjpcblx0Ki9cblx0aWYoemlwX3dpbmRvd1ttYXRjaHAgKyBiZXN0X2xlbl1cdCE9IHNjYW5fZW5kICB8fFxuXHQgICB6aXBfd2luZG93W21hdGNocCArIGJlc3RfbGVuIC0gMV1cdCE9IHNjYW5fZW5kMSB8fFxuXHQgICB6aXBfd2luZG93W21hdGNocF1cdFx0XHQhPSB6aXBfd2luZG93W3NjYW5wXSB8fFxuXHQgICB6aXBfd2luZG93WysrbWF0Y2hwXVx0XHRcdCE9IHppcF93aW5kb3dbc2NhbnAgKyAxXSkge1xuXHQgICAgY29udGludWU7XG5cdH1cblxuXHQvKiBUaGUgY2hlY2sgYXQgYmVzdF9sZW4tMSBjYW4gYmUgcmVtb3ZlZCBiZWNhdXNlIGl0IHdpbGwgYmUgbWFkZVxuICAgICAgICAgKiBhZ2FpbiBsYXRlci4gKFRoaXMgaGV1cmlzdGljIGlzIG5vdCBhbHdheXMgYSB3aW4uKVxuICAgICAgICAgKiBJdCBpcyBub3QgbmVjZXNzYXJ5IHRvIGNvbXBhcmUgc2NhblsyXSBhbmQgbWF0Y2hbMl0gc2luY2UgdGhleVxuICAgICAgICAgKiBhcmUgYWx3YXlzIGVxdWFsIHdoZW4gdGhlIG90aGVyIGJ5dGVzIG1hdGNoLCBnaXZlbiB0aGF0XG4gICAgICAgICAqIHRoZSBoYXNoIGtleXMgYXJlIGVxdWFsIGFuZCB0aGF0IEhBU0hfQklUUyA+PSA4LlxuICAgICAgICAgKi9cblx0c2NhbnAgKz0gMjtcblx0bWF0Y2hwKys7XG5cblx0LyogV2UgY2hlY2sgZm9yIGluc3VmZmljaWVudCBsb29rYWhlYWQgb25seSBldmVyeSA4dGggY29tcGFyaXNvbjtcbiAgICAgICAgICogdGhlIDI1NnRoIGNoZWNrIHdpbGwgYmUgbWFkZSBhdCBzdHJzdGFydCsyNTguXG4gICAgICAgICAqL1xuXHRkbyB7XG5cdH0gd2hpbGUoemlwX3dpbmRvd1srK3NjYW5wXSA9PSB6aXBfd2luZG93WysrbWF0Y2hwXSAmJlxuXHRcdHppcF93aW5kb3dbKytzY2FucF0gPT0gemlwX3dpbmRvd1srK21hdGNocF0gJiZcblx0XHR6aXBfd2luZG93Wysrc2NhbnBdID09IHppcF93aW5kb3dbKyttYXRjaHBdICYmXG5cdFx0emlwX3dpbmRvd1srK3NjYW5wXSA9PSB6aXBfd2luZG93WysrbWF0Y2hwXSAmJlxuXHRcdHppcF93aW5kb3dbKytzY2FucF0gPT0gemlwX3dpbmRvd1srK21hdGNocF0gJiZcblx0XHR6aXBfd2luZG93Wysrc2NhbnBdID09IHppcF93aW5kb3dbKyttYXRjaHBdICYmXG5cdFx0emlwX3dpbmRvd1srK3NjYW5wXSA9PSB6aXBfd2luZG93WysrbWF0Y2hwXSAmJlxuXHRcdHppcF93aW5kb3dbKytzY2FucF0gPT0gemlwX3dpbmRvd1srK21hdGNocF0gJiZcblx0XHRzY2FucCA8IHN0cmVuZHApO1xuXG4gICAgICBsZW4gPSB6aXBfTUFYX01BVENIIC0gKHN0cmVuZHAgLSBzY2FucCk7XG4gICAgICBzY2FucCA9IHN0cmVuZHAgLSB6aXBfTUFYX01BVENIO1xuXG4gICAgICBpZihsZW4gPiBiZXN0X2xlbikge1xuXHQgIHppcF9tYXRjaF9zdGFydCA9IGN1cl9tYXRjaDtcblx0ICBiZXN0X2xlbiA9IGxlbjtcblx0ICBpZih6aXBfRlVMTF9TRUFSQ0gpIHtcblx0ICAgICAgaWYobGVuID49IHppcF9NQVhfTUFUQ0gpIGJyZWFrO1xuXHQgIH0gZWxzZSB7XG5cdCAgICAgIGlmKGxlbiA+PSB6aXBfbmljZV9tYXRjaCkgYnJlYWs7XG5cdCAgfVxuXG5cdCAgc2Nhbl9lbmQxICA9IHppcF93aW5kb3dbc2NhbnAgKyBiZXN0X2xlbi0xXTtcblx0ICBzY2FuX2VuZCAgID0gemlwX3dpbmRvd1tzY2FucCArIGJlc3RfbGVuXTtcbiAgICAgIH1cbiAgICB9IHdoaWxlKChjdXJfbWF0Y2ggPSB6aXBfcHJldltjdXJfbWF0Y2ggJiB6aXBfV01BU0tdKSA+IGxpbWl0XG5cdCAgICAmJiAtLWNoYWluX2xlbmd0aCAhPSAwKTtcblxuICAgIHJldHVybiBiZXN0X2xlbjtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIEZpbGwgdGhlIHdpbmRvdyB3aGVuIHRoZSBsb29rYWhlYWQgYmVjb21lcyBpbnN1ZmZpY2llbnQuXG4gKiBVcGRhdGVzIHN0cnN0YXJ0IGFuZCBsb29rYWhlYWQsIGFuZCBzZXRzIGVvZmlsZSBpZiBlbmQgb2YgaW5wdXQgZmlsZS5cbiAqIElOIGFzc2VydGlvbjogbG9va2FoZWFkIDwgTUlOX0xPT0tBSEVBRCAmJiBzdHJzdGFydCArIGxvb2thaGVhZCA+IDBcbiAqIE9VVCBhc3NlcnRpb25zOiBhdCBsZWFzdCBvbmUgYnl0ZSBoYXMgYmVlbiByZWFkLCBvciBlb2ZpbGUgaXMgc2V0O1xuICogICAgZmlsZSByZWFkcyBhcmUgcGVyZm9ybWVkIGZvciBhdCBsZWFzdCB0d28gYnl0ZXMgKHJlcXVpcmVkIGZvciB0aGVcbiAqICAgIHRyYW5zbGF0ZV9lb2wgb3B0aW9uKS5cbiAqL1xudmFyIHppcF9maWxsX3dpbmRvdyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBuLCBtO1xuXG4gICAgLy8gQW1vdW50IG9mIGZyZWUgc3BhY2UgYXQgdGhlIGVuZCBvZiB0aGUgd2luZG93LlxuICAgIHZhciBtb3JlID0gemlwX3dpbmRvd19zaXplIC0gemlwX2xvb2thaGVhZCAtIHppcF9zdHJzdGFydDtcblxuICAgIC8qIElmIHRoZSB3aW5kb3cgaXMgYWxtb3N0IGZ1bGwgYW5kIHRoZXJlIGlzIGluc3VmZmljaWVudCBsb29rYWhlYWQsXG4gICAgICogbW92ZSB0aGUgdXBwZXIgaGFsZiB0byB0aGUgbG93ZXIgb25lIHRvIG1ha2Ugcm9vbSBpbiB0aGUgdXBwZXIgaGFsZi5cbiAgICAgKi9cbiAgICBpZihtb3JlID09IC0xKSB7XG5cdC8qIFZlcnkgdW5saWtlbHksIGJ1dCBwb3NzaWJsZSBvbiAxNiBiaXQgbWFjaGluZSBpZiBzdHJzdGFydCA9PSAwXG4gICAgICAgICAqIGFuZCBsb29rYWhlYWQgPT0gMSAoaW5wdXQgZG9uZSBvbmUgYnl0ZSBhdCB0aW1lKVxuICAgICAgICAgKi9cblx0bW9yZS0tO1xuICAgIH0gZWxzZSBpZih6aXBfc3Ryc3RhcnQgPj0gemlwX1dTSVpFICsgemlwX01BWF9ESVNUKSB7XG5cdC8qIEJ5IHRoZSBJTiBhc3NlcnRpb24sIHRoZSB3aW5kb3cgaXMgbm90IGVtcHR5IHNvIHdlIGNhbid0IGNvbmZ1c2VcbiAgICAgICAgICogbW9yZSA9PSAwIHdpdGggbW9yZSA9PSA2NEsgb24gYSAxNiBiaXQgbWFjaGluZS5cbiAgICAgICAgICovXG4vL1x0QXNzZXJ0KHdpbmRvd19zaXplID09ICh1bGcpMipXU0laRSwgXCJubyBzbGlkaW5nIHdpdGggQklHX01FTVwiKTtcblxuLy9cdFN5c3RlbS5hcnJheWNvcHkod2luZG93LCBXU0laRSwgd2luZG93LCAwLCBXU0laRSk7XG5cdGZvcihuID0gMDsgbiA8IHppcF9XU0laRTsgbisrKVxuXHQgICAgemlwX3dpbmRvd1tuXSA9IHppcF93aW5kb3dbbiArIHppcF9XU0laRV07XG4gICAgICBcblx0emlwX21hdGNoX3N0YXJ0IC09IHppcF9XU0laRTtcblx0emlwX3N0cnN0YXJ0ICAgIC09IHppcF9XU0laRTsgLyogd2Ugbm93IGhhdmUgc3Ryc3RhcnQgPj0gTUFYX0RJU1Q6ICovXG5cdHppcF9ibG9ja19zdGFydCAtPSB6aXBfV1NJWkU7XG5cblx0Zm9yKG4gPSAwOyBuIDwgemlwX0hBU0hfU0laRTsgbisrKSB7XG5cdCAgICBtID0gemlwX2hlYWQxKG4pO1xuXHQgICAgemlwX2hlYWQyKG4sIG0gPj0gemlwX1dTSVpFID8gbSAtIHppcF9XU0laRSA6IHppcF9OSUwpO1xuXHR9XG5cdGZvcihuID0gMDsgbiA8IHppcF9XU0laRTsgbisrKSB7XG5cdCAgICAvKiBJZiBuIGlzIG5vdCBvbiBhbnkgaGFzaCBjaGFpbiwgcHJldltuXSBpcyBnYXJiYWdlIGJ1dFxuXHQgICAgICogaXRzIHZhbHVlIHdpbGwgbmV2ZXIgYmUgdXNlZC5cblx0ICAgICAqL1xuXHQgICAgbSA9IHppcF9wcmV2W25dO1xuXHQgICAgemlwX3ByZXZbbl0gPSAobSA+PSB6aXBfV1NJWkUgPyBtIC0gemlwX1dTSVpFIDogemlwX05JTCk7XG5cdH1cblx0bW9yZSArPSB6aXBfV1NJWkU7XG4gICAgfVxuICAgIC8vIEF0IHRoaXMgcG9pbnQsIG1vcmUgPj0gMlxuICAgIGlmKCF6aXBfZW9maWxlKSB7XG5cdG4gPSB6aXBfcmVhZF9idWZmKHppcF93aW5kb3csIHppcF9zdHJzdGFydCArIHppcF9sb29rYWhlYWQsIG1vcmUpO1xuXHRpZihuIDw9IDApXG5cdCAgICB6aXBfZW9maWxlID0gdHJ1ZTtcblx0ZWxzZVxuXHQgICAgemlwX2xvb2thaGVhZCArPSBuO1xuICAgIH1cbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFByb2Nlc3NlcyBhIG5ldyBpbnB1dCBmaWxlIGFuZCByZXR1cm4gaXRzIGNvbXByZXNzZWQgbGVuZ3RoLiBUaGlzXG4gKiBmdW5jdGlvbiBkb2VzIG5vdCBwZXJmb3JtIGxhenkgZXZhbHVhdGlvbm9mIG1hdGNoZXMgYW5kIGluc2VydHNcbiAqIG5ldyBzdHJpbmdzIGluIHRoZSBkaWN0aW9uYXJ5IG9ubHkgZm9yIHVubWF0Y2hlZCBzdHJpbmdzIG9yIGZvciBzaG9ydFxuICogbWF0Y2hlcy4gSXQgaXMgdXNlZCBvbmx5IGZvciB0aGUgZmFzdCBjb21wcmVzc2lvbiBvcHRpb25zLlxuICovXG52YXIgemlwX2RlZmxhdGVfZmFzdCA9IGZ1bmN0aW9uKCkge1xuICAgIHdoaWxlKHppcF9sb29rYWhlYWQgIT0gMCAmJiB6aXBfcWhlYWQgPT0gbnVsbCkge1xuXHR2YXIgZmx1c2g7IC8vIHNldCBpZiBjdXJyZW50IGJsb2NrIG11c3QgYmUgZmx1c2hlZFxuXG5cdC8qIEluc2VydCB0aGUgc3RyaW5nIHdpbmRvd1tzdHJzdGFydCAuLiBzdHJzdGFydCsyXSBpbiB0aGVcblx0ICogZGljdGlvbmFyeSwgYW5kIHNldCBoYXNoX2hlYWQgdG8gdGhlIGhlYWQgb2YgdGhlIGhhc2ggY2hhaW46XG5cdCAqL1xuXHR6aXBfSU5TRVJUX1NUUklORygpO1xuXG5cdC8qIEZpbmQgdGhlIGxvbmdlc3QgbWF0Y2gsIGRpc2NhcmRpbmcgdGhvc2UgPD0gcHJldl9sZW5ndGguXG5cdCAqIEF0IHRoaXMgcG9pbnQgd2UgaGF2ZSBhbHdheXMgbWF0Y2hfbGVuZ3RoIDwgTUlOX01BVENIXG5cdCAqL1xuXHRpZih6aXBfaGFzaF9oZWFkICE9IHppcF9OSUwgJiZcblx0ICAgemlwX3N0cnN0YXJ0IC0gemlwX2hhc2hfaGVhZCA8PSB6aXBfTUFYX0RJU1QpIHtcblx0ICAgIC8qIFRvIHNpbXBsaWZ5IHRoZSBjb2RlLCB3ZSBwcmV2ZW50IG1hdGNoZXMgd2l0aCB0aGUgc3RyaW5nXG5cdCAgICAgKiBvZiB3aW5kb3cgaW5kZXggMCAoaW4gcGFydGljdWxhciB3ZSBoYXZlIHRvIGF2b2lkIGEgbWF0Y2hcblx0ICAgICAqIG9mIHRoZSBzdHJpbmcgd2l0aCBpdHNlbGYgYXQgdGhlIHN0YXJ0IG9mIHRoZSBpbnB1dCBmaWxlKS5cblx0ICAgICAqL1xuXHQgICAgemlwX21hdGNoX2xlbmd0aCA9IHppcF9sb25nZXN0X21hdGNoKHppcF9oYXNoX2hlYWQpO1xuXHQgICAgLyogbG9uZ2VzdF9tYXRjaCgpIHNldHMgbWF0Y2hfc3RhcnQgKi9cblx0ICAgIGlmKHppcF9tYXRjaF9sZW5ndGggPiB6aXBfbG9va2FoZWFkKVxuXHRcdHppcF9tYXRjaF9sZW5ndGggPSB6aXBfbG9va2FoZWFkO1xuXHR9XG5cdGlmKHppcF9tYXRjaF9sZW5ndGggPj0gemlwX01JTl9NQVRDSCkge1xuLy9cdCAgICBjaGVja19tYXRjaChzdHJzdGFydCwgbWF0Y2hfc3RhcnQsIG1hdGNoX2xlbmd0aCk7XG5cblx0ICAgIGZsdXNoID0gemlwX2N0X3RhbGx5KHppcF9zdHJzdGFydCAtIHppcF9tYXRjaF9zdGFydCxcblx0XHRcdFx0IHppcF9tYXRjaF9sZW5ndGggLSB6aXBfTUlOX01BVENIKTtcblx0ICAgIHppcF9sb29rYWhlYWQgLT0gemlwX21hdGNoX2xlbmd0aDtcblxuXHQgICAgLyogSW5zZXJ0IG5ldyBzdHJpbmdzIGluIHRoZSBoYXNoIHRhYmxlIG9ubHkgaWYgdGhlIG1hdGNoIGxlbmd0aFxuXHQgICAgICogaXMgbm90IHRvbyBsYXJnZS4gVGhpcyBzYXZlcyB0aW1lIGJ1dCBkZWdyYWRlcyBjb21wcmVzc2lvbi5cblx0ICAgICAqL1xuXHQgICAgaWYoemlwX21hdGNoX2xlbmd0aCA8PSB6aXBfbWF4X2xhenlfbWF0Y2gpIHtcblx0XHR6aXBfbWF0Y2hfbGVuZ3RoLS07IC8vIHN0cmluZyBhdCBzdHJzdGFydCBhbHJlYWR5IGluIGhhc2ggdGFibGVcblx0XHRkbyB7XG5cdFx0ICAgIHppcF9zdHJzdGFydCsrO1xuXHRcdCAgICB6aXBfSU5TRVJUX1NUUklORygpO1xuXHRcdCAgICAvKiBzdHJzdGFydCBuZXZlciBleGNlZWRzIFdTSVpFLU1BWF9NQVRDSCwgc28gdGhlcmUgYXJlXG5cdFx0ICAgICAqIGFsd2F5cyBNSU5fTUFUQ0ggYnl0ZXMgYWhlYWQuIElmIGxvb2thaGVhZCA8IE1JTl9NQVRDSFxuXHRcdCAgICAgKiB0aGVzZSBieXRlcyBhcmUgZ2FyYmFnZSwgYnV0IGl0IGRvZXMgbm90IG1hdHRlciBzaW5jZVxuXHRcdCAgICAgKiB0aGUgbmV4dCBsb29rYWhlYWQgYnl0ZXMgd2lsbCBiZSBlbWl0dGVkIGFzIGxpdGVyYWxzLlxuXHRcdCAgICAgKi9cblx0XHR9IHdoaWxlKC0temlwX21hdGNoX2xlbmd0aCAhPSAwKTtcblx0XHR6aXBfc3Ryc3RhcnQrKztcblx0ICAgIH0gZWxzZSB7XG5cdFx0emlwX3N0cnN0YXJ0ICs9IHppcF9tYXRjaF9sZW5ndGg7XG5cdFx0emlwX21hdGNoX2xlbmd0aCA9IDA7XG5cdFx0emlwX2luc19oID0gemlwX3dpbmRvd1t6aXBfc3Ryc3RhcnRdICYgMHhmZjtcbi8vXHRcdFVQREFURV9IQVNIKGluc19oLCB3aW5kb3dbc3Ryc3RhcnQgKyAxXSk7XG5cdFx0emlwX2luc19oID0gKCh6aXBfaW5zX2g8PHppcF9IX1NISUZUKSBeICh6aXBfd2luZG93W3ppcF9zdHJzdGFydCArIDFdICYgMHhmZikpICYgemlwX0hBU0hfTUFTSztcblxuLy8jaWYgTUlOX01BVENIICE9IDNcbi8vXHRcdENhbGwgVVBEQVRFX0hBU0goKSBNSU5fTUFUQ0gtMyBtb3JlIHRpbWVzXG4vLyNlbmRpZlxuXG5cdCAgICB9XG5cdH0gZWxzZSB7XG5cdCAgICAvKiBObyBtYXRjaCwgb3V0cHV0IGEgbGl0ZXJhbCBieXRlICovXG5cdCAgICBmbHVzaCA9IHppcF9jdF90YWxseSgwLCB6aXBfd2luZG93W3ppcF9zdHJzdGFydF0gJiAweGZmKTtcblx0ICAgIHppcF9sb29rYWhlYWQtLTtcblx0ICAgIHppcF9zdHJzdGFydCsrO1xuXHR9XG5cdGlmKGZsdXNoKSB7XG5cdCAgICB6aXBfZmx1c2hfYmxvY2soMCk7XG5cdCAgICB6aXBfYmxvY2tfc3RhcnQgPSB6aXBfc3Ryc3RhcnQ7XG5cdH1cblxuXHQvKiBNYWtlIHN1cmUgdGhhdCB3ZSBhbHdheXMgaGF2ZSBlbm91Z2ggbG9va2FoZWFkLCBleGNlcHRcblx0ICogYXQgdGhlIGVuZCBvZiB0aGUgaW5wdXQgZmlsZS4gV2UgbmVlZCBNQVhfTUFUQ0ggYnl0ZXNcblx0ICogZm9yIHRoZSBuZXh0IG1hdGNoLCBwbHVzIE1JTl9NQVRDSCBieXRlcyB0byBpbnNlcnQgdGhlXG5cdCAqIHN0cmluZyBmb2xsb3dpbmcgdGhlIG5leHQgbWF0Y2guXG5cdCAqL1xuXHR3aGlsZSh6aXBfbG9va2FoZWFkIDwgemlwX01JTl9MT09LQUhFQUQgJiYgIXppcF9lb2ZpbGUpXG5cdCAgICB6aXBfZmlsbF93aW5kb3coKTtcbiAgICB9XG59XG5cbnZhciB6aXBfZGVmbGF0ZV9iZXR0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAvKiBQcm9jZXNzIHRoZSBpbnB1dCBibG9jay4gKi9cbiAgICB3aGlsZSh6aXBfbG9va2FoZWFkICE9IDAgJiYgemlwX3FoZWFkID09IG51bGwpIHtcblx0LyogSW5zZXJ0IHRoZSBzdHJpbmcgd2luZG93W3N0cnN0YXJ0IC4uIHN0cnN0YXJ0KzJdIGluIHRoZVxuXHQgKiBkaWN0aW9uYXJ5LCBhbmQgc2V0IGhhc2hfaGVhZCB0byB0aGUgaGVhZCBvZiB0aGUgaGFzaCBjaGFpbjpcblx0ICovXG5cdHppcF9JTlNFUlRfU1RSSU5HKCk7XG5cblx0LyogRmluZCB0aGUgbG9uZ2VzdCBtYXRjaCwgZGlzY2FyZGluZyB0aG9zZSA8PSBwcmV2X2xlbmd0aC5cblx0ICovXG5cdHppcF9wcmV2X2xlbmd0aCA9IHppcF9tYXRjaF9sZW5ndGg7XG5cdHppcF9wcmV2X21hdGNoID0gemlwX21hdGNoX3N0YXJ0O1xuXHR6aXBfbWF0Y2hfbGVuZ3RoID0gemlwX01JTl9NQVRDSCAtIDE7XG5cblx0aWYoemlwX2hhc2hfaGVhZCAhPSB6aXBfTklMICYmXG5cdCAgIHppcF9wcmV2X2xlbmd0aCA8IHppcF9tYXhfbGF6eV9tYXRjaCAmJlxuXHQgICB6aXBfc3Ryc3RhcnQgLSB6aXBfaGFzaF9oZWFkIDw9IHppcF9NQVhfRElTVCkge1xuXHQgICAgLyogVG8gc2ltcGxpZnkgdGhlIGNvZGUsIHdlIHByZXZlbnQgbWF0Y2hlcyB3aXRoIHRoZSBzdHJpbmdcblx0ICAgICAqIG9mIHdpbmRvdyBpbmRleCAwIChpbiBwYXJ0aWN1bGFyIHdlIGhhdmUgdG8gYXZvaWQgYSBtYXRjaFxuXHQgICAgICogb2YgdGhlIHN0cmluZyB3aXRoIGl0c2VsZiBhdCB0aGUgc3RhcnQgb2YgdGhlIGlucHV0IGZpbGUpLlxuXHQgICAgICovXG5cdCAgICB6aXBfbWF0Y2hfbGVuZ3RoID0gemlwX2xvbmdlc3RfbWF0Y2goemlwX2hhc2hfaGVhZCk7XG5cdCAgICAvKiBsb25nZXN0X21hdGNoKCkgc2V0cyBtYXRjaF9zdGFydCAqL1xuXHQgICAgaWYoemlwX21hdGNoX2xlbmd0aCA+IHppcF9sb29rYWhlYWQpXG5cdFx0emlwX21hdGNoX2xlbmd0aCA9IHppcF9sb29rYWhlYWQ7XG5cblx0ICAgIC8qIElnbm9yZSBhIGxlbmd0aCAzIG1hdGNoIGlmIGl0IGlzIHRvbyBkaXN0YW50OiAqL1xuXHQgICAgaWYoemlwX21hdGNoX2xlbmd0aCA9PSB6aXBfTUlOX01BVENIICYmXG5cdCAgICAgICB6aXBfc3Ryc3RhcnQgLSB6aXBfbWF0Y2hfc3RhcnQgPiB6aXBfVE9PX0ZBUikge1xuXHRcdC8qIElmIHByZXZfbWF0Y2ggaXMgYWxzbyBNSU5fTUFUQ0gsIG1hdGNoX3N0YXJ0IGlzIGdhcmJhZ2Vcblx0XHQgKiBidXQgd2Ugd2lsbCBpZ25vcmUgdGhlIGN1cnJlbnQgbWF0Y2ggYW55d2F5LlxuXHRcdCAqL1xuXHRcdHppcF9tYXRjaF9sZW5ndGgtLTtcblx0ICAgIH1cblx0fVxuXHQvKiBJZiB0aGVyZSB3YXMgYSBtYXRjaCBhdCB0aGUgcHJldmlvdXMgc3RlcCBhbmQgdGhlIGN1cnJlbnRcblx0ICogbWF0Y2ggaXMgbm90IGJldHRlciwgb3V0cHV0IHRoZSBwcmV2aW91cyBtYXRjaDpcblx0ICovXG5cdGlmKHppcF9wcmV2X2xlbmd0aCA+PSB6aXBfTUlOX01BVENIICYmXG5cdCAgIHppcF9tYXRjaF9sZW5ndGggPD0gemlwX3ByZXZfbGVuZ3RoKSB7XG5cdCAgICB2YXIgZmx1c2g7IC8vIHNldCBpZiBjdXJyZW50IGJsb2NrIG11c3QgYmUgZmx1c2hlZFxuXG4vL1x0ICAgIGNoZWNrX21hdGNoKHN0cnN0YXJ0IC0gMSwgcHJldl9tYXRjaCwgcHJldl9sZW5ndGgpO1xuXHQgICAgZmx1c2ggPSB6aXBfY3RfdGFsbHkoemlwX3N0cnN0YXJ0IC0gMSAtIHppcF9wcmV2X21hdGNoLFxuXHRcdFx0XHQgemlwX3ByZXZfbGVuZ3RoIC0gemlwX01JTl9NQVRDSCk7XG5cblx0ICAgIC8qIEluc2VydCBpbiBoYXNoIHRhYmxlIGFsbCBzdHJpbmdzIHVwIHRvIHRoZSBlbmQgb2YgdGhlIG1hdGNoLlxuXHQgICAgICogc3Ryc3RhcnQtMSBhbmQgc3Ryc3RhcnQgYXJlIGFscmVhZHkgaW5zZXJ0ZWQuXG5cdCAgICAgKi9cblx0ICAgIHppcF9sb29rYWhlYWQgLT0gemlwX3ByZXZfbGVuZ3RoIC0gMTtcblx0ICAgIHppcF9wcmV2X2xlbmd0aCAtPSAyO1xuXHQgICAgZG8ge1xuXHRcdHppcF9zdHJzdGFydCsrO1xuXHRcdHppcF9JTlNFUlRfU1RSSU5HKCk7XG5cdFx0Lyogc3Ryc3RhcnQgbmV2ZXIgZXhjZWVkcyBXU0laRS1NQVhfTUFUQ0gsIHNvIHRoZXJlIGFyZVxuXHRcdCAqIGFsd2F5cyBNSU5fTUFUQ0ggYnl0ZXMgYWhlYWQuIElmIGxvb2thaGVhZCA8IE1JTl9NQVRDSFxuXHRcdCAqIHRoZXNlIGJ5dGVzIGFyZSBnYXJiYWdlLCBidXQgaXQgZG9lcyBub3QgbWF0dGVyIHNpbmNlIHRoZVxuXHRcdCAqIG5leHQgbG9va2FoZWFkIGJ5dGVzIHdpbGwgYWx3YXlzIGJlIGVtaXR0ZWQgYXMgbGl0ZXJhbHMuXG5cdFx0ICovXG5cdCAgICB9IHdoaWxlKC0temlwX3ByZXZfbGVuZ3RoICE9IDApO1xuXHQgICAgemlwX21hdGNoX2F2YWlsYWJsZSA9IDA7XG5cdCAgICB6aXBfbWF0Y2hfbGVuZ3RoID0gemlwX01JTl9NQVRDSCAtIDE7XG5cdCAgICB6aXBfc3Ryc3RhcnQrKztcblx0ICAgIGlmKGZsdXNoKSB7XG5cdFx0emlwX2ZsdXNoX2Jsb2NrKDApO1xuXHRcdHppcF9ibG9ja19zdGFydCA9IHppcF9zdHJzdGFydDtcblx0ICAgIH1cblx0fSBlbHNlIGlmKHppcF9tYXRjaF9hdmFpbGFibGUgIT0gMCkge1xuXHQgICAgLyogSWYgdGhlcmUgd2FzIG5vIG1hdGNoIGF0IHRoZSBwcmV2aW91cyBwb3NpdGlvbiwgb3V0cHV0IGFcblx0ICAgICAqIHNpbmdsZSBsaXRlcmFsLiBJZiB0aGVyZSB3YXMgYSBtYXRjaCBidXQgdGhlIGN1cnJlbnQgbWF0Y2hcblx0ICAgICAqIGlzIGxvbmdlciwgdHJ1bmNhdGUgdGhlIHByZXZpb3VzIG1hdGNoIHRvIGEgc2luZ2xlIGxpdGVyYWwuXG5cdCAgICAgKi9cblx0ICAgIGlmKHppcF9jdF90YWxseSgwLCB6aXBfd2luZG93W3ppcF9zdHJzdGFydCAtIDFdICYgMHhmZikpIHtcblx0XHR6aXBfZmx1c2hfYmxvY2soMCk7XG5cdFx0emlwX2Jsb2NrX3N0YXJ0ID0gemlwX3N0cnN0YXJ0O1xuXHQgICAgfVxuXHQgICAgemlwX3N0cnN0YXJ0Kys7XG5cdCAgICB6aXBfbG9va2FoZWFkLS07XG5cdH0gZWxzZSB7XG5cdCAgICAvKiBUaGVyZSBpcyBubyBwcmV2aW91cyBtYXRjaCB0byBjb21wYXJlIHdpdGgsIHdhaXQgZm9yXG5cdCAgICAgKiB0aGUgbmV4dCBzdGVwIHRvIGRlY2lkZS5cblx0ICAgICAqL1xuXHQgICAgemlwX21hdGNoX2F2YWlsYWJsZSA9IDE7XG5cdCAgICB6aXBfc3Ryc3RhcnQrKztcblx0ICAgIHppcF9sb29rYWhlYWQtLTtcblx0fVxuXG5cdC8qIE1ha2Ugc3VyZSB0aGF0IHdlIGFsd2F5cyBoYXZlIGVub3VnaCBsb29rYWhlYWQsIGV4Y2VwdFxuXHQgKiBhdCB0aGUgZW5kIG9mIHRoZSBpbnB1dCBmaWxlLiBXZSBuZWVkIE1BWF9NQVRDSCBieXRlc1xuXHQgKiBmb3IgdGhlIG5leHQgbWF0Y2gsIHBsdXMgTUlOX01BVENIIGJ5dGVzIHRvIGluc2VydCB0aGVcblx0ICogc3RyaW5nIGZvbGxvd2luZyB0aGUgbmV4dCBtYXRjaC5cblx0ICovXG5cdHdoaWxlKHppcF9sb29rYWhlYWQgPCB6aXBfTUlOX0xPT0tBSEVBRCAmJiAhemlwX2VvZmlsZSlcblx0ICAgIHppcF9maWxsX3dpbmRvdygpO1xuICAgIH1cbn1cblxudmFyIHppcF9pbml0X2RlZmxhdGUgPSBmdW5jdGlvbigpIHtcbiAgICBpZih6aXBfZW9maWxlKVxuXHRyZXR1cm47XG4gICAgemlwX2JpX2J1ZiA9IDA7XG4gICAgemlwX2JpX3ZhbGlkID0gMDtcbiAgICB6aXBfY3RfaW5pdCgpO1xuICAgIHppcF9sbV9pbml0KCk7XG5cbiAgICB6aXBfcWhlYWQgPSBudWxsO1xuICAgIHppcF9vdXRjbnQgPSAwO1xuICAgIHppcF9vdXRvZmYgPSAwO1xuICAgIHppcF9tYXRjaF9hdmFpbGFibGUgPSAwO1xuXG4gICAgaWYoemlwX2NvbXByX2xldmVsIDw9IDMpXG4gICAge1xuXHR6aXBfcHJldl9sZW5ndGggPSB6aXBfTUlOX01BVENIIC0gMTtcblx0emlwX21hdGNoX2xlbmd0aCA9IDA7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG5cdHppcF9tYXRjaF9sZW5ndGggPSB6aXBfTUlOX01BVENIIC0gMTtcblx0emlwX21hdGNoX2F2YWlsYWJsZSA9IDA7XG4gICAgICAgIHppcF9tYXRjaF9hdmFpbGFibGUgPSAwO1xuICAgIH1cblxuICAgIHppcF9jb21wbGV0ZSA9IGZhbHNlO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogU2FtZSBhcyBhYm92ZSwgYnV0IGFjaGlldmVzIGJldHRlciBjb21wcmVzc2lvbi4gV2UgdXNlIGEgbGF6eVxuICogZXZhbHVhdGlvbiBmb3IgbWF0Y2hlczogYSBtYXRjaCBpcyBmaW5hbGx5IGFkb3B0ZWQgb25seSBpZiB0aGVyZSBpc1xuICogbm8gYmV0dGVyIG1hdGNoIGF0IHRoZSBuZXh0IHdpbmRvdyBwb3NpdGlvbi5cbiAqL1xudmFyIHppcF9kZWZsYXRlX2ludGVybmFsID0gZnVuY3Rpb24oYnVmZiwgb2ZmLCBidWZmX3NpemUpIHtcbiAgICB2YXIgbjtcblxuICAgIGlmKCF6aXBfaW5pdGZsYWcpXG4gICAge1xuXHR6aXBfaW5pdF9kZWZsYXRlKCk7XG5cdHppcF9pbml0ZmxhZyA9IHRydWU7XG5cdGlmKHppcF9sb29rYWhlYWQgPT0gMCkgeyAvLyBlbXB0eVxuXHQgICAgemlwX2NvbXBsZXRlID0gdHJ1ZTtcblx0ICAgIHJldHVybiAwO1xuXHR9XG4gICAgfVxuXG4gICAgaWYoKG4gPSB6aXBfcWNvcHkoYnVmZiwgb2ZmLCBidWZmX3NpemUpKSA9PSBidWZmX3NpemUpXG5cdHJldHVybiBidWZmX3NpemU7XG5cbiAgICBpZih6aXBfY29tcGxldGUpXG5cdHJldHVybiBuO1xuXG4gICAgaWYoemlwX2NvbXByX2xldmVsIDw9IDMpIC8vIG9wdGltaXplZCBmb3Igc3BlZWRcblx0emlwX2RlZmxhdGVfZmFzdCgpO1xuICAgIGVsc2Vcblx0emlwX2RlZmxhdGVfYmV0dGVyKCk7XG4gICAgaWYoemlwX2xvb2thaGVhZCA9PSAwKSB7XG5cdGlmKHppcF9tYXRjaF9hdmFpbGFibGUgIT0gMClcblx0ICAgIHppcF9jdF90YWxseSgwLCB6aXBfd2luZG93W3ppcF9zdHJzdGFydCAtIDFdICYgMHhmZik7XG5cdHppcF9mbHVzaF9ibG9jaygxKTtcblx0emlwX2NvbXBsZXRlID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIG4gKyB6aXBfcWNvcHkoYnVmZiwgbiArIG9mZiwgYnVmZl9zaXplIC0gbik7XG59XG5cbnZhciB6aXBfcWNvcHkgPSBmdW5jdGlvbihidWZmLCBvZmYsIGJ1ZmZfc2l6ZSkge1xuICAgIHZhciBuLCBpLCBqO1xuXG4gICAgbiA9IDA7XG4gICAgd2hpbGUoemlwX3FoZWFkICE9IG51bGwgJiYgbiA8IGJ1ZmZfc2l6ZSlcbiAgICB7XG5cdGkgPSBidWZmX3NpemUgLSBuO1xuXHRpZihpID4gemlwX3FoZWFkLmxlbilcblx0ICAgIGkgPSB6aXBfcWhlYWQubGVuO1xuLy8gICAgICBTeXN0ZW0uYXJyYXljb3B5KHFoZWFkLnB0ciwgcWhlYWQub2ZmLCBidWZmLCBvZmYgKyBuLCBpKTtcblx0Zm9yKGogPSAwOyBqIDwgaTsgaisrKVxuXHQgICAgYnVmZltvZmYgKyBuICsgal0gPSB6aXBfcWhlYWQucHRyW3ppcF9xaGVhZC5vZmYgKyBqXTtcblx0XG5cdHppcF9xaGVhZC5vZmYgKz0gaTtcblx0emlwX3FoZWFkLmxlbiAtPSBpO1xuXHRuICs9IGk7XG5cdGlmKHppcF9xaGVhZC5sZW4gPT0gMCkge1xuXHQgICAgdmFyIHA7XG5cdCAgICBwID0gemlwX3FoZWFkO1xuXHQgICAgemlwX3FoZWFkID0gemlwX3FoZWFkLm5leHQ7XG5cdCAgICB6aXBfcmV1c2VfcXVldWUocCk7XG5cdH1cbiAgICB9XG5cbiAgICBpZihuID09IGJ1ZmZfc2l6ZSlcblx0cmV0dXJuIG47XG5cbiAgICBpZih6aXBfb3V0b2ZmIDwgemlwX291dGNudCkge1xuXHRpID0gYnVmZl9zaXplIC0gbjtcblx0aWYoaSA+IHppcF9vdXRjbnQgLSB6aXBfb3V0b2ZmKVxuXHQgICAgaSA9IHppcF9vdXRjbnQgLSB6aXBfb3V0b2ZmO1xuXHQvLyBTeXN0ZW0uYXJyYXljb3B5KG91dGJ1Ziwgb3V0b2ZmLCBidWZmLCBvZmYgKyBuLCBpKTtcblx0Zm9yKGogPSAwOyBqIDwgaTsgaisrKVxuXHQgICAgYnVmZltvZmYgKyBuICsgal0gPSB6aXBfb3V0YnVmW3ppcF9vdXRvZmYgKyBqXTtcblx0emlwX291dG9mZiArPSBpO1xuXHRuICs9IGk7XG5cdGlmKHppcF9vdXRjbnQgPT0gemlwX291dG9mZilcblx0ICAgIHppcF9vdXRjbnQgPSB6aXBfb3V0b2ZmID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIG47XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBBbGxvY2F0ZSB0aGUgbWF0Y2ggYnVmZmVyLCBpbml0aWFsaXplIHRoZSB2YXJpb3VzIHRhYmxlcyBhbmQgc2F2ZSB0aGVcbiAqIGxvY2F0aW9uIG9mIHRoZSBpbnRlcm5hbCBmaWxlIGF0dHJpYnV0ZSAoYXNjaWkvYmluYXJ5KSBhbmQgbWV0aG9kXG4gKiAoREVGTEFURS9TVE9SRSkuXG4gKi9cbnZhciB6aXBfY3RfaW5pdCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBuO1x0Ly8gaXRlcmF0ZXMgb3ZlciB0cmVlIGVsZW1lbnRzXG4gICAgdmFyIGJpdHM7XHQvLyBiaXQgY291bnRlclxuICAgIHZhciBsZW5ndGg7XHQvLyBsZW5ndGggdmFsdWVcbiAgICB2YXIgY29kZTtcdC8vIGNvZGUgdmFsdWVcbiAgICB2YXIgZGlzdDtcdC8vIGRpc3RhbmNlIGluZGV4XG5cbiAgICBpZih6aXBfc3RhdGljX2R0cmVlWzBdLmRsICE9IDApIHJldHVybjsgLy8gY3RfaW5pdCBhbHJlYWR5IGNhbGxlZFxuXG4gICAgemlwX2xfZGVzYy5keW5fdHJlZVx0XHQ9IHppcF9keW5fbHRyZWU7XG4gICAgemlwX2xfZGVzYy5zdGF0aWNfdHJlZVx0PSB6aXBfc3RhdGljX2x0cmVlO1xuICAgIHppcF9sX2Rlc2MuZXh0cmFfYml0c1x0PSB6aXBfZXh0cmFfbGJpdHM7XG4gICAgemlwX2xfZGVzYy5leHRyYV9iYXNlXHQ9IHppcF9MSVRFUkFMUyArIDE7XG4gICAgemlwX2xfZGVzYy5lbGVtc1x0XHQ9IHppcF9MX0NPREVTO1xuICAgIHppcF9sX2Rlc2MubWF4X2xlbmd0aFx0PSB6aXBfTUFYX0JJVFM7XG4gICAgemlwX2xfZGVzYy5tYXhfY29kZVx0XHQ9IDA7XG5cbiAgICB6aXBfZF9kZXNjLmR5bl90cmVlXHRcdD0gemlwX2R5bl9kdHJlZTtcbiAgICB6aXBfZF9kZXNjLnN0YXRpY190cmVlXHQ9IHppcF9zdGF0aWNfZHRyZWU7XG4gICAgemlwX2RfZGVzYy5leHRyYV9iaXRzXHQ9IHppcF9leHRyYV9kYml0cztcbiAgICB6aXBfZF9kZXNjLmV4dHJhX2Jhc2VcdD0gMDtcbiAgICB6aXBfZF9kZXNjLmVsZW1zXHRcdD0gemlwX0RfQ09ERVM7XG4gICAgemlwX2RfZGVzYy5tYXhfbGVuZ3RoXHQ9IHppcF9NQVhfQklUUztcbiAgICB6aXBfZF9kZXNjLm1heF9jb2RlXHRcdD0gMDtcblxuICAgIHppcF9ibF9kZXNjLmR5bl90cmVlXHQ9IHppcF9ibF90cmVlO1xuICAgIHppcF9ibF9kZXNjLnN0YXRpY190cmVlXHQ9IG51bGw7XG4gICAgemlwX2JsX2Rlc2MuZXh0cmFfYml0c1x0PSB6aXBfZXh0cmFfYmxiaXRzO1xuICAgIHppcF9ibF9kZXNjLmV4dHJhX2Jhc2VcdD0gMDtcbiAgICB6aXBfYmxfZGVzYy5lbGVtc1x0XHQ9IHppcF9CTF9DT0RFUztcbiAgICB6aXBfYmxfZGVzYy5tYXhfbGVuZ3RoXHQ9IHppcF9NQVhfQkxfQklUUztcbiAgICB6aXBfYmxfZGVzYy5tYXhfY29kZVx0PSAwO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgbWFwcGluZyBsZW5ndGggKDAuLjI1NSkgLT4gbGVuZ3RoIGNvZGUgKDAuLjI4KVxuICAgIGxlbmd0aCA9IDA7XG4gICAgZm9yKGNvZGUgPSAwOyBjb2RlIDwgemlwX0xFTkdUSF9DT0RFUy0xOyBjb2RlKyspIHtcblx0emlwX2Jhc2VfbGVuZ3RoW2NvZGVdID0gbGVuZ3RoO1xuXHRmb3IobiA9IDA7IG4gPCAoMTw8emlwX2V4dHJhX2xiaXRzW2NvZGVdKTsgbisrKVxuXHQgICAgemlwX2xlbmd0aF9jb2RlW2xlbmd0aCsrXSA9IGNvZGU7XG4gICAgfVxuICAgIC8vIEFzc2VydCAobGVuZ3RoID09IDI1NiwgXCJjdF9pbml0OiBsZW5ndGggIT0gMjU2XCIpO1xuXG4gICAgLyogTm90ZSB0aGF0IHRoZSBsZW5ndGggMjU1IChtYXRjaCBsZW5ndGggMjU4KSBjYW4gYmUgcmVwcmVzZW50ZWRcbiAgICAgKiBpbiB0d28gZGlmZmVyZW50IHdheXM6IGNvZGUgMjg0ICsgNSBiaXRzIG9yIGNvZGUgMjg1LCBzbyB3ZVxuICAgICAqIG92ZXJ3cml0ZSBsZW5ndGhfY29kZVsyNTVdIHRvIHVzZSB0aGUgYmVzdCBlbmNvZGluZzpcbiAgICAgKi9cbiAgICB6aXBfbGVuZ3RoX2NvZGVbbGVuZ3RoLTFdID0gY29kZTtcblxuICAgIC8qIEluaXRpYWxpemUgdGhlIG1hcHBpbmcgZGlzdCAoMC4uMzJLKSAtPiBkaXN0IGNvZGUgKDAuLjI5KSAqL1xuICAgIGRpc3QgPSAwO1xuICAgIGZvcihjb2RlID0gMCA7IGNvZGUgPCAxNjsgY29kZSsrKSB7XG5cdHppcF9iYXNlX2Rpc3RbY29kZV0gPSBkaXN0O1xuXHRmb3IobiA9IDA7IG4gPCAoMTw8emlwX2V4dHJhX2RiaXRzW2NvZGVdKTsgbisrKSB7XG5cdCAgICB6aXBfZGlzdF9jb2RlW2Rpc3QrK10gPSBjb2RlO1xuXHR9XG4gICAgfVxuICAgIC8vIEFzc2VydCAoZGlzdCA9PSAyNTYsIFwiY3RfaW5pdDogZGlzdCAhPSAyNTZcIik7XG4gICAgZGlzdCA+Pj0gNzsgLy8gZnJvbSBub3cgb24sIGFsbCBkaXN0YW5jZXMgYXJlIGRpdmlkZWQgYnkgMTI4XG4gICAgZm9yKCA7IGNvZGUgPCB6aXBfRF9DT0RFUzsgY29kZSsrKSB7XG5cdHppcF9iYXNlX2Rpc3RbY29kZV0gPSBkaXN0IDw8IDc7XG5cdGZvcihuID0gMDsgbiA8ICgxPDwoemlwX2V4dHJhX2RiaXRzW2NvZGVdLTcpKTsgbisrKVxuXHQgICAgemlwX2Rpc3RfY29kZVsyNTYgKyBkaXN0KytdID0gY29kZTtcbiAgICB9XG4gICAgLy8gQXNzZXJ0IChkaXN0ID09IDI1NiwgXCJjdF9pbml0OiAyNTYrZGlzdCAhPSA1MTJcIik7XG5cbiAgICAvLyBDb25zdHJ1Y3QgdGhlIGNvZGVzIG9mIHRoZSBzdGF0aWMgbGl0ZXJhbCB0cmVlXG4gICAgZm9yKGJpdHMgPSAwOyBiaXRzIDw9IHppcF9NQVhfQklUUzsgYml0cysrKVxuXHR6aXBfYmxfY291bnRbYml0c10gPSAwO1xuICAgIG4gPSAwO1xuICAgIHdoaWxlKG4gPD0gMTQzKSB7IHppcF9zdGF0aWNfbHRyZWVbbisrXS5kbCA9IDg7IHppcF9ibF9jb3VudFs4XSsrOyB9XG4gICAgd2hpbGUobiA8PSAyNTUpIHsgemlwX3N0YXRpY19sdHJlZVtuKytdLmRsID0gOTsgemlwX2JsX2NvdW50WzldKys7IH1cbiAgICB3aGlsZShuIDw9IDI3OSkgeyB6aXBfc3RhdGljX2x0cmVlW24rK10uZGwgPSA3OyB6aXBfYmxfY291bnRbN10rKzsgfVxuICAgIHdoaWxlKG4gPD0gMjg3KSB7IHppcF9zdGF0aWNfbHRyZWVbbisrXS5kbCA9IDg7IHppcF9ibF9jb3VudFs4XSsrOyB9XG4gICAgLyogQ29kZXMgMjg2IGFuZCAyODcgZG8gbm90IGV4aXN0LCBidXQgd2UgbXVzdCBpbmNsdWRlIHRoZW0gaW4gdGhlXG4gICAgICogdHJlZSBjb25zdHJ1Y3Rpb24gdG8gZ2V0IGEgY2Fub25pY2FsIEh1ZmZtYW4gdHJlZSAobG9uZ2VzdCBjb2RlXG4gICAgICogYWxsIG9uZXMpXG4gICAgICovXG4gICAgemlwX2dlbl9jb2Rlcyh6aXBfc3RhdGljX2x0cmVlLCB6aXBfTF9DT0RFUyArIDEpO1xuXG4gICAgLyogVGhlIHN0YXRpYyBkaXN0YW5jZSB0cmVlIGlzIHRyaXZpYWw6ICovXG4gICAgZm9yKG4gPSAwOyBuIDwgemlwX0RfQ09ERVM7IG4rKykge1xuXHR6aXBfc3RhdGljX2R0cmVlW25dLmRsID0gNTtcblx0emlwX3N0YXRpY19kdHJlZVtuXS5mYyA9IHppcF9iaV9yZXZlcnNlKG4sIDUpO1xuICAgIH1cblxuICAgIC8vIEluaXRpYWxpemUgdGhlIGZpcnN0IGJsb2NrIG9mIHRoZSBmaXJzdCBmaWxlOlxuICAgIHppcF9pbml0X2Jsb2NrKCk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBJbml0aWFsaXplIGEgbmV3IGJsb2NrLlxuICovXG52YXIgemlwX2luaXRfYmxvY2sgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgbjsgLy8gaXRlcmF0ZXMgb3ZlciB0cmVlIGVsZW1lbnRzXG5cbiAgICAvLyBJbml0aWFsaXplIHRoZSB0cmVlcy5cbiAgICBmb3IobiA9IDA7IG4gPCB6aXBfTF9DT0RFUzsgIG4rKykgemlwX2R5bl9sdHJlZVtuXS5mYyA9IDA7XG4gICAgZm9yKG4gPSAwOyBuIDwgemlwX0RfQ09ERVM7ICBuKyspIHppcF9keW5fZHRyZWVbbl0uZmMgPSAwO1xuICAgIGZvcihuID0gMDsgbiA8IHppcF9CTF9DT0RFUzsgbisrKSB6aXBfYmxfdHJlZVtuXS5mYyA9IDA7XG5cbiAgICB6aXBfZHluX2x0cmVlW3ppcF9FTkRfQkxPQ0tdLmZjID0gMTtcbiAgICB6aXBfb3B0X2xlbiA9IHppcF9zdGF0aWNfbGVuID0gMDtcbiAgICB6aXBfbGFzdF9saXQgPSB6aXBfbGFzdF9kaXN0ID0gemlwX2xhc3RfZmxhZ3MgPSAwO1xuICAgIHppcF9mbGFncyA9IDA7XG4gICAgemlwX2ZsYWdfYml0ID0gMTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFJlc3RvcmUgdGhlIGhlYXAgcHJvcGVydHkgYnkgbW92aW5nIGRvd24gdGhlIHRyZWUgc3RhcnRpbmcgYXQgbm9kZSBrLFxuICogZXhjaGFuZ2luZyBhIG5vZGUgd2l0aCB0aGUgc21hbGxlc3Qgb2YgaXRzIHR3byBzb25zIGlmIG5lY2Vzc2FyeSwgc3RvcHBpbmdcbiAqIHdoZW4gdGhlIGhlYXAgcHJvcGVydHkgaXMgcmUtZXN0YWJsaXNoZWQgKGVhY2ggZmF0aGVyIHNtYWxsZXIgdGhhbiBpdHNcbiAqIHR3byBzb25zKS5cbiAqL1xudmFyIHppcF9wcWRvd25oZWFwID0gZnVuY3Rpb24oXG4gICAgdHJlZSxcdC8vIHRoZSB0cmVlIHRvIHJlc3RvcmVcbiAgICBrKSB7XHQvLyBub2RlIHRvIG1vdmUgZG93blxuICAgIHZhciB2ID0gemlwX2hlYXBba107XG4gICAgdmFyIGogPSBrIDw8IDE7XHQvLyBsZWZ0IHNvbiBvZiBrXG5cbiAgICB3aGlsZShqIDw9IHppcF9oZWFwX2xlbikge1xuXHQvLyBTZXQgaiB0byB0aGUgc21hbGxlc3Qgb2YgdGhlIHR3byBzb25zOlxuXHRpZihqIDwgemlwX2hlYXBfbGVuICYmXG5cdCAgIHppcF9TTUFMTEVSKHRyZWUsIHppcF9oZWFwW2ogKyAxXSwgemlwX2hlYXBbal0pKVxuXHQgICAgaisrO1xuXG5cdC8vIEV4aXQgaWYgdiBpcyBzbWFsbGVyIHRoYW4gYm90aCBzb25zXG5cdGlmKHppcF9TTUFMTEVSKHRyZWUsIHYsIHppcF9oZWFwW2pdKSlcblx0ICAgIGJyZWFrO1xuXG5cdC8vIEV4Y2hhbmdlIHYgd2l0aCB0aGUgc21hbGxlc3Qgc29uXG5cdHppcF9oZWFwW2tdID0gemlwX2hlYXBbal07XG5cdGsgPSBqO1xuXG5cdC8vIEFuZCBjb250aW51ZSBkb3duIHRoZSB0cmVlLCBzZXR0aW5nIGogdG8gdGhlIGxlZnQgc29uIG9mIGtcblx0aiA8PD0gMTtcbiAgICB9XG4gICAgemlwX2hlYXBba10gPSB2O1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogQ29tcHV0ZSB0aGUgb3B0aW1hbCBiaXQgbGVuZ3RocyBmb3IgYSB0cmVlIGFuZCB1cGRhdGUgdGhlIHRvdGFsIGJpdCBsZW5ndGhcbiAqIGZvciB0aGUgY3VycmVudCBibG9jay5cbiAqIElOIGFzc2VydGlvbjogdGhlIGZpZWxkcyBmcmVxIGFuZCBkYWQgYXJlIHNldCwgaGVhcFtoZWFwX21heF0gYW5kXG4gKiAgICBhYm92ZSBhcmUgdGhlIHRyZWUgbm9kZXMgc29ydGVkIGJ5IGluY3JlYXNpbmcgZnJlcXVlbmN5LlxuICogT1VUIGFzc2VydGlvbnM6IHRoZSBmaWVsZCBsZW4gaXMgc2V0IHRvIHRoZSBvcHRpbWFsIGJpdCBsZW5ndGgsIHRoZVxuICogICAgIGFycmF5IGJsX2NvdW50IGNvbnRhaW5zIHRoZSBmcmVxdWVuY2llcyBmb3IgZWFjaCBiaXQgbGVuZ3RoLlxuICogICAgIFRoZSBsZW5ndGggb3B0X2xlbiBpcyB1cGRhdGVkOyBzdGF0aWNfbGVuIGlzIGFsc28gdXBkYXRlZCBpZiBzdHJlZSBpc1xuICogICAgIG5vdCBudWxsLlxuICovXG52YXIgemlwX2dlbl9iaXRsZW4gPSBmdW5jdGlvbihkZXNjKSB7IC8vIHRoZSB0cmVlIGRlc2NyaXB0b3JcbiAgICB2YXIgdHJlZVx0XHQ9IGRlc2MuZHluX3RyZWU7XG4gICAgdmFyIGV4dHJhXHRcdD0gZGVzYy5leHRyYV9iaXRzO1xuICAgIHZhciBiYXNlXHRcdD0gZGVzYy5leHRyYV9iYXNlO1xuICAgIHZhciBtYXhfY29kZVx0PSBkZXNjLm1heF9jb2RlO1xuICAgIHZhciBtYXhfbGVuZ3RoXHQ9IGRlc2MubWF4X2xlbmd0aDtcbiAgICB2YXIgc3RyZWVcdFx0PSBkZXNjLnN0YXRpY190cmVlO1xuICAgIHZhciBoO1x0XHQvLyBoZWFwIGluZGV4XG4gICAgdmFyIG4sIG07XHRcdC8vIGl0ZXJhdGUgb3ZlciB0aGUgdHJlZSBlbGVtZW50c1xuICAgIHZhciBiaXRzO1x0XHQvLyBiaXQgbGVuZ3RoXG4gICAgdmFyIHhiaXRzO1x0XHQvLyBleHRyYSBiaXRzXG4gICAgdmFyIGY7XHRcdC8vIGZyZXF1ZW5jeVxuICAgIHZhciBvdmVyZmxvdyA9IDA7XHQvLyBudW1iZXIgb2YgZWxlbWVudHMgd2l0aCBiaXQgbGVuZ3RoIHRvbyBsYXJnZVxuXG4gICAgZm9yKGJpdHMgPSAwOyBiaXRzIDw9IHppcF9NQVhfQklUUzsgYml0cysrKVxuXHR6aXBfYmxfY291bnRbYml0c10gPSAwO1xuXG4gICAgLyogSW4gYSBmaXJzdCBwYXNzLCBjb21wdXRlIHRoZSBvcHRpbWFsIGJpdCBsZW5ndGhzICh3aGljaCBtYXlcbiAgICAgKiBvdmVyZmxvdyBpbiB0aGUgY2FzZSBvZiB0aGUgYml0IGxlbmd0aCB0cmVlKS5cbiAgICAgKi9cbiAgICB0cmVlW3ppcF9oZWFwW3ppcF9oZWFwX21heF1dLmRsID0gMDsgLy8gcm9vdCBvZiB0aGUgaGVhcFxuXG4gICAgZm9yKGggPSB6aXBfaGVhcF9tYXggKyAxOyBoIDwgemlwX0hFQVBfU0laRTsgaCsrKSB7XG5cdG4gPSB6aXBfaGVhcFtoXTtcblx0Yml0cyA9IHRyZWVbdHJlZVtuXS5kbF0uZGwgKyAxO1xuXHRpZihiaXRzID4gbWF4X2xlbmd0aCkge1xuXHQgICAgYml0cyA9IG1heF9sZW5ndGg7XG5cdCAgICBvdmVyZmxvdysrO1xuXHR9XG5cdHRyZWVbbl0uZGwgPSBiaXRzO1xuXHQvLyBXZSBvdmVyd3JpdGUgdHJlZVtuXS5kbCB3aGljaCBpcyBubyBsb25nZXIgbmVlZGVkXG5cblx0aWYobiA+IG1heF9jb2RlKVxuXHQgICAgY29udGludWU7IC8vIG5vdCBhIGxlYWYgbm9kZVxuXG5cdHppcF9ibF9jb3VudFtiaXRzXSsrO1xuXHR4Yml0cyA9IDA7XG5cdGlmKG4gPj0gYmFzZSlcblx0ICAgIHhiaXRzID0gZXh0cmFbbiAtIGJhc2VdO1xuXHRmID0gdHJlZVtuXS5mYztcblx0emlwX29wdF9sZW4gKz0gZiAqIChiaXRzICsgeGJpdHMpO1xuXHRpZihzdHJlZSAhPSBudWxsKVxuXHQgICAgemlwX3N0YXRpY19sZW4gKz0gZiAqIChzdHJlZVtuXS5kbCArIHhiaXRzKTtcbiAgICB9XG4gICAgaWYob3ZlcmZsb3cgPT0gMClcblx0cmV0dXJuO1xuXG4gICAgLy8gVGhpcyBoYXBwZW5zIGZvciBleGFtcGxlIG9uIG9iajIgYW5kIHBpYyBvZiB0aGUgQ2FsZ2FyeSBjb3JwdXNcblxuICAgIC8vIEZpbmQgdGhlIGZpcnN0IGJpdCBsZW5ndGggd2hpY2ggY291bGQgaW5jcmVhc2U6XG4gICAgZG8ge1xuXHRiaXRzID0gbWF4X2xlbmd0aCAtIDE7XG5cdHdoaWxlKHppcF9ibF9jb3VudFtiaXRzXSA9PSAwKVxuXHQgICAgYml0cy0tO1xuXHR6aXBfYmxfY291bnRbYml0c10tLTtcdFx0Ly8gbW92ZSBvbmUgbGVhZiBkb3duIHRoZSB0cmVlXG5cdHppcF9ibF9jb3VudFtiaXRzICsgMV0gKz0gMjtcdC8vIG1vdmUgb25lIG92ZXJmbG93IGl0ZW0gYXMgaXRzIGJyb3RoZXJcblx0emlwX2JsX2NvdW50W21heF9sZW5ndGhdLS07XG5cdC8qIFRoZSBicm90aGVyIG9mIHRoZSBvdmVyZmxvdyBpdGVtIGFsc28gbW92ZXMgb25lIHN0ZXAgdXAsXG5cdCAqIGJ1dCB0aGlzIGRvZXMgbm90IGFmZmVjdCBibF9jb3VudFttYXhfbGVuZ3RoXVxuXHQgKi9cblx0b3ZlcmZsb3cgLT0gMjtcbiAgICB9IHdoaWxlKG92ZXJmbG93ID4gMCk7XG5cbiAgICAvKiBOb3cgcmVjb21wdXRlIGFsbCBiaXQgbGVuZ3Rocywgc2Nhbm5pbmcgaW4gaW5jcmVhc2luZyBmcmVxdWVuY3kuXG4gICAgICogaCBpcyBzdGlsbCBlcXVhbCB0byBIRUFQX1NJWkUuIChJdCBpcyBzaW1wbGVyIHRvIHJlY29uc3RydWN0IGFsbFxuICAgICAqIGxlbmd0aHMgaW5zdGVhZCBvZiBmaXhpbmcgb25seSB0aGUgd3Jvbmcgb25lcy4gVGhpcyBpZGVhIGlzIHRha2VuXG4gICAgICogZnJvbSAnYXInIHdyaXR0ZW4gYnkgSGFydWhpa28gT2t1bXVyYS4pXG4gICAgICovXG4gICAgZm9yKGJpdHMgPSBtYXhfbGVuZ3RoOyBiaXRzICE9IDA7IGJpdHMtLSkge1xuXHRuID0gemlwX2JsX2NvdW50W2JpdHNdO1xuXHR3aGlsZShuICE9IDApIHtcblx0ICAgIG0gPSB6aXBfaGVhcFstLWhdO1xuXHQgICAgaWYobSA+IG1heF9jb2RlKVxuXHRcdGNvbnRpbnVlO1xuXHQgICAgaWYodHJlZVttXS5kbCAhPSBiaXRzKSB7XG5cdFx0emlwX29wdF9sZW4gKz0gKGJpdHMgLSB0cmVlW21dLmRsKSAqIHRyZWVbbV0uZmM7XG5cdFx0dHJlZVttXS5mYyA9IGJpdHM7XG5cdCAgICB9XG5cdCAgICBuLS07XG5cdH1cbiAgICB9XG59XG5cbiAgLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICogR2VuZXJhdGUgdGhlIGNvZGVzIGZvciBhIGdpdmVuIHRyZWUgYW5kIGJpdCBjb3VudHMgKHdoaWNoIG5lZWQgbm90IGJlXG4gICAqIG9wdGltYWwpLlxuICAgKiBJTiBhc3NlcnRpb246IHRoZSBhcnJheSBibF9jb3VudCBjb250YWlucyB0aGUgYml0IGxlbmd0aCBzdGF0aXN0aWNzIGZvclxuICAgKiB0aGUgZ2l2ZW4gdHJlZSBhbmQgdGhlIGZpZWxkIGxlbiBpcyBzZXQgZm9yIGFsbCB0cmVlIGVsZW1lbnRzLlxuICAgKiBPVVQgYXNzZXJ0aW9uOiB0aGUgZmllbGQgY29kZSBpcyBzZXQgZm9yIGFsbCB0cmVlIGVsZW1lbnRzIG9mIG5vblxuICAgKiAgICAgemVybyBjb2RlIGxlbmd0aC5cbiAgICovXG52YXIgemlwX2dlbl9jb2RlcyA9IGZ1bmN0aW9uKHRyZWUsXHQvLyB0aGUgdHJlZSB0byBkZWNvcmF0ZVxuXHRcdCAgIG1heF9jb2RlKSB7XHQvLyBsYXJnZXN0IGNvZGUgd2l0aCBub24gemVybyBmcmVxdWVuY3lcbiAgICB2YXIgbmV4dF9jb2RlID0gbmV3IEFycmF5KHppcF9NQVhfQklUUysxKTsgLy8gbmV4dCBjb2RlIHZhbHVlIGZvciBlYWNoIGJpdCBsZW5ndGhcbiAgICB2YXIgY29kZSA9IDA7XHRcdC8vIHJ1bm5pbmcgY29kZSB2YWx1ZVxuICAgIHZhciBiaXRzO1x0XHRcdC8vIGJpdCBpbmRleFxuICAgIHZhciBuO1x0XHRcdC8vIGNvZGUgaW5kZXhcblxuICAgIC8qIFRoZSBkaXN0cmlidXRpb24gY291bnRzIGFyZSBmaXJzdCB1c2VkIHRvIGdlbmVyYXRlIHRoZSBjb2RlIHZhbHVlc1xuICAgICAqIHdpdGhvdXQgYml0IHJldmVyc2FsLlxuICAgICAqL1xuICAgIGZvcihiaXRzID0gMTsgYml0cyA8PSB6aXBfTUFYX0JJVFM7IGJpdHMrKykge1xuXHRjb2RlID0gKChjb2RlICsgemlwX2JsX2NvdW50W2JpdHMtMV0pIDw8IDEpO1xuXHRuZXh0X2NvZGVbYml0c10gPSBjb2RlO1xuICAgIH1cblxuICAgIC8qIENoZWNrIHRoYXQgdGhlIGJpdCBjb3VudHMgaW4gYmxfY291bnQgYXJlIGNvbnNpc3RlbnQuIFRoZSBsYXN0IGNvZGVcbiAgICAgKiBtdXN0IGJlIGFsbCBvbmVzLlxuICAgICAqL1xuLy8gICAgQXNzZXJ0IChjb2RlICsgZW5jb2Rlci0+YmxfY291bnRbTUFYX0JJVFNdLTEgPT0gKDE8PE1BWF9CSVRTKS0xLFxuLy9cdCAgICBcImluY29uc2lzdGVudCBiaXQgY291bnRzXCIpO1xuLy8gICAgVHJhY2V2KChzdGRlcnIsXCJcXG5nZW5fY29kZXM6IG1heF9jb2RlICVkIFwiLCBtYXhfY29kZSkpO1xuXG4gICAgZm9yKG4gPSAwOyBuIDw9IG1heF9jb2RlOyBuKyspIHtcblx0dmFyIGxlbiA9IHRyZWVbbl0uZGw7XG5cdGlmKGxlbiA9PSAwKVxuXHQgICAgY29udGludWU7XG5cdC8vIE5vdyByZXZlcnNlIHRoZSBiaXRzXG5cdHRyZWVbbl0uZmMgPSB6aXBfYmlfcmV2ZXJzZShuZXh0X2NvZGVbbGVuXSsrLCBsZW4pO1xuXG4vLyAgICAgIFRyYWNlYyh0cmVlICE9IHN0YXRpY19sdHJlZSwgKHN0ZGVycixcIlxcbm4gJTNkICVjIGwgJTJkIGMgJTR4ICgleCkgXCIsXG4vL1x0ICBuLCAoaXNncmFwaChuKSA/IG4gOiAnICcpLCBsZW4sIHRyZWVbbl0uZmMsIG5leHRfY29kZVtsZW5dLTEpKTtcbiAgICB9XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBDb25zdHJ1Y3Qgb25lIEh1ZmZtYW4gdHJlZSBhbmQgYXNzaWducyB0aGUgY29kZSBiaXQgc3RyaW5ncyBhbmQgbGVuZ3Rocy5cbiAqIFVwZGF0ZSB0aGUgdG90YWwgYml0IGxlbmd0aCBmb3IgdGhlIGN1cnJlbnQgYmxvY2suXG4gKiBJTiBhc3NlcnRpb246IHRoZSBmaWVsZCBmcmVxIGlzIHNldCBmb3IgYWxsIHRyZWUgZWxlbWVudHMuXG4gKiBPVVQgYXNzZXJ0aW9uczogdGhlIGZpZWxkcyBsZW4gYW5kIGNvZGUgYXJlIHNldCB0byB0aGUgb3B0aW1hbCBiaXQgbGVuZ3RoXG4gKiAgICAgYW5kIGNvcnJlc3BvbmRpbmcgY29kZS4gVGhlIGxlbmd0aCBvcHRfbGVuIGlzIHVwZGF0ZWQ7IHN0YXRpY19sZW4gaXNcbiAqICAgICBhbHNvIHVwZGF0ZWQgaWYgc3RyZWUgaXMgbm90IG51bGwuIFRoZSBmaWVsZCBtYXhfY29kZSBpcyBzZXQuXG4gKi9cbnZhciB6aXBfYnVpbGRfdHJlZSA9IGZ1bmN0aW9uKGRlc2MpIHsgLy8gdGhlIHRyZWUgZGVzY3JpcHRvclxuICAgIHZhciB0cmVlXHQ9IGRlc2MuZHluX3RyZWU7XG4gICAgdmFyIHN0cmVlXHQ9IGRlc2Muc3RhdGljX3RyZWU7XG4gICAgdmFyIGVsZW1zXHQ9IGRlc2MuZWxlbXM7XG4gICAgdmFyIG4sIG07XHRcdC8vIGl0ZXJhdGUgb3ZlciBoZWFwIGVsZW1lbnRzXG4gICAgdmFyIG1heF9jb2RlID0gLTE7XHQvLyBsYXJnZXN0IGNvZGUgd2l0aCBub24gemVybyBmcmVxdWVuY3lcbiAgICB2YXIgbm9kZSA9IGVsZW1zO1x0Ly8gbmV4dCBpbnRlcm5hbCBub2RlIG9mIHRoZSB0cmVlXG5cbiAgICAvKiBDb25zdHJ1Y3QgdGhlIGluaXRpYWwgaGVhcCwgd2l0aCBsZWFzdCBmcmVxdWVudCBlbGVtZW50IGluXG4gICAgICogaGVhcFtTTUFMTEVTVF0uIFRoZSBzb25zIG9mIGhlYXBbbl0gYXJlIGhlYXBbMipuXSBhbmQgaGVhcFsyKm4rMV0uXG4gICAgICogaGVhcFswXSBpcyBub3QgdXNlZC5cbiAgICAgKi9cbiAgICB6aXBfaGVhcF9sZW4gPSAwO1xuICAgIHppcF9oZWFwX21heCA9IHppcF9IRUFQX1NJWkU7XG5cbiAgICBmb3IobiA9IDA7IG4gPCBlbGVtczsgbisrKSB7XG5cdGlmKHRyZWVbbl0uZmMgIT0gMCkge1xuXHQgICAgemlwX2hlYXBbKyt6aXBfaGVhcF9sZW5dID0gbWF4X2NvZGUgPSBuO1xuXHQgICAgemlwX2RlcHRoW25dID0gMDtcblx0fSBlbHNlXG5cdCAgICB0cmVlW25dLmRsID0gMDtcbiAgICB9XG5cbiAgICAvKiBUaGUgcGt6aXAgZm9ybWF0IHJlcXVpcmVzIHRoYXQgYXQgbGVhc3Qgb25lIGRpc3RhbmNlIGNvZGUgZXhpc3RzLFxuICAgICAqIGFuZCB0aGF0IGF0IGxlYXN0IG9uZSBiaXQgc2hvdWxkIGJlIHNlbnQgZXZlbiBpZiB0aGVyZSBpcyBvbmx5IG9uZVxuICAgICAqIHBvc3NpYmxlIGNvZGUuIFNvIHRvIGF2b2lkIHNwZWNpYWwgY2hlY2tzIGxhdGVyIG9uIHdlIGZvcmNlIGF0IGxlYXN0XG4gICAgICogdHdvIGNvZGVzIG9mIG5vbiB6ZXJvIGZyZXF1ZW5jeS5cbiAgICAgKi9cbiAgICB3aGlsZSh6aXBfaGVhcF9sZW4gPCAyKSB7XG5cdHZhciB4bmV3ID0gemlwX2hlYXBbKyt6aXBfaGVhcF9sZW5dID0gKG1heF9jb2RlIDwgMiA/ICsrbWF4X2NvZGUgOiAwKTtcblx0dHJlZVt4bmV3XS5mYyA9IDE7XG5cdHppcF9kZXB0aFt4bmV3XSA9IDA7XG5cdHppcF9vcHRfbGVuLS07XG5cdGlmKHN0cmVlICE9IG51bGwpXG5cdCAgICB6aXBfc3RhdGljX2xlbiAtPSBzdHJlZVt4bmV3XS5kbDtcblx0Ly8gbmV3IGlzIDAgb3IgMSBzbyBpdCBkb2VzIG5vdCBoYXZlIGV4dHJhIGJpdHNcbiAgICB9XG4gICAgZGVzYy5tYXhfY29kZSA9IG1heF9jb2RlO1xuXG4gICAgLyogVGhlIGVsZW1lbnRzIGhlYXBbaGVhcF9sZW4vMisxIC4uIGhlYXBfbGVuXSBhcmUgbGVhdmVzIG9mIHRoZSB0cmVlLFxuICAgICAqIGVzdGFibGlzaCBzdWItaGVhcHMgb2YgaW5jcmVhc2luZyBsZW5ndGhzOlxuICAgICAqL1xuICAgIGZvcihuID0gemlwX2hlYXBfbGVuID4+IDE7IG4gPj0gMTsgbi0tKVxuXHR6aXBfcHFkb3duaGVhcCh0cmVlLCBuKTtcblxuICAgIC8qIENvbnN0cnVjdCB0aGUgSHVmZm1hbiB0cmVlIGJ5IHJlcGVhdGVkbHkgY29tYmluaW5nIHRoZSBsZWFzdCB0d29cbiAgICAgKiBmcmVxdWVudCBub2Rlcy5cbiAgICAgKi9cbiAgICBkbyB7XG5cdG4gPSB6aXBfaGVhcFt6aXBfU01BTExFU1RdO1xuXHR6aXBfaGVhcFt6aXBfU01BTExFU1RdID0gemlwX2hlYXBbemlwX2hlYXBfbGVuLS1dO1xuXHR6aXBfcHFkb3duaGVhcCh0cmVlLCB6aXBfU01BTExFU1QpO1xuXG5cdG0gPSB6aXBfaGVhcFt6aXBfU01BTExFU1RdOyAgLy8gbSA9IG5vZGUgb2YgbmV4dCBsZWFzdCBmcmVxdWVuY3lcblxuXHQvLyBrZWVwIHRoZSBub2RlcyBzb3J0ZWQgYnkgZnJlcXVlbmN5XG5cdHppcF9oZWFwWy0temlwX2hlYXBfbWF4XSA9IG47XG5cdHppcF9oZWFwWy0temlwX2hlYXBfbWF4XSA9IG07XG5cblx0Ly8gQ3JlYXRlIGEgbmV3IG5vZGUgZmF0aGVyIG9mIG4gYW5kIG1cblx0dHJlZVtub2RlXS5mYyA9IHRyZWVbbl0uZmMgKyB0cmVlW21dLmZjO1xuLy9cdGRlcHRoW25vZGVdID0gKGNoYXIpKE1BWChkZXB0aFtuXSwgZGVwdGhbbV0pICsgMSk7XG5cdGlmKHppcF9kZXB0aFtuXSA+IHppcF9kZXB0aFttXSArIDEpXG5cdCAgICB6aXBfZGVwdGhbbm9kZV0gPSB6aXBfZGVwdGhbbl07XG5cdGVsc2Vcblx0ICAgIHppcF9kZXB0aFtub2RlXSA9IHppcF9kZXB0aFttXSArIDE7XG5cdHRyZWVbbl0uZGwgPSB0cmVlW21dLmRsID0gbm9kZTtcblxuXHQvLyBhbmQgaW5zZXJ0IHRoZSBuZXcgbm9kZSBpbiB0aGUgaGVhcFxuXHR6aXBfaGVhcFt6aXBfU01BTExFU1RdID0gbm9kZSsrO1xuXHR6aXBfcHFkb3duaGVhcCh0cmVlLCB6aXBfU01BTExFU1QpO1xuXG4gICAgfSB3aGlsZSh6aXBfaGVhcF9sZW4gPj0gMik7XG5cbiAgICB6aXBfaGVhcFstLXppcF9oZWFwX21heF0gPSB6aXBfaGVhcFt6aXBfU01BTExFU1RdO1xuXG4gICAgLyogQXQgdGhpcyBwb2ludCwgdGhlIGZpZWxkcyBmcmVxIGFuZCBkYWQgYXJlIHNldC4gV2UgY2FuIG5vd1xuICAgICAqIGdlbmVyYXRlIHRoZSBiaXQgbGVuZ3Rocy5cbiAgICAgKi9cbiAgICB6aXBfZ2VuX2JpdGxlbihkZXNjKTtcblxuICAgIC8vIFRoZSBmaWVsZCBsZW4gaXMgbm93IHNldCwgd2UgY2FuIGdlbmVyYXRlIHRoZSBiaXQgY29kZXNcbiAgICB6aXBfZ2VuX2NvZGVzKHRyZWUsIG1heF9jb2RlKTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFNjYW4gYSBsaXRlcmFsIG9yIGRpc3RhbmNlIHRyZWUgdG8gZGV0ZXJtaW5lIHRoZSBmcmVxdWVuY2llcyBvZiB0aGUgY29kZXNcbiAqIGluIHRoZSBiaXQgbGVuZ3RoIHRyZWUuIFVwZGF0ZXMgb3B0X2xlbiB0byB0YWtlIGludG8gYWNjb3VudCB0aGUgcmVwZWF0XG4gKiBjb3VudHMuIChUaGUgY29udHJpYnV0aW9uIG9mIHRoZSBiaXQgbGVuZ3RoIGNvZGVzIHdpbGwgYmUgYWRkZWQgbGF0ZXJcbiAqIGR1cmluZyB0aGUgY29uc3RydWN0aW9uIG9mIGJsX3RyZWUuKVxuICovXG52YXIgemlwX3NjYW5fdHJlZSA9IGZ1bmN0aW9uKHRyZWUsLy8gdGhlIHRyZWUgdG8gYmUgc2Nhbm5lZFxuXHRcdCAgICAgICBtYXhfY29kZSkgeyAgLy8gYW5kIGl0cyBsYXJnZXN0IGNvZGUgb2Ygbm9uIHplcm8gZnJlcXVlbmN5XG4gICAgdmFyIG47XHRcdFx0Ly8gaXRlcmF0ZXMgb3ZlciBhbGwgdHJlZSBlbGVtZW50c1xuICAgIHZhciBwcmV2bGVuID0gLTE7XHRcdC8vIGxhc3QgZW1pdHRlZCBsZW5ndGhcbiAgICB2YXIgY3VybGVuO1x0XHRcdC8vIGxlbmd0aCBvZiBjdXJyZW50IGNvZGVcbiAgICB2YXIgbmV4dGxlbiA9IHRyZWVbMF0uZGw7XHQvLyBsZW5ndGggb2YgbmV4dCBjb2RlXG4gICAgdmFyIGNvdW50ID0gMDtcdFx0Ly8gcmVwZWF0IGNvdW50IG9mIHRoZSBjdXJyZW50IGNvZGVcbiAgICB2YXIgbWF4X2NvdW50ID0gNztcdFx0Ly8gbWF4IHJlcGVhdCBjb3VudFxuICAgIHZhciBtaW5fY291bnQgPSA0O1x0XHQvLyBtaW4gcmVwZWF0IGNvdW50XG5cbiAgICBpZihuZXh0bGVuID09IDApIHtcblx0bWF4X2NvdW50ID0gMTM4O1xuXHRtaW5fY291bnQgPSAzO1xuICAgIH1cbiAgICB0cmVlW21heF9jb2RlICsgMV0uZGwgPSAweGZmZmY7IC8vIGd1YXJkXG5cbiAgICBmb3IobiA9IDA7IG4gPD0gbWF4X2NvZGU7IG4rKykge1xuXHRjdXJsZW4gPSBuZXh0bGVuO1xuXHRuZXh0bGVuID0gdHJlZVtuICsgMV0uZGw7XG5cdGlmKCsrY291bnQgPCBtYXhfY291bnQgJiYgY3VybGVuID09IG5leHRsZW4pXG5cdCAgICBjb250aW51ZTtcblx0ZWxzZSBpZihjb3VudCA8IG1pbl9jb3VudClcblx0ICAgIHppcF9ibF90cmVlW2N1cmxlbl0uZmMgKz0gY291bnQ7XG5cdGVsc2UgaWYoY3VybGVuICE9IDApIHtcblx0ICAgIGlmKGN1cmxlbiAhPSBwcmV2bGVuKVxuXHRcdHppcF9ibF90cmVlW2N1cmxlbl0uZmMrKztcblx0ICAgIHppcF9ibF90cmVlW3ppcF9SRVBfM182XS5mYysrO1xuXHR9IGVsc2UgaWYoY291bnQgPD0gMTApXG5cdCAgICB6aXBfYmxfdHJlZVt6aXBfUkVQWl8zXzEwXS5mYysrO1xuXHRlbHNlXG5cdCAgICB6aXBfYmxfdHJlZVt6aXBfUkVQWl8xMV8xMzhdLmZjKys7XG5cdGNvdW50ID0gMDsgcHJldmxlbiA9IGN1cmxlbjtcblx0aWYobmV4dGxlbiA9PSAwKSB7XG5cdCAgICBtYXhfY291bnQgPSAxMzg7XG5cdCAgICBtaW5fY291bnQgPSAzO1xuXHR9IGVsc2UgaWYoY3VybGVuID09IG5leHRsZW4pIHtcblx0ICAgIG1heF9jb3VudCA9IDY7XG5cdCAgICBtaW5fY291bnQgPSAzO1xuXHR9IGVsc2Uge1xuXHQgICAgbWF4X2NvdW50ID0gNztcblx0ICAgIG1pbl9jb3VudCA9IDQ7XG5cdH1cbiAgICB9XG59XG5cbiAgLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICogU2VuZCBhIGxpdGVyYWwgb3IgZGlzdGFuY2UgdHJlZSBpbiBjb21wcmVzc2VkIGZvcm0sIHVzaW5nIHRoZSBjb2RlcyBpblxuICAgKiBibF90cmVlLlxuICAgKi9cbnZhciB6aXBfc2VuZF90cmVlID0gZnVuY3Rpb24odHJlZSwgLy8gdGhlIHRyZWUgdG8gYmUgc2Nhbm5lZFxuXHRcdCAgIG1heF9jb2RlKSB7IC8vIGFuZCBpdHMgbGFyZ2VzdCBjb2RlIG9mIG5vbiB6ZXJvIGZyZXF1ZW5jeVxuICAgIHZhciBuO1x0XHRcdC8vIGl0ZXJhdGVzIG92ZXIgYWxsIHRyZWUgZWxlbWVudHNcbiAgICB2YXIgcHJldmxlbiA9IC0xO1x0XHQvLyBsYXN0IGVtaXR0ZWQgbGVuZ3RoXG4gICAgdmFyIGN1cmxlbjtcdFx0XHQvLyBsZW5ndGggb2YgY3VycmVudCBjb2RlXG4gICAgdmFyIG5leHRsZW4gPSB0cmVlWzBdLmRsO1x0Ly8gbGVuZ3RoIG9mIG5leHQgY29kZVxuICAgIHZhciBjb3VudCA9IDA7XHRcdC8vIHJlcGVhdCBjb3VudCBvZiB0aGUgY3VycmVudCBjb2RlXG4gICAgdmFyIG1heF9jb3VudCA9IDc7XHRcdC8vIG1heCByZXBlYXQgY291bnRcbiAgICB2YXIgbWluX2NvdW50ID0gNDtcdFx0Ly8gbWluIHJlcGVhdCBjb3VudFxuXG4gICAgLyogdHJlZVttYXhfY29kZSsxXS5kbCA9IC0xOyAqLyAgLyogZ3VhcmQgYWxyZWFkeSBzZXQgKi9cbiAgICBpZihuZXh0bGVuID09IDApIHtcbiAgICAgIG1heF9jb3VudCA9IDEzODtcbiAgICAgIG1pbl9jb3VudCA9IDM7XG4gICAgfVxuXG4gICAgZm9yKG4gPSAwOyBuIDw9IG1heF9jb2RlOyBuKyspIHtcblx0Y3VybGVuID0gbmV4dGxlbjtcblx0bmV4dGxlbiA9IHRyZWVbbisxXS5kbDtcblx0aWYoKytjb3VudCA8IG1heF9jb3VudCAmJiBjdXJsZW4gPT0gbmV4dGxlbikge1xuXHQgICAgY29udGludWU7XG5cdH0gZWxzZSBpZihjb3VudCA8IG1pbl9jb3VudCkge1xuXHQgICAgZG8geyB6aXBfU0VORF9DT0RFKGN1cmxlbiwgemlwX2JsX3RyZWUpOyB9IHdoaWxlKC0tY291bnQgIT0gMCk7XG5cdH0gZWxzZSBpZihjdXJsZW4gIT0gMCkge1xuXHQgICAgaWYoY3VybGVuICE9IHByZXZsZW4pIHtcblx0XHR6aXBfU0VORF9DT0RFKGN1cmxlbiwgemlwX2JsX3RyZWUpO1xuXHRcdGNvdW50LS07XG5cdCAgICB9XG5cdCAgICAvLyBBc3NlcnQoY291bnQgPj0gMyAmJiBjb3VudCA8PSA2LCBcIiAzXzY/XCIpO1xuXHQgICAgemlwX1NFTkRfQ09ERSh6aXBfUkVQXzNfNiwgemlwX2JsX3RyZWUpO1xuXHQgICAgemlwX3NlbmRfYml0cyhjb3VudCAtIDMsIDIpO1xuXHR9IGVsc2UgaWYoY291bnQgPD0gMTApIHtcblx0ICAgIHppcF9TRU5EX0NPREUoemlwX1JFUFpfM18xMCwgemlwX2JsX3RyZWUpO1xuXHQgICAgemlwX3NlbmRfYml0cyhjb3VudC0zLCAzKTtcblx0fSBlbHNlIHtcblx0ICAgIHppcF9TRU5EX0NPREUoemlwX1JFUFpfMTFfMTM4LCB6aXBfYmxfdHJlZSk7XG5cdCAgICB6aXBfc2VuZF9iaXRzKGNvdW50LTExLCA3KTtcblx0fVxuXHRjb3VudCA9IDA7XG5cdHByZXZsZW4gPSBjdXJsZW47XG5cdGlmKG5leHRsZW4gPT0gMCkge1xuXHQgICAgbWF4X2NvdW50ID0gMTM4O1xuXHQgICAgbWluX2NvdW50ID0gMztcblx0fSBlbHNlIGlmKGN1cmxlbiA9PSBuZXh0bGVuKSB7XG5cdCAgICBtYXhfY291bnQgPSA2O1xuXHQgICAgbWluX2NvdW50ID0gMztcblx0fSBlbHNlIHtcblx0ICAgIG1heF9jb3VudCA9IDc7XG5cdCAgICBtaW5fY291bnQgPSA0O1xuXHR9XG4gICAgfVxufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogQ29uc3RydWN0IHRoZSBIdWZmbWFuIHRyZWUgZm9yIHRoZSBiaXQgbGVuZ3RocyBhbmQgcmV0dXJuIHRoZSBpbmRleCBpblxuICogYmxfb3JkZXIgb2YgdGhlIGxhc3QgYml0IGxlbmd0aCBjb2RlIHRvIHNlbmQuXG4gKi9cbnZhciB6aXBfYnVpbGRfYmxfdHJlZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBtYXhfYmxpbmRleDsgIC8vIGluZGV4IG9mIGxhc3QgYml0IGxlbmd0aCBjb2RlIG9mIG5vbiB6ZXJvIGZyZXFcblxuICAgIC8vIERldGVybWluZSB0aGUgYml0IGxlbmd0aCBmcmVxdWVuY2llcyBmb3IgbGl0ZXJhbCBhbmQgZGlzdGFuY2UgdHJlZXNcbiAgICB6aXBfc2Nhbl90cmVlKHppcF9keW5fbHRyZWUsIHppcF9sX2Rlc2MubWF4X2NvZGUpO1xuICAgIHppcF9zY2FuX3RyZWUoemlwX2R5bl9kdHJlZSwgemlwX2RfZGVzYy5tYXhfY29kZSk7XG5cbiAgICAvLyBCdWlsZCB0aGUgYml0IGxlbmd0aCB0cmVlOlxuICAgIHppcF9idWlsZF90cmVlKHppcF9ibF9kZXNjKTtcbiAgICAvKiBvcHRfbGVuIG5vdyBpbmNsdWRlcyB0aGUgbGVuZ3RoIG9mIHRoZSB0cmVlIHJlcHJlc2VudGF0aW9ucywgZXhjZXB0XG4gICAgICogdGhlIGxlbmd0aHMgb2YgdGhlIGJpdCBsZW5ndGhzIGNvZGVzIGFuZCB0aGUgNSs1KzQgYml0cyBmb3IgdGhlIGNvdW50cy5cbiAgICAgKi9cblxuICAgIC8qIERldGVybWluZSB0aGUgbnVtYmVyIG9mIGJpdCBsZW5ndGggY29kZXMgdG8gc2VuZC4gVGhlIHBremlwIGZvcm1hdFxuICAgICAqIHJlcXVpcmVzIHRoYXQgYXQgbGVhc3QgNCBiaXQgbGVuZ3RoIGNvZGVzIGJlIHNlbnQuIChhcHBub3RlLnR4dCBzYXlzXG4gICAgICogMyBidXQgdGhlIGFjdHVhbCB2YWx1ZSB1c2VkIGlzIDQuKVxuICAgICAqL1xuICAgIGZvcihtYXhfYmxpbmRleCA9IHppcF9CTF9DT0RFUy0xOyBtYXhfYmxpbmRleCA+PSAzOyBtYXhfYmxpbmRleC0tKSB7XG5cdGlmKHppcF9ibF90cmVlW3ppcF9ibF9vcmRlclttYXhfYmxpbmRleF1dLmRsICE9IDApIGJyZWFrO1xuICAgIH1cbiAgICAvKiBVcGRhdGUgb3B0X2xlbiB0byBpbmNsdWRlIHRoZSBiaXQgbGVuZ3RoIHRyZWUgYW5kIGNvdW50cyAqL1xuICAgIHppcF9vcHRfbGVuICs9IDMqKG1heF9ibGluZGV4KzEpICsgNSs1KzQ7XG4vLyAgICBUcmFjZXYoKHN0ZGVyciwgXCJcXG5keW4gdHJlZXM6IGR5biAlbGQsIHN0YXQgJWxkXCIsXG4vL1x0ICAgIGVuY29kZXItPm9wdF9sZW4sIGVuY29kZXItPnN0YXRpY19sZW4pKTtcblxuICAgIHJldHVybiBtYXhfYmxpbmRleDtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFNlbmQgdGhlIGhlYWRlciBmb3IgYSBibG9jayB1c2luZyBkeW5hbWljIEh1ZmZtYW4gdHJlZXM6IHRoZSBjb3VudHMsIHRoZVxuICogbGVuZ3RocyBvZiB0aGUgYml0IGxlbmd0aCBjb2RlcywgdGhlIGxpdGVyYWwgdHJlZSBhbmQgdGhlIGRpc3RhbmNlIHRyZWUuXG4gKiBJTiBhc3NlcnRpb246IGxjb2RlcyA+PSAyNTcsIGRjb2RlcyA+PSAxLCBibGNvZGVzID49IDQuXG4gKi9cbnZhciB6aXBfc2VuZF9hbGxfdHJlZXMgPSBmdW5jdGlvbihsY29kZXMsIGRjb2RlcywgYmxjb2RlcykgeyAvLyBudW1iZXIgb2YgY29kZXMgZm9yIGVhY2ggdHJlZVxuICAgIHZhciByYW5rOyAvLyBpbmRleCBpbiBibF9vcmRlclxuXG4vLyAgICBBc3NlcnQgKGxjb2RlcyA+PSAyNTcgJiYgZGNvZGVzID49IDEgJiYgYmxjb2RlcyA+PSA0LCBcIm5vdCBlbm91Z2ggY29kZXNcIik7XG4vLyAgICBBc3NlcnQgKGxjb2RlcyA8PSBMX0NPREVTICYmIGRjb2RlcyA8PSBEX0NPREVTICYmIGJsY29kZXMgPD0gQkxfQ09ERVMsXG4vL1x0ICAgIFwidG9vIG1hbnkgY29kZXNcIik7XG4vLyAgICBUcmFjZXYoKHN0ZGVyciwgXCJcXG5ibCBjb3VudHM6IFwiKSk7XG4gICAgemlwX3NlbmRfYml0cyhsY29kZXMtMjU3LCA1KTsgLy8gbm90ICsyNTUgYXMgc3RhdGVkIGluIGFwcG5vdGUudHh0XG4gICAgemlwX3NlbmRfYml0cyhkY29kZXMtMSwgICA1KTtcbiAgICB6aXBfc2VuZF9iaXRzKGJsY29kZXMtNCwgIDQpOyAvLyBub3QgLTMgYXMgc3RhdGVkIGluIGFwcG5vdGUudHh0XG4gICAgZm9yKHJhbmsgPSAwOyByYW5rIDwgYmxjb2RlczsgcmFuaysrKSB7XG4vLyAgICAgIFRyYWNldigoc3RkZXJyLCBcIlxcbmJsIGNvZGUgJTJkIFwiLCBibF9vcmRlcltyYW5rXSkpO1xuXHR6aXBfc2VuZF9iaXRzKHppcF9ibF90cmVlW3ppcF9ibF9vcmRlcltyYW5rXV0uZGwsIDMpO1xuICAgIH1cblxuICAgIC8vIHNlbmQgdGhlIGxpdGVyYWwgdHJlZVxuICAgIHppcF9zZW5kX3RyZWUoemlwX2R5bl9sdHJlZSxsY29kZXMtMSk7XG5cbiAgICAvLyBzZW5kIHRoZSBkaXN0YW5jZSB0cmVlXG4gICAgemlwX3NlbmRfdHJlZSh6aXBfZHluX2R0cmVlLGRjb2Rlcy0xKTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIERldGVybWluZSB0aGUgYmVzdCBlbmNvZGluZyBmb3IgdGhlIGN1cnJlbnQgYmxvY2s6IGR5bmFtaWMgdHJlZXMsIHN0YXRpY1xuICogdHJlZXMgb3Igc3RvcmUsIGFuZCBvdXRwdXQgdGhlIGVuY29kZWQgYmxvY2sgdG8gdGhlIHppcCBmaWxlLlxuICovXG52YXIgemlwX2ZsdXNoX2Jsb2NrID0gZnVuY3Rpb24oZW9mKSB7IC8vIHRydWUgaWYgdGhpcyBpcyB0aGUgbGFzdCBibG9jayBmb3IgYSBmaWxlXG4gICAgdmFyIG9wdF9sZW5iLCBzdGF0aWNfbGVuYjsgLy8gb3B0X2xlbiBhbmQgc3RhdGljX2xlbiBpbiBieXRlc1xuICAgIHZhciBtYXhfYmxpbmRleDtcdC8vIGluZGV4IG9mIGxhc3QgYml0IGxlbmd0aCBjb2RlIG9mIG5vbiB6ZXJvIGZyZXFcbiAgICB2YXIgc3RvcmVkX2xlbjtcdC8vIGxlbmd0aCBvZiBpbnB1dCBibG9ja1xuXG4gICAgc3RvcmVkX2xlbiA9IHppcF9zdHJzdGFydCAtIHppcF9ibG9ja19zdGFydDtcbiAgICB6aXBfZmxhZ19idWZbemlwX2xhc3RfZmxhZ3NdID0gemlwX2ZsYWdzOyAvLyBTYXZlIHRoZSBmbGFncyBmb3IgdGhlIGxhc3QgOCBpdGVtc1xuXG4gICAgLy8gQ29uc3RydWN0IHRoZSBsaXRlcmFsIGFuZCBkaXN0YW5jZSB0cmVlc1xuICAgIHppcF9idWlsZF90cmVlKHppcF9sX2Rlc2MpO1xuLy8gICAgVHJhY2V2KChzdGRlcnIsIFwiXFxubGl0IGRhdGE6IGR5biAlbGQsIHN0YXQgJWxkXCIsXG4vL1x0ICAgIGVuY29kZXItPm9wdF9sZW4sIGVuY29kZXItPnN0YXRpY19sZW4pKTtcblxuICAgIHppcF9idWlsZF90cmVlKHppcF9kX2Rlc2MpO1xuLy8gICAgVHJhY2V2KChzdGRlcnIsIFwiXFxuZGlzdCBkYXRhOiBkeW4gJWxkLCBzdGF0ICVsZFwiLFxuLy9cdCAgICBlbmNvZGVyLT5vcHRfbGVuLCBlbmNvZGVyLT5zdGF0aWNfbGVuKSk7XG4gICAgLyogQXQgdGhpcyBwb2ludCwgb3B0X2xlbiBhbmQgc3RhdGljX2xlbiBhcmUgdGhlIHRvdGFsIGJpdCBsZW5ndGhzIG9mXG4gICAgICogdGhlIGNvbXByZXNzZWQgYmxvY2sgZGF0YSwgZXhjbHVkaW5nIHRoZSB0cmVlIHJlcHJlc2VudGF0aW9ucy5cbiAgICAgKi9cblxuICAgIC8qIEJ1aWxkIHRoZSBiaXQgbGVuZ3RoIHRyZWUgZm9yIHRoZSBhYm92ZSB0d28gdHJlZXMsIGFuZCBnZXQgdGhlIGluZGV4XG4gICAgICogaW4gYmxfb3JkZXIgb2YgdGhlIGxhc3QgYml0IGxlbmd0aCBjb2RlIHRvIHNlbmQuXG4gICAgICovXG4gICAgbWF4X2JsaW5kZXggPSB6aXBfYnVpbGRfYmxfdHJlZSgpO1xuXG4gICAgLy8gRGV0ZXJtaW5lIHRoZSBiZXN0IGVuY29kaW5nLiBDb21wdXRlIGZpcnN0IHRoZSBibG9jayBsZW5ndGggaW4gYnl0ZXNcbiAgICBvcHRfbGVuYlx0PSAoemlwX29wdF9sZW4gICArMys3KT4+MztcbiAgICBzdGF0aWNfbGVuYiA9ICh6aXBfc3RhdGljX2xlbiszKzcpPj4zO1xuXG4vLyAgICBUcmFjZSgoc3RkZXJyLCBcIlxcbm9wdCAlbHUoJWx1KSBzdGF0ICVsdSglbHUpIHN0b3JlZCAlbHUgbGl0ICV1IGRpc3QgJXUgXCIsXG4vL1x0ICAgb3B0X2xlbmIsIGVuY29kZXItPm9wdF9sZW4sXG4vL1x0ICAgc3RhdGljX2xlbmIsIGVuY29kZXItPnN0YXRpY19sZW4sIHN0b3JlZF9sZW4sXG4vL1x0ICAgZW5jb2Rlci0+bGFzdF9saXQsIGVuY29kZXItPmxhc3RfZGlzdCkpO1xuXG4gICAgaWYoc3RhdGljX2xlbmIgPD0gb3B0X2xlbmIpXG5cdG9wdF9sZW5iID0gc3RhdGljX2xlbmI7XG4gICAgaWYoc3RvcmVkX2xlbiArIDQgPD0gb3B0X2xlbmIgLy8gNDogdHdvIHdvcmRzIGZvciB0aGUgbGVuZ3Roc1xuICAgICAgICYmIHppcF9ibG9ja19zdGFydCA+PSAwKSB7XG5cdHZhciBpO1xuXG5cdC8qIFRoZSB0ZXN0IGJ1ZiAhPSBOVUxMIGlzIG9ubHkgbmVjZXNzYXJ5IGlmIExJVF9CVUZTSVpFID4gV1NJWkUuXG5cdCAqIE90aGVyd2lzZSB3ZSBjYW4ndCBoYXZlIHByb2Nlc3NlZCBtb3JlIHRoYW4gV1NJWkUgaW5wdXQgYnl0ZXMgc2luY2Vcblx0ICogdGhlIGxhc3QgYmxvY2sgZmx1c2gsIGJlY2F1c2UgY29tcHJlc3Npb24gd291bGQgaGF2ZSBiZWVuXG5cdCAqIHN1Y2Nlc3NmdWwuIElmIExJVF9CVUZTSVpFIDw9IFdTSVpFLCBpdCBpcyBuZXZlciB0b28gbGF0ZSB0b1xuXHQgKiB0cmFuc2Zvcm0gYSBibG9jayBpbnRvIGEgc3RvcmVkIGJsb2NrLlxuXHQgKi9cblx0emlwX3NlbmRfYml0cygoemlwX1NUT1JFRF9CTE9DSzw8MSkrZW9mLCAzKTsgIC8qIHNlbmQgYmxvY2sgdHlwZSAqL1xuXHR6aXBfYmlfd2luZHVwKCk7XHRcdCAvKiBhbGlnbiBvbiBieXRlIGJvdW5kYXJ5ICovXG5cdHppcF9wdXRfc2hvcnQoc3RvcmVkX2xlbik7XG5cdHppcF9wdXRfc2hvcnQofnN0b3JlZF9sZW4pO1xuXG4gICAgICAvLyBjb3B5IGJsb2NrXG4vKlxuICAgICAgcCA9ICZ3aW5kb3dbYmxvY2tfc3RhcnRdO1xuICAgICAgZm9yKGkgPSAwOyBpIDwgc3RvcmVkX2xlbjsgaSsrKVxuXHRwdXRfYnl0ZShwW2ldKTtcbiovXG5cdGZvcihpID0gMDsgaSA8IHN0b3JlZF9sZW47IGkrKylcblx0ICAgIHppcF9wdXRfYnl0ZSh6aXBfd2luZG93W3ppcF9ibG9ja19zdGFydCArIGldKTtcblxuICAgIH0gZWxzZSBpZihzdGF0aWNfbGVuYiA9PSBvcHRfbGVuYikge1xuXHR6aXBfc2VuZF9iaXRzKCh6aXBfU1RBVElDX1RSRUVTPDwxKStlb2YsIDMpO1xuXHR6aXBfY29tcHJlc3NfYmxvY2soemlwX3N0YXRpY19sdHJlZSwgemlwX3N0YXRpY19kdHJlZSk7XG4gICAgfSBlbHNlIHtcblx0emlwX3NlbmRfYml0cygoemlwX0RZTl9UUkVFUzw8MSkrZW9mLCAzKTtcblx0emlwX3NlbmRfYWxsX3RyZWVzKHppcF9sX2Rlc2MubWF4X2NvZGUrMSxcblx0XHRcdCAgIHppcF9kX2Rlc2MubWF4X2NvZGUrMSxcblx0XHRcdCAgIG1heF9ibGluZGV4KzEpO1xuXHR6aXBfY29tcHJlc3NfYmxvY2soemlwX2R5bl9sdHJlZSwgemlwX2R5bl9kdHJlZSk7XG4gICAgfVxuXG4gICAgemlwX2luaXRfYmxvY2soKTtcblxuICAgIGlmKGVvZiAhPSAwKVxuXHR6aXBfYmlfd2luZHVwKCk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gKiBTYXZlIHRoZSBtYXRjaCBpbmZvIGFuZCB0YWxseSB0aGUgZnJlcXVlbmN5IGNvdW50cy4gUmV0dXJuIHRydWUgaWZcbiAqIHRoZSBjdXJyZW50IGJsb2NrIG11c3QgYmUgZmx1c2hlZC5cbiAqL1xudmFyIHppcF9jdF90YWxseSA9IGZ1bmN0aW9uKFxuXHRkaXN0LCAvLyBkaXN0YW5jZSBvZiBtYXRjaGVkIHN0cmluZ1xuXHRsYykgeyAvLyBtYXRjaCBsZW5ndGgtTUlOX01BVENIIG9yIHVubWF0Y2hlZCBjaGFyIChpZiBkaXN0PT0wKVxuICAgIHppcF9sX2J1Zlt6aXBfbGFzdF9saXQrK10gPSBsYztcbiAgICBpZihkaXN0ID09IDApIHtcblx0Ly8gbGMgaXMgdGhlIHVubWF0Y2hlZCBjaGFyXG5cdHppcF9keW5fbHRyZWVbbGNdLmZjKys7XG4gICAgfSBlbHNlIHtcblx0Ly8gSGVyZSwgbGMgaXMgdGhlIG1hdGNoIGxlbmd0aCAtIE1JTl9NQVRDSFxuXHRkaXN0LS07XHRcdCAgICAvLyBkaXN0ID0gbWF0Y2ggZGlzdGFuY2UgLSAxXG4vLyAgICAgIEFzc2VydCgodXNoKWRpc3QgPCAodXNoKU1BWF9ESVNUICYmXG4vL1x0ICAgICAodXNoKWxjIDw9ICh1c2gpKE1BWF9NQVRDSC1NSU5fTUFUQ0gpICYmXG4vL1x0ICAgICAodXNoKURfQ09ERShkaXN0KSA8ICh1c2gpRF9DT0RFUywgIFwiY3RfdGFsbHk6IGJhZCBtYXRjaFwiKTtcblxuXHR6aXBfZHluX2x0cmVlW3ppcF9sZW5ndGhfY29kZVtsY10remlwX0xJVEVSQUxTKzFdLmZjKys7XG5cdHppcF9keW5fZHRyZWVbemlwX0RfQ09ERShkaXN0KV0uZmMrKztcblxuXHR6aXBfZF9idWZbemlwX2xhc3RfZGlzdCsrXSA9IGRpc3Q7XG5cdHppcF9mbGFncyB8PSB6aXBfZmxhZ19iaXQ7XG4gICAgfVxuICAgIHppcF9mbGFnX2JpdCA8PD0gMTtcblxuICAgIC8vIE91dHB1dCB0aGUgZmxhZ3MgaWYgdGhleSBmaWxsIGEgYnl0ZVxuICAgIGlmKCh6aXBfbGFzdF9saXQgJiA3KSA9PSAwKSB7XG5cdHppcF9mbGFnX2J1Zlt6aXBfbGFzdF9mbGFncysrXSA9IHppcF9mbGFncztcblx0emlwX2ZsYWdzID0gMDtcblx0emlwX2ZsYWdfYml0ID0gMTtcbiAgICB9XG4gICAgLy8gVHJ5IHRvIGd1ZXNzIGlmIGl0IGlzIHByb2ZpdGFibGUgdG8gc3RvcCB0aGUgY3VycmVudCBibG9jayBoZXJlXG4gICAgaWYoemlwX2NvbXByX2xldmVsID4gMiAmJiAoemlwX2xhc3RfbGl0ICYgMHhmZmYpID09IDApIHtcblx0Ly8gQ29tcHV0ZSBhbiB1cHBlciBib3VuZCBmb3IgdGhlIGNvbXByZXNzZWQgbGVuZ3RoXG5cdHZhciBvdXRfbGVuZ3RoID0gemlwX2xhc3RfbGl0ICogODtcblx0dmFyIGluX2xlbmd0aCA9IHppcF9zdHJzdGFydCAtIHppcF9ibG9ja19zdGFydDtcblx0dmFyIGRjb2RlO1xuXG5cdGZvcihkY29kZSA9IDA7IGRjb2RlIDwgemlwX0RfQ09ERVM7IGRjb2RlKyspIHtcblx0ICAgIG91dF9sZW5ndGggKz0gemlwX2R5bl9kdHJlZVtkY29kZV0uZmMgKiAoNSArIHppcF9leHRyYV9kYml0c1tkY29kZV0pO1xuXHR9XG5cdG91dF9sZW5ndGggPj49IDM7XG4vLyAgICAgIFRyYWNlKChzdGRlcnIsXCJcXG5sYXN0X2xpdCAldSwgbGFzdF9kaXN0ICV1LCBpbiAlbGQsIG91dCB+JWxkKCVsZCUlKSBcIixcbi8vXHQgICAgIGVuY29kZXItPmxhc3RfbGl0LCBlbmNvZGVyLT5sYXN0X2Rpc3QsIGluX2xlbmd0aCwgb3V0X2xlbmd0aCxcbi8vXHQgICAgIDEwMEwgLSBvdXRfbGVuZ3RoKjEwMEwvaW5fbGVuZ3RoKSk7XG5cdGlmKHppcF9sYXN0X2Rpc3QgPCBwYXJzZUludCh6aXBfbGFzdF9saXQvMikgJiZcblx0ICAgb3V0X2xlbmd0aCA8IHBhcnNlSW50KGluX2xlbmd0aC8yKSlcblx0ICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gKHppcF9sYXN0X2xpdCA9PSB6aXBfTElUX0JVRlNJWkUtMSB8fFxuXHQgICAgemlwX2xhc3RfZGlzdCA9PSB6aXBfRElTVF9CVUZTSVpFKTtcbiAgICAvKiBXZSBhdm9pZCBlcXVhbGl0eSB3aXRoIExJVF9CVUZTSVpFIGJlY2F1c2Ugb2Ygd3JhcGFyb3VuZCBhdCA2NEtcbiAgICAgKiBvbiAxNiBiaXQgbWFjaGluZXMgYW5kIGJlY2F1c2Ugc3RvcmVkIGJsb2NrcyBhcmUgcmVzdHJpY3RlZCB0b1xuICAgICAqIDY0Sy0xIGJ5dGVzLlxuICAgICAqL1xufVxuXG4gIC8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAqIFNlbmQgdGhlIGJsb2NrIGRhdGEgY29tcHJlc3NlZCB1c2luZyB0aGUgZ2l2ZW4gSHVmZm1hbiB0cmVlc1xuICAgKi9cbnZhciB6aXBfY29tcHJlc3NfYmxvY2sgPSBmdW5jdGlvbihcblx0bHRyZWUsXHQvLyBsaXRlcmFsIHRyZWVcblx0ZHRyZWUpIHtcdC8vIGRpc3RhbmNlIHRyZWVcbiAgICB2YXIgZGlzdDtcdFx0Ly8gZGlzdGFuY2Ugb2YgbWF0Y2hlZCBzdHJpbmdcbiAgICB2YXIgbGM7XHRcdC8vIG1hdGNoIGxlbmd0aCBvciB1bm1hdGNoZWQgY2hhciAoaWYgZGlzdCA9PSAwKVxuICAgIHZhciBseCA9IDA7XHRcdC8vIHJ1bm5pbmcgaW5kZXggaW4gbF9idWZcbiAgICB2YXIgZHggPSAwO1x0XHQvLyBydW5uaW5nIGluZGV4IGluIGRfYnVmXG4gICAgdmFyIGZ4ID0gMDtcdFx0Ly8gcnVubmluZyBpbmRleCBpbiBmbGFnX2J1ZlxuICAgIHZhciBmbGFnID0gMDtcdC8vIGN1cnJlbnQgZmxhZ3NcbiAgICB2YXIgY29kZTtcdFx0Ly8gdGhlIGNvZGUgdG8gc2VuZFxuICAgIHZhciBleHRyYTtcdFx0Ly8gbnVtYmVyIG9mIGV4dHJhIGJpdHMgdG8gc2VuZFxuXG4gICAgaWYoemlwX2xhc3RfbGl0ICE9IDApIGRvIHtcblx0aWYoKGx4ICYgNykgPT0gMClcblx0ICAgIGZsYWcgPSB6aXBfZmxhZ19idWZbZngrK107XG5cdGxjID0gemlwX2xfYnVmW2x4KytdICYgMHhmZjtcblx0aWYoKGZsYWcgJiAxKSA9PSAwKSB7XG5cdCAgICB6aXBfU0VORF9DT0RFKGxjLCBsdHJlZSk7IC8qIHNlbmQgYSBsaXRlcmFsIGJ5dGUgKi9cbi8vXHRUcmFjZWN2KGlzZ3JhcGgobGMpLCAoc3RkZXJyLFwiICclYycgXCIsIGxjKSk7XG5cdH0gZWxzZSB7XG5cdCAgICAvLyBIZXJlLCBsYyBpcyB0aGUgbWF0Y2ggbGVuZ3RoIC0gTUlOX01BVENIXG5cdCAgICBjb2RlID0gemlwX2xlbmd0aF9jb2RlW2xjXTtcblx0ICAgIHppcF9TRU5EX0NPREUoY29kZSt6aXBfTElURVJBTFMrMSwgbHRyZWUpOyAvLyBzZW5kIHRoZSBsZW5ndGggY29kZVxuXHQgICAgZXh0cmEgPSB6aXBfZXh0cmFfbGJpdHNbY29kZV07XG5cdCAgICBpZihleHRyYSAhPSAwKSB7XG5cdFx0bGMgLT0gemlwX2Jhc2VfbGVuZ3RoW2NvZGVdO1xuXHRcdHppcF9zZW5kX2JpdHMobGMsIGV4dHJhKTsgLy8gc2VuZCB0aGUgZXh0cmEgbGVuZ3RoIGJpdHNcblx0ICAgIH1cblx0ICAgIGRpc3QgPSB6aXBfZF9idWZbZHgrK107XG5cdCAgICAvLyBIZXJlLCBkaXN0IGlzIHRoZSBtYXRjaCBkaXN0YW5jZSAtIDFcblx0ICAgIGNvZGUgPSB6aXBfRF9DT0RFKGRpc3QpO1xuLy9cdEFzc2VydCAoY29kZSA8IERfQ09ERVMsIFwiYmFkIGRfY29kZVwiKTtcblxuXHQgICAgemlwX1NFTkRfQ09ERShjb2RlLCBkdHJlZSk7XHQgIC8vIHNlbmQgdGhlIGRpc3RhbmNlIGNvZGVcblx0ICAgIGV4dHJhID0gemlwX2V4dHJhX2RiaXRzW2NvZGVdO1xuXHQgICAgaWYoZXh0cmEgIT0gMCkge1xuXHRcdGRpc3QgLT0gemlwX2Jhc2VfZGlzdFtjb2RlXTtcblx0XHR6aXBfc2VuZF9iaXRzKGRpc3QsIGV4dHJhKTsgICAvLyBzZW5kIHRoZSBleHRyYSBkaXN0YW5jZSBiaXRzXG5cdCAgICB9XG5cdH0gLy8gbGl0ZXJhbCBvciBtYXRjaCBwYWlyID9cblx0ZmxhZyA+Pj0gMTtcbiAgICB9IHdoaWxlKGx4IDwgemlwX2xhc3RfbGl0KTtcblxuICAgIHppcF9TRU5EX0NPREUoemlwX0VORF9CTE9DSywgbHRyZWUpO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogU2VuZCBhIHZhbHVlIG9uIGEgZ2l2ZW4gbnVtYmVyIG9mIGJpdHMuXG4gKiBJTiBhc3NlcnRpb246IGxlbmd0aCA8PSAxNiBhbmQgdmFsdWUgZml0cyBpbiBsZW5ndGggYml0cy5cbiAqL1xudmFyIHppcF9CdWZfc2l6ZSA9IDE2OyAvLyBiaXQgc2l6ZSBvZiBiaV9idWZcbnZhciB6aXBfc2VuZF9iaXRzID0gZnVuY3Rpb24oXG5cdHZhbHVlLFx0Ly8gdmFsdWUgdG8gc2VuZFxuXHRsZW5ndGgpIHtcdC8vIG51bWJlciBvZiBiaXRzXG4gICAgLyogSWYgbm90IGVub3VnaCByb29tIGluIGJpX2J1ZiwgdXNlICh2YWxpZCkgYml0cyBmcm9tIGJpX2J1ZiBhbmRcbiAgICAgKiAoMTYgLSBiaV92YWxpZCkgYml0cyBmcm9tIHZhbHVlLCBsZWF2aW5nICh3aWR0aCAtICgxNi1iaV92YWxpZCkpXG4gICAgICogdW51c2VkIGJpdHMgaW4gdmFsdWUuXG4gICAgICovXG4gICAgaWYoemlwX2JpX3ZhbGlkID4gemlwX0J1Zl9zaXplIC0gbGVuZ3RoKSB7XG5cdHppcF9iaV9idWYgfD0gKHZhbHVlIDw8IHppcF9iaV92YWxpZCk7XG5cdHppcF9wdXRfc2hvcnQoemlwX2JpX2J1Zik7XG5cdHppcF9iaV9idWYgPSAodmFsdWUgPj4gKHppcF9CdWZfc2l6ZSAtIHppcF9iaV92YWxpZCkpO1xuXHR6aXBfYmlfdmFsaWQgKz0gbGVuZ3RoIC0gemlwX0J1Zl9zaXplO1xuICAgIH0gZWxzZSB7XG5cdHppcF9iaV9idWYgfD0gdmFsdWUgPDwgemlwX2JpX3ZhbGlkO1xuXHR6aXBfYmlfdmFsaWQgKz0gbGVuZ3RoO1xuICAgIH1cbn1cblxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAqIFJldmVyc2UgdGhlIGZpcnN0IGxlbiBiaXRzIG9mIGEgY29kZSwgdXNpbmcgc3RyYWlnaHRmb3J3YXJkIGNvZGUgKGEgZmFzdGVyXG4gKiBtZXRob2Qgd291bGQgdXNlIGEgdGFibGUpXG4gKiBJTiBhc3NlcnRpb246IDEgPD0gbGVuIDw9IDE1XG4gKi9cbnZhciB6aXBfYmlfcmV2ZXJzZSA9IGZ1bmN0aW9uKFxuXHRjb2RlLFx0Ly8gdGhlIHZhbHVlIHRvIGludmVydFxuXHRsZW4pIHtcdC8vIGl0cyBiaXQgbGVuZ3RoXG4gICAgdmFyIHJlcyA9IDA7XG4gICAgZG8ge1xuXHRyZXMgfD0gY29kZSAmIDE7XG5cdGNvZGUgPj49IDE7XG5cdHJlcyA8PD0gMTtcbiAgICB9IHdoaWxlKC0tbGVuID4gMCk7XG4gICAgcmV0dXJuIHJlcyA+PiAxO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICogV3JpdGUgb3V0IGFueSByZW1haW5pbmcgYml0cyBpbiBhbiBpbmNvbXBsZXRlIGJ5dGUuXG4gKi9cbnZhciB6aXBfYmlfd2luZHVwID0gZnVuY3Rpb24oKSB7XG4gICAgaWYoemlwX2JpX3ZhbGlkID4gOCkge1xuXHR6aXBfcHV0X3Nob3J0KHppcF9iaV9idWYpO1xuICAgIH0gZWxzZSBpZih6aXBfYmlfdmFsaWQgPiAwKSB7XG5cdHppcF9wdXRfYnl0ZSh6aXBfYmlfYnVmKTtcbiAgICB9XG4gICAgemlwX2JpX2J1ZiA9IDA7XG4gICAgemlwX2JpX3ZhbGlkID0gMDtcbn1cblxudmFyIHppcF9xb3V0YnVmID0gZnVuY3Rpb24oKSB7XG4gICAgaWYoemlwX291dGNudCAhPSAwKSB7XG5cdHZhciBxLCBpO1xuXHRxID0gemlwX25ld19xdWV1ZSgpO1xuXHRpZih6aXBfcWhlYWQgPT0gbnVsbClcblx0ICAgIHppcF9xaGVhZCA9IHppcF9xdGFpbCA9IHE7XG5cdGVsc2Vcblx0ICAgIHppcF9xdGFpbCA9IHppcF9xdGFpbC5uZXh0ID0gcTtcblx0cS5sZW4gPSB6aXBfb3V0Y250IC0gemlwX291dG9mZjtcbi8vICAgICAgU3lzdGVtLmFycmF5Y29weSh6aXBfb3V0YnVmLCB6aXBfb3V0b2ZmLCBxLnB0ciwgMCwgcS5sZW4pO1xuXHRmb3IoaSA9IDA7IGkgPCBxLmxlbjsgaSsrKVxuXHQgICAgcS5wdHJbaV0gPSB6aXBfb3V0YnVmW3ppcF9vdXRvZmYgKyBpXTtcblx0emlwX291dGNudCA9IHppcF9vdXRvZmYgPSAwO1xuICAgIH1cbn1cblxudmFyIHppcF9kZWZsYXRlID0gZnVuY3Rpb24oc3RyLCBsZXZlbCkge1xuICAgIHZhciBpLCBqO1xuXG4gICAgemlwX2RlZmxhdGVfZGF0YSA9IHN0cjtcbiAgICB6aXBfZGVmbGF0ZV9wb3MgPSAwO1xuICAgIGlmKHR5cGVvZiBsZXZlbCA9PSBcInVuZGVmaW5lZFwiKVxuXHRsZXZlbCA9IHppcF9ERUZBVUxUX0xFVkVMO1xuICAgIHppcF9kZWZsYXRlX3N0YXJ0KGxldmVsKTtcblxuICAgIHZhciBidWZmID0gbmV3IEFycmF5KDEwMjQpO1xuICAgIHZhciBhb3V0ID0gW107XG4gICAgd2hpbGUoKGkgPSB6aXBfZGVmbGF0ZV9pbnRlcm5hbChidWZmLCAwLCBidWZmLmxlbmd0aCkpID4gMCkge1xuXHR2YXIgY2J1ZiA9IG5ldyBBcnJheShpKTtcblx0Zm9yKGogPSAwOyBqIDwgaTsgaisrKXtcblx0ICAgIGNidWZbal0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZmZbal0pO1xuXHR9XG5cdGFvdXRbYW91dC5sZW5ndGhdID0gY2J1Zi5qb2luKFwiXCIpO1xuICAgIH1cbiAgICB6aXBfZGVmbGF0ZV9kYXRhID0gbnVsbDsgLy8gRy5DLlxuICAgIHJldHVybiBhb3V0LmpvaW4oXCJcIik7XG59XG5cbmlmICghIGN0eC5SYXdEZWZsYXRlKSBjdHguUmF3RGVmbGF0ZSA9IHt9O1xuY3R4LlJhd0RlZmxhdGUuZGVmbGF0ZSA9IHppcF9kZWZsYXRlO1xuXG59KSh0aGlzKTtcbiIsIi8qXG4gKiAkSWQ6IHJhd2luZmxhdGUuanMsdiAwLjMgMjAxMy8wNC8wOSAxNDoyNTozOCBkYW5rb2dhaSBFeHAgZGFua29nYWkgJFxuICpcbiAqIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlLCB2ZXJzaW9uIDIgKEdQTC0yLjApXG4gKiAgIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9HUEwtMi4wXG4gKiBvcmlnaW5hbDpcbiAqICAgaHR0cDovL3d3dy5vbmljb3MuY29tL3N0YWZmL2l6L2FtdXNlL2phdmFzY3JpcHQvZXhwZXJ0L2luZmxhdGUudHh0XG4gKi9cblxuKGZ1bmN0aW9uKGN0eCl7XG5cbi8qIENvcHlyaWdodCAoQykgMTk5OSBNYXNhbmFvIEl6dW1vIDxpekBvbmljb3MuY28uanA+XG4gKiBWZXJzaW9uOiAxLjAuMC4xXG4gKiBMYXN0TW9kaWZpZWQ6IERlYyAyNSAxOTk5XG4gKi9cblxuLyogSW50ZXJmYWNlOlxuICogZGF0YSA9IHppcF9pbmZsYXRlKHNyYyk7XG4gKi9cblxuLyogY29uc3RhbnQgcGFyYW1ldGVycyAqL1xudmFyIHppcF9XU0laRSA9IDMyNzY4O1x0XHQvLyBTbGlkaW5nIFdpbmRvdyBzaXplXG52YXIgemlwX1NUT1JFRF9CTE9DSyA9IDA7XG52YXIgemlwX1NUQVRJQ19UUkVFUyA9IDE7XG52YXIgemlwX0RZTl9UUkVFUyAgICA9IDI7XG5cbi8qIGZvciBpbmZsYXRlICovXG52YXIgemlwX2xiaXRzID0gOTsgXHRcdC8vIGJpdHMgaW4gYmFzZSBsaXRlcmFsL2xlbmd0aCBsb29rdXAgdGFibGVcbnZhciB6aXBfZGJpdHMgPSA2OyBcdFx0Ly8gYml0cyBpbiBiYXNlIGRpc3RhbmNlIGxvb2t1cCB0YWJsZVxudmFyIHppcF9JTkJVRlNJWiA9IDMyNzY4O1x0Ly8gSW5wdXQgYnVmZmVyIHNpemVcbnZhciB6aXBfSU5CVUZfRVhUUkEgPSA2NDtcdC8vIEV4dHJhIGJ1ZmZlclxuXG4vKiB2YXJpYWJsZXMgKGluZmxhdGUpICovXG52YXIgemlwX3NsaWRlO1xudmFyIHppcF93cDtcdFx0XHQvLyBjdXJyZW50IHBvc2l0aW9uIGluIHNsaWRlXG52YXIgemlwX2ZpeGVkX3RsID0gbnVsbDtcdC8vIGluZmxhdGUgc3RhdGljXG52YXIgemlwX2ZpeGVkX3RkO1x0XHQvLyBpbmZsYXRlIHN0YXRpY1xudmFyIHppcF9maXhlZF9ibCwgemlwX2ZpeGVkX2JkO1x0Ly8gaW5mbGF0ZSBzdGF0aWNcbnZhciB6aXBfYml0X2J1ZjtcdFx0Ly8gYml0IGJ1ZmZlclxudmFyIHppcF9iaXRfbGVuO1x0XHQvLyBiaXRzIGluIGJpdCBidWZmZXJcbnZhciB6aXBfbWV0aG9kO1xudmFyIHppcF9lb2Y7XG52YXIgemlwX2NvcHlfbGVuZztcbnZhciB6aXBfY29weV9kaXN0O1xudmFyIHppcF90bCwgemlwX3RkO1x0Ly8gbGl0ZXJhbC9sZW5ndGggYW5kIGRpc3RhbmNlIGRlY29kZXIgdGFibGVzXG52YXIgemlwX2JsLCB6aXBfYmQ7XHQvLyBudW1iZXIgb2YgYml0cyBkZWNvZGVkIGJ5IHRsIGFuZCB0ZFxuXG52YXIgemlwX2luZmxhdGVfZGF0YTtcbnZhciB6aXBfaW5mbGF0ZV9wb3M7XG5cblxuLyogY29uc3RhbnQgdGFibGVzIChpbmZsYXRlKSAqL1xudmFyIHppcF9NQVNLX0JJVFMgPSBuZXcgQXJyYXkoXG4gICAgMHgwMDAwLFxuICAgIDB4MDAwMSwgMHgwMDAzLCAweDAwMDcsIDB4MDAwZiwgMHgwMDFmLCAweDAwM2YsIDB4MDA3ZiwgMHgwMGZmLFxuICAgIDB4MDFmZiwgMHgwM2ZmLCAweDA3ZmYsIDB4MGZmZiwgMHgxZmZmLCAweDNmZmYsIDB4N2ZmZiwgMHhmZmZmKTtcbi8vIFRhYmxlcyBmb3IgZGVmbGF0ZSBmcm9tIFBLWklQJ3MgYXBwbm90ZS50eHQuXG52YXIgemlwX2NwbGVucyA9IG5ldyBBcnJheSggLy8gQ29weSBsZW5ndGhzIGZvciBsaXRlcmFsIGNvZGVzIDI1Ny4uMjg1XG4gICAgMywgNCwgNSwgNiwgNywgOCwgOSwgMTAsIDExLCAxMywgMTUsIDE3LCAxOSwgMjMsIDI3LCAzMSxcbiAgICAzNSwgNDMsIDUxLCA1OSwgNjcsIDgzLCA5OSwgMTE1LCAxMzEsIDE2MywgMTk1LCAyMjcsIDI1OCwgMCwgMCk7XG4vKiBub3RlOiBzZWUgbm90ZSAjMTMgYWJvdmUgYWJvdXQgdGhlIDI1OCBpbiB0aGlzIGxpc3QuICovXG52YXIgemlwX2NwbGV4dCA9IG5ldyBBcnJheSggLy8gRXh0cmEgYml0cyBmb3IgbGl0ZXJhbCBjb2RlcyAyNTcuLjI4NVxuICAgIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDEsIDEsIDEsIDEsIDIsIDIsIDIsIDIsXG4gICAgMywgMywgMywgMywgNCwgNCwgNCwgNCwgNSwgNSwgNSwgNSwgMCwgOTksIDk5KTsgLy8gOTk9PWludmFsaWRcbnZhciB6aXBfY3BkaXN0ID0gbmV3IEFycmF5KCAvLyBDb3B5IG9mZnNldHMgZm9yIGRpc3RhbmNlIGNvZGVzIDAuLjI5XG4gICAgMSwgMiwgMywgNCwgNSwgNywgOSwgMTMsIDE3LCAyNSwgMzMsIDQ5LCA2NSwgOTcsIDEyOSwgMTkzLFxuICAgIDI1NywgMzg1LCA1MTMsIDc2OSwgMTAyNSwgMTUzNywgMjA0OSwgMzA3MywgNDA5NywgNjE0NSxcbiAgICA4MTkzLCAxMjI4OSwgMTYzODUsIDI0NTc3KTtcbnZhciB6aXBfY3BkZXh0ID0gbmV3IEFycmF5KCAvLyBFeHRyYSBiaXRzIGZvciBkaXN0YW5jZSBjb2Rlc1xuICAgIDAsIDAsIDAsIDAsIDEsIDEsIDIsIDIsIDMsIDMsIDQsIDQsIDUsIDUsIDYsIDYsXG4gICAgNywgNywgOCwgOCwgOSwgOSwgMTAsIDEwLCAxMSwgMTEsXG4gICAgMTIsIDEyLCAxMywgMTMpO1xudmFyIHppcF9ib3JkZXIgPSBuZXcgQXJyYXkoICAvLyBPcmRlciBvZiB0aGUgYml0IGxlbmd0aCBjb2RlIGxlbmd0aHNcbiAgICAxNiwgMTcsIDE4LCAwLCA4LCA3LCA5LCA2LCAxMCwgNSwgMTEsIDQsIDEyLCAzLCAxMywgMiwgMTQsIDEsIDE1KTtcbi8qIG9iamVjdHMgKGluZmxhdGUpICovXG5cbnZhciB6aXBfSHVmdExpc3QgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5leHQgPSBudWxsO1xuICAgIHRoaXMubGlzdCA9IG51bGw7XG59XG5cbnZhciB6aXBfSHVmdE5vZGUgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmUgPSAwOyAvLyBudW1iZXIgb2YgZXh0cmEgYml0cyBvciBvcGVyYXRpb25cbiAgICB0aGlzLmIgPSAwOyAvLyBudW1iZXIgb2YgYml0cyBpbiB0aGlzIGNvZGUgb3Igc3ViY29kZVxuXG4gICAgLy8gdW5pb25cbiAgICB0aGlzLm4gPSAwOyAvLyBsaXRlcmFsLCBsZW5ndGggYmFzZSwgb3IgZGlzdGFuY2UgYmFzZVxuICAgIHRoaXMudCA9IG51bGw7IC8vICh6aXBfSHVmdE5vZGUpIHBvaW50ZXIgdG8gbmV4dCBsZXZlbCBvZiB0YWJsZVxufVxuXG52YXIgemlwX0h1ZnRCdWlsZCA9IGZ1bmN0aW9uKGIsXHQvLyBjb2RlIGxlbmd0aHMgaW4gYml0cyAoYWxsIGFzc3VtZWQgPD0gQk1BWClcblx0XHQgICAgICAgbixcdC8vIG51bWJlciBvZiBjb2RlcyAoYXNzdW1lZCA8PSBOX01BWClcblx0XHQgICAgICAgcyxcdC8vIG51bWJlciBvZiBzaW1wbGUtdmFsdWVkIGNvZGVzICgwLi5zLTEpXG5cdFx0ICAgICAgIGQsXHQvLyBsaXN0IG9mIGJhc2UgdmFsdWVzIGZvciBub24tc2ltcGxlIGNvZGVzXG5cdFx0ICAgICAgIGUsXHQvLyBsaXN0IG9mIGV4dHJhIGJpdHMgZm9yIG5vbi1zaW1wbGUgY29kZXNcblx0XHQgICAgICAgbW1cdC8vIG1heGltdW0gbG9va3VwIGJpdHNcblx0XHQgICApIHtcbiAgICB0aGlzLkJNQVggPSAxNjsgICAvLyBtYXhpbXVtIGJpdCBsZW5ndGggb2YgYW55IGNvZGVcbiAgICB0aGlzLk5fTUFYID0gMjg4OyAvLyBtYXhpbXVtIG51bWJlciBvZiBjb2RlcyBpbiBhbnkgc2V0XG4gICAgdGhpcy5zdGF0dXMgPSAwO1x0Ly8gMDogc3VjY2VzcywgMTogaW5jb21wbGV0ZSB0YWJsZSwgMjogYmFkIGlucHV0XG4gICAgdGhpcy5yb290ID0gbnVsbDtcdC8vICh6aXBfSHVmdExpc3QpIHN0YXJ0aW5nIHRhYmxlXG4gICAgdGhpcy5tID0gMDtcdFx0Ly8gbWF4aW11bSBsb29rdXAgYml0cywgcmV0dXJucyBhY3R1YWxcblxuLyogR2l2ZW4gYSBsaXN0IG9mIGNvZGUgbGVuZ3RocyBhbmQgYSBtYXhpbXVtIHRhYmxlIHNpemUsIG1ha2UgYSBzZXQgb2ZcbiAgIHRhYmxlcyB0byBkZWNvZGUgdGhhdCBzZXQgb2YgY29kZXMuXHRSZXR1cm4gemVybyBvbiBzdWNjZXNzLCBvbmUgaWZcbiAgIHRoZSBnaXZlbiBjb2RlIHNldCBpcyBpbmNvbXBsZXRlICh0aGUgdGFibGVzIGFyZSBzdGlsbCBidWlsdCBpbiB0aGlzXG4gICBjYXNlKSwgdHdvIGlmIHRoZSBpbnB1dCBpcyBpbnZhbGlkIChhbGwgemVybyBsZW5ndGggY29kZXMgb3IgYW5cbiAgIG92ZXJzdWJzY3JpYmVkIHNldCBvZiBsZW5ndGhzKSwgYW5kIHRocmVlIGlmIG5vdCBlbm91Z2ggbWVtb3J5LlxuICAgVGhlIGNvZGUgd2l0aCB2YWx1ZSAyNTYgaXMgc3BlY2lhbCwgYW5kIHRoZSB0YWJsZXMgYXJlIGNvbnN0cnVjdGVkXG4gICBzbyB0aGF0IG5vIGJpdHMgYmV5b25kIHRoYXQgY29kZSBhcmUgZmV0Y2hlZCB3aGVuIHRoYXQgY29kZSBpc1xuICAgZGVjb2RlZC4gKi9cbiAgICB7XG5cdHZhciBhO1x0XHRcdC8vIGNvdW50ZXIgZm9yIGNvZGVzIG9mIGxlbmd0aCBrXG5cdHZhciBjID0gbmV3IEFycmF5KHRoaXMuQk1BWCsxKTtcdC8vIGJpdCBsZW5ndGggY291bnQgdGFibGVcblx0dmFyIGVsO1x0XHRcdC8vIGxlbmd0aCBvZiBFT0IgY29kZSAodmFsdWUgMjU2KVxuXHR2YXIgZjtcdFx0XHQvLyBpIHJlcGVhdHMgaW4gdGFibGUgZXZlcnkgZiBlbnRyaWVzXG5cdHZhciBnO1x0XHRcdC8vIG1heGltdW0gY29kZSBsZW5ndGhcblx0dmFyIGg7XHRcdFx0Ly8gdGFibGUgbGV2ZWxcblx0dmFyIGk7XHRcdFx0Ly8gY291bnRlciwgY3VycmVudCBjb2RlXG5cdHZhciBqO1x0XHRcdC8vIGNvdW50ZXJcblx0dmFyIGs7XHRcdFx0Ly8gbnVtYmVyIG9mIGJpdHMgaW4gY3VycmVudCBjb2RlXG5cdHZhciBseCA9IG5ldyBBcnJheSh0aGlzLkJNQVgrMSk7XHQvLyBzdGFjayBvZiBiaXRzIHBlciB0YWJsZVxuXHR2YXIgcDtcdFx0XHQvLyBwb2ludGVyIGludG8gY1tdLCBiW10sIG9yIHZbXVxuXHR2YXIgcGlkeDtcdFx0Ly8gaW5kZXggb2YgcFxuXHR2YXIgcTtcdFx0XHQvLyAoemlwX0h1ZnROb2RlKSBwb2ludHMgdG8gY3VycmVudCB0YWJsZVxuXHR2YXIgciA9IG5ldyB6aXBfSHVmdE5vZGUoKTsgLy8gdGFibGUgZW50cnkgZm9yIHN0cnVjdHVyZSBhc3NpZ25tZW50XG5cdHZhciB1ID0gbmV3IEFycmF5KHRoaXMuQk1BWCk7IC8vIHppcF9IdWZ0Tm9kZVtCTUFYXVtdICB0YWJsZSBzdGFja1xuXHR2YXIgdiA9IG5ldyBBcnJheSh0aGlzLk5fTUFYKTsgLy8gdmFsdWVzIGluIG9yZGVyIG9mIGJpdCBsZW5ndGhcblx0dmFyIHc7XG5cdHZhciB4ID0gbmV3IEFycmF5KHRoaXMuQk1BWCsxKTsvLyBiaXQgb2Zmc2V0cywgdGhlbiBjb2RlIHN0YWNrXG5cdHZhciB4cDtcdFx0XHQvLyBwb2ludGVyIGludG8geCBvciBjXG5cdHZhciB5O1x0XHRcdC8vIG51bWJlciBvZiBkdW1teSBjb2RlcyBhZGRlZFxuXHR2YXIgejtcdFx0XHQvLyBudW1iZXIgb2YgZW50cmllcyBpbiBjdXJyZW50IHRhYmxlXG5cdHZhciBvO1xuXHR2YXIgdGFpbDtcdFx0Ly8gKHppcF9IdWZ0TGlzdClcblxuXHR0YWlsID0gdGhpcy5yb290ID0gbnVsbDtcblx0Zm9yKGkgPSAwOyBpIDwgYy5sZW5ndGg7IGkrKylcblx0ICAgIGNbaV0gPSAwO1xuXHRmb3IoaSA9IDA7IGkgPCBseC5sZW5ndGg7IGkrKylcblx0ICAgIGx4W2ldID0gMDtcblx0Zm9yKGkgPSAwOyBpIDwgdS5sZW5ndGg7IGkrKylcblx0ICAgIHVbaV0gPSBudWxsO1xuXHRmb3IoaSA9IDA7IGkgPCB2Lmxlbmd0aDsgaSsrKVxuXHQgICAgdltpXSA9IDA7XG5cdGZvcihpID0gMDsgaSA8IHgubGVuZ3RoOyBpKyspXG5cdCAgICB4W2ldID0gMDtcblxuXHQvLyBHZW5lcmF0ZSBjb3VudHMgZm9yIGVhY2ggYml0IGxlbmd0aFxuXHRlbCA9IG4gPiAyNTYgPyBiWzI1Nl0gOiB0aGlzLkJNQVg7IC8vIHNldCBsZW5ndGggb2YgRU9CIGNvZGUsIGlmIGFueVxuXHRwID0gYjsgcGlkeCA9IDA7XG5cdGkgPSBuO1xuXHRkbyB7XG5cdCAgICBjW3BbcGlkeF1dKys7XHQvLyBhc3N1bWUgYWxsIGVudHJpZXMgPD0gQk1BWFxuXHQgICAgcGlkeCsrO1xuXHR9IHdoaWxlKC0taSA+IDApO1xuXHRpZihjWzBdID09IG4pIHtcdC8vIG51bGwgaW5wdXQtLWFsbCB6ZXJvIGxlbmd0aCBjb2Rlc1xuXHQgICAgdGhpcy5yb290ID0gbnVsbDtcblx0ICAgIHRoaXMubSA9IDA7XG5cdCAgICB0aGlzLnN0YXR1cyA9IDA7XG5cdCAgICByZXR1cm47XG5cdH1cblxuXHQvLyBGaW5kIG1pbmltdW0gYW5kIG1heGltdW0gbGVuZ3RoLCBib3VuZCAqbSBieSB0aG9zZVxuXHRmb3IoaiA9IDE7IGogPD0gdGhpcy5CTUFYOyBqKyspXG5cdCAgICBpZihjW2pdICE9IDApXG5cdFx0YnJlYWs7XG5cdGsgPSBqO1x0XHRcdC8vIG1pbmltdW0gY29kZSBsZW5ndGhcblx0aWYobW0gPCBqKVxuXHQgICAgbW0gPSBqO1xuXHRmb3IoaSA9IHRoaXMuQk1BWDsgaSAhPSAwOyBpLS0pXG5cdCAgICBpZihjW2ldICE9IDApXG5cdFx0YnJlYWs7XG5cdGcgPSBpO1x0XHRcdC8vIG1heGltdW0gY29kZSBsZW5ndGhcblx0aWYobW0gPiBpKVxuXHQgICAgbW0gPSBpO1xuXG5cdC8vIEFkanVzdCBsYXN0IGxlbmd0aCBjb3VudCB0byBmaWxsIG91dCBjb2RlcywgaWYgbmVlZGVkXG5cdGZvcih5ID0gMSA8PCBqOyBqIDwgaTsgaisrLCB5IDw8PSAxKVxuXHQgICAgaWYoKHkgLT0gY1tqXSkgPCAwKSB7XG5cdFx0dGhpcy5zdGF0dXMgPSAyO1x0Ly8gYmFkIGlucHV0OiBtb3JlIGNvZGVzIHRoYW4gYml0c1xuXHRcdHRoaXMubSA9IG1tO1xuXHRcdHJldHVybjtcblx0ICAgIH1cblx0aWYoKHkgLT0gY1tpXSkgPCAwKSB7XG5cdCAgICB0aGlzLnN0YXR1cyA9IDI7XG5cdCAgICB0aGlzLm0gPSBtbTtcblx0ICAgIHJldHVybjtcblx0fVxuXHRjW2ldICs9IHk7XG5cblx0Ly8gR2VuZXJhdGUgc3RhcnRpbmcgb2Zmc2V0cyBpbnRvIHRoZSB2YWx1ZSB0YWJsZSBmb3IgZWFjaCBsZW5ndGhcblx0eFsxXSA9IGogPSAwO1xuXHRwID0gYztcblx0cGlkeCA9IDE7XG5cdHhwID0gMjtcblx0d2hpbGUoLS1pID4gMClcdFx0Ly8gbm90ZSB0aGF0IGkgPT0gZyBmcm9tIGFib3ZlXG5cdCAgICB4W3hwKytdID0gKGogKz0gcFtwaWR4KytdKTtcblxuXHQvLyBNYWtlIGEgdGFibGUgb2YgdmFsdWVzIGluIG9yZGVyIG9mIGJpdCBsZW5ndGhzXG5cdHAgPSBiOyBwaWR4ID0gMDtcblx0aSA9IDA7XG5cdGRvIHtcblx0ICAgIGlmKChqID0gcFtwaWR4KytdKSAhPSAwKVxuXHRcdHZbeFtqXSsrXSA9IGk7XG5cdH0gd2hpbGUoKytpIDwgbik7XG5cdG4gPSB4W2ddO1x0XHRcdC8vIHNldCBuIHRvIGxlbmd0aCBvZiB2XG5cblx0Ly8gR2VuZXJhdGUgdGhlIEh1ZmZtYW4gY29kZXMgYW5kIGZvciBlYWNoLCBtYWtlIHRoZSB0YWJsZSBlbnRyaWVzXG5cdHhbMF0gPSBpID0gMDtcdFx0Ly8gZmlyc3QgSHVmZm1hbiBjb2RlIGlzIHplcm9cblx0cCA9IHY7IHBpZHggPSAwO1x0XHQvLyBncmFiIHZhbHVlcyBpbiBiaXQgb3JkZXJcblx0aCA9IC0xO1x0XHRcdC8vIG5vIHRhYmxlcyB5ZXQtLWxldmVsIC0xXG5cdHcgPSBseFswXSA9IDA7XHRcdC8vIG5vIGJpdHMgZGVjb2RlZCB5ZXRcblx0cSA9IG51bGw7XHRcdFx0Ly8gZGl0dG9cblx0eiA9IDA7XHRcdFx0Ly8gZGl0dG9cblxuXHQvLyBnbyB0aHJvdWdoIHRoZSBiaXQgbGVuZ3RocyAoayBhbHJlYWR5IGlzIGJpdHMgaW4gc2hvcnRlc3QgY29kZSlcblx0Zm9yKDsgayA8PSBnOyBrKyspIHtcblx0ICAgIGEgPSBjW2tdO1xuXHQgICAgd2hpbGUoYS0tID4gMCkge1xuXHRcdC8vIGhlcmUgaSBpcyB0aGUgSHVmZm1hbiBjb2RlIG9mIGxlbmd0aCBrIGJpdHMgZm9yIHZhbHVlIHBbcGlkeF1cblx0XHQvLyBtYWtlIHRhYmxlcyB1cCB0byByZXF1aXJlZCBsZXZlbFxuXHRcdHdoaWxlKGsgPiB3ICsgbHhbMSArIGhdKSB7XG5cdFx0ICAgIHcgKz0gbHhbMSArIGhdOyAvLyBhZGQgYml0cyBhbHJlYWR5IGRlY29kZWRcblx0XHQgICAgaCsrO1xuXG5cdFx0ICAgIC8vIGNvbXB1dGUgbWluaW11bSBzaXplIHRhYmxlIGxlc3MgdGhhbiBvciBlcXVhbCB0byAqbSBiaXRzXG5cdFx0ICAgIHogPSAoeiA9IGcgLSB3KSA+IG1tID8gbW0gOiB6OyAvLyB1cHBlciBsaW1pdFxuXHRcdCAgICBpZigoZiA9IDEgPDwgKGogPSBrIC0gdykpID4gYSArIDEpIHsgLy8gdHJ5IGEgay13IGJpdCB0YWJsZVxuXHRcdFx0Ly8gdG9vIGZldyBjb2RlcyBmb3Igay13IGJpdCB0YWJsZVxuXHRcdFx0ZiAtPSBhICsgMTtcdC8vIGRlZHVjdCBjb2RlcyBmcm9tIHBhdHRlcm5zIGxlZnRcblx0XHRcdHhwID0gaztcblx0XHRcdHdoaWxlKCsraiA8IHopIHsgLy8gdHJ5IHNtYWxsZXIgdGFibGVzIHVwIHRvIHogYml0c1xuXHRcdFx0ICAgIGlmKChmIDw8PSAxKSA8PSBjWysreHBdKVxuXHRcdFx0XHRicmVhaztcdC8vIGVub3VnaCBjb2RlcyB0byB1c2UgdXAgaiBiaXRzXG5cdFx0XHQgICAgZiAtPSBjW3hwXTtcdC8vIGVsc2UgZGVkdWN0IGNvZGVzIGZyb20gcGF0dGVybnNcblx0XHRcdH1cblx0XHQgICAgfVxuXHRcdCAgICBpZih3ICsgaiA+IGVsICYmIHcgPCBlbClcblx0XHRcdGogPSBlbCAtIHc7XHQvLyBtYWtlIEVPQiBjb2RlIGVuZCBhdCB0YWJsZVxuXHRcdCAgICB6ID0gMSA8PCBqO1x0Ly8gdGFibGUgZW50cmllcyBmb3Igai1iaXQgdGFibGVcblx0XHQgICAgbHhbMSArIGhdID0gajsgLy8gc2V0IHRhYmxlIHNpemUgaW4gc3RhY2tcblxuXHRcdCAgICAvLyBhbGxvY2F0ZSBhbmQgbGluayBpbiBuZXcgdGFibGVcblx0XHQgICAgcSA9IG5ldyBBcnJheSh6KTtcblx0XHQgICAgZm9yKG8gPSAwOyBvIDwgejsgbysrKSB7XG5cdFx0XHRxW29dID0gbmV3IHppcF9IdWZ0Tm9kZSgpO1xuXHRcdCAgICB9XG5cblx0XHQgICAgaWYodGFpbCA9PSBudWxsKVxuXHRcdFx0dGFpbCA9IHRoaXMucm9vdCA9IG5ldyB6aXBfSHVmdExpc3QoKTtcblx0XHQgICAgZWxzZVxuXHRcdFx0dGFpbCA9IHRhaWwubmV4dCA9IG5ldyB6aXBfSHVmdExpc3QoKTtcblx0XHQgICAgdGFpbC5uZXh0ID0gbnVsbDtcblx0XHQgICAgdGFpbC5saXN0ID0gcTtcblx0XHQgICAgdVtoXSA9IHE7XHQvLyB0YWJsZSBzdGFydHMgYWZ0ZXIgbGlua1xuXG5cdFx0ICAgIC8qIGNvbm5lY3QgdG8gbGFzdCB0YWJsZSwgaWYgdGhlcmUgaXMgb25lICovXG5cdFx0ICAgIGlmKGggPiAwKSB7XG5cdFx0XHR4W2hdID0gaTtcdFx0Ly8gc2F2ZSBwYXR0ZXJuIGZvciBiYWNraW5nIHVwXG5cdFx0XHRyLmIgPSBseFtoXTtcdC8vIGJpdHMgdG8gZHVtcCBiZWZvcmUgdGhpcyB0YWJsZVxuXHRcdFx0ci5lID0gMTYgKyBqO1x0Ly8gYml0cyBpbiB0aGlzIHRhYmxlXG5cdFx0XHRyLnQgPSBxO1x0XHQvLyBwb2ludGVyIHRvIHRoaXMgdGFibGVcblx0XHRcdGogPSAoaSAmICgoMSA8PCB3KSAtIDEpKSA+PiAodyAtIGx4W2hdKTtcblx0XHRcdHVbaC0xXVtqXS5lID0gci5lO1xuXHRcdFx0dVtoLTFdW2pdLmIgPSByLmI7XG5cdFx0XHR1W2gtMV1bal0ubiA9IHIubjtcblx0XHRcdHVbaC0xXVtqXS50ID0gci50O1xuXHRcdCAgICB9XG5cdFx0fVxuXG5cdFx0Ly8gc2V0IHVwIHRhYmxlIGVudHJ5IGluIHJcblx0XHRyLmIgPSBrIC0gdztcblx0XHRpZihwaWR4ID49IG4pXG5cdFx0ICAgIHIuZSA9IDk5O1x0XHQvLyBvdXQgb2YgdmFsdWVzLS1pbnZhbGlkIGNvZGVcblx0XHRlbHNlIGlmKHBbcGlkeF0gPCBzKSB7XG5cdFx0ICAgIHIuZSA9IChwW3BpZHhdIDwgMjU2ID8gMTYgOiAxNSk7IC8vIDI1NiBpcyBlbmQtb2YtYmxvY2sgY29kZVxuXHRcdCAgICByLm4gPSBwW3BpZHgrK107XHQvLyBzaW1wbGUgY29kZSBpcyBqdXN0IHRoZSB2YWx1ZVxuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIHIuZSA9IGVbcFtwaWR4XSAtIHNdO1x0Ly8gbm9uLXNpbXBsZS0tbG9vayB1cCBpbiBsaXN0c1xuXHRcdCAgICByLm4gPSBkW3BbcGlkeCsrXSAtIHNdO1xuXHRcdH1cblxuXHRcdC8vIGZpbGwgY29kZS1saWtlIGVudHJpZXMgd2l0aCByIC8vXG5cdFx0ZiA9IDEgPDwgKGsgLSB3KTtcblx0XHRmb3IoaiA9IGkgPj4gdzsgaiA8IHo7IGogKz0gZikge1xuXHRcdCAgICBxW2pdLmUgPSByLmU7XG5cdFx0ICAgIHFbal0uYiA9IHIuYjtcblx0XHQgICAgcVtqXS5uID0gci5uO1xuXHRcdCAgICBxW2pdLnQgPSByLnQ7XG5cdFx0fVxuXG5cdFx0Ly8gYmFja3dhcmRzIGluY3JlbWVudCB0aGUgay1iaXQgY29kZSBpXG5cdFx0Zm9yKGogPSAxIDw8IChrIC0gMSk7IChpICYgaikgIT0gMDsgaiA+Pj0gMSlcblx0XHQgICAgaSBePSBqO1xuXHRcdGkgXj0gajtcblxuXHRcdC8vIGJhY2t1cCBvdmVyIGZpbmlzaGVkIHRhYmxlc1xuXHRcdHdoaWxlKChpICYgKCgxIDw8IHcpIC0gMSkpICE9IHhbaF0pIHtcblx0XHQgICAgdyAtPSBseFtoXTtcdFx0Ly8gZG9uJ3QgbmVlZCB0byB1cGRhdGUgcVxuXHRcdCAgICBoLS07XG5cdFx0fVxuXHQgICAgfVxuXHR9XG5cblx0LyogcmV0dXJuIGFjdHVhbCBzaXplIG9mIGJhc2UgdGFibGUgKi9cblx0dGhpcy5tID0gbHhbMV07XG5cblx0LyogUmV0dXJuIHRydWUgKDEpIGlmIHdlIHdlcmUgZ2l2ZW4gYW4gaW5jb21wbGV0ZSB0YWJsZSAqL1xuXHR0aGlzLnN0YXR1cyA9ICgoeSAhPSAwICYmIGcgIT0gMSkgPyAxIDogMCk7XG4gICAgfSAvKiBlbmQgb2YgY29uc3RydWN0b3IgKi9cbn1cblxuXG4vKiByb3V0aW5lcyAoaW5mbGF0ZSkgKi9cblxudmFyIHppcF9HRVRfQllURSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmKHppcF9pbmZsYXRlX2RhdGEubGVuZ3RoID09IHppcF9pbmZsYXRlX3Bvcylcblx0cmV0dXJuIC0xO1xuICAgIHJldHVybiB6aXBfaW5mbGF0ZV9kYXRhLmNoYXJDb2RlQXQoemlwX2luZmxhdGVfcG9zKyspICYgMHhmZjtcbn1cblxudmFyIHppcF9ORUVEQklUUyA9IGZ1bmN0aW9uKG4pIHtcbiAgICB3aGlsZSh6aXBfYml0X2xlbiA8IG4pIHtcblx0emlwX2JpdF9idWYgfD0gemlwX0dFVF9CWVRFKCkgPDwgemlwX2JpdF9sZW47XG5cdHppcF9iaXRfbGVuICs9IDg7XG4gICAgfVxufVxuXG52YXIgemlwX0dFVEJJVFMgPSBmdW5jdGlvbihuKSB7XG4gICAgcmV0dXJuIHppcF9iaXRfYnVmICYgemlwX01BU0tfQklUU1tuXTtcbn1cblxudmFyIHppcF9EVU1QQklUUyA9IGZ1bmN0aW9uKG4pIHtcbiAgICB6aXBfYml0X2J1ZiA+Pj0gbjtcbiAgICB6aXBfYml0X2xlbiAtPSBuO1xufVxuXG52YXIgemlwX2luZmxhdGVfY29kZXMgPSBmdW5jdGlvbihidWZmLCBvZmYsIHNpemUpIHtcbiAgICAvKiBpbmZsYXRlIChkZWNvbXByZXNzKSB0aGUgY29kZXMgaW4gYSBkZWZsYXRlZCAoY29tcHJlc3NlZCkgYmxvY2suXG4gICAgICAgUmV0dXJuIGFuIGVycm9yIGNvZGUgb3IgemVybyBpZiBpdCBhbGwgZ29lcyBvay4gKi9cbiAgICB2YXIgZTtcdFx0Ly8gdGFibGUgZW50cnkgZmxhZy9udW1iZXIgb2YgZXh0cmEgYml0c1xuICAgIHZhciB0O1x0XHQvLyAoemlwX0h1ZnROb2RlKSBwb2ludGVyIHRvIHRhYmxlIGVudHJ5XG4gICAgdmFyIG47XG5cbiAgICBpZihzaXplID09IDApXG4gICAgICByZXR1cm4gMDtcblxuICAgIC8vIGluZmxhdGUgdGhlIGNvZGVkIGRhdGFcbiAgICBuID0gMDtcbiAgICBmb3IoOzspIHtcdFx0XHQvLyBkbyB1bnRpbCBlbmQgb2YgYmxvY2tcblx0emlwX05FRURCSVRTKHppcF9ibCk7XG5cdHQgPSB6aXBfdGwubGlzdFt6aXBfR0VUQklUUyh6aXBfYmwpXTtcblx0ZSA9IHQuZTtcblx0d2hpbGUoZSA+IDE2KSB7XG5cdCAgICBpZihlID09IDk5KVxuXHRcdHJldHVybiAtMTtcblx0ICAgIHppcF9EVU1QQklUUyh0LmIpO1xuXHQgICAgZSAtPSAxNjtcblx0ICAgIHppcF9ORUVEQklUUyhlKTtcblx0ICAgIHQgPSB0LnRbemlwX0dFVEJJVFMoZSldO1xuXHQgICAgZSA9IHQuZTtcblx0fVxuXHR6aXBfRFVNUEJJVFModC5iKTtcblxuXHRpZihlID09IDE2KSB7XHRcdC8vIHRoZW4gaXQncyBhIGxpdGVyYWxcblx0ICAgIHppcF93cCAmPSB6aXBfV1NJWkUgLSAxO1xuXHQgICAgYnVmZltvZmYgKyBuKytdID0gemlwX3NsaWRlW3ppcF93cCsrXSA9IHQubjtcblx0ICAgIGlmKG4gPT0gc2l6ZSlcblx0XHRyZXR1cm4gc2l6ZTtcblx0ICAgIGNvbnRpbnVlO1xuXHR9XG5cblx0Ly8gZXhpdCBpZiBlbmQgb2YgYmxvY2tcblx0aWYoZSA9PSAxNSlcblx0ICAgIGJyZWFrO1xuXG5cdC8vIGl0J3MgYW4gRU9CIG9yIGEgbGVuZ3RoXG5cblx0Ly8gZ2V0IGxlbmd0aCBvZiBibG9jayB0byBjb3B5XG5cdHppcF9ORUVEQklUUyhlKTtcblx0emlwX2NvcHlfbGVuZyA9IHQubiArIHppcF9HRVRCSVRTKGUpO1xuXHR6aXBfRFVNUEJJVFMoZSk7XG5cblx0Ly8gZGVjb2RlIGRpc3RhbmNlIG9mIGJsb2NrIHRvIGNvcHlcblx0emlwX05FRURCSVRTKHppcF9iZCk7XG5cdHQgPSB6aXBfdGQubGlzdFt6aXBfR0VUQklUUyh6aXBfYmQpXTtcblx0ZSA9IHQuZTtcblxuXHR3aGlsZShlID4gMTYpIHtcblx0ICAgIGlmKGUgPT0gOTkpXG5cdFx0cmV0dXJuIC0xO1xuXHQgICAgemlwX0RVTVBCSVRTKHQuYik7XG5cdCAgICBlIC09IDE2O1xuXHQgICAgemlwX05FRURCSVRTKGUpO1xuXHQgICAgdCA9IHQudFt6aXBfR0VUQklUUyhlKV07XG5cdCAgICBlID0gdC5lO1xuXHR9XG5cdHppcF9EVU1QQklUUyh0LmIpO1xuXHR6aXBfTkVFREJJVFMoZSk7XG5cdHppcF9jb3B5X2Rpc3QgPSB6aXBfd3AgLSB0Lm4gLSB6aXBfR0VUQklUUyhlKTtcblx0emlwX0RVTVBCSVRTKGUpO1xuXG5cdC8vIGRvIHRoZSBjb3B5XG5cdHdoaWxlKHppcF9jb3B5X2xlbmcgPiAwICYmIG4gPCBzaXplKSB7XG5cdCAgICB6aXBfY29weV9sZW5nLS07XG5cdCAgICB6aXBfY29weV9kaXN0ICY9IHppcF9XU0laRSAtIDE7XG5cdCAgICB6aXBfd3AgJj0gemlwX1dTSVpFIC0gMTtcblx0ICAgIGJ1ZmZbb2ZmICsgbisrXSA9IHppcF9zbGlkZVt6aXBfd3ArK11cblx0XHQ9IHppcF9zbGlkZVt6aXBfY29weV9kaXN0KytdO1xuXHR9XG5cblx0aWYobiA9PSBzaXplKVxuXHQgICAgcmV0dXJuIHNpemU7XG4gICAgfVxuXG4gICAgemlwX21ldGhvZCA9IC0xOyAvLyBkb25lXG4gICAgcmV0dXJuIG47XG59XG5cbnZhciB6aXBfaW5mbGF0ZV9zdG9yZWQgPSBmdW5jdGlvbihidWZmLCBvZmYsIHNpemUpIHtcbiAgICAvKiBcImRlY29tcHJlc3NcIiBhbiBpbmZsYXRlZCB0eXBlIDAgKHN0b3JlZCkgYmxvY2suICovXG4gICAgdmFyIG47XG5cbiAgICAvLyBnbyB0byBieXRlIGJvdW5kYXJ5XG4gICAgbiA9IHppcF9iaXRfbGVuICYgNztcbiAgICB6aXBfRFVNUEJJVFMobik7XG5cbiAgICAvLyBnZXQgdGhlIGxlbmd0aCBhbmQgaXRzIGNvbXBsZW1lbnRcbiAgICB6aXBfTkVFREJJVFMoMTYpO1xuICAgIG4gPSB6aXBfR0VUQklUUygxNik7XG4gICAgemlwX0RVTVBCSVRTKDE2KTtcbiAgICB6aXBfTkVFREJJVFMoMTYpO1xuICAgIGlmKG4gIT0gKCh+emlwX2JpdF9idWYpICYgMHhmZmZmKSlcblx0cmV0dXJuIC0xO1x0XHRcdC8vIGVycm9yIGluIGNvbXByZXNzZWQgZGF0YVxuICAgIHppcF9EVU1QQklUUygxNik7XG5cbiAgICAvLyByZWFkIGFuZCBvdXRwdXQgdGhlIGNvbXByZXNzZWQgZGF0YVxuICAgIHppcF9jb3B5X2xlbmcgPSBuO1xuXG4gICAgbiA9IDA7XG4gICAgd2hpbGUoemlwX2NvcHlfbGVuZyA+IDAgJiYgbiA8IHNpemUpIHtcblx0emlwX2NvcHlfbGVuZy0tO1xuXHR6aXBfd3AgJj0gemlwX1dTSVpFIC0gMTtcblx0emlwX05FRURCSVRTKDgpO1xuXHRidWZmW29mZiArIG4rK10gPSB6aXBfc2xpZGVbemlwX3dwKytdID1cblx0ICAgIHppcF9HRVRCSVRTKDgpO1xuXHR6aXBfRFVNUEJJVFMoOCk7XG4gICAgfVxuXG4gICAgaWYoemlwX2NvcHlfbGVuZyA9PSAwKVxuICAgICAgemlwX21ldGhvZCA9IC0xOyAvLyBkb25lXG4gICAgcmV0dXJuIG47XG59XG5cbnZhciB6aXBfaW5mbGF0ZV9maXhlZCA9IGZ1bmN0aW9uKGJ1ZmYsIG9mZiwgc2l6ZSkge1xuICAgIC8qIGRlY29tcHJlc3MgYW4gaW5mbGF0ZWQgdHlwZSAxIChmaXhlZCBIdWZmbWFuIGNvZGVzKSBibG9jay4gIFdlIHNob3VsZFxuICAgICAgIGVpdGhlciByZXBsYWNlIHRoaXMgd2l0aCBhIGN1c3RvbSBkZWNvZGVyLCBvciBhdCBsZWFzdCBwcmVjb21wdXRlIHRoZVxuICAgICAgIEh1ZmZtYW4gdGFibGVzLiAqL1xuXG4gICAgLy8gaWYgZmlyc3QgdGltZSwgc2V0IHVwIHRhYmxlcyBmb3IgZml4ZWQgYmxvY2tzXG4gICAgaWYoemlwX2ZpeGVkX3RsID09IG51bGwpIHtcblx0dmFyIGk7XHRcdFx0Ly8gdGVtcG9yYXJ5IHZhcmlhYmxlXG5cdHZhciBsID0gbmV3IEFycmF5KDI4OCk7XHQvLyBsZW5ndGggbGlzdCBmb3IgaHVmdF9idWlsZFxuXHR2YXIgaDtcdC8vIHppcF9IdWZ0QnVpbGRcblxuXHQvLyBsaXRlcmFsIHRhYmxlXG5cdGZvcihpID0gMDsgaSA8IDE0NDsgaSsrKVxuXHQgICAgbFtpXSA9IDg7XG5cdGZvcig7IGkgPCAyNTY7IGkrKylcblx0ICAgIGxbaV0gPSA5O1xuXHRmb3IoOyBpIDwgMjgwOyBpKyspXG5cdCAgICBsW2ldID0gNztcblx0Zm9yKDsgaSA8IDI4ODsgaSsrKVx0Ly8gbWFrZSBhIGNvbXBsZXRlLCBidXQgd3JvbmcgY29kZSBzZXRcblx0ICAgIGxbaV0gPSA4O1xuXHR6aXBfZml4ZWRfYmwgPSA3O1xuXG5cdGggPSBuZXcgemlwX0h1ZnRCdWlsZChsLCAyODgsIDI1NywgemlwX2NwbGVucywgemlwX2NwbGV4dCxcblx0XHRcdCAgICAgIHppcF9maXhlZF9ibCk7XG5cdGlmKGguc3RhdHVzICE9IDApIHtcblx0ICAgIGFsZXJ0KFwiSHVmQnVpbGQgZXJyb3I6IFwiK2guc3RhdHVzKTtcblx0ICAgIHJldHVybiAtMTtcblx0fVxuXHR6aXBfZml4ZWRfdGwgPSBoLnJvb3Q7XG5cdHppcF9maXhlZF9ibCA9IGgubTtcblxuXHQvLyBkaXN0YW5jZSB0YWJsZVxuXHRmb3IoaSA9IDA7IGkgPCAzMDsgaSsrKVx0Ly8gbWFrZSBhbiBpbmNvbXBsZXRlIGNvZGUgc2V0XG5cdCAgICBsW2ldID0gNTtcblx0emlwX2ZpeGVkX2JkID0gNTtcblxuXHRoID0gbmV3IHppcF9IdWZ0QnVpbGQobCwgMzAsIDAsIHppcF9jcGRpc3QsIHppcF9jcGRleHQsIHppcF9maXhlZF9iZCk7XG5cdGlmKGguc3RhdHVzID4gMSkge1xuXHQgICAgemlwX2ZpeGVkX3RsID0gbnVsbDtcblx0ICAgIGFsZXJ0KFwiSHVmQnVpbGQgZXJyb3I6IFwiK2guc3RhdHVzKTtcblx0ICAgIHJldHVybiAtMTtcblx0fVxuXHR6aXBfZml4ZWRfdGQgPSBoLnJvb3Q7XG5cdHppcF9maXhlZF9iZCA9IGgubTtcbiAgICB9XG5cbiAgICB6aXBfdGwgPSB6aXBfZml4ZWRfdGw7XG4gICAgemlwX3RkID0gemlwX2ZpeGVkX3RkO1xuICAgIHppcF9ibCA9IHppcF9maXhlZF9ibDtcbiAgICB6aXBfYmQgPSB6aXBfZml4ZWRfYmQ7XG4gICAgcmV0dXJuIHppcF9pbmZsYXRlX2NvZGVzKGJ1ZmYsIG9mZiwgc2l6ZSk7XG59XG5cbnZhciB6aXBfaW5mbGF0ZV9keW5hbWljID0gZnVuY3Rpb24oYnVmZiwgb2ZmLCBzaXplKSB7XG4gICAgLy8gZGVjb21wcmVzcyBhbiBpbmZsYXRlZCB0eXBlIDIgKGR5bmFtaWMgSHVmZm1hbiBjb2RlcykgYmxvY2suXG4gICAgdmFyIGk7XHRcdC8vIHRlbXBvcmFyeSB2YXJpYWJsZXNcbiAgICB2YXIgajtcbiAgICB2YXIgbDtcdFx0Ly8gbGFzdCBsZW5ndGhcbiAgICB2YXIgbjtcdFx0Ly8gbnVtYmVyIG9mIGxlbmd0aHMgdG8gZ2V0XG4gICAgdmFyIHQ7XHRcdC8vICh6aXBfSHVmdE5vZGUpIGxpdGVyYWwvbGVuZ3RoIGNvZGUgdGFibGVcbiAgICB2YXIgbmI7XHRcdC8vIG51bWJlciBvZiBiaXQgbGVuZ3RoIGNvZGVzXG4gICAgdmFyIG5sO1x0XHQvLyBudW1iZXIgb2YgbGl0ZXJhbC9sZW5ndGggY29kZXNcbiAgICB2YXIgbmQ7XHRcdC8vIG51bWJlciBvZiBkaXN0YW5jZSBjb2Rlc1xuICAgIHZhciBsbCA9IG5ldyBBcnJheSgyODYrMzApOyAvLyBsaXRlcmFsL2xlbmd0aCBhbmQgZGlzdGFuY2UgY29kZSBsZW5ndGhzXG4gICAgdmFyIGg7XHRcdC8vICh6aXBfSHVmdEJ1aWxkKVxuXG4gICAgZm9yKGkgPSAwOyBpIDwgbGwubGVuZ3RoOyBpKyspXG5cdGxsW2ldID0gMDtcblxuICAgIC8vIHJlYWQgaW4gdGFibGUgbGVuZ3Roc1xuICAgIHppcF9ORUVEQklUUyg1KTtcbiAgICBubCA9IDI1NyArIHppcF9HRVRCSVRTKDUpO1x0Ly8gbnVtYmVyIG9mIGxpdGVyYWwvbGVuZ3RoIGNvZGVzXG4gICAgemlwX0RVTVBCSVRTKDUpO1xuICAgIHppcF9ORUVEQklUUyg1KTtcbiAgICBuZCA9IDEgKyB6aXBfR0VUQklUUyg1KTtcdC8vIG51bWJlciBvZiBkaXN0YW5jZSBjb2Rlc1xuICAgIHppcF9EVU1QQklUUyg1KTtcbiAgICB6aXBfTkVFREJJVFMoNCk7XG4gICAgbmIgPSA0ICsgemlwX0dFVEJJVFMoNCk7XHQvLyBudW1iZXIgb2YgYml0IGxlbmd0aCBjb2Rlc1xuICAgIHppcF9EVU1QQklUUyg0KTtcbiAgICBpZihubCA+IDI4NiB8fCBuZCA+IDMwKVxuICAgICAgcmV0dXJuIC0xO1x0XHQvLyBiYWQgbGVuZ3Roc1xuXG4gICAgLy8gcmVhZCBpbiBiaXQtbGVuZ3RoLWNvZGUgbGVuZ3Roc1xuICAgIGZvcihqID0gMDsgaiA8IG5iOyBqKyspXG4gICAge1xuXHR6aXBfTkVFREJJVFMoMyk7XG5cdGxsW3ppcF9ib3JkZXJbal1dID0gemlwX0dFVEJJVFMoMyk7XG5cdHppcF9EVU1QQklUUygzKTtcbiAgICB9XG4gICAgZm9yKDsgaiA8IDE5OyBqKyspXG5cdGxsW3ppcF9ib3JkZXJbal1dID0gMDtcblxuICAgIC8vIGJ1aWxkIGRlY29kaW5nIHRhYmxlIGZvciB0cmVlcy0tc2luZ2xlIGxldmVsLCA3IGJpdCBsb29rdXBcbiAgICB6aXBfYmwgPSA3O1xuICAgIGggPSBuZXcgemlwX0h1ZnRCdWlsZChsbCwgMTksIDE5LCBudWxsLCBudWxsLCB6aXBfYmwpO1xuICAgIGlmKGguc3RhdHVzICE9IDApXG5cdHJldHVybiAtMTtcdC8vIGluY29tcGxldGUgY29kZSBzZXRcblxuICAgIHppcF90bCA9IGgucm9vdDtcbiAgICB6aXBfYmwgPSBoLm07XG5cbiAgICAvLyByZWFkIGluIGxpdGVyYWwgYW5kIGRpc3RhbmNlIGNvZGUgbGVuZ3Roc1xuICAgIG4gPSBubCArIG5kO1xuICAgIGkgPSBsID0gMDtcbiAgICB3aGlsZShpIDwgbikge1xuXHR6aXBfTkVFREJJVFMoemlwX2JsKTtcblx0dCA9IHppcF90bC5saXN0W3ppcF9HRVRCSVRTKHppcF9ibCldO1xuXHRqID0gdC5iO1xuXHR6aXBfRFVNUEJJVFMoaik7XG5cdGogPSB0Lm47XG5cdGlmKGogPCAxNilcdFx0Ly8gbGVuZ3RoIG9mIGNvZGUgaW4gYml0cyAoMC4uMTUpXG5cdCAgICBsbFtpKytdID0gbCA9IGo7XHQvLyBzYXZlIGxhc3QgbGVuZ3RoIGluIGxcblx0ZWxzZSBpZihqID09IDE2KSB7XHQvLyByZXBlYXQgbGFzdCBsZW5ndGggMyB0byA2IHRpbWVzXG5cdCAgICB6aXBfTkVFREJJVFMoMik7XG5cdCAgICBqID0gMyArIHppcF9HRVRCSVRTKDIpO1xuXHQgICAgemlwX0RVTVBCSVRTKDIpO1xuXHQgICAgaWYoaSArIGogPiBuKVxuXHRcdHJldHVybiAtMTtcblx0ICAgIHdoaWxlKGotLSA+IDApXG5cdFx0bGxbaSsrXSA9IGw7XG5cdH0gZWxzZSBpZihqID09IDE3KSB7XHQvLyAzIHRvIDEwIHplcm8gbGVuZ3RoIGNvZGVzXG5cdCAgICB6aXBfTkVFREJJVFMoMyk7XG5cdCAgICBqID0gMyArIHppcF9HRVRCSVRTKDMpO1xuXHQgICAgemlwX0RVTVBCSVRTKDMpO1xuXHQgICAgaWYoaSArIGogPiBuKVxuXHRcdHJldHVybiAtMTtcblx0ICAgIHdoaWxlKGotLSA+IDApXG5cdFx0bGxbaSsrXSA9IDA7XG5cdCAgICBsID0gMDtcblx0fSBlbHNlIHtcdFx0Ly8gaiA9PSAxODogMTEgdG8gMTM4IHplcm8gbGVuZ3RoIGNvZGVzXG5cdCAgICB6aXBfTkVFREJJVFMoNyk7XG5cdCAgICBqID0gMTEgKyB6aXBfR0VUQklUUyg3KTtcblx0ICAgIHppcF9EVU1QQklUUyg3KTtcblx0ICAgIGlmKGkgKyBqID4gbilcblx0XHRyZXR1cm4gLTE7XG5cdCAgICB3aGlsZShqLS0gPiAwKVxuXHRcdGxsW2krK10gPSAwO1xuXHQgICAgbCA9IDA7XG5cdH1cbiAgICB9XG5cbiAgICAvLyBidWlsZCB0aGUgZGVjb2RpbmcgdGFibGVzIGZvciBsaXRlcmFsL2xlbmd0aCBhbmQgZGlzdGFuY2UgY29kZXNcbiAgICB6aXBfYmwgPSB6aXBfbGJpdHM7XG4gICAgaCA9IG5ldyB6aXBfSHVmdEJ1aWxkKGxsLCBubCwgMjU3LCB6aXBfY3BsZW5zLCB6aXBfY3BsZXh0LCB6aXBfYmwpO1xuICAgIGlmKHppcF9ibCA9PSAwKVx0Ly8gbm8gbGl0ZXJhbHMgb3IgbGVuZ3Roc1xuXHRoLnN0YXR1cyA9IDE7XG4gICAgaWYoaC5zdGF0dXMgIT0gMCkge1xuXHRpZihoLnN0YXR1cyA9PSAxKVxuXHQgICAgOy8vICoqaW5jb21wbGV0ZSBsaXRlcmFsIHRyZWUqKlxuXHRyZXR1cm4gLTE7XHRcdC8vIGluY29tcGxldGUgY29kZSBzZXRcbiAgICB9XG4gICAgemlwX3RsID0gaC5yb290O1xuICAgIHppcF9ibCA9IGgubTtcblxuICAgIGZvcihpID0gMDsgaSA8IG5kOyBpKyspXG5cdGxsW2ldID0gbGxbaSArIG5sXTtcbiAgICB6aXBfYmQgPSB6aXBfZGJpdHM7XG4gICAgaCA9IG5ldyB6aXBfSHVmdEJ1aWxkKGxsLCBuZCwgMCwgemlwX2NwZGlzdCwgemlwX2NwZGV4dCwgemlwX2JkKTtcbiAgICB6aXBfdGQgPSBoLnJvb3Q7XG4gICAgemlwX2JkID0gaC5tO1xuXG4gICAgaWYoemlwX2JkID09IDAgJiYgbmwgPiAyNTcpIHsgICAvLyBsZW5ndGhzIGJ1dCBubyBkaXN0YW5jZXNcblx0Ly8gKippbmNvbXBsZXRlIGRpc3RhbmNlIHRyZWUqKlxuXHRyZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgaWYoaC5zdGF0dXMgPT0gMSkge1xuXHQ7Ly8gKippbmNvbXBsZXRlIGRpc3RhbmNlIHRyZWUqKlxuICAgIH1cbiAgICBpZihoLnN0YXR1cyAhPSAwKVxuXHRyZXR1cm4gLTE7XG5cbiAgICAvLyBkZWNvbXByZXNzIHVudGlsIGFuIGVuZC1vZi1ibG9jayBjb2RlXG4gICAgcmV0dXJuIHppcF9pbmZsYXRlX2NvZGVzKGJ1ZmYsIG9mZiwgc2l6ZSk7XG59XG5cbnZhciB6aXBfaW5mbGF0ZV9zdGFydCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBpO1xuXG4gICAgaWYoemlwX3NsaWRlID09IG51bGwpXG5cdHppcF9zbGlkZSA9IG5ldyBBcnJheSgyICogemlwX1dTSVpFKTtcbiAgICB6aXBfd3AgPSAwO1xuICAgIHppcF9iaXRfYnVmID0gMDtcbiAgICB6aXBfYml0X2xlbiA9IDA7XG4gICAgemlwX21ldGhvZCA9IC0xO1xuICAgIHppcF9lb2YgPSBmYWxzZTtcbiAgICB6aXBfY29weV9sZW5nID0gemlwX2NvcHlfZGlzdCA9IDA7XG4gICAgemlwX3RsID0gbnVsbDtcbn1cblxudmFyIHppcF9pbmZsYXRlX2ludGVybmFsID0gZnVuY3Rpb24oYnVmZiwgb2ZmLCBzaXplKSB7XG4gICAgLy8gZGVjb21wcmVzcyBhbiBpbmZsYXRlZCBlbnRyeVxuICAgIHZhciBuLCBpO1xuXG4gICAgbiA9IDA7XG4gICAgd2hpbGUobiA8IHNpemUpIHtcblx0aWYoemlwX2VvZiAmJiB6aXBfbWV0aG9kID09IC0xKVxuXHQgICAgcmV0dXJuIG47XG5cblx0aWYoemlwX2NvcHlfbGVuZyA+IDApIHtcblx0ICAgIGlmKHppcF9tZXRob2QgIT0gemlwX1NUT1JFRF9CTE9DSykge1xuXHRcdC8vIFNUQVRJQ19UUkVFUyBvciBEWU5fVFJFRVNcblx0XHR3aGlsZSh6aXBfY29weV9sZW5nID4gMCAmJiBuIDwgc2l6ZSkge1xuXHRcdCAgICB6aXBfY29weV9sZW5nLS07XG5cdFx0ICAgIHppcF9jb3B5X2Rpc3QgJj0gemlwX1dTSVpFIC0gMTtcblx0XHQgICAgemlwX3dwICY9IHppcF9XU0laRSAtIDE7XG5cdFx0ICAgIGJ1ZmZbb2ZmICsgbisrXSA9IHppcF9zbGlkZVt6aXBfd3ArK10gPVxuXHRcdFx0emlwX3NsaWRlW3ppcF9jb3B5X2Rpc3QrK107XG5cdFx0fVxuXHQgICAgfSBlbHNlIHtcblx0XHR3aGlsZSh6aXBfY29weV9sZW5nID4gMCAmJiBuIDwgc2l6ZSkge1xuXHRcdCAgICB6aXBfY29weV9sZW5nLS07XG5cdFx0ICAgIHppcF93cCAmPSB6aXBfV1NJWkUgLSAxO1xuXHRcdCAgICB6aXBfTkVFREJJVFMoOCk7XG5cdFx0ICAgIGJ1ZmZbb2ZmICsgbisrXSA9IHppcF9zbGlkZVt6aXBfd3ArK10gPSB6aXBfR0VUQklUUyg4KTtcblx0XHQgICAgemlwX0RVTVBCSVRTKDgpO1xuXHRcdH1cblx0XHRpZih6aXBfY29weV9sZW5nID09IDApXG5cdFx0ICAgIHppcF9tZXRob2QgPSAtMTsgLy8gZG9uZVxuXHQgICAgfVxuXHQgICAgaWYobiA9PSBzaXplKVxuXHRcdHJldHVybiBuO1xuXHR9XG5cblx0aWYoemlwX21ldGhvZCA9PSAtMSkge1xuXHQgICAgaWYoemlwX2VvZilcblx0XHRicmVhaztcblxuXHQgICAgLy8gcmVhZCBpbiBsYXN0IGJsb2NrIGJpdFxuXHQgICAgemlwX05FRURCSVRTKDEpO1xuXHQgICAgaWYoemlwX0dFVEJJVFMoMSkgIT0gMClcblx0XHR6aXBfZW9mID0gdHJ1ZTtcblx0ICAgIHppcF9EVU1QQklUUygxKTtcblxuXHQgICAgLy8gcmVhZCBpbiBibG9jayB0eXBlXG5cdCAgICB6aXBfTkVFREJJVFMoMik7XG5cdCAgICB6aXBfbWV0aG9kID0gemlwX0dFVEJJVFMoMik7XG5cdCAgICB6aXBfRFVNUEJJVFMoMik7XG5cdCAgICB6aXBfdGwgPSBudWxsO1xuXHQgICAgemlwX2NvcHlfbGVuZyA9IDA7XG5cdH1cblxuXHRzd2l0Y2goemlwX21ldGhvZCkge1xuXHQgIGNhc2UgMDogLy8gemlwX1NUT1JFRF9CTE9DS1xuXHQgICAgaSA9IHppcF9pbmZsYXRlX3N0b3JlZChidWZmLCBvZmYgKyBuLCBzaXplIC0gbik7XG5cdCAgICBicmVhaztcblxuXHQgIGNhc2UgMTogLy8gemlwX1NUQVRJQ19UUkVFU1xuXHQgICAgaWYoemlwX3RsICE9IG51bGwpXG5cdFx0aSA9IHppcF9pbmZsYXRlX2NvZGVzKGJ1ZmYsIG9mZiArIG4sIHNpemUgLSBuKTtcblx0ICAgIGVsc2Vcblx0XHRpID0gemlwX2luZmxhdGVfZml4ZWQoYnVmZiwgb2ZmICsgbiwgc2l6ZSAtIG4pO1xuXHQgICAgYnJlYWs7XG5cblx0ICBjYXNlIDI6IC8vIHppcF9EWU5fVFJFRVNcblx0ICAgIGlmKHppcF90bCAhPSBudWxsKVxuXHRcdGkgPSB6aXBfaW5mbGF0ZV9jb2RlcyhidWZmLCBvZmYgKyBuLCBzaXplIC0gbik7XG5cdCAgICBlbHNlXG5cdFx0aSA9IHppcF9pbmZsYXRlX2R5bmFtaWMoYnVmZiwgb2ZmICsgbiwgc2l6ZSAtIG4pO1xuXHQgICAgYnJlYWs7XG5cblx0ICBkZWZhdWx0OiAvLyBlcnJvclxuXHQgICAgaSA9IC0xO1xuXHQgICAgYnJlYWs7XG5cdH1cblxuXHRpZihpID09IC0xKSB7XG5cdCAgICBpZih6aXBfZW9mKVxuXHRcdHJldHVybiAwO1xuXHQgICAgcmV0dXJuIC0xO1xuXHR9XG5cdG4gKz0gaTtcbiAgICB9XG4gICAgcmV0dXJuIG47XG59XG5cbnZhciB6aXBfaW5mbGF0ZSA9IGZ1bmN0aW9uKHN0cikge1xuICAgIHZhciBpLCBqO1xuXG4gICAgemlwX2luZmxhdGVfc3RhcnQoKTtcbiAgICB6aXBfaW5mbGF0ZV9kYXRhID0gc3RyO1xuICAgIHppcF9pbmZsYXRlX3BvcyA9IDA7XG5cbiAgICB2YXIgYnVmZiA9IG5ldyBBcnJheSgxMDI0KTtcbiAgICB2YXIgYW91dCA9IFtdO1xuICAgIHdoaWxlKChpID0gemlwX2luZmxhdGVfaW50ZXJuYWwoYnVmZiwgMCwgYnVmZi5sZW5ndGgpKSA+IDApIHtcblx0dmFyIGNidWYgPSBuZXcgQXJyYXkoaSk7XG5cdGZvcihqID0gMDsgaiA8IGk7IGorKyl7XG5cdCAgICBjYnVmW2pdID0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZmW2pdKTtcblx0fVxuXHRhb3V0W2FvdXQubGVuZ3RoXSA9IGNidWYuam9pbihcIlwiKTtcbiAgICB9XG4gICAgemlwX2luZmxhdGVfZGF0YSA9IG51bGw7IC8vIEcuQy5cbiAgICByZXR1cm4gYW91dC5qb2luKFwiXCIpO1xufVxuXG5pZiAoISBjdHguUmF3RGVmbGF0ZSkgY3R4LlJhd0RlZmxhdGUgPSB7fTtcbmN0eC5SYXdEZWZsYXRlLmluZmxhdGUgPSB6aXBfaW5mbGF0ZTtcblxufSkodGhpcyk7XG4iLCIvKlxuICogJElkOiBiYXNlNjQuanMsdiAyLjE1IDIwMTQvMDQvMDUgMTI6NTg6NTcgZGFua29nYWkgRXhwIGRhbmtvZ2FpICRcbiAqXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICogICAgaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL21pdC1saWNlbnNlXG4gKlxuICogIFJlZmVyZW5jZXM6XG4gKiAgICBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0Jhc2U2NFxuICovXG5cbihmdW5jdGlvbihnbG9iYWwpIHtcbiAgICAndXNlIHN0cmljdCc7XG4gICAgLy8gZXhpc3RpbmcgdmVyc2lvbiBmb3Igbm9Db25mbGljdCgpXG4gICAgdmFyIF9CYXNlNjQgPSBnbG9iYWwuQmFzZTY0O1xuICAgIHZhciB2ZXJzaW9uID0gXCIyLjEuNVwiO1xuICAgIC8vIGlmIG5vZGUuanMsIHdlIHVzZSBCdWZmZXJcbiAgICB2YXIgYnVmZmVyO1xuICAgIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgICBidWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXI7XG4gICAgfVxuICAgIC8vIGNvbnN0YW50c1xuICAgIHZhciBiNjRjaGFyc1xuICAgICAgICA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcbiAgICB2YXIgYjY0dGFiID0gZnVuY3Rpb24oYmluKSB7XG4gICAgICAgIHZhciB0ID0ge307XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gYmluLmxlbmd0aDsgaSA8IGw7IGkrKykgdFtiaW4uY2hhckF0KGkpXSA9IGk7XG4gICAgICAgIHJldHVybiB0O1xuICAgIH0oYjY0Y2hhcnMpO1xuICAgIHZhciBmcm9tQ2hhckNvZGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlO1xuICAgIC8vIGVuY29kZXIgc3R1ZmZcbiAgICB2YXIgY2JfdXRvYiA9IGZ1bmN0aW9uKGMpIHtcbiAgICAgICAgaWYgKGMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgdmFyIGNjID0gYy5jaGFyQ29kZUF0KDApO1xuICAgICAgICAgICAgcmV0dXJuIGNjIDwgMHg4MCA/IGNcbiAgICAgICAgICAgICAgICA6IGNjIDwgMHg4MDAgPyAoZnJvbUNoYXJDb2RlKDB4YzAgfCAoY2MgPj4+IDYpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICArIGZyb21DaGFyQ29kZSgweDgwIHwgKGNjICYgMHgzZikpKVxuICAgICAgICAgICAgICAgIDogKGZyb21DaGFyQ29kZSgweGUwIHwgKChjYyA+Pj4gMTIpICYgMHgwZikpXG4gICAgICAgICAgICAgICAgICAgKyBmcm9tQ2hhckNvZGUoMHg4MCB8ICgoY2MgPj4+ICA2KSAmIDB4M2YpKVxuICAgICAgICAgICAgICAgICAgICsgZnJvbUNoYXJDb2RlKDB4ODAgfCAoIGNjICAgICAgICAgJiAweDNmKSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGNjID0gMHgxMDAwMFxuICAgICAgICAgICAgICAgICsgKGMuY2hhckNvZGVBdCgwKSAtIDB4RDgwMCkgKiAweDQwMFxuICAgICAgICAgICAgICAgICsgKGMuY2hhckNvZGVBdCgxKSAtIDB4REMwMCk7XG4gICAgICAgICAgICByZXR1cm4gKGZyb21DaGFyQ29kZSgweGYwIHwgKChjYyA+Pj4gMTgpICYgMHgwNykpXG4gICAgICAgICAgICAgICAgICAgICsgZnJvbUNoYXJDb2RlKDB4ODAgfCAoKGNjID4+PiAxMikgJiAweDNmKSlcbiAgICAgICAgICAgICAgICAgICAgKyBmcm9tQ2hhckNvZGUoMHg4MCB8ICgoY2MgPj4+ICA2KSAmIDB4M2YpKVxuICAgICAgICAgICAgICAgICAgICArIGZyb21DaGFyQ29kZSgweDgwIHwgKCBjYyAgICAgICAgICYgMHgzZikpKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgdmFyIHJlX3V0b2IgPSAvW1xcdUQ4MDAtXFx1REJGRl1bXFx1REMwMC1cXHVERkZGRl18W15cXHgwMC1cXHg3Rl0vZztcbiAgICB2YXIgdXRvYiA9IGZ1bmN0aW9uKHUpIHtcbiAgICAgICAgcmV0dXJuIHUucmVwbGFjZShyZV91dG9iLCBjYl91dG9iKTtcbiAgICB9O1xuICAgIHZhciBjYl9lbmNvZGUgPSBmdW5jdGlvbihjY2MpIHtcbiAgICAgICAgdmFyIHBhZGxlbiA9IFswLCAyLCAxXVtjY2MubGVuZ3RoICUgM10sXG4gICAgICAgIG9yZCA9IGNjYy5jaGFyQ29kZUF0KDApIDw8IDE2XG4gICAgICAgICAgICB8ICgoY2NjLmxlbmd0aCA+IDEgPyBjY2MuY2hhckNvZGVBdCgxKSA6IDApIDw8IDgpXG4gICAgICAgICAgICB8ICgoY2NjLmxlbmd0aCA+IDIgPyBjY2MuY2hhckNvZGVBdCgyKSA6IDApKSxcbiAgICAgICAgY2hhcnMgPSBbXG4gICAgICAgICAgICBiNjRjaGFycy5jaGFyQXQoIG9yZCA+Pj4gMTgpLFxuICAgICAgICAgICAgYjY0Y2hhcnMuY2hhckF0KChvcmQgPj4+IDEyKSAmIDYzKSxcbiAgICAgICAgICAgIHBhZGxlbiA+PSAyID8gJz0nIDogYjY0Y2hhcnMuY2hhckF0KChvcmQgPj4+IDYpICYgNjMpLFxuICAgICAgICAgICAgcGFkbGVuID49IDEgPyAnPScgOiBiNjRjaGFycy5jaGFyQXQob3JkICYgNjMpXG4gICAgICAgIF07XG4gICAgICAgIHJldHVybiBjaGFycy5qb2luKCcnKTtcbiAgICB9O1xuICAgIHZhciBidG9hID0gZ2xvYmFsLmJ0b2EgPyBmdW5jdGlvbihiKSB7XG4gICAgICAgIHJldHVybiBnbG9iYWwuYnRvYShiKTtcbiAgICB9IDogZnVuY3Rpb24oYikge1xuICAgICAgICByZXR1cm4gYi5yZXBsYWNlKC9bXFxzXFxTXXsxLDN9L2csIGNiX2VuY29kZSk7XG4gICAgfTtcbiAgICB2YXIgX2VuY29kZSA9IGJ1ZmZlclxuICAgICAgICA/IGZ1bmN0aW9uICh1KSB7IHJldHVybiAobmV3IGJ1ZmZlcih1KSkudG9TdHJpbmcoJ2Jhc2U2NCcpIH0gXG4gICAgOiBmdW5jdGlvbiAodSkgeyByZXR1cm4gYnRvYSh1dG9iKHUpKSB9XG4gICAgO1xuICAgIHZhciBlbmNvZGUgPSBmdW5jdGlvbih1LCB1cmlzYWZlKSB7XG4gICAgICAgIHJldHVybiAhdXJpc2FmZSBcbiAgICAgICAgICAgID8gX2VuY29kZSh1KVxuICAgICAgICAgICAgOiBfZW5jb2RlKHUpLnJlcGxhY2UoL1srXFwvXS9nLCBmdW5jdGlvbihtMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtMCA9PSAnKycgPyAnLScgOiAnXyc7XG4gICAgICAgICAgICB9KS5yZXBsYWNlKC89L2csICcnKTtcbiAgICB9O1xuICAgIHZhciBlbmNvZGVVUkkgPSBmdW5jdGlvbih1KSB7IHJldHVybiBlbmNvZGUodSwgdHJ1ZSkgfTtcbiAgICAvLyBkZWNvZGVyIHN0dWZmXG4gICAgdmFyIHJlX2J0b3UgPSBuZXcgUmVnRXhwKFtcbiAgICAgICAgJ1tcXHhDMC1cXHhERl1bXFx4ODAtXFx4QkZdJyxcbiAgICAgICAgJ1tcXHhFMC1cXHhFRl1bXFx4ODAtXFx4QkZdezJ9JyxcbiAgICAgICAgJ1tcXHhGMC1cXHhGN11bXFx4ODAtXFx4QkZdezN9J1xuICAgIF0uam9pbignfCcpLCAnZycpO1xuICAgIHZhciBjYl9idG91ID0gZnVuY3Rpb24oY2NjYykge1xuICAgICAgICBzd2l0Y2goY2NjYy5sZW5ndGgpIHtcbiAgICAgICAgY2FzZSA0OlxuICAgICAgICAgICAgdmFyIGNwID0gKCgweDA3ICYgY2NjYy5jaGFyQ29kZUF0KDApKSA8PCAxOClcbiAgICAgICAgICAgICAgICB8ICAgICgoMHgzZiAmIGNjY2MuY2hhckNvZGVBdCgxKSkgPDwgMTIpXG4gICAgICAgICAgICAgICAgfCAgICAoKDB4M2YgJiBjY2NjLmNoYXJDb2RlQXQoMikpIDw8ICA2KVxuICAgICAgICAgICAgICAgIHwgICAgICgweDNmICYgY2NjYy5jaGFyQ29kZUF0KDMpKSxcbiAgICAgICAgICAgIG9mZnNldCA9IGNwIC0gMHgxMDAwMDtcbiAgICAgICAgICAgIHJldHVybiAoZnJvbUNoYXJDb2RlKChvZmZzZXQgID4+PiAxMCkgKyAweEQ4MDApXG4gICAgICAgICAgICAgICAgICAgICsgZnJvbUNoYXJDb2RlKChvZmZzZXQgJiAweDNGRikgKyAweERDMDApKTtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgICAgcmV0dXJuIGZyb21DaGFyQ29kZShcbiAgICAgICAgICAgICAgICAoKDB4MGYgJiBjY2NjLmNoYXJDb2RlQXQoMCkpIDw8IDEyKVxuICAgICAgICAgICAgICAgICAgICB8ICgoMHgzZiAmIGNjY2MuY2hhckNvZGVBdCgxKSkgPDwgNilcbiAgICAgICAgICAgICAgICAgICAgfCAgKDB4M2YgJiBjY2NjLmNoYXJDb2RlQXQoMikpXG4gICAgICAgICAgICApO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuICBmcm9tQ2hhckNvZGUoXG4gICAgICAgICAgICAgICAgKCgweDFmICYgY2NjYy5jaGFyQ29kZUF0KDApKSA8PCA2KVxuICAgICAgICAgICAgICAgICAgICB8ICAoMHgzZiAmIGNjY2MuY2hhckNvZGVBdCgxKSlcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHZhciBidG91ID0gZnVuY3Rpb24oYikge1xuICAgICAgICByZXR1cm4gYi5yZXBsYWNlKHJlX2J0b3UsIGNiX2J0b3UpO1xuICAgIH07XG4gICAgdmFyIGNiX2RlY29kZSA9IGZ1bmN0aW9uKGNjY2MpIHtcbiAgICAgICAgdmFyIGxlbiA9IGNjY2MubGVuZ3RoLFxuICAgICAgICBwYWRsZW4gPSBsZW4gJSA0LFxuICAgICAgICBuID0gKGxlbiA+IDAgPyBiNjR0YWJbY2NjYy5jaGFyQXQoMCldIDw8IDE4IDogMClcbiAgICAgICAgICAgIHwgKGxlbiA+IDEgPyBiNjR0YWJbY2NjYy5jaGFyQXQoMSldIDw8IDEyIDogMClcbiAgICAgICAgICAgIHwgKGxlbiA+IDIgPyBiNjR0YWJbY2NjYy5jaGFyQXQoMildIDw8ICA2IDogMClcbiAgICAgICAgICAgIHwgKGxlbiA+IDMgPyBiNjR0YWJbY2NjYy5jaGFyQXQoMyldICAgICAgIDogMCksXG4gICAgICAgIGNoYXJzID0gW1xuICAgICAgICAgICAgZnJvbUNoYXJDb2RlKCBuID4+PiAxNiksXG4gICAgICAgICAgICBmcm9tQ2hhckNvZGUoKG4gPj4+ICA4KSAmIDB4ZmYpLFxuICAgICAgICAgICAgZnJvbUNoYXJDb2RlKCBuICAgICAgICAgJiAweGZmKVxuICAgICAgICBdO1xuICAgICAgICBjaGFycy5sZW5ndGggLT0gWzAsIDAsIDIsIDFdW3BhZGxlbl07XG4gICAgICAgIHJldHVybiBjaGFycy5qb2luKCcnKTtcbiAgICB9O1xuICAgIHZhciBhdG9iID0gZ2xvYmFsLmF0b2IgPyBmdW5jdGlvbihhKSB7XG4gICAgICAgIHJldHVybiBnbG9iYWwuYXRvYihhKTtcbiAgICB9IDogZnVuY3Rpb24oYSl7XG4gICAgICAgIHJldHVybiBhLnJlcGxhY2UoL1tcXHNcXFNdezEsNH0vZywgY2JfZGVjb2RlKTtcbiAgICB9O1xuICAgIHZhciBfZGVjb2RlID0gYnVmZmVyXG4gICAgICAgID8gZnVuY3Rpb24oYSkgeyByZXR1cm4gKG5ldyBidWZmZXIoYSwgJ2Jhc2U2NCcpKS50b1N0cmluZygpIH1cbiAgICA6IGZ1bmN0aW9uKGEpIHsgcmV0dXJuIGJ0b3UoYXRvYihhKSkgfTtcbiAgICB2YXIgZGVjb2RlID0gZnVuY3Rpb24oYSl7XG4gICAgICAgIHJldHVybiBfZGVjb2RlKFxuICAgICAgICAgICAgYS5yZXBsYWNlKC9bLV9dL2csIGZ1bmN0aW9uKG0wKSB7IHJldHVybiBtMCA9PSAnLScgPyAnKycgOiAnLycgfSlcbiAgICAgICAgICAgICAgICAucmVwbGFjZSgvW15BLVphLXowLTlcXCtcXC9dL2csICcnKVxuICAgICAgICApO1xuICAgIH07XG4gICAgdmFyIG5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIEJhc2U2NCA9IGdsb2JhbC5CYXNlNjQ7XG4gICAgICAgIGdsb2JhbC5CYXNlNjQgPSBfQmFzZTY0O1xuICAgICAgICByZXR1cm4gQmFzZTY0O1xuICAgIH07XG4gICAgLy8gZXhwb3J0IEJhc2U2NFxuICAgIGdsb2JhbC5CYXNlNjQgPSB7XG4gICAgICAgIFZFUlNJT046IHZlcnNpb24sXG4gICAgICAgIGF0b2I6IGF0b2IsXG4gICAgICAgIGJ0b2E6IGJ0b2EsXG4gICAgICAgIGZyb21CYXNlNjQ6IGRlY29kZSxcbiAgICAgICAgdG9CYXNlNjQ6IGVuY29kZSxcbiAgICAgICAgdXRvYjogdXRvYixcbiAgICAgICAgZW5jb2RlOiBlbmNvZGUsXG4gICAgICAgIGVuY29kZVVSSTogZW5jb2RlVVJJLFxuICAgICAgICBidG91OiBidG91LFxuICAgICAgICBkZWNvZGU6IGRlY29kZSxcbiAgICAgICAgbm9Db25mbGljdDogbm9Db25mbGljdFxuICAgIH07XG4gICAgLy8gaWYgRVM1IGlzIGF2YWlsYWJsZSwgbWFrZSBCYXNlNjQuZXh0ZW5kU3RyaW5nKCkgYXZhaWxhYmxlXG4gICAgaWYgKHR5cGVvZiBPYmplY3QuZGVmaW5lUHJvcGVydHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdmFyIG5vRW51bSA9IGZ1bmN0aW9uKHYpe1xuICAgICAgICAgICAgcmV0dXJuIHt2YWx1ZTp2LGVudW1lcmFibGU6ZmFsc2Usd3JpdGFibGU6dHJ1ZSxjb25maWd1cmFibGU6dHJ1ZX07XG4gICAgICAgIH07XG4gICAgICAgIGdsb2JhbC5CYXNlNjQuZXh0ZW5kU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFxuICAgICAgICAgICAgICAgIFN0cmluZy5wcm90b3R5cGUsICdmcm9tQmFzZTY0Jywgbm9FbnVtKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRlY29kZSh0aGlzKVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShcbiAgICAgICAgICAgICAgICBTdHJpbmcucHJvdG90eXBlLCAndG9CYXNlNjQnLCBub0VudW0oZnVuY3Rpb24gKHVyaXNhZmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVuY29kZSh0aGlzLCB1cmlzYWZlKVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShcbiAgICAgICAgICAgICAgICBTdHJpbmcucHJvdG90eXBlLCAndG9CYXNlNjRVUkknLCBub0VudW0oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZW5jb2RlKHRoaXMsIHRydWUpXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICAvLyB0aGF0J3MgaXQhXG59KSh0aGlzKTtcblxuaWYgKHRoaXNbJ01ldGVvciddKSB7XG4gICAgQmFzZTY0ID0gZ2xvYmFsLkJhc2U2NDsgLy8gZm9yIG5vcm1hbCBleHBvcnQgaW4gTWV0ZW9yLmpzXG59XG4iLCIvKiohXG4gKiBTb3J0YWJsZVxuICogQGF1dGhvclx0UnViYVhhICAgPHRyYXNoQHJ1YmF4YS5vcmc+XG4gKiBAbGljZW5zZSBNSVRcbiAqL1xuXG5cbihmdW5jdGlvbiAoZmFjdG9yeSl7XG5cdFwidXNlIHN0cmljdFwiO1xuXG5cdGlmKCB0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCApe1xuXHRcdGRlZmluZShmYWN0b3J5KTtcblx0fVxuXHRlbHNlIGlmKCB0eXBlb2YgbW9kdWxlICE9IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzICE9IFwidW5kZWZpbmVkXCIgKXtcblx0XHRtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcblx0fVxuXHRlbHNlIHtcblx0XHR3aW5kb3dbXCJTb3J0YWJsZVwiXSA9IGZhY3RvcnkoKTtcblx0fVxufSkoZnVuY3Rpb24gKCl7XG5cdFwidXNlIHN0cmljdFwiO1xuXG5cdHZhclxuXHRcdCAgZHJhZ0VsXG5cdFx0LCBnaG9zdEVsXG5cdFx0LCByb290RWxcblx0XHQsIG5leHRFbFxuXG5cdFx0LCBsYXN0RWxcblx0XHQsIGxhc3RDU1Ncblx0XHQsIGxhc3RSZWN0XG5cblx0XHQsIGFjdGl2ZUdyb3VwXG5cblx0XHQsIHRhcEV2dFxuXHRcdCwgdG91Y2hFdnRcblxuXHRcdCwgZXhwYW5kbyA9ICdTb3J0YWJsZScgKyAobmV3IERhdGUpLmdldFRpbWUoKVxuXG5cdFx0LCB3aW4gPSB3aW5kb3dcblx0XHQsIGRvY3VtZW50ID0gd2luLmRvY3VtZW50XG5cdFx0LCBwYXJzZUludCA9IHdpbi5wYXJzZUludFxuXHRcdCwgc3VwcG9ydElFZG5kID0gISFkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKS5kcmFnRHJvcFxuXG5cdFx0LCBfc2lsZW50ID0gZmFsc2VcblxuXHRcdCwgX2NyZWF0ZUV2ZW50ID0gZnVuY3Rpb24gKGV2ZW50LyoqU3RyaW5nKi8sIGl0ZW0vKipIVE1MRWxlbWVudCovKXtcblx0XHRcdHZhciBldnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnRXZlbnQnKTtcblx0XHRcdGV2dC5pbml0RXZlbnQoZXZlbnQsIHRydWUsIHRydWUpO1xuXHRcdFx0ZXZ0Lml0ZW0gPSBpdGVtO1xuXHRcdFx0cmV0dXJuIGV2dDtcblx0XHR9XG5cblx0XHQsIF9kaXNwYXRjaEV2ZW50ID0gZnVuY3Rpb24gKHJvb3RFbCwgbmFtZSwgdGFyZ2V0RWwpIHtcblx0XHRcdHJvb3RFbC5kaXNwYXRjaEV2ZW50KF9jcmVhdGVFdmVudChuYW1lLCB0YXJnZXRFbCB8fCByb290RWwpKTtcblx0XHR9XG5cblx0XHQsIF9jdXN0b21FdmVudHMgPSAnb25BZGQgb25VcGRhdGUgb25SZW1vdmUgb25TdGFydCBvbkVuZCBvbkZpbHRlcicuc3BsaXQoJyAnKVxuXG5cdFx0LCBub29wID0gZnVuY3Rpb24gKCl7fVxuXHRcdCwgc2xpY2UgPSBbXS5zbGljZVxuXG5cdFx0LCB0b3VjaERyYWdPdmVyTGlzdGVuZXJzID0gW11cblx0O1xuXG5cblxuXHQvKipcblx0ICogQGNsYXNzICBTb3J0YWJsZVxuXHQgKiBAcGFyYW0gIHtIVE1MRWxlbWVudH0gIGVsXG5cdCAqIEBwYXJhbSAge09iamVjdH0gICAgICAgW29wdGlvbnNdXG5cdCAqL1xuXHRmdW5jdGlvbiBTb3J0YWJsZShlbCwgb3B0aW9ucyl7XG5cdFx0dGhpcy5lbCA9IGVsOyAvLyByb290IGVsZW1lbnRcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zID0gKG9wdGlvbnMgfHwge30pO1xuXG5cblx0XHQvLyBEZWZhdWx0c1xuXHRcdHZhciBkZWZhdWx0cyA9IHtcblx0XHRcdGdyb3VwOiBNYXRoLnJhbmRvbSgpLFxuXHRcdFx0c3RvcmU6IG51bGwsXG5cdFx0XHRoYW5kbGU6IG51bGwsXG5cdFx0XHRkcmFnZ2FibGU6IGVsLmNoaWxkcmVuWzBdICYmIGVsLmNoaWxkcmVuWzBdLm5vZGVOYW1lIHx8ICgvW3VvXWwvaS50ZXN0KGVsLm5vZGVOYW1lKSA/ICdsaScgOiAnKicpLFxuXHRcdFx0Z2hvc3RDbGFzczogJ3NvcnRhYmxlLWdob3N0Jyxcblx0XHRcdGlnbm9yZTogJ2EsIGltZycsXG5cdFx0XHRmaWx0ZXI6IG51bGxcblx0XHR9O1xuXG5cdFx0Ly8gU2V0IGRlZmF1bHQgb3B0aW9uc1xuXHRcdGZvciAodmFyIG5hbWUgaW4gZGVmYXVsdHMpIHtcblx0XHRcdG9wdGlvbnNbbmFtZV0gPSBvcHRpb25zW25hbWVdIHx8IGRlZmF1bHRzW25hbWVdO1xuXHRcdH1cblxuXG5cdFx0Ly8gRGVmaW5lIGV2ZW50c1xuXHRcdF9jdXN0b21FdmVudHMuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuXHRcdFx0b3B0aW9uc1tuYW1lXSA9IF9iaW5kKHRoaXMsIG9wdGlvbnNbbmFtZV0gfHwgbm9vcCk7XG5cdFx0XHRfb24oZWwsIG5hbWUuc3Vic3RyKDIpLnRvTG93ZXJDYXNlKCksIG9wdGlvbnNbbmFtZV0pO1xuXHRcdH0sIHRoaXMpO1xuXG5cblx0XHQvLyBFeHBvcnQgZ3JvdXAgbmFtZVxuXHRcdGVsW2V4cGFuZG9dID0gb3B0aW9ucy5ncm91cDtcblxuXG5cdFx0Ly8gQmluZCBhbGwgcHJpdmF0ZSBtZXRob2RzXG5cdFx0Zm9yKCB2YXIgZm4gaW4gdGhpcyApe1xuXHRcdFx0aWYoIGZuLmNoYXJBdCgwKSA9PT0gJ18nICl7XG5cdFx0XHRcdHRoaXNbZm5dID0gX2JpbmQodGhpcywgdGhpc1tmbl0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0Ly8gQmluZCBldmVudHNcblx0XHRfb24oZWwsICdtb3VzZWRvd24nLCB0aGlzLl9vblRhcFN0YXJ0KTtcblx0XHRfb24oZWwsICd0b3VjaHN0YXJ0JywgdGhpcy5fb25UYXBTdGFydCk7XG5cdFx0c3VwcG9ydElFZG5kICYmIF9vbihlbCwgJ3NlbGVjdHN0YXJ0JywgdGhpcy5fb25UYXBTdGFydCk7XG5cblx0XHRfb24oZWwsICdkcmFnb3ZlcicsIHRoaXMuX29uRHJhZ092ZXIpO1xuXHRcdF9vbihlbCwgJ2RyYWdlbnRlcicsIHRoaXMuX29uRHJhZ092ZXIpO1xuXG5cdFx0dG91Y2hEcmFnT3Zlckxpc3RlbmVycy5wdXNoKHRoaXMuX29uRHJhZ092ZXIpO1xuXG5cdFx0Ly8gUmVzdG9yZSBzb3J0aW5nXG5cdFx0b3B0aW9ucy5zdG9yZSAmJiB0aGlzLnNvcnQob3B0aW9ucy5zdG9yZS5nZXQodGhpcykpO1xuXHR9XG5cblxuXHRTb3J0YWJsZS5wcm90b3R5cGUgPSAvKiogQGxlbmRzIFNvcnRhYmxlLnByb3RvdHlwZSAqLyB7XG5cdFx0Y29uc3RydWN0b3I6IFNvcnRhYmxlLFxuXG5cblx0XHRfYXBwbHlFZmZlY3RzOiBmdW5jdGlvbiAoKXtcblx0XHRcdF90b2dnbGVDbGFzcyhkcmFnRWwsIHRoaXMub3B0aW9ucy5naG9zdENsYXNzLCB0cnVlKTtcblx0XHR9LFxuXG5cblx0XHRfb25UYXBTdGFydDogZnVuY3Rpb24gKGV2dC8qKkV2ZW50fFRvdWNoRXZlbnQqLyl7XG5cdFx0XHR2YXJcblx0XHRcdFx0ICB0b3VjaCA9IGV2dC50b3VjaGVzICYmIGV2dC50b3VjaGVzWzBdXG5cdFx0XHRcdCwgdGFyZ2V0ID0gKHRvdWNoIHx8IGV2dCkudGFyZ2V0XG5cdFx0XHRcdCwgb3B0aW9ucyA9ICB0aGlzLm9wdGlvbnNcblx0XHRcdFx0LCBlbCA9IHRoaXMuZWxcblx0XHRcdFx0LCBmaWx0ZXIgPSBvcHRpb25zLmZpbHRlclxuXHRcdFx0O1xuXG5cdFx0XHRpZiggZXZ0LnR5cGUgPT09ICdtb3VzZWRvd24nICYmIGV2dC5idXR0b24gIT09IDAgKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gb25seSBsZWZ0IGJ1dHRvblxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBmaWx0ZXJcblx0XHRcdGlmKCB0eXBlb2YgZmlsdGVyID09PSAnZnVuY3Rpb24nICl7XG5cdFx0XHRcdGlmKCBmaWx0ZXIuY2FsbCh0aGlzLCB0YXJnZXQsIHRoaXMpICl7XG5cdFx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQoZWwsICdmaWx0ZXInLCB0YXJnZXQpO1xuXHRcdFx0XHRcdHJldHVybjsgLy8gY2FuY2VsIGRuZFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKCBmaWx0ZXIgKXtcblx0XHRcdFx0ZmlsdGVyID0gZmlsdGVyLnNwbGl0KCcsJykuZmlsdGVyKGZ1bmN0aW9uIChjcml0ZXJpYSkge1xuXHRcdFx0XHRcdHJldHVybiBfY2xvc2VzdCh0YXJnZXQsIGNyaXRlcmlhLnRyaW0oKSwgZWwpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoZmlsdGVyLmxlbmd0aCkge1xuXHRcdFx0XHRcdF9kaXNwYXRjaEV2ZW50KGVsLCAnZmlsdGVyJywgdGFyZ2V0KTtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGNhbmNlbCBkbmRcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiggb3B0aW9ucy5oYW5kbGUgKXtcblx0XHRcdFx0dGFyZ2V0ID0gX2Nsb3Nlc3QodGFyZ2V0LCBvcHRpb25zLmhhbmRsZSwgZWwpO1xuXHRcdFx0fVxuXG5cdFx0XHR0YXJnZXQgPSBfY2xvc2VzdCh0YXJnZXQsIG9wdGlvbnMuZHJhZ2dhYmxlLCBlbCk7XG5cblx0XHRcdC8vIElFIDkgU3VwcG9ydFxuXHRcdFx0aWYoIHRhcmdldCAmJiBldnQudHlwZSA9PSAnc2VsZWN0c3RhcnQnICl7XG5cdFx0XHRcdGlmKCB0YXJnZXQudGFnTmFtZSAhPSAnQScgJiYgdGFyZ2V0LnRhZ05hbWUgIT0gJ0lNRycpe1xuXHRcdFx0XHRcdHRhcmdldC5kcmFnRHJvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmKCB0YXJnZXQgJiYgIWRyYWdFbCAmJiAodGFyZ2V0LnBhcmVudE5vZGUgPT09IGVsKSApe1xuXHRcdFx0XHR0YXBFdnQgPSBldnQ7XG5cblx0XHRcdFx0cm9vdEVsID0gdGhpcy5lbDtcblx0XHRcdFx0ZHJhZ0VsID0gdGFyZ2V0O1xuXHRcdFx0XHRuZXh0RWwgPSBkcmFnRWwubmV4dFNpYmxpbmc7XG5cdFx0XHRcdGFjdGl2ZUdyb3VwID0gdGhpcy5vcHRpb25zLmdyb3VwO1xuXG5cdFx0XHRcdGRyYWdFbC5kcmFnZ2FibGUgPSB0cnVlO1xuXG5cdFx0XHRcdC8vIERpc2FibGUgXCJkcmFnZ2FibGVcIlxuXHRcdFx0XHRvcHRpb25zLmlnbm9yZS5zcGxpdCgnLCcpLmZvckVhY2goZnVuY3Rpb24gKGNyaXRlcmlhKSB7XG5cdFx0XHRcdFx0X2ZpbmQodGFyZ2V0LCBjcml0ZXJpYS50cmltKCksIF9kaXNhYmxlRHJhZ2dhYmxlKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYoIHRvdWNoICl7XG5cdFx0XHRcdFx0Ly8gVG91Y2ggZGV2aWNlIHN1cHBvcnRcblx0XHRcdFx0XHR0YXBFdnQgPSB7XG5cdFx0XHRcdFx0XHQgIHRhcmdldDogIHRhcmdldFxuXHRcdFx0XHRcdFx0LCBjbGllbnRYOiB0b3VjaC5jbGllbnRYXG5cdFx0XHRcdFx0XHQsIGNsaWVudFk6IHRvdWNoLmNsaWVudFlcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0dGhpcy5fb25EcmFnU3RhcnQodGFwRXZ0LCB0cnVlKTtcblx0XHRcdFx0XHRldnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF9vbihkb2N1bWVudCwgJ21vdXNldXAnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdFx0XHRfb24oZG9jdW1lbnQsICd0b3VjaGVuZCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHRcdF9vbihkb2N1bWVudCwgJ3RvdWNoY2FuY2VsJywgdGhpcy5fb25Ecm9wKTtcblxuXHRcdFx0XHRfb24odGhpcy5lbCwgJ2RyYWdzdGFydCcsIHRoaXMuX29uRHJhZ1N0YXJ0KTtcblx0XHRcdFx0X29uKHRoaXMuZWwsICdkcmFnZW5kJywgdGhpcy5fb25Ecm9wKTtcblx0XHRcdFx0X29uKGRvY3VtZW50LCAnZHJhZ292ZXInLCBfZ2xvYmFsRHJhZ092ZXIpO1xuXG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiggZG9jdW1lbnQuc2VsZWN0aW9uICl7XG5cdFx0XHRcdFx0XHRkb2N1bWVudC5zZWxlY3Rpb24uZW1wdHkoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0d2luZG93LmdldFNlbGVjdGlvbigpLnJlbW92ZUFsbFJhbmdlcygpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpeyB9XG5cblxuXHRcdFx0XHRfZGlzcGF0Y2hFdmVudChkcmFnRWwsICdzdGFydCcpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfZW11bGF0ZURyYWdPdmVyOiBmdW5jdGlvbiAoKXtcblx0XHRcdGlmKCB0b3VjaEV2dCApe1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdkaXNwbGF5JywgJ25vbmUnKTtcblxuXHRcdFx0XHR2YXJcblx0XHRcdFx0XHQgIHRhcmdldCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQodG91Y2hFdnQuY2xpZW50WCwgdG91Y2hFdnQuY2xpZW50WSlcblx0XHRcdFx0XHQsIHBhcmVudCA9IHRhcmdldFxuXHRcdFx0XHRcdCwgZ3JvdXAgPSB0aGlzLm9wdGlvbnMuZ3JvdXBcblx0XHRcdFx0XHQsIGkgPSB0b3VjaERyYWdPdmVyTGlzdGVuZXJzLmxlbmd0aFxuXHRcdFx0XHQ7XG5cblx0XHRcdFx0aWYoIHBhcmVudCApe1xuXHRcdFx0XHRcdGRvIHtcblx0XHRcdFx0XHRcdGlmKCBwYXJlbnRbZXhwYW5kb10gPT09IGdyb3VwICl7XG5cdFx0XHRcdFx0XHRcdHdoaWxlKCBpLS0gKXtcblx0XHRcdFx0XHRcdFx0XHR0b3VjaERyYWdPdmVyTGlzdGVuZXJzW2ldKHtcblx0XHRcdFx0XHRcdFx0XHRcdGNsaWVudFg6IHRvdWNoRXZ0LmNsaWVudFgsXG5cdFx0XHRcdFx0XHRcdFx0XHRjbGllbnRZOiB0b3VjaEV2dC5jbGllbnRZLFxuXHRcdFx0XHRcdFx0XHRcdFx0dGFyZ2V0OiB0YXJnZXQsXG5cdFx0XHRcdFx0XHRcdFx0XHRyb290RWw6IHBhcmVudFxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0YXJnZXQgPSBwYXJlbnQ7IC8vIHN0b3JlIGxhc3QgZWxlbWVudFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR3aGlsZSggcGFyZW50ID0gcGFyZW50LnBhcmVudE5vZGUgKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ2Rpc3BsYXknLCAnJyk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXG5cdFx0X29uVG91Y2hNb3ZlOiBmdW5jdGlvbiAoZXZ0LyoqVG91Y2hFdmVudCovKXtcblx0XHRcdGlmKCB0YXBFdnQgKXtcblx0XHRcdFx0dmFyXG5cdFx0XHRcdFx0ICB0b3VjaCA9IGV2dC50b3VjaGVzWzBdXG5cdFx0XHRcdFx0LCBkeCA9IHRvdWNoLmNsaWVudFggLSB0YXBFdnQuY2xpZW50WFxuXHRcdFx0XHRcdCwgZHkgPSB0b3VjaC5jbGllbnRZIC0gdGFwRXZ0LmNsaWVudFlcblx0XHRcdFx0XHQsIHRyYW5zbGF0ZTNkID0gJ3RyYW5zbGF0ZTNkKCcgKyBkeCArICdweCwnICsgZHkgKyAncHgsMCknXG5cdFx0XHRcdDtcblxuXHRcdFx0XHR0b3VjaEV2dCA9IHRvdWNoO1xuXG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ3dlYmtpdFRyYW5zZm9ybScsIHRyYW5zbGF0ZTNkKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnbW96VHJhbnNmb3JtJywgdHJhbnNsYXRlM2QpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdtc1RyYW5zZm9ybScsIHRyYW5zbGF0ZTNkKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAndHJhbnNmb3JtJywgdHJhbnNsYXRlM2QpO1xuXG5cdFx0XHRcdGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblxuXHRcdF9vbkRyYWdTdGFydDogZnVuY3Rpb24gKGV2dC8qKkV2ZW50Ki8sIGlzVG91Y2gvKipCb29sZWFuKi8pe1xuXHRcdFx0dmFyIGRhdGFUcmFuc2ZlciA9IGV2dC5kYXRhVHJhbnNmZXI7XG5cblx0XHRcdHRoaXMuX29mZlVwRXZlbnRzKCk7XG5cblx0XHRcdGlmKCBpc1RvdWNoICl7XG5cdFx0XHRcdHZhclxuXHRcdFx0XHRcdCAgcmVjdCA9IGRyYWdFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuXHRcdFx0XHRcdCwgY3NzID0gX2NzcyhkcmFnRWwpXG5cdFx0XHRcdFx0LCBnaG9zdFJlY3Rcblx0XHRcdFx0O1xuXG5cdFx0XHRcdGdob3N0RWwgPSBkcmFnRWwuY2xvbmVOb2RlKHRydWUpO1xuXG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ3RvcCcsIHJlY3QudG9wIC0gcGFyc2VJbnQoY3NzLm1hcmdpblRvcCwgMTApKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnbGVmdCcsIHJlY3QubGVmdCAtIHBhcnNlSW50KGNzcy5tYXJnaW5MZWZ0LCAxMCkpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICd3aWR0aCcsIHJlY3Qud2lkdGgpO1xuXHRcdFx0XHRfY3NzKGdob3N0RWwsICdoZWlnaHQnLCByZWN0LmhlaWdodCk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ29wYWNpdHknLCAnMC44Jyk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ3Bvc2l0aW9uJywgJ2ZpeGVkJyk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ3pJbmRleCcsICcxMDAwMDAnKTtcblxuXHRcdFx0XHRyb290RWwuYXBwZW5kQ2hpbGQoZ2hvc3RFbCk7XG5cblx0XHRcdFx0Ly8gRml4aW5nIGRpbWVuc2lvbnMuXG5cdFx0XHRcdGdob3N0UmVjdCA9IGdob3N0RWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdF9jc3MoZ2hvc3RFbCwgJ3dpZHRoJywgcmVjdC53aWR0aCoyIC0gZ2hvc3RSZWN0LndpZHRoKTtcblx0XHRcdFx0X2NzcyhnaG9zdEVsLCAnaGVpZ2h0JywgcmVjdC5oZWlnaHQqMiAtIGdob3N0UmVjdC5oZWlnaHQpO1xuXG5cdFx0XHRcdC8vIEJpbmQgdG91Y2ggZXZlbnRzXG5cdFx0XHRcdF9vbihkb2N1bWVudCwgJ3RvdWNobW92ZScsIHRoaXMuX29uVG91Y2hNb3ZlKTtcblx0XHRcdFx0X29uKGRvY3VtZW50LCAndG91Y2hlbmQnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdFx0XHRfb24oZG9jdW1lbnQsICd0b3VjaGNhbmNlbCcsIHRoaXMuX29uRHJvcCk7XG5cblx0XHRcdFx0dGhpcy5fbG9vcElkID0gc2V0SW50ZXJ2YWwodGhpcy5fZW11bGF0ZURyYWdPdmVyLCAxNTApO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ21vdmUnO1xuXHRcdFx0XHRkYXRhVHJhbnNmZXIuc2V0RGF0YSgnVGV4dCcsIGRyYWdFbC50ZXh0Q29udGVudCk7XG5cblx0XHRcdFx0X29uKGRvY3VtZW50LCAnZHJvcCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHR9XG5cblx0XHRcdHNldFRpbWVvdXQodGhpcy5fYXBwbHlFZmZlY3RzKTtcblx0XHR9LFxuXG5cblx0XHRfb25EcmFnT3ZlcjogZnVuY3Rpb24gKGV2dC8qKkV2ZW50Ki8pe1xuXHRcdFx0aWYoICFfc2lsZW50ICYmIChhY3RpdmVHcm91cCA9PT0gdGhpcy5vcHRpb25zLmdyb3VwKSAmJiAoZXZ0LnJvb3RFbCA9PT0gdm9pZCAwIHx8IGV2dC5yb290RWwgPT09IHRoaXMuZWwpICl7XG5cdFx0XHRcdHZhclxuXHRcdFx0XHRcdCAgZWwgPSB0aGlzLmVsXG5cdFx0XHRcdFx0LCB0YXJnZXQgPSBfY2xvc2VzdChldnQudGFyZ2V0LCB0aGlzLm9wdGlvbnMuZHJhZ2dhYmxlLCBlbClcblx0XHRcdFx0O1xuXG5cdFx0XHRcdGlmKCBlbC5jaGlsZHJlbi5sZW5ndGggPT09IDAgfHwgZWwuY2hpbGRyZW5bMF0gPT09IGdob3N0RWwgfHwgKGVsID09PSBldnQudGFyZ2V0KSAmJiBfZ2hvc3RJbkJvdHRvbShlbCwgZXZ0KSApe1xuXHRcdFx0XHRcdGVsLmFwcGVuZENoaWxkKGRyYWdFbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiggdGFyZ2V0ICYmIHRhcmdldCAhPT0gZHJhZ0VsICYmICh0YXJnZXQucGFyZW50Tm9kZVtleHBhbmRvXSAhPT0gdm9pZCAwKSApe1xuXHRcdFx0XHRcdGlmKCBsYXN0RWwgIT09IHRhcmdldCApe1xuXHRcdFx0XHRcdFx0bGFzdEVsID0gdGFyZ2V0O1xuXHRcdFx0XHRcdFx0bGFzdENTUyA9IF9jc3ModGFyZ2V0KTtcblx0XHRcdFx0XHRcdGxhc3RSZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRcdH1cblxuXG5cdFx0XHRcdFx0dmFyXG5cdFx0XHRcdFx0XHQgIHJlY3QgPSBsYXN0UmVjdFxuXHRcdFx0XHRcdFx0LCB3aWR0aCA9IHJlY3QucmlnaHQgLSByZWN0LmxlZnRcblx0XHRcdFx0XHRcdCwgaGVpZ2h0ID0gcmVjdC5ib3R0b20gLSByZWN0LnRvcFxuXHRcdFx0XHRcdFx0LCBmbG9hdGluZyA9IC9sZWZ0fHJpZ2h0fGlubGluZS8udGVzdChsYXN0Q1NTLmNzc0Zsb2F0ICsgbGFzdENTUy5kaXNwbGF5KVxuXHRcdFx0XHRcdFx0LCBpc1dpZGUgPSAodGFyZ2V0Lm9mZnNldFdpZHRoID4gZHJhZ0VsLm9mZnNldFdpZHRoKVxuXHRcdFx0XHRcdFx0LCBpc0xvbmcgPSAodGFyZ2V0Lm9mZnNldEhlaWdodCA+IGRyYWdFbC5vZmZzZXRIZWlnaHQpXG5cdFx0XHRcdFx0XHQsIGhhbGZ3YXkgPSAoZmxvYXRpbmcgPyAoZXZ0LmNsaWVudFggLSByZWN0LmxlZnQpL3dpZHRoIDogKGV2dC5jbGllbnRZIC0gcmVjdC50b3ApL2hlaWdodCkgPiAuNVxuXHRcdFx0XHRcdFx0LCBuZXh0U2libGluZyA9IHRhcmdldC5uZXh0RWxlbWVudFNpYmxpbmdcblx0XHRcdFx0XHRcdCwgYWZ0ZXJcblx0XHRcdFx0XHQ7XG5cblx0XHRcdFx0XHRfc2lsZW50ID0gdHJ1ZTtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KF91bnNpbGVudCwgMzApO1xuXG5cdFx0XHRcdFx0aWYoIGZsb2F0aW5nICl7XG5cdFx0XHRcdFx0XHRhZnRlciA9ICh0YXJnZXQucHJldmlvdXNFbGVtZW50U2libGluZyA9PT0gZHJhZ0VsKSAmJiAhaXNXaWRlIHx8IGhhbGZ3YXkgJiYgaXNXaWRlXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFmdGVyID0gKG5leHRTaWJsaW5nICE9PSBkcmFnRWwpICYmICFpc0xvbmcgfHwgaGFsZndheSAmJiBpc0xvbmc7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYoIGFmdGVyICYmICFuZXh0U2libGluZyApe1xuXHRcdFx0XHRcdFx0ZWwuYXBwZW5kQ2hpbGQoZHJhZ0VsKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGFyZ2V0LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGRyYWdFbCwgYWZ0ZXIgPyBuZXh0U2libGluZyA6IHRhcmdldCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9vZmZVcEV2ZW50czogZnVuY3Rpb24gKCkge1xuXHRcdFx0X29mZihkb2N1bWVudCwgJ21vdXNldXAnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdFx0X29mZihkb2N1bWVudCwgJ3RvdWNobW92ZScsIHRoaXMuX29uVG91Y2hNb3ZlKTtcblx0XHRcdF9vZmYoZG9jdW1lbnQsICd0b3VjaGVuZCcsIHRoaXMuX29uRHJvcCk7XG5cdFx0XHRfb2ZmKGRvY3VtZW50LCAndG91Y2hjYW5jZWwnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdH0sXG5cblx0XHRfb25Ecm9wOiBmdW5jdGlvbiAoZXZ0LyoqRXZlbnQqLyl7XG5cdFx0XHRjbGVhckludGVydmFsKHRoaXMuX2xvb3BJZCk7XG5cblx0XHRcdC8vIFVuYmluZCBldmVudHNcblx0XHRcdF9vZmYoZG9jdW1lbnQsICdkcm9wJywgdGhpcy5fb25Ecm9wKTtcblx0XHRcdF9vZmYoZG9jdW1lbnQsICdkcmFnb3ZlcicsIF9nbG9iYWxEcmFnT3Zlcik7XG5cblx0XHRcdF9vZmYodGhpcy5lbCwgJ2RyYWdlbmQnLCB0aGlzLl9vbkRyb3ApO1xuXHRcdFx0X29mZih0aGlzLmVsLCAnZHJhZ3N0YXJ0JywgdGhpcy5fb25EcmFnU3RhcnQpO1xuXHRcdFx0X29mZih0aGlzLmVsLCAnc2VsZWN0c3RhcnQnLCB0aGlzLl9vblRhcFN0YXJ0KTtcblxuXHRcdFx0dGhpcy5fb2ZmVXBFdmVudHMoKTtcblxuXHRcdFx0aWYoIGV2dCApe1xuXHRcdFx0XHRldnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZ0LnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0XHRcdGlmKCBnaG9zdEVsICl7XG5cdFx0XHRcdFx0Z2hvc3RFbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGdob3N0RWwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYoIGRyYWdFbCApe1xuXHRcdFx0XHRcdF9kaXNhYmxlRHJhZ2dhYmxlKGRyYWdFbCk7XG5cdFx0XHRcdFx0X3RvZ2dsZUNsYXNzKGRyYWdFbCwgdGhpcy5vcHRpb25zLmdob3N0Q2xhc3MsIGZhbHNlKTtcblxuXHRcdFx0XHRcdGlmKCAhcm9vdEVsLmNvbnRhaW5zKGRyYWdFbCkgKXtcblx0XHRcdFx0XHRcdC8vIFJlbW92ZSBldmVudFxuXHRcdFx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQocm9vdEVsLCAncmVtb3ZlJywgZHJhZ0VsKTtcblxuXHRcdFx0XHRcdFx0Ly8gQWRkIGV2ZW50XG5cdFx0XHRcdFx0XHRfZGlzcGF0Y2hFdmVudChkcmFnRWwsICdhZGQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSBpZiggZHJhZ0VsLm5leHRTaWJsaW5nICE9PSBuZXh0RWwgKXtcblx0XHRcdFx0XHRcdC8vIFVwZGF0ZSBldmVudFxuXHRcdFx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQoZHJhZ0VsLCAndXBkYXRlJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0X2Rpc3BhdGNoRXZlbnQoZHJhZ0VsLCAnZW5kJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTZXQgTlVMTFxuXHRcdFx0XHRyb290RWwgPVxuXHRcdFx0XHRkcmFnRWwgPVxuXHRcdFx0XHRnaG9zdEVsID1cblx0XHRcdFx0bmV4dEVsID1cblxuXHRcdFx0XHR0YXBFdnQgPVxuXHRcdFx0XHR0b3VjaEV2dCA9XG5cblx0XHRcdFx0bGFzdEVsID1cblx0XHRcdFx0bGFzdENTUyA9XG5cblx0XHRcdFx0YWN0aXZlR3JvdXAgPSBudWxsO1xuXG5cdFx0XHRcdC8vIFNhdmUgc29ydGluZ1xuXHRcdFx0XHR0aGlzLm9wdGlvbnMuc3RvcmUgJiYgdGhpcy5vcHRpb25zLnN0b3JlLnNldCh0aGlzKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cblx0XHQvKipcblx0XHQgKiBTZXJpYWxpemVzIHRoZSBpdGVtIGludG8gYW4gYXJyYXkgb2Ygc3RyaW5nLlxuXHRcdCAqIEByZXR1cm5zIHtTdHJpbmdbXX1cblx0XHQgKi9cblx0XHR0b0FycmF5OiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgb3JkZXIgPSBbXSxcblx0XHRcdFx0ZWwsXG5cdFx0XHRcdGNoaWxkcmVuID0gdGhpcy5lbC5jaGlsZHJlbixcblx0XHRcdFx0aSA9IDAsXG5cdFx0XHRcdG4gPSBjaGlsZHJlbi5sZW5ndGhcblx0XHRcdDtcblxuXHRcdFx0Zm9yICg7IGkgPCBuOyBpKyspIHtcblx0XHRcdFx0ZWwgPSBjaGlsZHJlbltpXTtcblx0XHRcdFx0aWYgKF9jbG9zZXN0KGVsLCB0aGlzLm9wdGlvbnMuZHJhZ2dhYmxlLCB0aGlzLmVsKSkge1xuXHRcdFx0XHRcdG9yZGVyLnB1c2goZWwuZ2V0QXR0cmlidXRlKCdkYXRhLWlkJykgfHwgX2dlbmVyYXRlSWQoZWwpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gb3JkZXI7XG5cdFx0fSxcblxuXG5cdFx0LyoqXG5cdFx0ICogU29ydHMgdGhlIGVsZW1lbnRzIGFjY29yZGluZyB0byB0aGUgYXJyYXkuXG5cdFx0ICogQHBhcmFtICB7U3RyaW5nW119ICBvcmRlciAgb3JkZXIgb2YgdGhlIGl0ZW1zXG5cdFx0ICovXG5cdFx0c29ydDogZnVuY3Rpb24gKG9yZGVyKSB7XG5cdFx0XHR2YXIgaXRlbXMgPSB7fSwgcm9vdEVsID0gdGhpcy5lbDtcblxuXHRcdFx0dGhpcy50b0FycmF5KCkuZm9yRWFjaChmdW5jdGlvbiAoaWQsIGkpIHtcblx0XHRcdFx0dmFyIGVsID0gcm9vdEVsLmNoaWxkcmVuW2ldO1xuXG5cdFx0XHRcdGlmIChfY2xvc2VzdChlbCwgdGhpcy5vcHRpb25zLmRyYWdnYWJsZSwgcm9vdEVsKSkge1xuXHRcdFx0XHRcdGl0ZW1zW2lkXSA9IGVsO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0aGlzKTtcblxuXG5cdFx0XHRvcmRlci5mb3JFYWNoKGZ1bmN0aW9uIChpZCkge1xuXHRcdFx0XHRpZiAoaXRlbXNbaWRdKSB7XG5cdFx0XHRcdFx0cm9vdEVsLnJlbW92ZUNoaWxkKGl0ZW1zW2lkXSk7XG5cdFx0XHRcdFx0cm9vdEVsLmFwcGVuZENoaWxkKGl0ZW1zW2lkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0sXG5cblxuXHRcdC8qKlxuXHRcdCAqIEZvciBlYWNoIGVsZW1lbnQgaW4gdGhlIHNldCwgZ2V0IHRoZSBmaXJzdCBlbGVtZW50IHRoYXQgbWF0Y2hlcyB0aGUgc2VsZWN0b3IgYnkgdGVzdGluZyB0aGUgZWxlbWVudCBpdHNlbGYgYW5kIHRyYXZlcnNpbmcgdXAgdGhyb3VnaCBpdHMgYW5jZXN0b3JzIGluIHRoZSBET00gdHJlZS5cblx0XHQgKiBAcGFyYW0gICB7SFRNTEVsZW1lbnR9ICBlbFxuXHRcdCAqIEBwYXJhbSAgIHtTdHJpbmd9ICAgICAgIFtzZWxlY3Rvcl0gIGRlZmF1bHQ6IGBvcHRpb25zLmRyYWdnYWJsZWBcblx0XHQgKiBAcmV0dXJucyB7SFRNTEVsZW1lbnR8bnVsbH1cblx0XHQgKi9cblx0XHRjbG9zZXN0OiBmdW5jdGlvbiAoZWwsIHNlbGVjdG9yKSB7XG5cdFx0XHRyZXR1cm4gX2Nsb3Nlc3QoZWwsIHNlbGVjdG9yIHx8IHRoaXMub3B0aW9ucy5kcmFnZ2FibGUsIHRoaXMuZWwpO1xuXHRcdH0sXG5cblxuXHRcdC8qKlxuXHRcdCAqIERlc3Ryb3lcblx0XHQgKi9cblx0XHRkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgZWwgPSB0aGlzLmVsLCBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuXG5cdFx0XHRfY3VzdG9tRXZlbnRzLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcblx0XHRcdFx0X29mZihlbCwgbmFtZS5zdWJzdHIoMikudG9Mb3dlckNhc2UoKSwgb3B0aW9uc1tuYW1lXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0X29mZihlbCwgJ21vdXNlZG93bicsIHRoaXMuX29uVGFwU3RhcnQpO1xuXHRcdFx0X29mZihlbCwgJ3RvdWNoc3RhcnQnLCB0aGlzLl9vblRhcFN0YXJ0KTtcblx0XHRcdF9vZmYoZWwsICdzZWxlY3RzdGFydCcsIHRoaXMuX29uVGFwU3RhcnQpO1xuXG5cdFx0XHRfb2ZmKGVsLCAnZHJhZ292ZXInLCB0aGlzLl9vbkRyYWdPdmVyKTtcblx0XHRcdF9vZmYoZWwsICdkcmFnZW50ZXInLCB0aGlzLl9vbkRyYWdPdmVyKTtcblxuXHRcdFx0Ly9yZW1vdmUgZHJhZ2dhYmxlIGF0dHJpYnV0ZXNcblx0XHRcdEFycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwoZWwucXVlcnlTZWxlY3RvckFsbCgnW2RyYWdnYWJsZV0nKSwgZnVuY3Rpb24oZWwpIHtcblx0XHRcdFx0ZWwucmVtb3ZlQXR0cmlidXRlKCdkcmFnZ2FibGUnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0b3VjaERyYWdPdmVyTGlzdGVuZXJzLnNwbGljZSh0b3VjaERyYWdPdmVyTGlzdGVuZXJzLmluZGV4T2YodGhpcy5fb25EcmFnT3ZlciksIDEpO1xuXG5cdFx0XHR0aGlzLl9vbkRyb3AoKTtcblxuXHRcdFx0dGhpcy5lbCA9IG51bGw7XG5cdFx0fVxuXHR9O1xuXG5cblx0ZnVuY3Rpb24gX2JpbmQoY3R4LCBmbil7XG5cdFx0dmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG5cdFx0cmV0dXJuXHRmbi5iaW5kID8gZm4uYmluZC5hcHBseShmbiwgW2N0eF0uY29uY2F0KGFyZ3MpKSA6IGZ1bmN0aW9uICgpe1xuXHRcdFx0cmV0dXJuIGZuLmFwcGx5KGN0eCwgYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG5cdFx0fTtcblx0fVxuXG5cblx0ZnVuY3Rpb24gX2Nsb3Nlc3QoZWwsIHNlbGVjdG9yLCBjdHgpe1xuXHRcdGlmKCBzZWxlY3RvciA9PT0gJyonICl7XG5cdFx0XHRyZXR1cm4gZWw7XG5cdFx0fVxuXHRcdGVsc2UgaWYoIGVsICl7XG5cdFx0XHRjdHggPSBjdHggfHwgZG9jdW1lbnQ7XG5cdFx0XHRzZWxlY3RvciA9IHNlbGVjdG9yLnNwbGl0KCcuJyk7XG5cblx0XHRcdHZhclxuXHRcdFx0XHQgIHRhZyA9IHNlbGVjdG9yLnNoaWZ0KCkudG9VcHBlckNhc2UoKVxuXHRcdFx0XHQsIHJlID0gbmV3IFJlZ0V4cCgnXFxcXHMoJytzZWxlY3Rvci5qb2luKCd8JykrJylcXFxccycsICdnJylcblx0XHRcdDtcblxuXHRcdFx0ZG8ge1xuXHRcdFx0XHRpZihcblx0XHRcdFx0XHQgICAodGFnID09PSAnJyB8fCBlbC5ub2RlTmFtZSA9PSB0YWcpXG5cdFx0XHRcdFx0JiYgKCFzZWxlY3Rvci5sZW5ndGggfHwgKCgnICcrZWwuY2xhc3NOYW1lKycgJykubWF0Y2gocmUpIHx8IFtdKS5sZW5ndGggPT0gc2VsZWN0b3IubGVuZ3RoKVxuXHRcdFx0XHQpe1xuXHRcdFx0XHRcdHJldHVyblx0ZWw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHdoaWxlKCBlbCAhPT0gY3R4ICYmIChlbCA9IGVsLnBhcmVudE5vZGUpICk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuXHRudWxsO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfZ2xvYmFsRHJhZ092ZXIoZXZ0KXtcblx0XHRldnQuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnbW92ZSc7XG5cdFx0ZXZ0LnByZXZlbnREZWZhdWx0KCk7XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF9vbihlbCwgZXZlbnQsIGZuKXtcblx0XHRlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBmbiwgZmFsc2UpO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfb2ZmKGVsLCBldmVudCwgZm4pe1xuXHRcdGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGZuLCBmYWxzZSk7XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF90b2dnbGVDbGFzcyhlbCwgbmFtZSwgc3RhdGUpe1xuXHRcdGlmKCBlbCApe1xuXHRcdFx0aWYoIGVsLmNsYXNzTGlzdCApe1xuXHRcdFx0XHRlbC5jbGFzc0xpc3Rbc3RhdGUgPyAnYWRkJyA6ICdyZW1vdmUnXShuYW1lKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR2YXIgY2xhc3NOYW1lID0gKCcgJytlbC5jbGFzc05hbWUrJyAnKS5yZXBsYWNlKC9cXHMrL2csICcgJykucmVwbGFjZSgnICcrbmFtZSsnICcsICcnKTtcblx0XHRcdFx0ZWwuY2xhc3NOYW1lID0gY2xhc3NOYW1lICsgKHN0YXRlID8gJyAnK25hbWUgOiAnJylcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF9jc3MoZWwsIHByb3AsIHZhbCl7XG5cdFx0aWYoIGVsICYmIGVsLnN0eWxlICl7XG5cdFx0XHRpZiggdmFsID09PSB2b2lkIDAgKXtcblx0XHRcdFx0aWYoIGRvY3VtZW50LmRlZmF1bHRWaWV3ICYmIGRvY3VtZW50LmRlZmF1bHRWaWV3LmdldENvbXB1dGVkU3R5bGUgKXtcblx0XHRcdFx0XHR2YWwgPSBkb2N1bWVudC5kZWZhdWx0Vmlldy5nZXRDb21wdXRlZFN0eWxlKGVsLCAnJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiggZWwuY3VycmVudFN0eWxlICl7XG5cdFx0XHRcdFx0dmFsXHQ9IGVsLmN1cnJlbnRTdHlsZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm5cdHByb3AgPT09IHZvaWQgMCA/IHZhbCA6IHZhbFtwcm9wXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVsLnN0eWxlW3Byb3BdID0gdmFsICsgKHR5cGVvZiB2YWwgPT09ICdzdHJpbmcnID8gJycgOiAncHgnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGZ1bmN0aW9uIF9maW5kKGN0eCwgdGFnTmFtZSwgaXRlcmF0b3Ipe1xuXHRcdGlmKCBjdHggKXtcblx0XHRcdHZhciBsaXN0ID0gY3R4LmdldEVsZW1lbnRzQnlUYWdOYW1lKHRhZ05hbWUpLCBpID0gMCwgbiA9IGxpc3QubGVuZ3RoO1xuXHRcdFx0aWYoIGl0ZXJhdG9yICl7XG5cdFx0XHRcdGZvciggOyBpIDwgbjsgaSsrICl7XG5cdFx0XHRcdFx0aXRlcmF0b3IobGlzdFtpXSwgaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVyblx0bGlzdDtcblx0XHR9XG5cdFx0cmV0dXJuXHRbXTtcblx0fVxuXG5cblx0ZnVuY3Rpb24gX2Rpc2FibGVEcmFnZ2FibGUoZWwpe1xuXHRcdHJldHVybiBlbC5kcmFnZ2FibGUgPSBmYWxzZTtcblx0fVxuXG5cblx0ZnVuY3Rpb24gX3Vuc2lsZW50KCl7XG5cdFx0X3NpbGVudCA9IGZhbHNlO1xuXHR9XG5cblxuXHRmdW5jdGlvbiBfZ2hvc3RJbkJvdHRvbShlbCwgZXZ0KXtcblx0XHR2YXIgbGFzdCA9IGVsLmxhc3RFbGVtZW50Q2hpbGQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0cmV0dXJuIGV2dC5jbGllbnRZIC0gKGxhc3QudG9wICsgbGFzdC5oZWlnaHQpID4gNTsgLy8gbWluIGRlbHRhXG5cdH1cblxuXG5cdC8qKlxuXHQgKiBHZW5lcmF0ZSBpZFxuXHQgKiBAcGFyYW0gICB7SFRNTEVsZW1lbnR9IGVsXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9XG5cdCAqIEBwcml2YXRlXG5cdCAqL1xuXHRmdW5jdGlvbiBfZ2VuZXJhdGVJZChlbCkge1xuXHRcdHZhciBzdHIgPSBlbC50YWdOYW1lICsgZWwuY2xhc3NOYW1lICsgZWwuc3JjICsgZWwuaHJlZiArIGVsLnRleHRDb250ZW50LFxuXHRcdFx0aSA9IHN0ci5sZW5ndGgsXG5cdFx0XHRzdW0gPSAwXG5cdFx0O1xuXG5cdFx0d2hpbGUgKGktLSkge1xuXHRcdFx0c3VtICs9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdW0udG9TdHJpbmcoMzYpO1xuXHR9XG5cblxuXHQvLyBFeHBvcnQgdXRpbHNcblx0U29ydGFibGUudXRpbHMgPSB7XG5cdFx0b246IF9vbixcblx0XHRvZmY6IF9vZmYsXG5cdFx0Y3NzOiBfY3NzLFxuXHRcdGZpbmQ6IF9maW5kLFxuXHRcdGJpbmQ6IF9iaW5kLFxuXHRcdGNsb3Nlc3Q6IF9jbG9zZXN0LFxuXHRcdHRvZ2dsZUNsYXNzOiBfdG9nZ2xlQ2xhc3MsXG5cdFx0Y3JlYXRlRXZlbnQ6IF9jcmVhdGVFdmVudCxcblx0XHRkaXNwYXRjaEV2ZW50OiBfZGlzcGF0Y2hFdmVudFxuXHR9O1xuXG5cblx0U29ydGFibGUudmVyc2lvbiA9ICcwLjUuMic7XG5cblxuXHQvLyBFeHBvcnRcblx0cmV0dXJuIFNvcnRhYmxlO1xufSk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnLCBbJ3lvdXR1YmUtZW1iZWQnXSk7XG5cbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBIYXNoID0gZnVuY3Rpb24oJHdpbmRvdykge1xuXG4gICAgcmV0dXJuIHtcblxuICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGhhc2ggPSBkZWNvZGVVUklDb21wb25lbnQoJHdpbmRvdy5sb2NhdGlvbi5oYXNoLnN1YnN0cmluZygxKSk7XG4gICAgICAgIGlmIChoYXNoLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYW5ndWxhci5mcm9tSnNvbihCYXNlNjQuYnRvdShSYXdEZWZsYXRlLmluZmxhdGUoQmFzZTY0LmZyb21CYXNlNjQoaGFzaCkpKSk7XG4gICAgICB9LFxuXG4gICAgICBzZXQ6IGZ1bmN0aW9uKGFycikge1xuICAgICAgICAkd2luZG93LmxvY2F0aW9uLmhhc2ggPSBhcnIubGVuZ3RoID09PSAwID8gJycgOiBlbmNvZGVVUklDb21wb25lbnQoQmFzZTY0LnRvQmFzZTY0KFJhd0RlZmxhdGUuZGVmbGF0ZShCYXNlNjQudXRvYihhbmd1bGFyLnRvSnNvbihhcnIpKSkpKTtcbiAgICAgIH0sXG5cbiAgICB9O1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmZhY3RvcnkoJ0hhc2gnLCBbJyR3aW5kb3cnLCBIYXNoXSk7XG5cbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBqb2NrZXkgPSByZXF1aXJlKCdqb2NrZXknKTtcblxuICB2YXIgUGxheWxpc3RNb2RlbCA9IGZ1bmN0aW9uKCRyb290U2NvcGUsIEhhc2gpIHtcblxuICAgIHZhciBpdGVtcyA9IEhhc2guZ2V0KCk7XG4gICAgdmFyIGNicyA9IHtcbiAgICAgIG9uTW9kZWxDaGFuZ2U6IGZ1bmN0aW9uKGl0ZW1zKSB7XG4gICAgICAgIEhhc2guc2V0KGl0ZW1zKTtcbiAgICAgIH0sXG4gICAgICBvblN0YXRlQ2hhbmdlOiBmdW5jdGlvbihzdGF0ZSwgY3VycmVudEl0ZW0pIHtcbiAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KHN0YXRlLCBjdXJyZW50SXRlbSk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gam9ja2V5KGl0ZW1zLCBjYnMpO1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmZhY3RvcnkoJ1BsYXlsaXN0TW9kZWwnLCBbJyRyb290U2NvcGUnLCAnSGFzaCcsIFBsYXlsaXN0TW9kZWxdKTtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFQSV9LRVkgPSAnQUl6YVN5Q2k2N0VUaTh5UGR5T2NsajhUNzBQckkzejhXRW9lOWZvJztcblxuICB2YXIgbWFwID0gZnVuY3Rpb24oYXJyLCBjYikge1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgaSA9IC0xO1xuICAgIHZhciBsZW4gPSBhcnIubGVuZ3RoO1xuICAgIHdoaWxlICgrK2kgPCBsZW4pIHtcbiAgICAgIHJlc3VsdC5wdXNoKGNiKGFycltpXSwgaSkpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIHZhciBZb3VUdWJlQVBJID0gZnVuY3Rpb24oJGh0dHApIHtcblxuICAgIHZhciB6ZXJvUGFkID0gZnVuY3Rpb24obiwgd2lkdGgpIHtcbiAgICAgIG4gPSBuID8gbiArICcnIDogJyc7XG4gICAgICByZXR1cm4gbi5sZW5ndGggPj0gd2lkdGggPyBuIDogbmV3IEFycmF5KHdpZHRoIC0gbi5sZW5ndGggKyAxKS5qb2luKCcwJykgKyBuO1xuICAgIH07XG5cbiAgICB2YXIgZm9ybWF0RHVyYXRpb24gPSBmdW5jdGlvbihzdHIsIGRlbGltZXRlcikge1xuICAgICAgdmFyIG1hdGNoZXMgPSBzdHIubWF0Y2goL15QVCg/OihcXGQrKUgpPyg/OihcXGQrKU0pPyg/OihcXGQrKVMpPyQvKS5zbGljZSgxLCA0KTtcbiAgICAgIHZhciBpID0gLTE7XG4gICAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgICBpZiAoYW5ndWxhci5pc1VuZGVmaW5lZChtYXRjaGVzWzJdKSkge1xuICAgICAgICBtYXRjaGVzWzJdID0gJzAnO1xuICAgICAgfVxuICAgICAgd2hpbGUgKCsraSA8IDMpIHtcbiAgICAgICAgdmFyIG1hdGNoID0gbWF0Y2hlc1tpXTtcbiAgICAgICAgaWYgKCFhbmd1bGFyLmlzVW5kZWZpbmVkKG1hdGNoKSkge1xuICAgICAgICAgIHJlc3VsdC5wdXNoKHplcm9QYWQobWF0Y2gsIDIpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5qb2luKGRlbGltZXRlcik7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICBzZWFyY2g6IGZ1bmN0aW9uKHF1ZXJ5KSB7XG4gICAgICAgIHF1ZXJ5ID0gZW5jb2RlVVJJQ29tcG9uZW50KHF1ZXJ5KS5yZXBsYWNlKC8lMjAvZywgJysnKTtcbiAgICAgICAgdmFyIGVuZHBvaW50ID0gJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3lvdXR1YmUvdjMvc2VhcmNoP3BhcnQ9c25pcHBldCZmaWVsZHM9aXRlbXMoaWQlMkNzbmlwcGV0KSZtYXhSZXN1bHRzPTUwJm9yZGVyPXZpZXdDb3VudCZxPScgKyBxdWVyeSArICcmdHlwZT12aWRlbyZ2aWRlb0VtYmVkZGFibGU9dHJ1ZSZ2aWRlb1N5bmRpY2F0ZWQ9dHJ1ZSZrZXk9JyArIEFQSV9LRVk7XG4gICAgICAgIHJldHVybiAkaHR0cC5nZXQoZW5kcG9pbnQpXG4gICAgICAgICAgLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCkge1xuICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWFwKHJlc3BvbnNlLmRhdGEuaXRlbXMsIGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0uaWQudmlkZW9JZDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oZnVuY3Rpb24oaWRzKSB7XG4gICAgICAgICAgICB2YXIgZW5kcG9pbnQgPSAnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20veW91dHViZS92My92aWRlb3M/cGFydD1pZCUyQ2NvbnRlbnREZXRhaWxzJTJDc25pcHBldCZpZD0nICsgaWRzLmpvaW4oJyUyQycpICsgJyZmaWVsZHM9aXRlbXMoaWQlMkNjb250ZW50RGV0YWlscyUyQ3NuaXBwZXQpJmtleT0nICsgQVBJX0tFWTtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoZW5kcG9pbnQpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCkge1xuICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWFwKHJlc3BvbnNlLmRhdGEuaXRlbXMsIGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBpZDogaXRlbS5pZCxcbiAgICAgICAgICAgICAgICB0aXRsZTogaXRlbS5zbmlwcGV0LnRpdGxlLFxuICAgICAgICAgICAgICAgIGR1cmF0aW9uOiBmb3JtYXREdXJhdGlvbihpdGVtLmNvbnRlbnREZXRhaWxzLmR1cmF0aW9uLCAnOicpXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmZhY3RvcnkoJ1lvdVR1YmVBUEknLCBbJyRodHRwJywgWW91VHViZUFQSV0pO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCkge1xuXG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgeXFFZGl0YWJsZSA9IGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHNjb3BlID0ge1xuICAgICAgY2FsbGJhY2s6ICc9eXFFZGl0YWJsZSdcbiAgICB9O1xuXG4gICAgdmFyIGxpbmsgPSBmdW5jdGlvbihzY29wZSwgZWxlbWVudCkge1xuICAgICAgZWxlbWVudC5vbigna2V5cHJlc3MnLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIGlmIChlLmtleUNvZGUgPT09IDEzIHx8IGUua2V5Q29kZSA9PT0gMjcpIHtcbiAgICAgICAgICBlLnRhcmdldC5ibHVyKCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgZWxlbWVudC5vbignYmx1cicsIGZ1bmN0aW9uKCkge1xuICAgICAgICBzY29wZS5jYWxsYmFjayhzY29wZS4kcGFyZW50LiRpbmRleCwgZWxlbWVudC50ZXh0KCkpO1xuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgc2NvcGU6IHNjb3BlLFxuICAgICAgbGluazogbGlua1xuICAgIH07XG5cbiAgfTtcblxuICBhbmd1bGFyLm1vZHVsZSgnYXBwJykuZGlyZWN0aXZlKCd5cUVkaXRhYmxlJywgW3lxRWRpdGFibGVdKTtcblxufSkoKTtcbiIsIi8qIGdsb2JhbHMgU29ydGFibGUgKi9cbihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHlxU29ydGFibGUgPSBmdW5jdGlvbigpIHtcblxuICAgIHZhciBzY29wZSA9IHtcbiAgICAgIGNhbGxiYWNrOiAnPXlxU29ydGFibGUnLFxuICAgICAgaGFuZGxlOiAnQHlxU29ydGFibGVIYW5kbGUnLFxuICAgICAgZ2hvc3RDbGFzczogJ0B5cVNvcnRhYmxlR2hvc3RDbGFzcycsXG4gICAgfTtcblxuICAgIHZhciBsaW5rID0gZnVuY3Rpb24oc2NvcGUsIGVsZW1lbnQpIHtcbiAgICAgIHZhciBvblVwZGF0ZSA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgdmFyIGl0ZW1zID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZWxlbWVudC5jaGlsZHJlbigpKTtcbiAgICAgICAgdmFyIG1vdmVkSXRlbSA9IGUuaXRlbTtcbiAgICAgICAgdmFyIG9sZEluZGV4ID0gYW5ndWxhci5lbGVtZW50KG1vdmVkSXRlbSkuc2NvcGUoKS4kaW5kZXg7XG4gICAgICAgIHZhciBuZXdJbmRleCA9IGl0ZW1zLmluZGV4T2YobW92ZWRJdGVtKTtcbiAgICAgICAgc2NvcGUuY2FsbGJhY2sob2xkSW5kZXgsIG5ld0luZGV4KTtcbiAgICAgIH07XG4gICAgICBuZXcgU29ydGFibGUoZWxlbWVudFswXSwge1xuICAgICAgICBoYW5kbGU6IHNjb3BlLmhhbmRsZSxcbiAgICAgICAgZ2hvc3RDbGFzczogc2NvcGUuZ2hvc3RDbGFzcyxcbiAgICAgICAgb25VcGRhdGU6IG9uVXBkYXRlLFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgc2NvcGU6IHNjb3BlLFxuICAgICAgbGluazogbGlua1xuICAgIH07XG5cbiAgfTtcblxuICBhbmd1bGFyLm1vZHVsZSgnYXBwJykuZGlyZWN0aXZlKCd5cVNvcnRhYmxlJywgW3lxU29ydGFibGVdKTtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHlxU3luY0ZvY3VzID0gZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgc2NvcGUgPSB7XG4gICAgICB2YWw6ICc9eXFTeW5jRm9jdXMnXG4gICAgfTtcblxuICAgIHZhciBsaW5rID0gZnVuY3Rpb24oJHNjb3BlLCAkZWxlbWVudCkge1xuICAgICAgJHNjb3BlLiR3YXRjaCgndmFsJywgZnVuY3Rpb24oY3VycmVudFZhbCwgcHJldmlvdXNWYWwpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRWYWwgJiYgIXByZXZpb3VzVmFsKSB7XG4gICAgICAgICAgJGVsZW1lbnRbMF0uZm9jdXMoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFjdXJyZW50VmFsICYmIHByZXZpb3VzVmFsKSB7XG4gICAgICAgICAgJGVsZW1lbnRbMF0uYmx1cigpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICBzY29wZTogc2NvcGUsXG4gICAgICBsaW5rOiBsaW5rXG4gICAgfTtcblxuICB9O1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdhcHAnKS5kaXJlY3RpdmUoJ3lxU3luY0ZvY3VzJywgW3lxU3luY0ZvY3VzXSk7XG5cbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBUSVRMRSA9ICdYT1hPJztcblxuICB2YXIgTWFpbkN0cmwgPSBmdW5jdGlvbigkc2NvcGUsIFBsYXlsaXN0TW9kZWwpIHtcblxuICAgICRzY29wZS5pc1NlYXJjaE9wZW4gPSBmYWxzZTtcbiAgICAkc2NvcGUuaXNWaWRlb1Zpc2libGUgPSBmYWxzZTtcblxuICAgICRzY29wZS50aXRsZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKFBsYXlsaXN0TW9kZWwuaXNQbGF5aW5nKCkpIHtcbiAgICAgICAgcmV0dXJuICdcXHUyNUI2ICcgKyBUSVRMRTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBUSVRMRTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmlzU3RvcHBlZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFBsYXlsaXN0TW9kZWwuaXNTdG9wcGVkKCk7XG4gICAgfTtcblxuICAgICRzY29wZS50b2dnbGVTZWFyY2ggPSBmdW5jdGlvbigpIHtcbiAgICAgICRzY29wZS5pc1NlYXJjaE9wZW4gPSAhJHNjb3BlLmlzU2VhcmNoT3BlbjtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnRvZ2dsZVZpZGVvID0gZnVuY3Rpb24oKSB7XG4gICAgICAkc2NvcGUuaXNWaWRlb1Zpc2libGUgPSAhJHNjb3BlLmlzVmlkZW9WaXNpYmxlO1xuICAgIH07XG5cbiAgfTtcblxuICBhbmd1bGFyLm1vZHVsZSgnYXBwJykuY29udHJvbGxlcignTWFpbkN0cmwnLCBbJyRzY29wZScsICdQbGF5bGlzdE1vZGVsJywgTWFpbkN0cmxdKTtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIFBsYXllckN0cmwgPSBmdW5jdGlvbigkc2NvcGUsIC8qICRpbnRlcnZhbCwgKi8gJHRpbWVvdXQsIFBsYXlsaXN0TW9kZWwpIHtcblxuICAgIHZhciBQTEFZSU5HID0gMTtcbiAgICAvLyB2YXIgX2ludGVydmFsID0gbnVsbDtcblxuICAgICRzY29wZS5pZCA9IG51bGw7XG4gICAgJHNjb3BlLnBsYXllciA9IG51bGw7XG4gICAgJHNjb3BlLmlzVmlzaWJsZSA9IGZhbHNlO1xuICAgIC8vICRzY29wZS5lbGFwc2VkID0gMDtcblxuICAgIHZhciBfaXNNb3VudGVkID0gZnVuY3Rpb24oaWQpIHtcbiAgICAgIGlmICgkc2NvcGUucGxheWVyID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGlmICghYW5ndWxhci5pc1VuZGVmaW5lZChpZCkpIHtcbiAgICAgICAgcmV0dXJuICRzY29wZS5pZCA9PT0gaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gJHNjb3BlLmlkICE9PSBudWxsO1xuICAgIH07XG5cbiAgICAvLyB2YXIgX3Jlc2V0UHJvZ3Jlc3MgPSBmdW5jdGlvbigpIHtcbiAgICAvLyAgICRpbnRlcnZhbC5jYW5jZWwoX2ludGVydmFsKTtcbiAgICAvLyAgIF9pbnRlcnZhbCA9IG51bGw7XG4gICAgLy8gICAkc2NvcGUuZWxhcHNlZCA9IDA7XG4gICAgLy8gfTtcblxuICAgIHZhciBfc3RvcCA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKF9pc01vdW50ZWQoKSkge1xuICAgICAgICAkc2NvcGUucGxheWVyLnN0b3BWaWRlbygpO1xuICAgICAgICAkc2NvcGUuaWQgPSBudWxsO1xuICAgICAgfVxuICAgICAgLy8gX3Jlc2V0UHJvZ3Jlc3MoKTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnRvZ2dsZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgJHNjb3BlLmlzVmlzaWJsZSA9ICEkc2NvcGUuaXNWaXNpYmxlO1xuICAgIH07XG5cbiAgICAkc2NvcGUuJG9uKCdzdG9wcGVkJywgZnVuY3Rpb24oKSB7XG4gICAgICBfc3RvcCgpO1xuICAgIH0pO1xuXG4gICAgJHNjb3BlLiRvbigncGxheWluZycsIGZ1bmN0aW9uKF8sIGl0ZW0pIHtcbiAgICAgIHZhciBpZCA9IGl0ZW0uaWQ7XG4gICAgICBpZiAoX2lzTW91bnRlZChpZCkpIHtcbiAgICAgICAgaWYgKCRzY29wZS5wbGF5ZXIuZ2V0UGxheWVyU3RhdGUoKSAhPT0gUExBWUlORykge1xuICAgICAgICAgICRzY29wZS5wbGF5ZXIucGxheVZpZGVvKCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIF9zdG9wKCk7XG4gICAgICAgICRzY29wZS5pZCA9IGlkO1xuICAgICAgICBpZiAoJHNjb3BlLnBsYXllciAhPT0gbnVsbCkge1xuICAgICAgICAgICRzY29wZS5wbGF5ZXIubG9hZFZpZGVvQnlJZChpZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgICRzY29wZS4kb24oJ3BhdXNlZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKCFfaXNNb3VudGVkKCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgJHNjb3BlLnBsYXllci5wYXVzZVZpZGVvKCk7XG4gICAgfSk7XG5cbiAgICAkc2NvcGUuJG9uKCd5b3V0dWJlLnBsYXllci5yZWFkeScsIGZ1bmN0aW9uKF8sIHBsYXllcikge1xuICAgICAgcGxheWVyLnNldFZvbHVtZSgxMDApO1xuICAgICAgcGxheWVyLnBsYXlWaWRlbygpO1xuICAgICAgJHNjb3BlLnBsYXllciA9IHBsYXllcjtcbiAgICB9KTtcblxuICAgIC8vICRzY29wZS4kb24oJ3lvdXR1YmUucGxheWVyLnBsYXlpbmcnLCBmdW5jdGlvbigpIHtcbiAgICAvLyAgIHZhciBwbGF5ZXIgPSAkc2NvcGUucGxheWVyO1xuICAgIC8vICAgX3Jlc2V0UHJvZ3Jlc3MoKTtcbiAgICAvLyAgICRzY29wZS5lbGFwc2VkID0gKHBsYXllci5nZXRDdXJyZW50VGltZSgpIC8gcGxheWVyLmdldER1cmF0aW9uKCkgKiAxMDApO1xuICAgIC8vICAgX2ludGVydmFsID0gJGludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgIC8vICAgICAkc2NvcGUuZWxhcHNlZCA9IChwbGF5ZXIuZ2V0Q3VycmVudFRpbWUoKSAvIHBsYXllci5nZXREdXJhdGlvbigpICogMTAwKTtcbiAgICAvLyAgIH0sIDQwMCk7XG4gICAgLy8gfSk7XG5cbiAgICAkc2NvcGUuJG9uKCd5b3V0dWJlLnBsYXllci5lbmRlZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgLy8gX3Jlc2V0UHJvZ3Jlc3MoKTtcbiAgICAgIFBsYXlsaXN0TW9kZWwubmV4dCgpO1xuICAgIH0pO1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmNvbnRyb2xsZXIoJ1BsYXllckN0cmwnLCBbJyRzY29wZScsIC8qICckaW50ZXJ2YWwnLCAqLyAnJHRpbWVvdXQnLCAnUGxheWxpc3RNb2RlbCcsIFBsYXllckN0cmxdKTtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIFBsYXlsaXN0Q3RybCA9IGZ1bmN0aW9uKCRzY29wZSwgUGxheWxpc3RNb2RlbCkge1xuXG4gICAgLy8gcGxheWVyIHN0YXRlXG4gICAgJHNjb3BlLmlzU3RvcHBlZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFBsYXlsaXN0TW9kZWwuaXNTdG9wcGVkKCk7XG4gICAgfTtcbiAgICAkc2NvcGUuaXNQbGF5aW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gUGxheWxpc3RNb2RlbC5pc1BsYXlpbmcoKTtcbiAgICB9O1xuICAgICRzY29wZS5pc1BhdXNlZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFBsYXlsaXN0TW9kZWwuaXNQYXVzZWQoKTtcbiAgICB9O1xuICAgICRzY29wZS5pc1JlcGVhdGluZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFBsYXlsaXN0TW9kZWwuaXNSZXBlYXRpbmcoKTtcbiAgICB9O1xuICAgICRzY29wZS5pc1NodWZmbGluZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFBsYXlsaXN0TW9kZWwuaXNTaHVmZmxpbmcoKTtcbiAgICB9O1xuXG4gICAgLy8gZ2V0IGl0ZW1zIGluIHBsYXlsaXN0XG4gICAgJHNjb3BlLmdldCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIFBsYXlsaXN0TW9kZWwuZ2V0KCk7XG4gICAgfTtcbiAgICAkc2NvcGUuZ2V0Q3VycmVudEluZGV4ID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gUGxheWxpc3RNb2RlbC5nZXRDdXJyZW50SW5kZXgoKTtcbiAgICB9O1xuXG4gICAgLy8gY2hhbmdlIHBsYXlsaXN0IHN0YXRlXG4gICAgJHNjb3BlLnBsYXkgPSBmdW5jdGlvbihpbmRleCkge1xuICAgICAgaWYgKGFuZ3VsYXIuaXNVbmRlZmluZWQoaW5kZXgpKSB7XG4gICAgICAgIGlmIChQbGF5bGlzdE1vZGVsLmlzUGxheWluZygpKSB7XG4gICAgICAgICAgUGxheWxpc3RNb2RlbC5wYXVzZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFBsYXlsaXN0TW9kZWwucGxheSgpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBQbGF5bGlzdE1vZGVsLnBsYXkoaW5kZXgpO1xuICAgICAgfVxuICAgIH07XG4gICAgJHNjb3BlLnByZXZpb3VzID0gZnVuY3Rpb24oKSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLnByZXZpb3VzKCk7XG4gICAgfTtcbiAgICAkc2NvcGUubmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgUGxheWxpc3RNb2RlbC5uZXh0KCk7XG4gICAgfTtcbiAgICAkc2NvcGUucmVwZWF0ID0gZnVuY3Rpb24oKSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLnJlcGVhdCgpO1xuICAgIH07XG4gICAgJHNjb3BlLnNodWZmbGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIFBsYXlsaXN0TW9kZWwuc2h1ZmZsZSgpO1xuICAgIH07XG5cbiAgICAvLyBjaGFuZ2UgcGxheWxpc3QgbW9kZWxcbiAgICAkc2NvcGUucmVtb3ZlID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgICAgIFBsYXlsaXN0TW9kZWwucmVtb3ZlKGluZGV4KTtcbiAgICB9O1xuICAgICRzY29wZS5zb3J0YWJsZUNhbGxiYWNrID0gZnVuY3Rpb24ob2xkSW5kZXgsIG5ld0luZGV4KSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLnJlb3JkZXIob2xkSW5kZXgsIG5ld0luZGV4KTtcbiAgICB9O1xuICAgICRzY29wZS5lZGl0YWJsZUNhbGxiYWNrID0gZnVuY3Rpb24oaW5kZXgsIG5ld1RpdGxlKSB7XG4gICAgICB2YXIgaXRlbSA9IFBsYXlsaXN0TW9kZWwuZ2V0KGluZGV4KTtcbiAgICAgIGl0ZW0udGl0bGUgPSBuZXdUaXRsZTtcbiAgICAgIFBsYXlsaXN0TW9kZWwuc2V0KGluZGV4LCBpdGVtKTtcbiAgICB9O1xuXG4gIH07XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2FwcCcpLmNvbnRyb2xsZXIoJ1BsYXlsaXN0Q3RybCcsIFsnJHNjb3BlJywgJ1BsYXlsaXN0TW9kZWwnLCBQbGF5bGlzdEN0cmxdKTtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblxuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIFNlYXJjaEN0cmwgPSBmdW5jdGlvbigkc2NvcGUsIFBsYXlsaXN0TW9kZWwsIFlvdVR1YmVBUEkpIHtcblxuICAgIHZhciByZXN1bHRzID0gW107XG5cbiAgICAkc2NvcGUucXVlcnkgPSAnJztcbiAgICAkc2NvcGUubG9hZGluZyA9IGZhbHNlO1xuXG4gICAgJHNjb3BlLmFkZFRvUGxheWxpc3QgPSBmdW5jdGlvbihpdGVtKSB7XG4gICAgICBQbGF5bGlzdE1vZGVsLmFkZChhbmd1bGFyLmNvcHkoaXRlbSkpO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc2VhcmNoID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXN1bHRzID0gW107IC8vIGNsZWFyIGByZXN1bHRzYFxuICAgICAgaWYgKCRzY29wZS5xdWVyeSA9PT0gJycpIHtcbiAgICAgICAgJHNjb3BlLmxvYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgJHNjb3BlLmxvYWRpbmcgPSB0cnVlO1xuICAgICAgWW91VHViZUFQSS5zZWFyY2goJHNjb3BlLnF1ZXJ5KS50aGVuKGZ1bmN0aW9uKHIpIHtcbiAgICAgICAgJHNjb3BlLmxvYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgcmVzdWx0cyA9IHI7XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmdldFJlc3VsdHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH07XG5cbiAgfTtcblxuICBhbmd1bGFyLm1vZHVsZSgnYXBwJykuY29udHJvbGxlcignU2VhcmNoQ3RybCcsIFsnJHNjb3BlJywgJ1BsYXlsaXN0TW9kZWwnLCAnWW91VHViZUFQSScsIFNlYXJjaEN0cmxdKTtcblxufSkoKTtcbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==