/* globals Base64, RawDeflate */
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
