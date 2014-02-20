var Indexes     = require('./Indexes');
var IndexEntry = require('./IndexEntry');

module.exports = TableEntry;

function TableEntry(cArray, indexes) {
  IndexEntry.call(this, cArray, indexes);
//  this.cArray = cArray;
//  this.indexes = Indexes.getIndexes(indexes, cArray);
}

TableEntry.prototype = Object.create(IndexEntry.prototype);


TableEntry.prototype.get = function (property) {
  return this.cArray.getProperty(property).saveGet(this.indexes);
};

TableEntry.prototype.forEachIndex = function (callback) {
  return this.indexes.slice(1).forEach(callback);
};

TableEntry.prototype.forEachKey = function (callback) {
  for (var i = 1; i<this.indexes.length; i++) {
    callback(this.cArray.indexes.getName(i), this.indexes[i]);
  }
};

TableEntry.prototype.deleted = function () {
  return (this.cArray.state.deleted(this.indexes, this.cArray));
};

TableEntry.prototype.delete = function () {
  return this.cArray.delete(this);
};

TableEntry.prototype.toString = function () {
  return Indexes.createIndex(this.indexes);
};