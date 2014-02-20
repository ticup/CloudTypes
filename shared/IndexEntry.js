var Indexes = require('./Indexes');

module.exports = IndexEntry;

function IndexEntry(cArray, indexes) {
  this.cArray = cArray;
  this.indexes = Indexes.getIndexes(indexes, cArray);
}

IndexEntry.prototype.get = function (property) {
  return this.cArray.getProperty(property).saveGet(this.indexes);
};

IndexEntry.prototype.forEachProperty = function (callback) {
  var self = this;
  this.cArray.forEachProperty(function (property) {
    callback(property.name, self.get(property));
  });
};

IndexEntry.prototype.forEachKey = function (callback) {
  for (var i = 0; i<this.indexes.length; i++) {
    callback(this.cArray.indexes.getName(i), this.indexes[i]);
  }
};



IndexEntry.prototype.forEachIndex = function (callback) {
  return this.indexes.forEach(callback);
};



IndexEntry.prototype.key = function (name) {
  var position = this.cArray.indexes.getPositionOf(name);
  if (position === -1)
    throw Error("This Array does not have an index named " + name);

  var type = this.cArray.indexes.getType(position);
  var value =  this.indexes[position];
  if (type === 'int') {
    value = parseInt(value, 10);
  }
  if (type !== 'int' && type !== 'string') {
    value = this.cArray.state.get(type).getByIndex(value);
  }
  return value;
};

IndexEntry.prototype.deleted = function () {
  return (this.cArray.state.deleted(this.indexes, this.cArray));
};

IndexEntry.prototype.index = function () {
  return Indexes.createIndex(this.indexes);
};

IndexEntry.prototype.equals = function (entry) {
  if (this.cArray !== entry.cArray)
    return false;

  for (var i = 0; i<this.indexes.length; i++) {
    if (this.indexes[i] !== entry.indexes[i])
      return false;
  }
  return true;
};