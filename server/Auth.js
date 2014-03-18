var Index  = require('../shared/Index');
var Table  = require('../shared/Table');
var CSet   = require('../shared/CSet').Declaration;
var State  = require('./State');
var CSetPrototype = require('../shared/CSet').CSetPrototype;

module.exports = Auth;

function Auth(state) {
  state.auth  = this;
  this.state  = state;
  this.User   = state.declare('SysUser',  new Table({name: 'CString', password: 'CString'}), 'N');
  this.Group  = state.declare('SysGroup', new Table({name: 'CString', users: new CSet('SysUser')}), 'N');
  this.Auth   = state.declare('SysAuth',  new Table({user:    'SysUser',
                                                     tname:    'CString',
                                                     type:     'CString',
                                                     vname:    'CString',
                                                     read:     'CString', 
                                                     create:   'CString', 
                                                     delete:   'CString', 
                                                     update:   'CString',
                                                     grantopt: 'CString' }), 'N');
  this.ColAuth = state.declare('SysColAuth', new Table({user:    'SysUser',
                                                        tname:    'CString',
                                                        read:     'CString',
                                                        update:   'CString',
                                                        cname:    'CString',
                                                        type:     'CString',
                                                        vname:    'CString',
                                                        privtype: 'CString',
                                                        grantopt: 'CString' }), 'N');

  // init groups
  this.guestGroup = this.Group.create().set('name', 'Guest');
  this.rootGroup = this.Group.create().set('name', 'Root');
  // root.get('children').add(this.guest);

  // init root user
  this.root = this.User.create();
  this.root.set('name', 'root')
           .set('password','root');
  this.rootGroup.get('users').add(this.root);

  this.guest = this.User.create();
  this.guest.set('name', 'guest')
            .set('password', 'guest');
  this.guestGroup.get('users').add(this.guest);

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

Auth.prototype.createUser = function (name, password) {
  var user = this.User.create();
  user.set('name', name)
      .set('password', password);
  this.guestGroup.get('users').add(user);
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

Auth.prototype.getGroupsOf = function (user) {
  var self = this;
  return self.Group.where(function (group) {
    return group.get('users').contains(user);
  }).all();
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

Auth.prototype.grantAllView = function (view) {
  return this.grantAll(view.table.name, 'V', false, view.name);
};

Auth.prototype.grantAll = function (tableName, type, sys, viewName) {
  var self = this;
  var auth = self.Auth.create();
  var table = this.state.get(tableName);

  // Guest group
  // 1) with grantopt: no access
  auth.set('user', self.guest)
      .set('tname', tableName)
      .set('read', 'N')
      .set('create', 'N')
      .set('update', 'N')
      .set('delete', 'N')
      .set('type', type)
      .set('grantopt', 'Y');
  if (type === 'V') {
    auth.set('vname', viewName);
  }
  self.createColAuths('N', 'N', tableName, self.guest, type, 'Y', viewName);

  // 2) without grantopt:
  auth = self.Auth.create();
  if (sys) {
    // all access when system table
    auth.set('user', self.guest)
      .set('tname', tableName)
      .set('read', 'Y')
      .set('create', 'Y')
      .set('update', 'Y')
      .set('delete', 'Y')
      .set('type', type)
      .set('grantopt', 'N');
  if (type === 'V') {
    auth.set('vname', viewName);
  }
  self.createColAuths('Y', 'Y', tableName, self.guest, type, 'N', viewName);

  } else {
    // only read access otherwise
    auth.set('user', self.guest)
      .set('tname', tableName)
      .set('read', 'Y')
      .set('create', 'N')
      .set('update', 'N')
      .set('delete', 'N')
      .set('type', type)
      .set('grantopt', 'N');
  if (type === 'V') {
    auth.set('vname', viewName);
  }
  self.createColAuths('Y', 'N', tableName, self.guest, type, 'N', viewName);

  }

  // Root Group
  // 1) with grantopt: all access
  auth = self.Auth.create();
  auth.set('user', self.root)
      .set('tname', tableName)
      .set('read', 'Y')
      .set('create', 'Y')
      .set('update', 'Y')
      .set('delete', 'Y')
      .set('type', type)
      .set('grantopt', 'Y');
  if (type === 'V') {
    auth.set('vname', viewName);
  }
  self.createColAuths('Y', 'Y', tableName, self.root, type, 'Y', viewName);

  // 2) without grantopt: all access
  auth = self.Auth.create();
  auth.set('user', self.root)
      .set('tname', tableName)
      .set('read', 'Y')
      .set('create', 'Y')
      .set('update', 'Y')
      .set('delete', 'Y')
      .set('type', type)
      .set('grantopt', 'N');
  if (type === 'V') {
    auth.set('vname', viewName);
  }
  self.createColAuths('Y', 'Y', tableName, self.root, type, 'N', viewName);


  table.forEachProperty(function (property) {
    if (property.CType.prototype === CSetPrototype) {
      self.grantAll(property.CType.entity.name, type, sys);
    }
  });
};

Auth.prototype.createColAuths = function (read, update, tableName, user, type, grantopt, viewName) {
  var self = this;
  var table = self.state.get(tableName);
  table.forEachProperty(function (property) {
    var colAuth = self.ColAuth.create();
    // console.log('creating ' + read + ' for ' +group.get('name').get() + ' for ' + table.name+'.'+property.name);
    colAuth.set('user', user)
           .set('tname', table.name)
           .set('cname', property.name)
           .set('read', read)
           .set('update', update)
           .set('type', type)
           .set('grantopt', grantopt);
    if (type === 'V') {
      colAuth.set('vname', viewName);
    }
  });
};
