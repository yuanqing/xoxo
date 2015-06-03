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
