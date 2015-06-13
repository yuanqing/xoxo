(function() {

  'use strict';

  // https://developers.google.com/youtube/iframe_api_reference#Playback_status
  var PLAYING = 1;

  var PlayerCtrl = function($scope, PlaylistModel) {

    $scope.id = null;
    $scope.player = null;

    $scope.$on('play', function(_, item) {
      var id = item.id;
      $scope.id = id;
      if ($scope.player !== null) {
        $scope.player.loadVideoById(id);
      }
    });

    var pause = function() {
      if ($scope.player === null) {
        return;
      }
      $scope.player.pauseVideo();
    };

    $scope.$on('stop', pause);

    $scope.$on('pause', pause);

    $scope.$on('resume', function() {
      if ($scope.player.getPlayerState() !== PLAYING) {
        $scope.player.playVideo();
      }
    });

    $scope.$on('youtube.player.playing', function() {
      if (PlaylistModel.isPaused()) {
        PlaylistModel.play();
      }
    });

    $scope.$on('youtube.player.paused', function() {
      if (PlaylistModel.isPlaying()) {
        PlaylistModel.play();
      }
    });

    $scope.$on('youtube.player.ready', function(_, player) {
      player.setVolume(100);
      player.playVideo();
      $scope.player = player;
    });

    $scope.$on('youtube.player.ended', function() {
      PlaylistModel.next();
    });

  };

  angular.module('app').controller('PlayerCtrl', ['$scope', 'PlaylistModel', PlayerCtrl]);

})();
