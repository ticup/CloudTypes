var CIntModule = require('../shared/CInt');
var CInt = CIntModule.CInt;

module.exports = CIntModule;

// var update = CInt.prototype.set;
// CInt.prototype.set = function (val) {
//   this.entry.index.state.checkEntryPropertyPermission('update', this.entry, this.property, this.entry.index.state.getUser());
//   update.call(this, val);
// };