var Indexes     = require('./Indexes');
var CArrayEntry = require('./CArrayEntry');

module.exports = CEntityEntry;

function CEntityEntry(cArray, keys) {
  CArrayEntry.call(this, cArray, keys);
//  this.cArray = cArray;
//  this.keys = Indexes.getIndexes(keys, cArray);
}

CEntityEntry.prototype = Object.create(CArrayEntry.prototype);


CEntityEntry.prototype.get = function (property) {
  return this.cArray.getProperty(property).saveGet(this.keys);
};

CEntityEntry.prototype.forEachIndex = function (callback) {
  return this.keys.slice(1).forEach(callback);
};

CEntityEntry.prototype.forEachKey = function (callback) {
  for (var i = 1; i<this.keys.length; i++) {
    callback(this.cArray.keys.getName(i), this.keys[i]);
  }
};

CEntityEntry.prototype.deleted = function () {
  return (this.cArray.state.deleted(this.keys, this.cArray));
};

CEntityEntry.prototype.delete = function () {
  return this.cArray.delete(this);
};

CEntityEntry.prototype.toString = function () {
  return Indexes.createIndex(this.keys);
};