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