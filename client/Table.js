var Table = require('../shared/Table');
module.exports = Table;

var create = Table.prototype.create;
Table.prototype.create = function () {
  console.log('CREATING');
  this.state.checkTablePermission('create', this, this.state.getGroup());
  return create.apply(this, Array.prototype.slice.apply(arguments));
};