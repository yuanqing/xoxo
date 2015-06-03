(function() {

  'use strict';

  var yqSyncFocus = function() {

    var scope = {
      val: '=yqSyncFocus'
    };

    var link = function($scope, $element) {
      $scope.$watch('val', function(currentVal, previousVal) {
        if (currentVal && !previousVal) {
          $element[0].focus();
          return;
        }
        if (!currentVal && previousVal) {
          $element[0].blur();
        }
      });
    };

    return {
      restrict: 'A',
      scope: scope,
      link: link
    };

  };

  angular.module('app').directive('yqSyncFocus', [yqSyncFocus]);

})();
