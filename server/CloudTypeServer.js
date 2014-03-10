var Server = require('./Server');
var State  = require('./State');
var Auth    = require('./Auth');
var Views    = require('./Views');

module.exports = CServer;

function CServer(state) {
  this.state   = state || new State();
  this.auth    = new Auth(this.state);
  this.views   = new Views(this.state);
  this.server  = new Server(this.state, this.auth, this.views);

}

CServer.prototype.publish = function (target, static) {
  this.server.open(target, static);
  // this.state.published(this.server);
  return this;
};

CServer.prototype.close = function () {
  this.server.close();
};

CServer.prototype.declare = function (name, array) {
  return this.state.declare(name, array);
};

CServer.prototype.get = function (name) {
  return this.state.get(name);
};

CServer.prototype.view = function (name, group, table, query) {
  return this.views.create(name, group, table, query);
};
