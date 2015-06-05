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
