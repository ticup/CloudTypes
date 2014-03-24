var Index      = require('./Index');
var Keys       = require('./Keys');
var Properties = require('./Properties');
var Property   = require('./Property');
var TableEntry = require('./TableEntry');
var TableQuery = require('./TableQuery');
var TypeChecker = require('./TypeChecker');
module.exports = Table;

var OK = 'ok';
var DELETED = 'deleted';

// when declared in a State, the state will add itself and the declared name for this Index as properties
// to the Table object.
function Table(keys, columns) {
  var self = this;

  // declare with only columns
  if (typeof columns === 'undefined' && !(keys instanceof Array)) {
    columns = keys;
    keys = [];
  }
  // declare with no keys/columns (from json)
  else if (typeof columns === 'undefined' && typeof keys === 'undefined') {
    columns = {};
    keys = [];
  }

  Index.call(this, keys, columns);
  this.keyValues = {};
  this.states    = {};
  this.callbacks = [];
  this.uid       = 0;
  this.cached = {};
}

Table.prototype = Object.create(Index.prototype);
Table.prototype.constructor = Table;

Table.OK = OK;
Table.DELETED = DELETED;

Table.declare = function (keys, columns) {
  return new Table(keys, columns);
};

Table.declare.type = Table;

Table.prototype.create = function (keys) {
  var uid = this.name + ":" + this.state.createUID(this.uid);
  if (!(keys instanceof Array)) {
    keys = Array.prototype.slice.call(arguments, 0);
  }
  TypeChecker.keys(keys, this.keys);
  // keys = Keys.getKeys(keys, this).slice(1);
  this.uid += 1;
  this.setCreated(uid);
  this.setKeyValues(uid, keys);
  return this.getByKey(uid);
};

Table.prototype.delete = function (entry) {
  console.log('deleting: ' + entry.uid);
  this.setDeleted(entry.uid);
  this.state.propagate();
};

Table.prototype.getKeyValues = function (uid) {
  var values = this.keyValues[uid];
  if (typeof values === 'undefined') {
    return [];
  }
  return values;
};

Table.prototype.setKeyValues = function (uid, keys) {
  this.keyValues[uid] = keys;
  return this;
};


// Removes all info about uid, only to be used by restrict
Table.prototype.obliterate = function (uid) {
  delete this.keyValues[uid];
  delete this.states[uid];
  delete this.cached[uid];
  this.forEachProperty(function (property) {
    property.delete(uid);
  });
};

// Pure arguments version (user input version)
// Table.prototype.get = function () {
//   var args = Array.prototype.slice.call(arguments);
//   var key = Keys.createIndex(args);
//   if (this.states[key]) {
//     return new TableEntry(this, args);
//   }
//   return null;
// };

// Pure arguments version (user input version)
// Table.prototype.get = function () {
//   var args = Array.prototype.slice.call(arguments);
//   var key = Keys.createIndex(args);
//   if (this.exists(key)) {
//     return new TableEntry(this, args);
//   }
//   return null;
// };

Table.prototype.get = function () {
  throw new Error("should not call get on table");
};

// Flattened key version (internal version)
Table.prototype.getByKey = function (uid, keys) {
  var self = this;
  if (this.exists(uid)) {
    keys = keys || this.getKeyValues(uid);
    var cache = self.cached[uid];
    if (typeof cache !== 'undefined') {
      cache.keys = Keys.getKeys(keys, self);
      return cache;
    }
    var entry = new TableEntry(this, uid, keys);
    self.cached[uid] = entry;
    return entry;
  }
  return null;
};

Table.prototype.forEachState = function (callback) {
  var self = this;
  return Object.keys(this.states).forEach(function (key) {
    callback(key, self.states[key]);
  });
};

Table.prototype.setMax = function (entity1, entity2, key) {
  var self = this;
  var val1 = entity1.states[key];
  var val2 = entity2.states[key];
  if (val1 === DELETED || val2 === DELETED) {
    self.states[key] = DELETED;
    return;
  }
  if (val1 === OK || val2 === OK) {
    self.states[key] = OK;

    if (val1 === OK && val2 !== OK) {
      entity2.setKeyValues(key, entity1.getKeyValues(key));
      return;
    }

    // newly created by client, coming in to server
    if (val2 === OK && val1 !== OK) {
      entity1.setKeyValues(key, entity2.getKeyValues(key));
      return true;
    }
  }

};

Table.prototype.where = function (filter) {
  return new TableQuery(this, filter);
};

Table.prototype.all = function () {
  var self = this;
  var entities = [];
  Object.keys(this.states).forEach(function (uid) {
    if (!self.state.deleted(uid, self))
      entities.push(self.getByKey(uid));
  });
  return entities;
};

Table.prototype.forEachRow = function (callback) {
  var self = this;
  Object.keys(this.states).forEach(function (uid) {
    if (!self.state.deleted(uid, self))
      callback(self.getByKey(uid));
  });
};

Table.prototype.setDeleted = function (key) {
  console.log('setting to deleted: ' + key);
  this.states[key] = DELETED;
};

Table.prototype.setCreated = function (key) {
  this.states[key] = OK;
};


Table.prototype.getByProperties = function (properties) {
  var results = this.where(function (row) {
    var toReturn = true;
    Object.keys(properties).forEach(function (name) {
      if (!row.get(name).equals(properties[name])) {
        toReturn = false;
      }
    });
    return toReturn;
  }).all();
  if (results.length > 0) {
    return results[0];
  }
  return null;
};

Table.prototype.getByKeys = function (keys) {
  var results = this.where(function (row) {
    var toReturn = true;
    Object.keys(keys).forEach(function (name) {
      var val = row.key(name);
      if (val instanceof TableEntry) {
        if (!(val.equals(keys[name]))) {
          toReturn = false;
        }
      } else {
        if (val !== keys[name]) {
          toReturn = false;
        }
      }
    });
    return toReturn;
  }).all();
  if (results.length > 0) {
    return results[0];
  }
  return null;
};

Table.prototype.find = function (callback) {
  var self = this;
  var result = null;
  self.all().forEach(function (row) {
    if (callback(row)) {
      result = row;
    }
  });
  return result;
}


Table.prototype.onCreate = function (callback) {
  this.callbacks.push(callback);
};

Table.prototype.triggerCreated = function (key) {
  var entry = this.getByKey(key);
  this.callbacks.forEach(function (callback) {
    callback(entry);
  });
};


Table.prototype.exists = function (idx) {
  return (this.defined(idx) && this.created(idx));
};

Table.prototype.created = function (idx) {
  return (this.states[idx] === OK);
};

Table.prototype.defined = function (idx) {
  return (typeof this.states[idx] !== 'undefined');
};

Table.prototype.deleted = function (idx) {
  return (this.states[idx] === DELETED);
};

Table.prototype.fork = function () {
  var self = this;
  var fKeys = this.keys.fork();
  var table = new Table();
  table.keys = fKeys;
  table.properties = self.properties.fork(table);
  table.states     = {};
  Object.keys(self.states).forEach(function (key) {
    table.states[key] = self.states[key];
  });
  table.keyValues  = {};
  Object.keys(self.keyValues).forEach(function (key) {
    table.keyValues[key] = self.keyValues[key];
  })
  table.isProxy    = this.isProxy;
  return table;
};

Table.prototype.shallowFork = function () {
  var self = this;
  var fKeys = this.keys.fork();
  var table = new Table();
  table.keys = fKeys;
  table.properties = new Properties();
  table.isProxy    = this.isProxy;
  return table;
};

// Table.prototype.restrictedFork = function (group) {
//   var fKeys = this.keys.fork();
//   var table = new Table();
//   table.keys = fKeys;
//   table.properties = this.properties.restrictedFork(table, group);
//   table.states     = this.states;
//   table.isProxy    = this.isProxy;
//   table.keyValues  = this.keyValues;
//   return table;
// };

Table.fromJSON = function (json) {
  var table = new Table();
  table.keys = Keys.fromJSON(json.keys);
  table.keyValues = json.keyValues;
  table.states = {};
  Object.keys(json.states).forEach(function (key) {
    table.states[key] = json.states[key];
  });
  table.properties = Properties.fromJSON(json.properties, table);
  return table;
};

Table.prototype.toJSON = function () {
  return {
    type        : 'Entity',
    keys        : this.keys.toJSON(),
    keyValues   : this.keyValues,
    properties  : this.properties.toJSON(),
    states      : this.states,
    isProxy     : this.isProxy
  };
};

Table.prototype.skeletonToJSON = function () {
  return {
    type        : 'Entity',
    keys        : this.keys.toJSON(),
    keyValues   : this.keyValues,
    properties  : {},
    states      : {},
    isProxy     : this.isProxy,
    name        : this.name
  };
};
