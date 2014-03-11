var Keys       = require('./Keys');
var CloudType  = require('./CloudType');
var TypeChecker = require('./TypeChecker');

module.exports = IndexEntry;

// keys: an array of real keys or a flattened string of those keys
function IndexEntry(index, keys) {
  this.index = index;
  this.keys = Keys.getKeys(keys, index);
}

IndexEntry.prototype.get = function (propertyName) {
  var property = this.index.getProperty(propertyName);
  var key = this.key();
  return property.getByKey(key);
};

IndexEntry.prototype.set = function (propertyName, value) {
  var property = this.index.getProperty(propertyName);
  var key = this.key();
  TypeChecker.property(value, property.CType);

  // If it is a Cloud Type column, retrieve it and call set(value) on it
  // if (CloudType.isCloudType(property.CType)) {
    property.getByKey(key).set(value);
    // return this;
  // }
  
  // Otherwise replace the reference
  // property.set(key, value);
  return this;
};

IndexEntry.prototype.forEachProperty = function (callback) {
  var self = this;
  this.index.forEachProperty(function (property) {
    callback(property.name, self.get(property));
  });
};

IndexEntry.prototype.forEachKey = function (callback) {
  for (var i = 0; i<this.keys.length; i++) {
    var name = this.index.keys.getName(i);
    callback(name, this.key(name));
  }
};

IndexEntry.prototype.key = function (name) {
  if (typeof name === 'undefined') { 
    return this.serialKey();
  }
  var position = this.index.keys.getPositionOf(name);
  if (position === -1)
    throw Error("This Array does not have a key named " + name);
  var type = this.index.keys.getType(position);
  var value =  this.keys[position];
  if (type === 'int') {
    value = parseInt(value, 10);
  }
  if (type !== 'int' && type !== 'string') {
    value = type.getByKey(value);
  }
  return value;
};

IndexEntry.prototype.deleted = function () {
  return (this.index.state.deleted(this.key(), this.index));
};

IndexEntry.prototype.serialKey = function () {
  return Keys.createIndex(this.keys);
};

IndexEntry.prototype.equals = function (entry) {
  if (!(entry instanceof IndexEntry))
    return false;
  
  if (this.index.name !== entry.index.name)
    return false;

  for (var i = 0; i<this.keys.length; i++) {
    if (this.keys[i] !== entry.keys[i])
      return false;
  }
  return true;
};

IndexEntry.prototype.toString = function () {
  return Keys.createIndex(this.keys);
};