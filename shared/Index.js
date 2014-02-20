var CloudType     = require('./CloudType');
var Keys       = require('./Keys');
var Property      = require('./Property');
var Properties    = require('./Properties');
var IndexEntry   = require('./IndexEntry');
var IndexQuery   = require('./IndexQuery');

var CSet = require('./CSet');

var util          = require('util');

module.exports = Index;

// keyNames:  { string: IndexType }
// when declared in a State, the state will add itself and the declared name for this Index as properties
// to the Index object.
// todo: create copy of initializers
function Index(keys, properties) {
  this.keys    = (keys instanceof Keys) ? keys : new Keys(keys);
  this.properties = properties || new Properties();
  this.isProxy    = false;  // set true by State if used as proxy for global CloudType
}

// properties: { string: string {"int", "string"} }
Index.declare = function (keyDeclarations, propertyDeclarations) {
  var carray = new Index(keyDeclarations);
  Object.keys(propertyDeclarations).forEach(function (propName) {
    var cType = propertyDeclarations[propName];
    carray.addProperty(new Property(propName, cType, carray));
  });
  return carray;
};

Index.prototype.forEachProperty = function (callback) {
  return this.properties.forEach(callback);
};

Index.prototype.get = function () {
  return new IndexEntry(this, Array.prototype.slice.call(arguments));
};

Index.prototype.getByIndex = function (key) {
  return new IndexEntry(this, key)
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
  var index = new Index(fKeys);
  index.properties = this.properties.fork(index);
  index.isProxy = this.isProxy;
  return index;
};


Index.prototype.toJSON = function () {
  return {
    type        : 'Array',
    keys     : this.keys.toJSON(),
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