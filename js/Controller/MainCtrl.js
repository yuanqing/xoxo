(function() {

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
