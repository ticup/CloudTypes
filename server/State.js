var State = require('../shared/State');
var Table = require('../shared/Table');
var CloudType = require('../shared/CloudType');

var util = require('util');

module.exports = State;

State.prototype.published = function (server) {
  this.server = server;
  this.publish = true;
};

State.prototype.checkChanges = function (state, group) {
  var self = this;
  var permission = true;
  // console.log('joining ' + Object.keys(master.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  // console.log('with ' + Object.keys(target.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  
  // Check create/delete permissions
  state.forEachEntity(function (clientEntity) {
    var serverEntity = self.get(clientEntity.name);
    clientEntity.forEachState(function (key, val) {
      if (clientEntity.deleted(key) && !serverEntity.deleted(key)) {
        if (!self.authedFor('delete', clientEntity, group)) {
          console.log(group.get('name').get() + ' not authed for delete of ' + clientEntity.name);
          permission = false;
        }
      }
      if (clientEntity.exists(key) && !serverEntity.exists(key)) {
        if (!self.authedFor('create', clientEntity, group)) {
          console.log(group.get('name').get() + ' not authed for create of ' + clientEntity.name);
          permission = false;
        }
      }
    });
  });

  // Check update permissions
  state.forEachArray(function (array) {
    array.forEachProperty(function (property) {
      property.forEachKey(function (key) {
        var joiner = state.getProperty(property).getByKey(key);
        var joinee = self.getProperty(property).getByKey(key);
        if (isChanged(joinee, joiner, property)) {
          if (!self.authedFor('update', array, group)) {
            console.log(group.get('name').get() + ' not authed for update of ' + array.name);
            permission = false;
          }
        }
      });
    });
  });

  return permission;
};

function isChanged(joineeValue, joiningValue, property) {
  // If CloudType, it can be deduced from the joining value itself
  if (CloudType.isCloudType(property.CType)) {
    return joiningValue.isChanged();
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
  // 3) both are a reference, see if they are the same reference
  return (joineeValue.key() === joiningValue.key());
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