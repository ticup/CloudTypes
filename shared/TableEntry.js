var Keys        = require('./Keys');
var CArrayEntry = require('./CArrayEntry');

module.exports = TableEntry;

function TableEntry(cArray, keys) {
  CArrayEntry.call(this, cArray, keys);
//  this.cArray = cArray;
//  this.keys = Keys.getKeys(keys, cArray);
}

TableEntry.prototype = Object.create(CArrayEntry.prototype);


TableEntry.prototype.get = function (property) {
  return this.cArray.getProperty(property).saveGet(this.keys);
};

TableEntry.prototype.forEachIndex = function (callback) {
  return this.keys.slice(1).forEach(callback);
};

TableEntry.prototype.forEachKey = function (callback) {
  for (var i = 1; i<this.keys.length; i++) {
    callback(this.cArray.keys.getName(i), this.keys[i]);
  }
};

TableEntry.prototype.deleted = function () {
  return (this.cArray.state.deleted(this.keys, this.cArray));
};

TableEntry.prototype.delete = function () {
  return this.cArray.delete(this);
};

TableEntry.prototype.toString = function () {
  return Keys.createIndex(this.keys);
};