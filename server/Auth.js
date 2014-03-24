var Index  = require('../shared/Index');
var Table  = require('../shared/Table');
var CSet   = require('../shared/CSet').Declaration;
var State  = require('./State');
var CSetPrototype = require('../shared/CSet').CSetPrototype;

module.exports = Auth;

function Auth(state) {
  state.auth  = this;
  this.state  = state;
  this.Group  = state.declare('SysGroup', new Table({name: 'CString'}), 'N');
  this.User   = state.declare('SysUser',  new Table({name: 'CString', password: 'CString', group: 'SysGroup'}), 'N');
  this.Auth   = state.declare('SysAuth',  new Table({user:     'SysUser',
                                                     group:    'SysGroup',
                                                     tname:    'CString',
                                                     vname:    'CString',
                                                     type:     'CString',
                                                     priv:     'CString',
                                                     active:   'CString',
                                                     grantopt: 'CString' }), 'N');
  this.ColAuth = state.declare('SysColAuth', new Table({user:     'SysUser',
                                                        group:    'SysGroup',
                                                        tname:    'CString',
                                                        cname:    'CString',
                                                        vname:    'CString',
                                                        type:     'CString',
                                                        priv:     'CString',
                                                        active:   'CString',
                                                        grantopt: 'CString' }), 'N');

  // init groups
  this.guestGroup = this.Group.create().set('name', 'Guest');
  this.rootGroup = this.Group.create().set('name', 'Root');
  // root.get('children').add(this.guest);

  // init root user
  this.root = this.User.create();
  this.root.set('name', 'root')
           .set('password','root')
           .set('group', this.rootGroup);

  this.guest = this.User.create();
  this.guest.set('name', 'guest')
            .set('password', 'guest')
            .set('group', this.guestGroup);

  // grant privileges for the system tables
  this.grantAll('SysGroup', 'T', true);
  this.grantAll('SysUser', 'T', true);
  this.grantAll('SysAuth', 'T', true);
  this.grantAll('SysColAuth', 'T', true);
}

// Auth.prototype.privileges = function (user) {
//   var group;
//   var self = this;
//   if (user) {
//     group = user.get('group');
//   } else {
//     group = this.guest;
//   }
//   var auths = this.Auth.where(function (auth) {
//     return auth.get('group').equals(group);
//   }).all();
//   return auths;
// };


Auth.prototype.initProtection = function (views) {
  var self = this;
  var guest = this.state.get('SysGroup').getByProperties({name: 'Guest'});

  // Guest can only see password of his own
  this.state.grant('read', this.User, guest);
  this.state.revoke('read', this.User.getProperty('password'), guest);
  var MySysUser = this.state.views.create('MySysUser', this.User, function (user, context) {
    return user.equals(context.current_user);
  });
  this.state.grantView('read', MySysUser, guest);

  // Only see your own group
  // this.state.revoke('all', this.Group, guest);
  var MySysGroup = this.state.views.create('MySysGroup', this.Group, function (group, context) {
    return (group.equals(context.current_user.get('group').get()));
  });
  this.state.grantView('read', MySysGroup, guest);


  // Only see you own authorizations
  // this.state.revoke('all', this.Auth, guest);
  // this.state.views.create('MyAuth', 'SysAuth', function (auth, context) {
  //   return (auth.get('user').equals(context.current_user) || auth.get('group').equals(context.current_user.get('group').get()));
  // });
  // // this.state.revokeView('delete', 'MyAuth', guest);

  // this.state.views.create('MyGrantAuth', 'SysAuth', function (auth, context) {
  //   return self.state.canGrantAuth(auth, context.current_user);
  // });
  // // this.state.revokeView('delete', 'MyGrantAuth', guest)

  // this.state.views.create('MyGrantColAuth', 'SysColAuth', function (colAuth, context) {
  //   return self.state.canGrantColAuth(colAuth, context.current_user);
  // });
  // this.state.revokeView('delete', 'MyGrantColAuth', guest)

  // this.state.revoke('all', this.ColAuth, guest);
  // this.state.views.create('MyColAuth', 'SysColAuth', function (auth, context) {
  //   return (auth.get('user').equals(context.current_user) || auth.get('group').equals(context.current_user.get('group').get()));
  // });





};

Auth.prototype.createUser = function (name, password) {
  var user = this.User.create();
  user.set('name', name)
      .set('password', password)
      .set('group', this.guestGroup);
  return user;
};


Auth.prototype.exists = function (username) {
  var users = this.User.where(function (user) {
    return (user.get('name').get() === username);
  }).all();
  return users.length >= 1;
};

Auth.prototype.getUser = function (username) {
  return this.User.getByProperties({name: username});
};

Auth.prototype.getGroup = function (name) {
  var group = this.Group.where(function (group) {
    return (group.get('name').get() === name);
  });
  if (group.length >= 1)
    return group[0];
  return null;
};


// Auth.prototype.checkPermission = function (aGroup, user, finish) {
//   if (!this.isLoggedIn(user)) {
//     finish("not authorized");
//     return false;
//   }

//   if (typeof aGroup === 'undefined') {
//     finish("invalid group");
//     return false;
//   }

//   if (!user.group.authorizedFor(aGroup)) {
//     finish("not authorized");
//     return false;
//   }

//   return true;
// };

Auth.prototype.login = function (username, password, finish) {
  console.log('logging in: ' + username + ' : ' + password);
  var user = this.getUser(username);
  if (!user)
      return finish("Unknown username");
  if (user.get('password').equals(password))
    return finish(null, user);
  return finish("incorrect password");
};

Auth.prototype.register = function (username, password, finish) {
  console.log('registering: ' + username + ' : ' + password);
  var user = this.User.create();
  user.set('name', username)
      .set('password', password)
      .set('group', this.guestGroup);
  return finish(null, user);
};

Auth.prototype.grantAllView = function (view) {
  return this.grantAll(view.table.name, 'V', false, view.name);
};

Auth.prototype.grantAll = function (tableName, type, sys, viewName) {
  var self = this;
  // var auth = self.Auth.create();
  var table = this.state.get(tableName);
  var ops = ['read', 'update', 'create', 'delete'];
  console.log('granting all for ' + tableName + ' | ' + viewName + ' | ' + type);
  // Guest group
  // 1) with grantopt: no access
  // 2) without grantopt:
  //    a) all access when system table
  if (sys) {
    ops.forEach(function (priv) {
      auth = self.Auth.create();
      auth.set('group', self.guestGroup)
          .set('tname', tableName)
          .set('priv', priv)
          .set('active', 'Y')
          .set('type', type)
          .set('grantopt', 'N');
      if (type === 'V') {
        auth.set('vname', viewName);
      }
    });
  self.createColAuths('Y', 'Y', tableName, self.guestGroup, type, 'N', viewName);

  } else {
    // b) only read access otherwise
  //   auth = self.Auth.create();
  //   console.log('granting ' + self.guestGroup);
  //   auth.set('group', self.guestGroup)
  //       .set('tname', tableName)
  //       .set('priv', 'read')
  //       .set('active', 'Y')
  //       .set('type', type)
  //       .set('grantopt', 'N');
  //   if (type === 'V') {
  //     auth.set('vname', viewName);
  //   }
  // self.createColAuths('Y', 'N', tableName, self.guestGroup, type, 'N', viewName);

  }

  // Root Group
  // 1) with grantopt: all access
  ops.forEach(function (priv) {
    auth = self.Auth.create();
    auth.set('group', self.rootGroup)
        .set('tname', tableName)
        .set('priv', priv)
        .set('active', 'Y')
        .set('type', type)
        .set('grantopt', 'Y');
    if (type === 'V') {
      auth.set('vname', viewName);
    }
  });
  self.createColAuths('Y', 'Y', tableName, self.rootGroup, type, 'Y', viewName);

  // 2) without grantopt: all access
  // auth = self.Auth.create();
  // auth.set('user', self.root)
  //     .set('tname', tableName)
  //     .set('read', 'Y')
  //     .set('create', 'Y')
  //     .set('update', 'Y')
  //     .set('delete', 'Y')
  //     .set('type', type)
  //     .set('grantopt', 'N');
  // if (type === 'V') {
  //   auth.set('vname', viewName);
  // }
  // self.createColAuths('Y', 'Y', tableName, self.root, type, 'N', viewName);


  table.forEachProperty(function (property) {
    if (property.CType.prototype === CSetPrototype) {
      self.grantAll(property.CType.entity.name, 'T', sys);
    }
  });
};

Auth.prototype.createColAuths = function (read, update, tableName, group, type, grantopt, viewName) {
  var self = this;
  var table = self.state.get(tableName);
  table.forEachProperty(function (property) {
    if (read === 'Y') {
      var colAuth = self.ColAuth.create();
      // console.log('creating ' + read + ' for ' +group.get('name').get() + ' for ' + table.name+'.'+property.name);
      colAuth.set('group', group)
             .set('tname', table.name)
             .set('cname', property.name)
             .set('priv', 'read')
             .set('active', 'Y')
             .set('type', type)
             .set('grantopt', grantopt);
      if (type === 'V') {
        colAuth.set('vname', viewName);
      }
    }
    if (update === 'Y') {
      var colAuth = self.ColAuth.create();
      // console.log('creating ' + read + ' for ' +group.get('name').get() + ' for ' + table.name+'.'+property.name);
      colAuth.set('group', group)
             .set('tname', table.name)
             .set('cname', property.name)
             .set('priv', 'update')
             .set('active', 'Y')
             .set('type', type)
             .set('grantopt', grantopt);
      if (type === 'V') {
        colAuth.set('vname', viewName);
      }
    }
  });
};
