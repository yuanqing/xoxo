/* globals Sortable */
(function() {

  'use strict';

  var slice = [].slice;

  var yqSortable = function() {

    var scope = {
      callback: '=yqSortable',
      handle: '@yqSortableHandle',
      sortedClass: '@yqSortableSortedClass',
      ghostClass: '@yqSortableGhostClass'
    };

    var link = function(scope, element) {
      var onUpdate = function(e) {
        var items = slice.call(element.children());
        var movedItem = e.item;
        var oldIndex = angular.element(movedItem).scope().$index;
        var newIndex = items.indexOf(movedItem);
        scope.callback(oldIndex, newIndex);
        element.addClass(scope.sortedClass);
        document.addEventListener('mousemove', function mousemove() {
          element.removeClass(scope.sortedClass);
          document.removeEventListener('mousemove', mousemove);
        });
      };
      new Sortable(element[0], {
        handle: scope.handle,
        ghostClass: scope.ghostClass,
        onUpdate: onUpdate
      });
    };

    return {
      restrict: 'A',
      scope: scope,
      link: link
    };

  };

  angular.module('app').directive('yqSortable', [yqSortable]);

})();
