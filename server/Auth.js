var Index  = require('../shared/Index');
var Table  = require('../shared/Table');
var CSet   = require('../shared/CSet').Declaration;
var State  = require('./State');
var CSetPrototype = require('../shared/CSet').CSetPrototype;

module.exports = Auth;

function Auth(state) {
  state.auth  = this;
  this.state  = state;
  this.Group  = state.declare('SysGroup', new Table({name: 'CString', children: new CSet('SysGroup')}), 'N');
  this.User   = state.declare('SysUser',  new Table({name: 'CString', password: 'CString', group: 'SysGroup'}), 'N');
  this.Auth   = state.declare('SysAuth',  new Table({group:    'SysGroup',
                                                     tname:    'CString',
                                                     type:     'CString',
                                                     read:     'CString', 
                                                     create:   'CString', 
                                                     delete:   'CString', 
                                                     update:   'CString',
                                                     grantopt: 'CString' }), 'N');
  this.ColAuth = state.declare('SysColAuth', new Table({group:    'SysGroup',
                                                        tname:    'CString',
                                                        read:     'CString',
                                                        update:   'CString',
                                                        cname:    'CString',
                                                        type:     'CString',
                                                        vname:    'CString',
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

Auth.prototype.createUser = function (name, password, group) {
  var user = this.User.create();
  user.set('name', name)
      .set('password', password)
      .set('group', group);
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


Auth.prototype.checkPermission = function (aGroup, user, finish) {
  if (!this.isLoggedIn(user)) {
    finish("not authorized");
    return false;
  }

  if (typeof aGroup === 'undefined') {
    finish("invalid group");
    return false;
  }

  if (!user.group.authorizedFor(aGroup)) {
    finish("not authorized");
    return false;
  }

  return true;
};

Auth.prototype.login = function (username, password, finish) {
  console.log('logging in: ' + username + ' : ' + password);
  var user = this.getUser(username);
  if (!user)
      return finish("Unknown username");
  if (user.get('password').equals(password))
    return finish(null, user);
  return finish("incorrect password");
};

Auth.prototype.grantAll = function (tableName, type, sys) {
  var self = this;
  var auth = self.Auth.create();
  var table = this.state.get(tableName);

  // Guest group
  // 1) with grantopt: no access
  auth.set('group', self.guestGroup)
      .set('tname', tableName)
      .set('read', 'N')
      .set('create', 'N')
      .set('update', 'N')
      .set('delete', 'N')
      .set('type', type)
      .set('grantopt', 'Y');
  self.createColAuths('N', 'N', tableName, self.guestGroup, type, 'Y');

  // 2) without grantopt:
  auth = self.Auth.create();
  if (sys) {
    // all access when system table
    auth.set('group', self.guestGroup)
      .set('tname', tableName)
      .set('read', 'Y')
      .set('create', 'Y')
      .set('update', 'Y')
      .set('delete', 'Y')
      .set('type', type)
      .set('grantopt', 'N');
  self.createColAuths('Y', 'Y', tableName, self.guestGroup, type, 'N');

  } else {
    // only read access otherwise
    auth.set('group', self.guestGroup)
      .set('tname', tableName)
      .set('read', 'Y')
      .set('create', 'N')
      .set('update', 'N')
      .set('delete', 'N')
      .set('type', type)
      .set('grantopt', 'N');
  self.createColAuths('Y', 'N', tableName, self.guestGroup, type, 'N');

  }

  // Root Group
  // 1) with grantopt: all access
  auth = self.Auth.create();
  auth.set('group', self.rootGroup)
      .set('tname', tableName)
      .set('read', 'Y')
      .set('create', 'Y')
      .set('update', 'Y')
      .set('delete', 'Y')
      .set('type', type)
      .set('grantopt', 'Y');
  self.createColAuths('Y', 'Y', tableName, self.rootGroup, type, 'Y');

  // 2) without grantopt: all access
  auth = self.Auth.create();
  auth.set('group', self.rootGroup)
      .set('tname', tableName)
      .set('read', 'Y')
      .set('create', 'Y')
      .set('update', 'Y')
      .set('delete', 'Y')
      .set('type', type)
      .set('grantopt', 'N');
  self.createColAuths('Y', 'Y', tableName, self.rootGroup, type, 'N');


  table.forEachProperty(function (property) {
    if (property.CType.prototype === CSetPrototype) {
      self.grantAll(property.CType.entity.name, type, sys);
    }
  });
};

Auth.prototype.createColAuths = function (read, update, tableName, group, type, grantopt) {
  var self = this;
  var table = self.state.get(tableName);
  table.forEachProperty(function (property) {
    var colAuth = self.ColAuth.create();
    // console.log('creating ' + read + ' for ' +group.get('name').get() + ' for ' + table.name+'.'+property.name);
    colAuth.set('group', group)
           .set('tname', table.name)
           .set('cname', property.name)
           .set('read', read)
           .set('update', update)
           .set('type', type)
           .set('grantopt', grantopt);
  });
};
