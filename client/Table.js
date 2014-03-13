var Table = require('../shared/Table');
module.exports = Table;

var create = Table.prototype.create;
Table.prototype.create = function () {
  console.log('CREATING');
  this.state.checkCreateOnTablePermission(this, this.state.getUser());
  return create.apply(this, Array.prototype.slice.apply(arguments));
};