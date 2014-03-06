var Table = require('../shared/Table');
module.exports = Table;

var create = Table.prototype.create;
Table.prototype.create = function () {
  console.log('CREATING');
  this.state.checkPermission('create', this);
  return create.apply(this, Array.prototype.slice.apply(arguments));
};

