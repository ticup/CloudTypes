angular.module('groceryApp').controller('GroupCtrl', function ($scope, $client, $ctstate, $state, $cachedArray) {
  if (!$client.isLoggedIn()) {
    $state.go('login');
    return;
  }

  var cachedGroups, Group, Request;
  $scope.groups = [];

   // when revision received from server
  $ctstate.then(function (state) {
    Group = state.get('Group');
    Request = state.get('Request');

    // create an array that will reuse its entries upon update (provides better reuse for angular)
    cachedGroups = $cachedArray.create(function () {
      return Group.all();
    });

    // initial update of the array + set up periodic updates after yielding
    $scope.update();
    $client.onYield(function () {
      $scope.$apply($scope.update);
    });
  });

  // update the cached array
  $scope.update = function () {
    $scope.groups = cachedGroups.update();
  };

  // create new group
  $scope.createGroup = function (name) {
    var group = Group.create();
    group.set('name', name);
    group.get('users').add($client.getUser());
    group.set('token', group.serialKey());
  };

  $scope.joinGroup = function (token) {
    console.log('joining group');
    Request
      .create()
      .set('token', token)
      .set('user', $client.getUser());
  };
});