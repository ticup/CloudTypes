var CloudType = require('../shared/CloudType');

module.exports = CloudType;

CloudType.forEachUpdateOperation(function (type, name){
  var operation = type.prototype[name];
  type.prototype[name] = function () {
    var args = Array.prototype.slice.call(arguments);
    // this.entry.index.state.checkEntryPropertyPermission('update', this.entry, this.property, this.entry.index.state.getUser());
    return operation.apply(this, args);
  };
});