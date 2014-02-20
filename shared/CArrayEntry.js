var Keys = require('./Keys');

module.exports = CArrayEntry;

function CArrayEntry(cArray, keys) {
  this.cArray = cArray;
  this.keys = Keys.getKeys(keys, cArray);
}

CArrayEntry.prototype.get = function (property) {
  return this.cArray.getProperty(property).saveGet(this.keys);
};

CArrayEntry.prototype.forEachProperty = function (callback) {
  var self = this;
  this.cArray.forEachProperty(function (property) {
    callback(property.name, self.get(property));
  });
};

CArrayEntry.prototype.forEachKey = function (callback) {
  for (var i = 0; i<this.keys.length; i++) {
    callback(this.cArray.keys.getName(i), this.keys[i]);
  }
};



CArrayEntry.prototype.forEachIndex = function (callback) {
  return this.keys.forEach(callback);
};



CArrayEntry.prototype.key = function (name) {
  var position = this.cArray.keys.getPositionOf(name);
  if (position === -1)
    throw Error("This Array does not have an key named " + name);

  var type = this.cArray.keys.getType(position);
  var value =  this.keys[position];
  if (type === 'int') {
    value = parseInt(value, 10);
  }
  if (type !== 'int' && type !== 'string') {
    value = this.cArray.state.get(type).getByIndex(value);
  }
  return value;
};

CArrayEntry.prototype.deleted = function () {
  return (this.cArray.state.deleted(this.keys, this.cArray));
};

CArrayEntry.prototype.serialKey = function () {
  return Keys.createIndex(this.keys);
};

CArrayEntry.prototype.equals = function (entry) {
  if (this.cArray !== entry.cArray)
    return false;

  for (var i = 0; i<this.keys.length; i++) {
    if (this.keys[i] !== entry.keys[i])
      return false;
  }
  return true;
};