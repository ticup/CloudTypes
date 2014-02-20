var CloudType = require('./CloudType');
var CSet      = require('./CSet');

function Property(name, CType, index, values) {
  this.name = name;
  this.keys = index.keys;
  this.index = index;
  this.CType = CType;
  if (typeof CType === 'string') {
    this.CType = CloudType.declareFromTag(CType);
  }
  if (!CloudType.isCloudType(this.CType)) {
    throw Error ("Unknown property type in declaration (Must be CloudType (CInt, CString, CSet,...)): " + this.CType);
  }
  this.values = values || {};
}

Property.prototype.forEachIndex = function (callback) {
  return Object.keys(this.values).forEach(callback);
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
  return this.getByIndex(key);
};

Property.prototype.getByIndex = function (key) {
  var ctype = this.values[key];
  if (typeof ctype === 'undefined') {
    ctype = this.CType.newFor(key);
    if (this.CType.prototype !== CSet.CSetPrototype) {
      this.values[key] = ctype;
    }

  }
  return ctype;
};

Property.prototype.entries = function () {
  var self = this;
  var result = [];
  this.forEachIndex(function (key) {
//    console.log("____entry checking : " + key + "____");
//    console.log("deleted: " + self.index.state.deleted(key, self.index));
//    console.log("default: " + self.index.state.isDefault(self.getByIndex(key)));
    if (!self.index.state.deleted(key, self.index) && !self.index.state.isDefault(self.getByIndex(key))) {
      result.push(self.index.getByIndex(key));
    }
  });
  return result;
};

Property.prototype.toJSON = function () {
  var self = this;
  var values = {};
  Object.keys(self.values).forEach(function (key) {
    values[key] = self.values[key].toJSON();
  });
  return { name: this.name, type: this.CType.toJSON(), values: values };
};

Property.fromJSON = function (json, index) {
  var values = {};
  var CType = CloudType.fromJSON(json.type);
  Object.keys(json.values).forEach(function (key) {
    values[key] = CType.fromJSON(json.values[key], key);
  });
  return new Property(json.name, CType, index, values);
};

Property.prototype.fork = function (index) {
  var self = this;
  var fProperty = new Property(this.name, this.CType, index);
  Object.keys(self.values).forEach(function (key) {
    fProperty.values[key] = self.values[key].fork();
  });
  return fProperty;
};

module.exports = Property;