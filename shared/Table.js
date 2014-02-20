var Index     = require('./Index');
var Indexes    = require('./Indexes');
var Properties = require('./Properties');
var Property   = require('./Property');
var TableEntry = require('./TableEntry');
var TableQuery = require('./TableQuery');

module.exports = Table;

var OK = 'ok';
var DELETED = 'deleted';

// when declared in a State, the state will add itself and the declared name for this Index as properties
// to the Table object.
function Table(indexes, properties, states) {
  Index.call(this, indexes, properties);
  this.states = {} || states;
  this.uid = 0;
}
Table.prototype = Object.create(Index.prototype);

Table.OK = OK;
Table.DELETED = DELETED;

Table.declare = function (indexDeclarations, propertyDeclarations) {
  var table = new Table([{uid: 'string'}].concat(indexDeclarations));
  Object.keys(propertyDeclarations).forEach(function (propName) {
    var cTypeName = propertyDeclarations[propName];
    table.addProperty(new Property(propName, cTypeName, table));
  });
  return table;
};


Table.prototype.create = function (indexes) {
  indexes = (typeof indexes === 'undefined') ? [] : indexes;
  var uid = this.name + ":" + this.state.createUID(this.uid);
  this.uid += 1;
  var index = Indexes.createIndex([uid].concat(indexes));
  this.setCreated(index);
  return this.get.apply(this, [uid].concat(indexes));
};

Table.prototype.delete = function (entry) {
  console.log("DELETING " + entry.indexes);
  this.setDeleted(Indexes.createIndex(entry.indexes));
  this.state.propagate();
};

// Pure arguments version (user input version)
Table.prototype.get = function () {
  return new TableEntry(this, Array.prototype.slice.call(arguments));
};

// Flattened index version (internal version)
Table.prototype.getByIndex = function (index) {
  return new TableEntry(this, index);
};

Table.prototype.forEachState = function (callback) {
  return Object.keys(this.states).forEach(callback);
};

Table.prototype.setMax = function (entity1, entity2, index) {
  var val1 = entity1.states[index];
  var val2 = entity2.states[index];
  if (val1 === DELETED || val2 === DELETED) {
    return this.states[index] = DELETED;
  }
  if (val1 === OK || val2 === OK) {
    return this.states[index] = OK;
  }

};

Table.prototype.where = function (filter) {
  return new TableQuery(this, filter);
};

Table.prototype.all = function () {
  var self = this;
  var entities = [];
  Object.keys(this.states).forEach(function (index) {
    if (self.states[index] === OK)
      entities.push(self.getByIndex(index));
  });
  return entities;
};

Table.prototype.setDeleted = function (index) {
  this.states[index] = DELETED;
};

Table.prototype.setCreated = function (index) {
  this.states[index] = OK;
};



Table.prototype.exists = function (idx) {
  return (typeof this.states[idx] !== 'undefined' && this.states[idx] === OK);
};

Table.prototype.deleted = function (idx) {
  return (this.states[idx] === DELETED)
};

Table.prototype.fork = function () {
  var fIndexes = this.indexes.fork();
  var table = new Table(fIndexes);
  table.properties = this.properties.fork(table);
  table.states     = this.states;
  return table;
};

Table.fromJSON = function (json) {
  var table = new Table();
  table.indexes = Indexes.fromJSON(json.indexes);
  table.properties = Properties.fromJSON(json.properties, table);
  table.states = {};
  Object.keys(json.states).forEach(function (index) {
    table.states[index] = json.states[index];
  });
  return table;
};

Table.prototype.toJSON = function () {
  return {
    type        : 'Entity',
    indexes     : this.indexes.toJSON(),
    properties  : this.properties.toJSON(),
    states      : this.states

  };
};
