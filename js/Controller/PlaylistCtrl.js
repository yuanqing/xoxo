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
