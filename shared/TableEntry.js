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


// TableEntry.prototype.get = function (property) {
//   // console.log('getting ' + this.uid + ' (' + typeof this.uid + ')');
//   return this.index.getProperty(property).getByKey(this.uid);
// };

// TableEntry.prototype.set = function (propertyName, value) {
//   var prop = this.index.getProperty(propertyName);
//   TypeChecker.property(value, property.CType);

//   // If it is a Cloud Type column, retrieve it and call set(value) on it
//   if (CloudType.isCloudType(prop.CType)) {
//     prop.getByKey(this.uid).set(value);
//     return this;
//   }
  
//   // Otherwise replace the reference
//   prop.set(this.uid, value);
//   return this;
// };

// TableEntry.prototype.forEachKey = function (callback) {
//   for (var i = 0; i<this.keys.length; i++) {
//     var name = this.index.keys.getName(i);
//     callback(name, this.key(name));
//   }
// };

TableEntry.prototype.forEachColumn = function (callback) {
  return this.forEachProperty(callback);
};

// TableEntry.prototype.key = function (name) {
//   if (typeof name === 'undefined') { 
//     return this.serialKey();
//   } 
//   var position = this.index.keys.getPositionOf(name);
//   if (position === -1)
//     throw Error("This Array does not have a key named " + name);

//   var type  = this.index.keys.getType(position);
//   var value =  this.keys[position];

//   if (type === 'int') {
//     value = parseInt(value, 10);
//   }
//   if (type !== 'int' && type !== 'string') {
//     value = type.getByKey(value);
//   }
//   return value;
// };

TableEntry.prototype.deleted = function () {
  return (this.index.state.deleted(this.uid, this.index));
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