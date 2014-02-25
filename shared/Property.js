var CloudType = require('./CloudType');
var CSet      = require('./CSet');
//var Index     = require('./Index');

function Property(name, CType, index, values) {
  this.name = name;
  this.keys = index.keys;
  this.index = index;
  this.CType = CType;
  this.values = values || {};

  // Should either be a cloud type or a reference to an index
  // console.log(Index);
  // if (!CloudType.isCloudType(this.CType) && !(this.CType instanceof Index)) {
  //   throw Error ("Unknown property type in declaration (Must be CloudType (CInt, CString, CSet,...)): " + this.CType);
  // }
}

Property.prototype.forEachKey = function (callback) {
  var self = this;
  return Object.keys(this.values).forEach(function (key) {
    var val = self.getByKey(key);
    if (val) {
      callback(key, val);
    }
  });
};

Property.prototype.forAllKeys = function (callback) {
  var self = this;
  return Object.keys(this.values).forEach(function (key) {
    callback(key, self.values[key]);
  });
};

Property.prototype.saveGet = function (keys) {
  var key = this.keys.get(keys);
  if (this.index.state.deleted(key, this.index)) {
    return null;
  }
  return this.get(keys);
};

Property.prototype.get = function (keys) {
  var key;
  keys = keys || [];
  // TODO: perform check on types
  if (keys.length !== this.keys.length())
    throw Error("Given keys do not match declaration of Property: " + keys);

  if (keys.length === 0)
    key = 'singleton';
  else
    key = this.keys.get(keys);
  return this.getByKey(key);
};

Property.prototype.set = function (keys, val) {
  if (CloudType.isCloudType(this.CType)) {
    this.saveGet(keys).set(val);
    return this;
  }
  var key = this.keys.get(keys);
  this.values[key] = val.serialKey();
}

Property.prototype.getByKey = function (key) {
  var ctype = this.values[key];
  var entry = this.index.getByKey(key);

  // console.log('getting ' + key + '.' + this.name + ' = ' + ctype);
  // check if reference is still valid, otherwise return null
  if (!CloudType.isCloudType(this.CType) && this.index.state.deleted(key, this.index)) {
    return null;
  }

  // This key does not exist for this property yet
  if (typeof ctype === 'undefined') {

    // if it is a Cloud Type, make a new default.
    if (CloudType.isCloudType(this.CType)) {
      ctype = this.CType.newFor(entry);
      if (this.CType.prototype !== CSet.CSetPrototype) {
        this.values[key] = ctype;
      }
      return ctype;

    // if it is a reference, return null
    } else {
      return null;
    }
  }

  if (!CloudType.isCloudType(this.CType)) {
    return this.CType.getByKey(ctype);
  }
  return ctype;
};

Property.prototype.entries = function () {
  var self = this;
  var result = [];
  this.forEachKey(function (key) {
//    console.log("____entry checking : " + key + "____");
//    console.log("deleted: " + self.index.state.deleted(key, self.index));
//    console.log("default: " + self.index.state.isDefault(self.getByKey(key)));
    if (!self.index.state.deleted(key, self.index) && !self.index.state.isDefault(self.getByKey(key))) {
      result.push(self.index.getByKey(key));
    }
  });
  return result;
};

Property.prototype.toJSON = function () {
  var type;
  var self = this;
  var values = {};
  
  if (CloudType.isCloudType(this.CType)) {
    type = this.CType.toJSON();
    self.forAllKeys(function (key, val) {
      values[key] = val.toJSON();
    });
  } else {
    type = { reference: this.CType.name };
    self.forAllKeys(function (key, val) {
      values[key] = val.toString();
    });
  }
  return { name: this.name, type: type, values: values };
};

Property.fromJSON = function (json, index) {
  var values = {};
  
  // If the property is a Cloud, rebuild all entries
  if (CloudType.isCloudType(json.type)) {
    var CType = CloudType.fromJSON(json.type);
    Object.keys(json.values).forEach(function (key) {
      values[key] = CType.fromJSON(json.values[key], index.get(key));
    });
    return new Property(json.name, CType, index, values);
  }

  // Otherwise it's a reference that will be replaced by the real reference in the second scan
  Object.keys(json.values).forEach(function (key) {
    values[key] = json.values[key];
  });
  return new Property(json.name, json.type.reference, index, values)
  
};

Property.prototype.fork = function (index) {
  var self = this;
  var fProperty = new Property(this.name, this.CType, index);
  // Cloud Types need to be forked
  if (CloudType.isCloudType(this.CType)) {
    self.forAllKeys(function (key, val) {
      fProperty.values[key] = val.fork();
    });
  // References are just copied
  } else {
    self.forAllKeys(function (key, val) {
      fProperty.values[key] = val;
    });
  }
  return fProperty;
};

module.exports = Property;