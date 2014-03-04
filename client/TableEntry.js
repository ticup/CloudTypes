var TableEntry = require('../shared/TableEntry');
module.exports = TableEntry;

var create = TableEntry.prototype.create;

var update = TableEntry.prototype.set;
TableEntry.prototype.set = function () {
  console.log('UPDATING ' + Array.prototype.slice.apply(arguments));
  this.index.state.checkAuthorization(this.index, 'update');
  return update.apply(this, Array.prototype.slice.apply(arguments));
};


var remove = TableEntry.prototype.delete;
TableEntry.prototype.delete = function () {
  console.log('DELETING');
  this.index.state.checkAuthorization(this.index, 'delete');
  return remove.apply(this, Array.prototype.slice.apply(arguments));
};