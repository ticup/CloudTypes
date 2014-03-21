var Table = require('../shared/Table');
module.exports = Table;

var create = Table.prototype.create;
Table.prototype.create = function () {
  console.log('CREATING');
  this.state.checkCreateOnTablePermission(this, this.state.getUser());
  var entry = create.apply(this, Array.prototype.slice.apply(arguments));
  this.setFreshCreated(entry.uid);
  return entry;
};

Table.prototype.setFreshCreated = function (uid) {
  if (typeof this.freshCreated === 'undefined') {
    this.resetFreshCreated();
  }
  this.freshCreated[uid] = true;
};

Table.prototype.isFreshCreated = function (uid) {
  return this.freshCreated[uid];
};

Table.prototype.resetFreshCreated = function () {
  this.freshCreated = {};
};

Table.prototype.forEachFreshCreated = function (callback) {
  if (typeof this.freshCreated === 'undefined') return;
  Object.keys(this.freshCreated).forEach(callback);
};