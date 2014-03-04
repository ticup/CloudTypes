var State       = require('./ClientState');
var io          = require('socket.io-client');

global.io = io;

module.exports = Client;

function Client() {
  this.initialized = false;
  this.listeners = {};
}

Client.prototype.connect = function (host, options, connected, reconnected, disconnected) {
  var self = this;
  if (typeof options === 'function') {
    disconnected = reconnected;
    reconnected = connected;
    connected = options;
    options  = {};
  }
  options['force new connection'] = options['force new connection'] ? options['force new connection'] : true;
  options['max reconnection attempts'] = options['max reconnection attempts'] ? options ['max reconnection attempts'] : Infinity;
  this.host = host;
  this.options = options;
  this.connected = connected;
  this.reconnected = reconnected;
  this.disconnected = disconnected;

  this.socket = io.connect(host, options);
  this.socket.on('connect', function () {
    if (typeof self.uid === 'undefined') {
      console.log('client connected for first time');
      self.socket.emit('init', function (json) {
        console.log(json.uid);
        var state = State.fromJSON(json.state);
        self.uid = json.uid;
        self.state = state;
        self.state.init(json.cid, self);
        self.group = state.get('SysGroup').getByProperties({name: 'Guest'});
        connected(self.state);
      });
    } else {
      console.log("client reconnected");
      self.state.reinit(self);
      if (typeof reconnected === 'function') {
        reconnected(self.state);
      }
    }
  });
  this.socket.on('disconnect', function () {
    if (typeof disconnected === 'function') {
      disconnected();
    }
  });
};

Client.prototype.reconnect = function () {
  return this.connect(this.host, this.options, this.connected, this.reconnected, this.disconnected);
};

Client.prototype.disconnect = function () {
  return this.socket.disconnect();
};

Client.prototype.close = function () {
  return this.disconnect();
};

Client.prototype.unrecognizedClient = function () {
  alert("Sorry, his client is unrecognized by the server! The server probably restarted and your data is lost... Please refresh.");
  this.disconnect();
};

Client.prototype.yieldPush = function (pushState) {
  var self = this;
  var state = this.state;
  this.socket.emit('YieldPush', {uid: this.uid, state: pushState}, function (error, stateJson) {
    if (error) {
      return self.unrecognizedClient();
    }
    var pullState = State.fromJSON(stateJson);
    // TODO: with callback like flushpush
    state.yieldPull(pullState);
  });
};

Client.prototype.flushPush = function (pushState, flushPull) {
  var self = this;
  var state = this.state;
  this.socket.emit('FlushPush', {uid: this.uid, state: pushState}, function (error, stateJson) {
    if (error) {
      return self.unrecognizedClient();
    }
    var pullState = State.fromJSON(stateJson);
    flushPull(pullState);
  });
};

/* Authentication */
// Client.prototype.register = function (username, password, group, finish) {
//   if (typeof this.socket === 'undefined')
//     return finish("not connected");
//   this.socket.emit('Register', {username: username, password: password, group: group}, finish);
// };

Client.prototype.login = function (username, password, finish) {
  var self = this;
  if (typeof this.socket === 'undefined')
    return finish("not connected");
  this.socket.emit('Login', {username: username, password: password}, function (err, groupName) {
    if (err)
      throw err;
    self.group = self.state.get('SysGroup').where(function (group) {
      return group.get('name').get() === groupName;
    }).all()[0];
    finish(null, groupName);
  });
};