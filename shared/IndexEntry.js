var Keys       = require('./Keys');
var CloudType  = require('./CloudType');
module.exports = IndexEntry;

// keys: an array of real keys or a flattened string of those keys
function IndexEntry(index, keys) {
  this.index = index;
  this.keys = Keys.getKeys(keys, index);
}

IndexEntry.prototype.get = function (propertyName) {
  return this.index.getProperty(propertyName).saveGet(this.keys);
};

IndexEntry.prototype.set = function (propertyName, value) {
  var prop = this.index.getProperty(propertyName);
  return prop.set(this.keys, value);
};


IndexEntry.prototype.forEachProperty = function (callback) {
  var self = this;
  this.index.forEachProperty(function (property) {
    callback(property.name, self.get(property));
  });
};

IndexEntry.prototype.forEachKey = function (callback) {
  for (var i = 0; i<this.keys.length; i++) {
    callback(this.index.keys.getName(i), this.keys[i]);
  }
};


IndexEntry.prototype.key = function (name) {
  var position = this.index.keys.getPositionOf(name);
  if (position === -1)
    throw Error("This Array does not have a key named " + name);

  var type = this.index.keys.getType(position);
  var value =  this.keys[position];
  if (type === 'int') {
    value = parseInt(value, 10);
  }
  if (type !== 'int' && type !== 'string') {
    value = this.index.state.get(type).getByKey(value);
  }
  return value;
};

IndexEntry.prototype.deleted = function () {
  return (this.index.state.deleted(this.keys, this.index));
};

IndexEntry.prototype.serialKey = function () {
  return Keys.createIndex(this.keys);
};

IndexEntry.prototype.equals = function (entry) {
  if (this.index !== entry.index)
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