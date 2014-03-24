angular.module('groceryApp').controller('LoginCtrl', function ($scope, $client, $ctstate, $state) {
  $scope.login = function (username, password) {
    $client.login(username, password)
      .then(function (user) {
        $state.go('groups');
      })
      .catch(function (err) {
        alert(err);
      });
  };

  $scope.register = function (username, password) {
    $client.register(username, password)
      .then(function (user) {
        $state.go('groups');
      })
      .catch(function (err) {
        aler(err);
      });
  }
});