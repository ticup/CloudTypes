var testApp = angular.module('testApp', ['cloudtypes', 'avbuttons']);

// make a controller and inject the $client and $state service of the cloudtypes module
testApp.controller('StateCtrl', function ($scope, $client, $state) {

  // the $state service automatically sets up a connection to the cloud types server
  // and returns a promise for the state.
  client = $client;
  $state.then(function (state) {

    $scope.state = state;
    $scope.editing = null;

    // cloud types state now available from server, initialize model
    // $scope.cachedTables = $cachedTables.create(function () {
    // $scope.state.all();
    // });

     // initial update of the array + set up periodic updates after yielding
    // $scope.update();
    $client.onYield(function () {
      $scope.$apply('');
    });
  });

  $scope.startEditing = function (cloudType) {
    $scope.editing = cloudType;
  };

  $scope.stopEditing = function () {
    $scope.editing = null;
  };

  // Starts/Stops editing depending on the current status
  $scope.toggleEdit = function (cloudType, $event) {
    console.log('toggling');
    if (!cloudType || $scope.editing == cloudType)
      return $scope.stopEditing();
    $scope.startEditing(cloudType);
    $event.stopPropagation();
  };

  $scope.typeToClass = function (type) {
    if (CloudTypes.isCloudType(type)) {
      return type.tag;
    }
    return 'table';
  };

  $scope.setProperty = function (cloudtype, value) {
          console.log('setting value ' + value);

    try {
      cloudtype.set(value);
    } catch(err) {
      alert(err);
    }
  };

  $scope.deleteRow = function (row) {
    try {
      row.delete();
    } catch(err) {
      alert(err);
    }
  };



  // $scope.rows = function (table) {
  //   var rows = [];
  //   return Object.keys(table.states).forEach(function (row) {
  //     if (row.indexOf('Sys') !== -1)
  //       rows.push(row);
  //   });
  //   return rows;
  // };

  // update the cached array
  // $scope.update = function () {
  //   $scope.tables = $scope.cachedTables.update();
  // };

});


/**
 * Directive that places focus on the element it is applied to when the expression it binds to evaluates to true
 */
testApp.directive('testFocus', function testFocus($timeout) {
  return function (scope, elem, attrs) {
    scope.$watch(attrs.testFocus, function (newVal) {
      if (newVal) {
        $timeout(function () {
          elem[0].focus();
        }, 0, false);
      }
    });
  };
});
