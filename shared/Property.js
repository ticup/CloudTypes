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
var Reference   = require('./Reference');

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
  // if (this.CType.prototype === Reference.Prototype) {
  //   if (val !== null) {
  //     val = val.serialKey();
  //   }
  // }
  this.values[key] = val;
};

// Gets the value of given key
// keys is only for the Tables
Property.prototype.getByKey = function (key, keys) {
  var ctype = this.values[key];

  // console.log('getting ' + key + '.' + this.name + ' = ' + ctype + ' (' + typeof ctype + ')');
  
  // If reference: check if reference is still valid, otherwise return null
  if (!CloudType.isCloudType(this.CType) && this.index.state.deleted(key, this.index)) {
    return null;
  }

  // 1) This key does not exist yet
  if (typeof ctype === 'undefined') {
    var entry = this.index.getByKey(key, keys);

    // if it is a Cloud Type, make a new default.
    // if (CloudType.isCloudType(this.CType)) { 
      ctype = this.CType.newFor(entry, this);

      // do not add to values property for a CSet, because it is kept in dedicated Table
      if (this.CType.prototype === CSet.CSetPrototype) {
        return ctype;
      }
    // } else {
      // ctype = Reference.newFor(entry, this);
    // }
      
      // add the new cloudtype to the values property for this key
      this.values[key] = ctype;
      return ctype;

    // if it is a reference and the key does not exist yet, return null
    // } else {
      // return null;
    // }
  }

  // 2) The key exists
  // if it is a Cloud Type, simply return the value
  // if (CloudType.isCloudType(this.CType)) {
  return ctype;
  // }
  // if it's a reference, retrieve the entry for that key from the referred Table.
  // return this.CType.getByKey(ctype);
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
  
  // if (CloudType.isCloudType(this.CType)) {
    type = this.CType.toJSON();
  // } else {
    // type = this.CType.name;
  // }
  self.forEachKey(function (key, val) {
    values[key] = val.toJSON();
  });
  return { name: this.name, type: type, values: values };
};

Property.fromJSON = function (json, index) {
  var values = {};
  var CType;
  
  // If the property is a Cloud Type, rebuild all entries
  // if (CloudType.isCloudType(json.type)) {
    CType = CloudType.fromJSON(json.type);
    var property = new Property(json.name, CType, index);
    Object.keys(json.values).forEach(function (key) {
      values[key] = CType.fromJSON(json.values[key], index.getByKey(key), property);
    });
  // } else {
    // Otherwise it's a reference that will be replaced by the real reference in the second scan
    // CType = json.type;
    // Object.keys(json.values).forEach(function (key) {
      // values[key] = Reference.fromJSON(json.values[key], index.getByKey(key), property);
    // });
  // }
    
  // Object.keys(json.values).forEach(function (key) {
  //   values[key] = CType.fromJSON(json.values[key], index.getByKey(key), property);
  // });
  property.values = values;
  return property;  
};

Property.prototype.fork = function (index) {
  var self = this;
  var fProperty, fType;
  // Cloud Types need to be forked
  // if (CloudType.isCloudType(this.CType)) {
  //   fType = this.CType.fork();
  // } else {
    fType = this.CType;
  // }
    fProperty = new Property(this.name, fType, index);
    self.forEachKey(function (key, val) {
      fProperty.values[key] = val.fork();
    });
  // References are just copied
  // } else {
  //   fProperty = new Property(this.name, this.CType, index);
  //   self.forEachKey(function (key, val) {
  //     fProperty.values[key] = val;
  //   });
  // }
  return fProperty;
};

// Property.prototype.restrictedFork = function (index, group) {
//   var self = this;

//   // Need to be authed to read this column
//   if (!self.index.state.authedForColumn('read', self.index, self.name, group)) {
//     return null;
//   }

//   // If its a reference, it needs to be authed to read the reference table
//   if (Reference.isReferenceDeclaration(self.CType) && !self.index.state.authedForTable('read', self.CType.prototype.table, group)) {
//     return null;
//   }
  
//   return self.fork(index);
// };

module.exports = Property;