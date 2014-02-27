var CloudType = require('./CloudType');


var TypeChecker = {
  key: function (val, type) {
    if (type === 'int') {
      if (typeof val !== 'number') {
        throw new Error("uncompatible key for declared type int: " + val);
      }
    } else if (type === 'string') {
      if (typeof val !== 'string') {
        throw new Error("uncompatible key for declared type string: " + val);
      }
    } else {
      if (typeof val.index === 'undefined' || val.index !== type) {
        throw new Error("uncompatible key for declared type " + type.index.name + ": " + val);
      }
    }
  },
  property: function (type, val) {
    // Cloud Type property: value has to be an instance of the declared Cloud Type
    if (CloudType.isCloudType(type)) {
      if (!val instanceof type) {
        throw new Error("uncompatible property for declared property " + type.tag + ": " + val);
      }
    // Reference property: value has to be an entry of declared Table.
    } else if (val.index === 'undefined' || val.index !== type) {
        throw new Error("uncompatible property for declared property " + type.name + ": " + val);
    }
  }
};

module.exports = TypeChecker;