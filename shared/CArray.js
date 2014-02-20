var CloudType     = require('./CloudType');
var Indexes       = require('./Indexes');
var Property      = require('./Property');
var Properties    = require('./Properties');
var CArrayEntry   = require('./CArrayEntry');
var CArrayQuery   = require('./CArrayQuery');

var CSet = require('./CSet');

var util          = require('util');

module.exports = CArray;

// keyNames:  { string: IndexType }
// when declared in a State, the state will add itself and the declared name for this CArray as properties
// to the CArray object.
// todo: create copy of initializers
function CArray(keys, properties) {
  this.keys    = (keys instanceof Indexes) ? keys : new Indexes(keys);
  this.properties = properties || new Properties();
  this.isProxy    = false;  // set true by State if used as proxy for global CloudType
}

// properties: { string: string {"int", "string"} }
CArray.declare = function (keyDeclarations, propertyDeclarations) {
  var carray = new CArray(keyDeclarations);
  Object.keys(propertyDeclarations).forEach(function (propName) {
    var cType = propertyDeclarations[propName];
    carray.addProperty(new Property(propName, cType, carray));
  });
  return carray;
};

CArray.prototype.forEachProperty = function (callback) {
  return this.properties.forEach(callback);
};

CArray.prototype.get = function () {
  return new CArrayEntry(this, Array.prototype.slice.call(arguments));
};

CArray.prototype.getByIndex = function (key) {
  return new CArrayEntry(this, key)
};

CArray.prototype.entries = function (propertyName) {
  return this.properties.get(propertyName).entries();
};

CArray.prototype.where = function (filter) {
  return new CArrayQuery(this, filter);
};

CArray.prototype.getProperty = function (property) {
  var result = this.properties.get(property);
  if (typeof result === 'undefined') {
    throw Error(this.name + " does not have property " + property);
  }
  return result;
};

CArray.prototype.addProperty = function (property) {
  return this.properties.add(property);
};

CArray.prototype.fork = function () {
  var fIndexes = this.keys.fork();
  var cArray = new CArray(fIndexes);
  cArray.properties = this.properties.fork(cArray);
  cArray.isProxy = this.isProxy;
  return cArray;
};


CArray.prototype.toJSON = function () {
  return {
    type        : 'Array',
    keys     : this.keys.toJSON(),
    properties  : this.properties.toJSON(),
    isProxy     : this.isProxy
  };
};

CArray.fromJSON = function (json) {
  var cArray = new CArray();
  cArray.keys = Indexes.fromJSON(json.keys);
  cArray.properties = Properties.fromJSON(json.properties, cArray);
  cArray.isProxy = json.isProxy;
  return cArray;
};