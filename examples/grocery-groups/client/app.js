"user strict";
var groceryApp = angular.module('groceryApp', ['cloudtypes', 'avbuttons', 'ui.router']);

groceryApp.config(function ($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.otherwise('/login');
  $stateProvider
    .state('login', {
      url: '/login',
      templateUrl: 'views/login.html',
      controller: 'LoginCtrl'
    })
    .state('groups', {
      url: '/groups',
      templateUrl: 'views/groups.html',
      controller: 'GroupCtrl'
    });
});