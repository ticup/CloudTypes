var CIntModule = require('../shared/CInt');
var CInt = CIntModule.CInt;

module.exports = CIntModule;

var update = CInt.prototype.set;
CInt.prototype.set = function (val) {
  this.entry.index.state.checkColumnPermission('update', this.entry.index, this.property.name, this.entry.index.state.getGroup());
  update.call(this, val);
};