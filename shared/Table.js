var Index     = require('./Index');
var Keys       = require('./Keys');
var Properties = require('./Properties');
var Property   = require('./Property');
var TableEntry = require('./TableEntry');
var TableQuery = require('./TableQuery');

module.exports = Table;

var OK = 'ok';
var DELETED = 'deleted';

// when declared in a State, the state will add itself and the declared name for this Index as properties
// to the Table object.
function Table(properties, states) {
  Index.call(this, [{uid: 'string'}], properties);
  this.states = {} || states;
  this.uid = 0;
}
Table.prototype = Object.create(Index.prototype);

Table.OK = OK;
Table.DELETED = DELETED;

Table.declare = function (propertyDeclarations) {
  var table = new Table();
  Object.keys(propertyDeclarations).forEach(function (propName) {
    var cTypeName = propertyDeclarations[propName];
    table.addProperty(new Property(propName, cTypeName, table));
  });
  return table;
};


Table.prototype.create = function (keys) {
  keys = (typeof keys === 'undefined') ? [] : keys;
  var uid = this.name + ":" + this.state.createUID(this.uid);
  this.uid += 1;
  var key = Keys.createIndex([uid].concat(keys));
  this.setCreated(key);
  return this.get.apply(this, [uid].concat(keys));
};

Table.prototype.delete = function (entry) {
  console.log("DELETING " + entry.keys);
  this.setDeleted(Keys.createIndex(entry.keys));
  this.state.propagate();
};

// Pure arguments version (user input version)
Table.prototype.get = function () {
  return new TableEntry(this, Array.prototype.slice.call(arguments));
};

// Flattened key version (internal version)
Table.prototype.getByIndex = function (key) {
  return new TableEntry(this, key);
};

Table.prototype.forEachState = function (callback) {
  return Object.keys(this.states).forEach(callback);
};

Table.prototype.setMax = function (entity1, entity2, key) {
  var val1 = entity1.states[key];
  var val2 = entity2.states[key];
  if (val1 === DELETED || val2 === DELETED) {
    return this.states[key] = DELETED;
  }
  if (val1 === OK || val2 === OK) {
    return this.states[key] = OK;
  }

};

Table.prototype.where = function (filter) {
  return new TableQuery(this, filter);
};

Table.prototype.all = function () {
  var self = this;
  var entities = [];
  Object.keys(this.states).forEach(function (key) {
    if (self.states[key] === OK)
      entities.push(self.getByIndex(key));
  });
  return entities;
};

Table.prototype.setDeleted = function (key) {
  this.states[key] = DELETED;
};

Table.prototype.setCreated = function (key) {
  this.states[key] = OK;
};



Table.prototype.exists = function (idx) {
  return (typeof this.states[idx] !== 'undefined' && this.states[idx] === OK);
};

Table.prototype.deleted = function (idx) {
  return (this.states[idx] === DELETED)
};

Table.prototype.fork = function () {
  var fKeys = this.keys.fork();
  var table = new Table(fKeys);
  table.properties = this.properties.fork(table);
  table.states     = this.states;
  return table;
};

Table.fromJSON = function (json) {
  var table = new Table();
  table.keys = Keys.fromJSON(json.keys);
  table.properties = Properties.fromJSON(json.properties, table);
  table.states = {};
  Object.keys(json.states).forEach(function (key) {
    table.states[key] = json.states[key];
  });
  return table;
};

Table.prototype.toJSON = function () {
  return {
    type        : 'Entity',
    keys     : this.keys.toJSON(),
    properties  : this.properties.toJSON(),
    states      : this.states

  };
};
