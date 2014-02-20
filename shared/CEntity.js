var CArray     = require('./CArray');
var Indexes    = require('./Indexes');
var Properties = require('./Properties');
var Property   = require('./Property');
var CEntityEntry = require('./CEntityEntry');
var CEntityQuery = require('./CEntityQuery');

module.exports = CEntity;

var OK = 'ok';
var DELETED = 'deleted';

// when declared in a State, the state will add itself and the declared name for this CArray as properties
// to the CEntity object.
function CEntity(keys, properties, states) {
  CArray.call(this, keys, properties);
  this.states = {} || states;
  this.uid = 0;
}
CEntity.prototype = Object.create(CArray.prototype);

CEntity.OK = OK;
CEntity.DELETED = DELETED;

CEntity.declare = function (keyDeclarations, propertyDeclarations) {
  var cEntity = new CEntity([{uid: 'string'}].concat(keyDeclarations));
  Object.keys(propertyDeclarations).forEach(function (propName) {
    var cTypeName = propertyDeclarations[propName];
    cEntity.addProperty(new Property(propName, cTypeName, cEntity));
  });
  return cEntity;
};


CEntity.prototype.create = function (keys) {
  keys = (typeof keys === 'undefined') ? [] : keys;
  var uid = this.name + ":" + this.state.createUID(this.uid);
  this.uid += 1;
  var key = Indexes.createIndex([uid].concat(keys));
  this.setCreated(key);
  return this.get.apply(this, [uid].concat(keys));
};

CEntity.prototype.delete = function (entry) {
  console.log("DELETING " + entry.keys);
  this.setDeleted(Indexes.createIndex(entry.keys));
  this.state.propagate();
};

// Pure arguments version (user input version)
CEntity.prototype.get = function () {
  return new CEntityEntry(this, Array.prototype.slice.call(arguments));
};

// Flattened key version (internal version)
CEntity.prototype.getByIndex = function (key) {
  return new CEntityEntry(this, key);
};

CEntity.prototype.forEachState = function (callback) {
  return Object.keys(this.states).forEach(callback);
};

CEntity.prototype.setMax = function (entity1, entity2, key) {
  var val1 = entity1.states[key];
  var val2 = entity2.states[key];
  if (val1 === DELETED || val2 === DELETED) {
    return this.states[key] = DELETED;
  }
  if (val1 === OK || val2 === OK) {
    return this.states[key] = OK;
  }

};

CEntity.prototype.where = function (filter) {
  return new CEntityQuery(this, filter);
};

CEntity.prototype.all = function () {
  var self = this;
  var entities = [];
  Object.keys(this.states).forEach(function (key) {
    if (self.states[key] === OK)
      entities.push(self.getByIndex(key));
  });
  return entities;
};

CEntity.prototype.setDeleted = function (key) {
  this.states[key] = DELETED;
};

CEntity.prototype.setCreated = function (key) {
  this.states[key] = OK;
};



CEntity.prototype.exists = function (idx) {
  return (typeof this.states[idx] !== 'undefined' && this.states[idx] === OK);
};

CEntity.prototype.deleted = function (idx) {
  return (this.states[idx] === DELETED)
};

CEntity.prototype.fork = function () {
  var fIndexes = this.keys.fork();
  var cEntity = new CEntity(fIndexes);
  cEntity.properties = this.properties.fork(cEntity);
  cEntity.states     = this.states;
  return cEntity;
};

CEntity.fromJSON = function (json) {
  var cEntity = new CEntity();
  cEntity.keys = Indexes.fromJSON(json.keys);
  cEntity.properties = Properties.fromJSON(json.properties, cEntity);
  cEntity.states = {};
  Object.keys(json.states).forEach(function (key) {
    cEntity.states[key] = json.states[key];
  });
  return cEntity;
};

CEntity.prototype.toJSON = function () {
  return {
    type        : 'Entity',
    keys     : this.keys.toJSON(),
    properties  : this.properties.toJSON(),
    states      : this.states

  };
};
