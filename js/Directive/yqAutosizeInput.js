/* globals autosizeInput */
(function() {

  'use strict';

  var ENTER = 13;
  var ESCAPE = 27;

  var yqAutosizeInput = function($timeout) {

    var link = function(scope, element) {

      var set;
      $timeout(function() {
        set = autosizeInput(element[0]);
      });

      scope.$on('setAutosize', function() {
        $timeout(function() {
          set();
        });
      });

      element.on('keyup', function(e) {
        if (e.keyCode === ENTER || e.keyCode === ESCAPE) {
          e.target.blur();
        }
      });

    };

    return {
      restrict: 'A',
      link: link
    };

  };

  angular.module('app').directive('yqAutosizeInput', ['$timeout', yqAutosizeInput]);

})();
