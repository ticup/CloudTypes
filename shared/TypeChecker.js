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
      if (typeof val.index === 'undefined' || !type.isTypeOf(value)) {
        throw new Error("uncompatible key for declared type " + type.index.name + " : " + val);
      }
    }
  },
  property: function (val, type) {
    // Cloud Type property: value has to be an instance of the declared Cloud Type
    if (CloudType.isCloudType(type)) {
      if (!val instanceof type) {
        throw new Error("uncompatible property for declared property " + type.tag + " : " + val);
      }
    // Reference property: value has to be an entry of declared Table or null.
    } else if (val !== null && (val.index === 'undefined' || !type.isTypeOf(value))) {
        throw new Error("uncompatible property for declared property " + type + " : " + val);
    }
  },
  keys: function (values, keys) {
    if (keys.types.length !== values.length) {
      throw new Error("uncompatible keys for declared type " + keys);
    }
    for (var i = 0; i < keys.types.length; i++) {
      var type = keys.types[i];
      var value = values[i];
      if (type === 'int') {
        if (typeof value !== 'number') {
          throw new Error("uncompatible key for declared type int" + value);
        }
      } else if (type === 'string') {
        if (typeof value !== 'string') {
          throw new Error("uncompatible key for declared type string" + value);
        }
      } else {
        if (typeof value.index === 'undefined' || value.index !== type) {
          throw new Error("uncompatible key for declared type " + value);
        }
      }
    }
  }
};


module.exports = TypeChecker;