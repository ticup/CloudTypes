var View = require('./View');

module.exports = Views;

function Views(state, auth) {
  state.views = this;
  this.state = state;
  this.auth  = auth;
  this.views = {};
}

Views.prototype.create = function (name, table, query) {
  if (typeof table === 'string') {
    table = this.state.get(table);
  }
  var view = new View(name, table, query);
  this.views[name] = view;
  this.auth.grantAllView(view);
  return this;
};

Views.prototype.get = function (name) {
  return this.views[name];
};

Views.prototype.toJSON = function () {
  var self = this;
  var json = [];
  Object.keys(this.views).forEach(function (name) {
    json.push(self.views[name].toJSON());
  });
  return json;
};

Views.fromJSON = function (json, state) {
  var views = new Views(state);
  json.forEach(function (view) {
    var view = View.fromJSON(view, state);
    views.views[view.name] = view;
  });
  return views;
};