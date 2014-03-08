angular
    .module('testApp', ['cloudtypes'])

    // make a controller and inject the $client and $state service of the cloudtypes module
    .controller('TestCtrl', function ($scope, $client, $state) {

      // the $state service automatically sets up a connection to the cloud types server
      // and returns a promise for the state.
      $state.then(function (state) {
        // cloud types state now available from server, initialize model
        $scope.counter = state.get('counter');

        // notify angular that the model might have been changed
        $client.onYield(function () { $scope.$apply('') });
      });

      // model methods
      $scope.increaseCounter = function () {
        $scope.counter.add(1);
      };

      $scope.decreaseCounter = function () {
        $scope.counter.add(-1);
      };

      $scope.setCounter = function (amount) {
        $scope.counter.set(amount);
      };
    });
