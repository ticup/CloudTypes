var Index  = require('../shared/Index');
var Table  = require('../shared/Table');
var CSet   = require('../shared/CSet').Declaration;

module.exports = Auth;

function Auth(state) {
  this.state  = state;
  this.groups = state.declare('SysGroup', new Table({name: 'CString', children: new CSet('SysGroup')}));
  this.users  = state.declare('SysUser',  new Table({name: 'CString', password: 'CString', group: 'SysGroup'}));
  this.auth   = state.declare('SysAuth',  new Table({group:    'SysGroup',
                                                     tname:    'CString',
                                                     type:     'CString',
                                                     read:     'CString', 
                                                     insert:   'CString', 
                                                     delete:   'CString', 
                                                     update:   'CString',
                                                     grantopt: 'CString' }));
  this.colauth = state.declare('SysColAuth', new Table({group:   'SysGroup',
                                                        tname:   'CString',
                                                        column:  'CString',
                                                        grantor: 'SysGroup',
                                                        grantop: 'SysGroup'}));

  // init groups
  this.guest = this.groups.create().set('name', 'Guest');
  this.admin = this.groups.create().set('name', 'Admin');
  this.admin.get('children').add(this.guest);
  this.populateGuest(this.guest);
  this.populateAdmin(this.admin);

  // init root user
  var root = this.users.create();
  root.set('name', 'root')
      .set('password','root')
      .set('group', this.admin);
}

Auth.prototype.privileges = function (user) {
  if (user) {
    var group = user.get('group');
  } else {
    var group = this.guest;
  }
  var auths = this.auth.where(function (auth) {
    return auth.get('group').equals(group);
  }).all();
  return auths;
};

Auth.prototype.createUser = function (name, password, group) {
  var user = this.users.create();
  user.set('name', name)
      .set('password', password)
      .set('group', group);
  return user;
};


Auth.prototype.exists = function (username) {
  var users = this.users.where(function (user) {
    return (user.get('name').get() === username);
  }).all();
  return users.length >= 1;
};

Auth.prototype.getUser = function (username) {
  var user = this.users.where(function (user) {
    return (user.get('name').get());
  });
  if (user.length >= 1)
    return user[0];
  return null;
};

Auth.prototype.getGroup = function (name) {
  var group = this.groups.where(function (group) {
    return (group.get('name').get());
  });
  if (group.length >= 1)
    return group[0];
  return null;
};




Auth.prototype.checkAuthorization = function (aGroup, user, finish) {
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

Auth.prototype.isLoggedIn = function (user) {
  return (typeof user.username !== 'undefined')
};

Auth.prototype.createGroup = function (name, aGroup, user, finish) {
  var uGroup = user.group;

  if (!this.checkAuthorization(aGroup, user, finish)) {
    return false;
  }
  if (this.groups[name]) {
    return finish("group exists");
  }

  var group = new Group(name);
  aGroup.addChild(group);
  this.addGroup(group);
  return finish(null, group);
};

Auth.prototype.prohibit = function (group, arrayNames, user, finish) {
  if (!this.checkAuthorization(group, user, finish)) {
    return false;
  }
  if (typeof group === 'undefined')
    return finish("unknown group to restrict");

  if (!user.group.canRestrict) {
    return finish("unauthorized to restrict");
  }

  group.addRestrictions(arrayNames);

  return finish(null, group.getRestrictions());
};

Auth.prototype.register = function (username, password, groupName, user, finish) {
  var uGroup = user.group;
  if (this.exists(username))
    return finish("username exists");

  if (typeof password === 'undefined' || password === '')
    return finish("invalid password");

  var group = this.getGroup(groupName);
  if (typeof group === 'undefined')
    return finish("not authorized");

  if (!uGroup.authorizedFor(group))
    return finish("invalid group");

  var user = new User(username, password, group);
  this.users[username] = user;

  if (typeof finish === 'function')
    return finish(null, user);
};
  
Auth.prototype.login = function (username, password, finish) {
  var user = this.getUser(username);
  if (user.password === password)
    return finish(null, user);
  return finish("incorrect password");
};


Auth.prototype.populateGuest = function (group) {
  var auth = this.auth.create();
  auth.set('group', group)
      .set('tname', '*')
      .set('type', 'R')
      .set('read', 'Y')
      .set('insert', 'N')
      .set('delete', 'N')
      .set('update', 'N')
      .set('grantopt', 'N');
};

Auth.prototype.populateAdmin = function (group) {
  var auth = this.auth.create();
  auth.set('group', group)
      .set('tname', '*')
      .set('type', 'R')
      .set('read', 'Y')
      .set('insert', 'Y')
      .set('delete', 'Y')
      .set('update', 'Y')
      .set('grantopt', 'Y');
};

