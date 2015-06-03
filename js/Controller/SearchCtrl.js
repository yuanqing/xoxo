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
