var CStringModule = require('../shared/CString');
var CString = CStringModule.CString;

module.exports = CStringModule;

// var update = CString.prototype.set;
// CString.prototype.set = function (val) {
//   console.log(this.entry);
//   console.log(this.property);
//   this.entry.index.state.checkEntryPropertyPermission('update', this.entry, this.property, this.entry.index.state.getUser());
//   update.call(this, val);
// };