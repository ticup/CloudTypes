var testApp = angular.module('testApp', ['cloudtypes', 'avbuttons']);

// make a controller and inject the $client and $state service of the cloudtypes module
testApp.controller('StateCtrl', function ($scope, $client, $state) {

  // the $state service automatically sets up a connection to the cloud types server
  // and returns a promise for the state.
  client = $client;
  $state.then(function (state) {

    $scope.state = state;

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
