var Keys        = require('./Keys');
var IndexEntry  = require('./IndexEntry');
var CloudType   = require('./CloudType');
var TypeChecker = require('./TypeChecker');
module.exports = TableEntry;

function TableEntry(index, uid, keys) {
  this.index = index;
  this.uid   = uid;
  this.keys  = Keys.getKeys(keys, index);
}
TableEntry.prototype = Object.create(IndexEntry.prototype);

TableEntry.prototype.forEachColumn = function (callback) {
  return this.forEachProperty(callback);
};

TableEntry.prototype.delete = function () {
  return this.index.delete(this);
};    

TableEntry.prototype.equals = function (entry) {
  if (this.index !== entry.index)
    return false;

  return this.uid === entry.uid;
};

TableEntry.prototype.serialKey = function () {
  return this.toString();
};

TableEntry.prototype.toString = function () {
  return this.uid;
};