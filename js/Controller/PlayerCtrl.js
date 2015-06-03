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
