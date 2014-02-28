var IO      = require('socket.io');
var util    = require('util');
var shortId = require('shortid');

var State   = require('../shared/State');
var Auth    = require('./Auth');

module.exports = Server;

function Server(state) {
  this.state = state;
  this.clients = {};
}

// target: port or http server (default = port 8090)
// staticPath: if given, will serve static files from given path
Server.prototype.open = function (target, staticPath) {
  var self = this;
  var cid  = 0;

  target = target || 8090;

  // setup static file serving
  if (typeof staticPath === 'string') {
    var file = new (require('node-static').Server)(staticPath);
    console.log('#### Static File Server Added To : ' + target + ' #### ')
    console.log("-> from path: " + staticPath);
    target = require('http').createServer(function (req, res) {
      req.addListener('end', function () {
        file.serve(req, res);
      }).resume();
    }).listen(target);
  }

  // open websockets
  var io = IO.listen(target);
  this.io = io;
  io.set('log level', 1);
  // set up listeners
  io.sockets.on('connection', function (socket) {
    var uid;
    var cuser;

    /* State operations */
    // Initial connect: initialize client with a uid, cid and a fork of current state
    socket.on('init', function (initClient) {
      uid = self.generateUID();
      var privileges = self.auth.privileges(cuser);
      initClient({ uid: uid, cid: ++cid, state: self.state.restrictedFork(privileges) });
    });

    socket.on('YieldPush', function (json, yieldPull) {
      if (!self.exists(json.uid))
        return yieldPull("unrecognized client");
      var state = State.fromJSON(json.state);
      var privileges = self.auth.privileges(cuser);
      self.state.join(state);
      var fork = self.state.restrictedFork(privileges);
      yieldPull(null, fork);
    });

    socket.on('FlushPush', function (json, flushPull) {
      if (!self.exists(json.uid))
        return flushPull("unrecognized client");

      var state = State.fromJSON(json.state);
      var privileges = self.auth.privileges(cuser);

      self.state.join(state);
      var fork = self.state.restrictedFork(privileges);
      flushPull(null, fork);
    });


    /* Authentication */
    socket.on('Login', function (json, finish) {
      self.auth.login(json.username, json.password, function (err, user) {
        if (err)
          return finish(err);
        cuser = user;
        finish(null, user.toJSON());
      });
    });

    socket.on('Register', function (json, finish) {
      self.auth.register(json.username,
                         json.password,
                         json.group,
                         cuser,
                         function (err, user) { if (user) { user = user.toJSON(); } finish(err, user);});
    });

    socket.on('CreateGroup', function (json, finish) {
      self.auth.createGroup(json.name,
                            self.auth.getGroup(json.aGroup),
                            cuser,
                            function (err, group)  { if (group) { group = group.toJSON(); } finish(err, group); });
    });

    socket.on('Prohibit', function (json, finish) {
      self.auth.prohibit(self.auth.getGroup(json.groupName),
                         self.state.expandRestriction(json.arrayName),
                         cuser,
                         finish);
    });
  });
};

Server.prototype.close = function () {
  this.io.server.close();
};

Server.prototype.generateUID = function () {
  var uid = shortId.generate();
  this.clients[uid] = true;
  return uid;
};

Server.prototype.exists = function (uid) {
  return this.clients[uid];
};