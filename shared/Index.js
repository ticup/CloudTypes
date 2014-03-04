var CloudType     = require('./CloudType');
var Keys          = require('./Keys');
var Property      = require('./Property');
var Properties    = require('./Properties');
var IndexEntry    = require('./IndexEntry');
var IndexQuery    = require('./IndexQuery');
var TypeChecker   = require('./TypeChecker');
var util          = require('util');

module.exports = Index;

// keyNames:  { string: IndexType }
// when declared in a State, the state will add itself and the declared name for this Index as properties
// to the Index object.
// todo: create copy of initializers
function Index(keys, fields) {
  var self        = this;
  fields = fields || {};
  if (!keys instanceof Array) {
    throw new Error('Index requires an array of single property objects as first argument to define its keys');
  }
  if (!fields instanceof Object) {
    throw new Error('Index requires and object with properties as second argument to define its fields');
  }

  this.keys       = new Keys(keys);
  this.properties = new Properties();
  this.isProxy    = false;  // set true by State if used as proxy for global CloudType
  Object.keys(fields).forEach(function (propName) {
    var cType = fields[propName];
    self.addProperty(new Property(propName, cType, self));
  });
}

Index.declare = function (keys, fields) {
  return new Index(keys, fields);
};

Index.declare.type = Index;


Index.prototype.forEachProperty = function (callback) {
  return this.properties.forEach(callback);
};

Index.prototype.get = function () {
  var keys = Array.prototype.slice.call(arguments);
  TypeChecker.keys(keys, this.keys);
  return new IndexEntry(this, keys);
};

Index.prototype.getByKey = function (key) {
  return new IndexEntry(this, key);
};

Index.prototype.entries = function (propertyName) {
  return this.properties.get(propertyName).entries();
};

Index.prototype.where = function (filter) {
  return new IndexQuery(this, filter);
};

Index.prototype.getProperty = function (property) {
  var result = this.properties.get(property);
  if (typeof result === 'undefined') {
    throw Error(this.name + " does not have property " + property);
  }
  return result;
};

Index.prototype.addProperty = function (property) {
  return this.properties.add(property);
};

Index.prototype.fork = function () {
  var fKeys = this.keys.fork();
  var index = new Index();
  index.keys = fKeys;
  index.properties = this.properties.fork(index);
  index.isProxy = this.isProxy;
  return index;
};

Index.prototype.toJSON = function () {
  return {
    type        : 'Array',
    keys        : this.keys.toJSON(),
    properties  : this.properties.toJSON(),
    isProxy     : this.isProxy
  };
};

Index.fromJSON = function (json) {
  var index = new Index();
  index.keys = Keys.fromJSON(json.keys);
  index.properties = Properties.fromJSON(json.properties, index);
  index.isProxy = json.isProxy;
  return index;
};