var State = require('../shared/State');
var Table = require('../shared/Table');
var CloudType = require('../shared/CloudType');

var util = require('util');

module.exports = State;

State.prototype.published = function (server) {
  this.server = server;
  this.publish = true;
};

State.prototype.checkChanges = function (state, user) {
  var self = this;
  var valid = true;
  // console.log('joining ' + Object.keys(master.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  // console.log('with ' + Object.keys(target.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  


  // // 1) Check SysAuth table changes
  // var ClientAuth = state.get('SysAuth');
  // var ServerAuth = self.get('SysAuth');
  // ClientAuth.forEachRow(function (clientAuth) {
  //   // the grantopt/tname/user columns should never be changed
  //   var serverAuth = ServerAuth.getByKey(clientAuth.uid);



  //   // client added table authorization
  //   if (!serverAuth) {
  //     if (!self.canGrantTable(clientAuth.get('priv').get(), self.get(clientAuth.get('tname').get()), user)) {
  //       console.log('client added authorization that it was not authorized to');
  //       valid = false;
  //     }
  //   }

  //   // // negative authorization on client-side
  //   // if (clientAuth.get('privtype').equals('-')) {
      
  //   //   // client added a negative authorization
  //   //   if (!serverAuth) {
  //   //     if (!self.canGrantTable(clientAuth.get('action').get(), self.get(clientAuth.get('tname').get()), user) {
  //   //       valid = false;
  //   //     }
  //   //   }
  //   // }


  //   ['grantopt', 'tname', 'user', 'priv', 'type'].forEach(function (column) {
  //     if (isChanged(serverAuth.get(column), clientAuth.get(column), ServerAuth.getProperty(column))) {
  //       console.log(column + ' was changed!');
  //       valid = false;
  //     }
  //   });

  //   // If an authorization action is changed (= revoked or granted)
  //   // check if user had the permission to do that action
  //   if (isChanged(serverAuth.get('active'), clientAuth.get('active'), ServerAuth.getProperty('active'))) {
  //     var table = self.get(clientAuth.get('tname').get());
  //     var action = clientAuth.get('priv').get();
  //     if (!self.canGrantTable(action, table, user)) {
  //       console.log(user.get('name').get() + ' not authed to grant ' + action + ' to ' + table.name);
  //       valid = false;
  //     }
  //   }
  // });
  
  // if (!valid) return valid;


  // // 2) Check SysColAuth Table changes
  // var ClientColAuth = state.get('SysColAuth');
  // var ServerColAuth = self.get('SysColAuth');
  // ClientColAuth.forEachRow(function (clientColAuth) {
  //   // the grantopt/tname/user columns should never be changed
  //   var serverColAuth = ServerColAuth.getByKey(clientColAuth.uid);

  //   // client added table authorization
  //   if (!serverColAuth) {
  //     if (!self.canGrantTable(clientColAuth.get('priv').get(), self.get(clientColAuth.get('tname').get()), user)) {
  //       console.log('client added authorization that it was not authorized to');
  //       valid = false;
  //     }
  //   }

  //   ['grantopt', 'tname', 'cname', 'user', 'priv', 'type'].forEach(function (column) {

  //     if (isChanged(serverColAuth.get(column), clientColAuth.get(column), ServerColAuth.getProperty(column))) {
  //       console.log(column + ' was changed!');
  //       valid = false;
  //     }
  //   });

  //   // If an authorization action is changed (= revoked or granted)
  //   // check if user had the permission to do that action
  //   if (isChanged(serverColAuth.get('active'), clientColAuth.get('active'), ServerColAuth.getProperty('active'))) {
  //     var table = self.get(clientColAuth.get('tname').get());
  //     var cname = clientColAuth.get('cname').get();
  //     var action = clientColAuth.get('priv').get();
  //     if (!self.canGrantColumn(action, table, cname, user)) {
  //       console.log(user.get('name').get() + ' not authed to grant ' + action + ' to ' + table.name + '.' + cname);
  //       valid = false;
  //     }
  //   }
  // });

  // // Check create/delete operations
  // state.forEachEntity(function (clientEntity) {
  //   var serverEntity = self.get(clientEntity.name);
  //   clientEntity.forEachState(function (key, val) {
  //     if (clientEntity.deleted(key) && !serverEntity.deleted(key)) {
  //       var entry = serverEntity.getByKey(key);
  //       if (!self.authedForRow('delete', entry, user)) {
  //         console.log(user.get('name').get() + ' not authed for delete of ' + clientEntity.name);
  //         clientEntity.obliterate(key);
  //         // valid = false;
  //       }
  //     }
  //     if (clientEntity.exists(key) && !serverEntity.defined(key)) {
  //       if (!self.canCreateOnTable(clientEntity, user)) {
  //         clientEntity.obliterate(key);
  //         console.log(user.get('name').get() + ' not authed for create of ' + clientEntity.name);
  //         // valid = false;
  //       }
  //     }
  //   });
  // });

  // // Check update operations
  // state.forEachArray(function (array) {
  //   array.forEachProperty(function (property) {
  //     property.forEachKey(function (key) {
  //       var joiner = state.getProperty(property).getByKey(key);
  //       var joinee = self.getProperty(property).getByKey(key);
  //       if (isChanged(joinee, joiner, property)) {
  //         var entry = array.getByKey(key);
  //         console.log(key + ' changed ');
  //         if (!self.authedForEntryProperty('update', entry, property, user)) {
  //           state.getProperty(property).obliterate(key);
  //           console.log(user.get('name').get() + ' not authed for update of ' + array.name);
  //           valid = false;
  //         }
  //       }
  //     });
  //   });
  // });
  return true;
  return valid;
};

function isChanged(joineeValue, joiningValue, property) {
  // If CloudType, check internally
  if (CloudType.isCloudType(property.CType)) {
    return joineeValue.isChanged(joiningValue);
  }

  // If Table Reference
  // 1) both are null, nothing changed
  if (joineeValue === null && joiningValue === null) {
    return false;
  }
  // 2) one of the values is null, the client changed the value
  if (joineeValue === null || joiningValue === null) {
    return true;
  }
  // 3) both are a reference, see if it is changed
  return (joineeValue.key() !== joiningValue.key());
}

//ServerState.prototype.declare = function (name, cvar) {
//  if (this.isPublished)
//    throw "Declare: Can not declare types after being published";
//  console.log('declaring ' + name);
//  this.map[name] = cvar;
//  return this;
//};
//
//State.prototype.yieldPush = function (state) {
//  this.join(state);
//  this.server.yieldPull(this);
//};