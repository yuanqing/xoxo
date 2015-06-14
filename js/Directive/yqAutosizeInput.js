/* globals autosizeInput */
(function() {

  'use strict';

  var ENTER = 13;
  var ESCAPE = 27;

  var yqAutosizeInput = function() {

    var link = function(scope, element) {

      setTimeout(function() {
        autosizeInput(element[0]);
      }, 0);

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

  angular.module('app').directive('yqAutosizeInput', [yqAutosizeInput]);

})();
