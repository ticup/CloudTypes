var View = require('./View');
var CSetPrototype = require('./CSet').CSetPrototype;

module.exports = Views;

function Views(state, auth) {
  state.views = this;
  this.state = state;
  this.auth  = auth;
  this.views = {};
}

Views.prototype.create = function (name, table, query) {
  var self = this;
  if (typeof table === 'string') {
    table = this.state.get(table);
  }
  if (typeof this.get(name) !== 'undefined') {
    throw new Error("View " + name + " already exists!");
  }
  var view = new View(name, table, query);
  this.views[name] = view;
  this.auth.grantAllView(view);
  // table.forEachProperty(function (property) {
  //     if (property.CType.prototype === CSetPrototype) {
  //       // console.log(property.CType.prototype);
  //       self.create(name+'.'+property.name, property.CType.entity, query);
  //     }
  //   });
  return view;
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