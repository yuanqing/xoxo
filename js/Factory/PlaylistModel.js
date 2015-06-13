/* globals jockey */

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
