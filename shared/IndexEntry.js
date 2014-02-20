var Keys = require('./Keys');

module.exports = IndexEntry;

function IndexEntry(index, keys) {
  this.index = index;
  this.keys = Keys.getKeys(keys, index);
}

IndexEntry.prototype.get = function (property) {
  return this.index.getProperty(property).saveGet(this.keys);
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



IndexEntry.prototype.forEachIndex = function (callback) {
  return this.keys.forEach(callback);
};



IndexEntry.prototype.key = function (name) {
  var position = this.index.keys.getPositionOf(name);
  if (position === -1)
    throw Error("This Array does not have an key named " + name);

  var type = this.index.keys.getType(position);
  var value =  this.keys[position];
  if (type === 'int') {
    value = parseInt(value, 10);
  }
  if (type !== 'int' && type !== 'string') {
    value = this.index.state.get(type).getByIndex(value);
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