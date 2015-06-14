(function() {

  'use strict';

  var PlaylistCtrl = function($scope, PlaylistModel) {

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


    $scope.set = function(index, newTitle) {
      console.log('set', index, newTitle);
      var item = PlaylistModel.get(index);
      item.title = newTitle;
      PlaylistModel.set(index, item);
    };

  };

  angular.module('app').controller('PlaylistCtrl', ['$scope', 'PlaylistModel', PlaylistCtrl]);

})();
