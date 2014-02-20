var CloudType     = require('./CloudType');
var Indexes       = require('./Indexes');
var Property      = require('./Property');
var Properties    = require('./Properties');
var IndexEntry   = require('./IndexEntry');
var IndexQuery   = require('./IndexQuery');

var CSet = require('./CSet');

var util          = require('util');

module.exports = Index;

// indexNames:  { string: IndexType }
// when declared in a State, the state will add itself and the declared name for this Index as properties
// to the Index object.
// todo: create copy of initializers
function Index(indexes, properties) {
  this.indexes    = (indexes instanceof Indexes) ? indexes : new Indexes(indexes);
  this.properties = properties || new Properties();
  this.isProxy    = false;  // set true by State if used as proxy for global CloudType
}

// properties: { string: string {"int", "string"} }
Index.declare = function (indexDeclarations, propertyDeclarations) {
  var carray = new Index(indexDeclarations);
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

Index.prototype.getByIndex = function (index) {
  return new IndexEntry(this, index)
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
  var fIndexes = this.indexes.fork();
  var cArray = new Index(fIndexes);
  cArray.properties = this.properties.fork(cArray);
  cArray.isProxy = this.isProxy;
  return cArray;
};


Index.prototype.toJSON = function () {
  return {
    type        : 'Array',
    indexes     : this.indexes.toJSON(),
    properties  : this.properties.toJSON(),
    isProxy     : this.isProxy
  };
};

Index.fromJSON = function (json) {
  var cArray = new Index();
  cArray.indexes = Indexes.fromJSON(json.indexes);
  cArray.properties = Properties.fromJSON(json.properties, cArray);
  cArray.isProxy = json.isProxy;
  return cArray;
};