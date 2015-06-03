(function() {

  'use strict';

  var yqEditable = function() {

    var scope = {
      callback: '=yqEditable'
    };

    var link = function(scope, element) {
      element.on('keypress', function(e) {
        if (e.keyCode === 13 || e.keyCode === 27) {
          e.target.blur();
        }
      });
      element.on('blur', function() {
        scope.callback(scope.$parent.$index, element.text());
      });
    };

    return {
      restrict: 'A',
      scope: scope,
      link: link
    };

  };

  angular.module('app').directive('yqEditable', [yqEditable]);

})();
