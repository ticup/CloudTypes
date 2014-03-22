var IO      = require('socket.io');
var util    = require('util');
var State  = require('./State');
var shortId = require('shortid');

module.exports = Server;

function Server(state, auth, views) {
  this.state   = state;
  this.auth    = auth;
  this.views   = views;
  this.clients = {};
}

Server.prototype.getUser = function (user) {
  if (typeof user === 'undefined') {
    return this.auth.guest;
  }
  return user;
};

// target: port or http server (default = port 8090)
// staticPath: if given, will serve static files from given path
Server.prototype.open = function (target, staticPath) {
  var self = this;
  var cid  = 0;

  target = target || 8090;

  // setup static file serving
  if (typeof staticPath === 'string') {
    var file = new (require('node-static').Server)(staticPath);
    console.log('#### Static File Server Added To : ' + target + ' #### ');
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
      var user = self.getUser(cuser);
      var fork = self.state.restrictedFork(user);
      initClient({ uid: uid, cid: ++cid, state: fork, views: fork.views});
    });

    socket.on('YieldPush', function (json, yieldPull) {
      var user = self.getUser(cuser);
      if (!self.exists(json.uid)) {
        return yieldPull("unrecognized client");
      }
      var state = State.fromJSON(json.state);
      if (!self.state.checkChanges(state, user)) {
        console.log('UNAUTHORIZED ACCESS');
        return yieldPull("Unauthorized Access!");
      }
      self.state.join(state);
      var fork = self.state.restrictedFork(user);
      yieldPull(null, fork);
    });

    socket.on('FlushPush', function (json, flushPull) {
      var user = self.getUser(cuser);
      if (!self.exists(json.uid)) {
        return flushPull("unrecognized client");
      }
      console.log('recognized');
      var state = State.fromJSON(json.state);
      if (!self.state.checkChanges(state, user)) {
        console.log('UNAUTHORIZED ACCESS');
        return flushPull("Unauthorized Access!");
      }
      console.log('authorized');
      self.state.join(state);
      console.log('joined');
      var fork = self.state.restrictedFork(user);
      console.log('forked');
      flushPull(null, fork);
    });


    /* Authentication */
    socket.on('Login', function (json, finish) {
      self.auth.login(json.username, json.password, function (err, user) {
        if (err)
          return finish(err);
        cuser = user;
        finish(null, user.get('name').get());
      });
    });

    // socket.on('Register', function (json, finish) {
    //   self.auth.register(json.username,
    //                      json.password,
    //                      json.group,
    //                      cuser,
    //                      function (err, user) { if (user) { user = user.toJSON(); } finish(err, user);});
    // });
    
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