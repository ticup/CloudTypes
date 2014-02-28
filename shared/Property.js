/* 
 * Property
 * ---------
 * A single property: column of Table or field of Index.
 * Stores all the values for that property using the serialized index of an entry of the Index/Table.
 * CloudType values are stored as the real values, Table references as their serialized index.
 */

var CloudType   = require('./CloudType');
var CSet        = require('./CSet');
var TypeChecker = require('./TypeChecker');
var Keys        = require('./Keys');

function Property(name, CType, index, values) {
  this.name   = name;
  this.keys   = index.keys;
  this.index  = index;
  this.CType  = CType;
  this.values = values || {};
}

// Calls callback with (keyName, keyEntry) for each valid key of this property
Property.prototype.forEachKey = function (callback) {
  var self = this;
  return Object.keys(this.values).forEach(function (key) {
      callback(key, self.values[key]);
  });
};


// Sets given value for given key and checks the type
Property.prototype.set = function (key, val) {
  if (this.CType.prototype === CSet.CSetPrototype) {
    throw new Error("Can not call set on a CSet propety");
  }
  TypeChecker.property(val, this.CType);
  
  // If it's a reference, simply store its uid
  if (!CloudType.isCloudType(this.CType)) {
    val = val.serialKey();
  }
  this.values[key] = val;
};

// Gets the value of given key
Property.prototype.getByKey = function (key) {
  var ctype = this.values[key];

  // console.log('getting ' + key + '.' + this.name + ' = ' + ctype + ' (' + typeof ctype + ')');
  
  // If reference: check if reference is still valid, otherwise return null
  if (!CloudType.isCloudType(this.CType) && this.index.state.deleted(key, this.index)) {
    return null;
  }

  // 1) This key does not exist yet
  if (typeof ctype === 'undefined') {
    var entry = this.index.getByKey(key);

    // if it is a Cloud Type, make a new default.
    if (CloudType.isCloudType(this.CType)) {
      ctype = this.CType.newFor(entry);

      // do not add to values property for a CSet, because it is kept in dedicated Table
      if (this.CType.prototype === CSet.CSetPrototype) {
        return ctype;
      }
      
      // otherwise add the new cloudtype to the values property for this key
      this.values[key] = ctype;
      return ctype;

    // if it is a reference and the key does not exist yet, return null
    } else {
      return null;
    }
  }

  // 2) The key exists
  // if it is a Cloud Type, simply return the value
  if (CloudType.isCloudType(this.CType)) {
    return ctype;
  }
  // if it's a reference, retrieve the entry for that key from the referred Table.
  return this.CType.getByKey(ctype);
};


// Returns an array of all entries for which the values of this property are not default
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
    self.forEachKey(function (key, val) {
      values[key] = val.toJSON();
    });
  } else {
    type = { reference: this.CType.name };
    self.forEachKey(function (key, val) {
      values[key] = val;
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
      values[key] = CType.fromJSON(json.values[key], index.getByKey(key));
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
    self.forEachKey(function (key, val) {
      fProperty.values[key] = val.fork();
    });
  // References are just copied
  } else {
    self.forEachKey(function (key, val) {
      fProperty.values[key] = val;
    });
  }
  return fProperty;
};

module.exports = Property;