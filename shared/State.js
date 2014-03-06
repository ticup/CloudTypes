var CloudType = require('./CloudType');
var Index     = require('./Index');
var Table     = require('./Table');
var Restricted = require('./Restricted');
var CSetPrototype = require('./CSet').CSetPrototype;

module.exports = State;

function State() {
  this.arrays = {};
  this.cid = 0;
}

/* User API */
State.prototype.get = function (name) {
  var array = this.arrays[name];

  // if retrieving a global CloudType, get the value property of its proxy index instead
  if (typeof array !== 'undefined' && array.isProxy) {
    return array.getProperty('value').getByKey('singleton');
  }

  return this.arrays[name];
};


State.prototype.declare = function (name, array, grant) {
  var self = this;
  if (typeof self.arrays[name] !== 'undefined') {
    throw new Error("A type with name " + name + " is already declared");
  }

  // 1) Index or Table
  if (array instanceof Index) {
    array.state = this;
    array.name  = name;
    self.arrays[name] = array;

    array.forEachProperty(function (property) {

      // Lookup CloudType/Reference of property if necessary
      property.CType = self.resolvePropertyType(property.CType);

      // Special case: CSet property
      if (property.CType.prototype === CSetPrototype) {

        // Lookup Reference of the set if necessary
        property.CType.elementType = self.resolveKeyType(property.CType.elementType);

        // Declare proxy Table and set reference
        property.CType.declareProxyTable(self, array, property, grant);
      }
    });

    array.keys.forEach(function (name, type, i) {
      array.keys.types[i] = self.resolveKeyType(type);
      if (array.keys.types[i] === array)
        throw new Error("Cannot use self as key type: " + name + " (" + type + ")");
    });

  }

  // 2) global (CloudType) => create proxy Index
  else if (CloudType.isCloudType(array)) {
    var CType = array;
    array = new Index([], {value: CType});
    array.state = this;
    array.name  = name;
    array.isProxy = true;
    this.arrays[name] = array;
  } else {
    // Either declare Index (Table is also a Index) or CloudType, nothing else.
    throw new Error("Need an Index or CloudType to declare: " + array);
  }

  if (grant !== 'N') {
    this.auth.grantAll(array.name, grant);
  }
  return array;
};

State.prototype.add = function (index) {
  this.arrays[index.name] = index;
  index.state = this;
  return this;
};



/* Internal */
/***********/
State.prototype.isDefault = function (cType) {
  return cType.isDefault();
};

State.prototype.createUID = function (uid) {
  var id = this.cid + "#" + uid;
  return id;
};

State.prototype.toJSON = function () {
  var self = this;
  var arrays = {};
  Object.keys(self.arrays).forEach(function (name) {
    arrays[name] = self.arrays[name].toJSON();
  });
  return {
    arrays: arrays
  };
};

State.fromJSON = function (json) {
  var array, state;
  state = new this();

  // Recreate the indexes
  Object.keys(json.arrays).forEach(function (name) {
    var arrayJson = json.arrays[name];
    if (arrayJson.type === 'Entity') {
      array = Table.fromJSON(arrayJson);
    } else if (arrayJson.type === 'Array') {
      array = Index.fromJSON(arrayJson);
    } else if (arrayJson.type === 'Restricted') {
      array = Restricted.fromJSON(arrayJson);
    } else {
      throw "Unknown type in state: " + json.type;
    }
    array.state = state;
    array.name  = name;
    state.arrays[name] = array;
  });

  // Fix references
  state.forEachArray(function (array) {
    array.forEachProperty(function (property) {
      property.CType = state.resolvePropertyType(property.CType);

      // if CSet property -> give reference to the proxy entity
      if (property.CType.prototype === CSetPrototype) {
        property.CType.entity      = state.get(array.name + property.name);
        property.CType.elementType = state.resolveKeyType(property.CType.elementType);
      }

      // If property is a reference, find all the references for all keys of that property
      // if (property.CType instanceof Index) {
      //   var refIndex = property.CType;

      //   property.forAllKeys(function (key, val) {
      //     var ref = refIndex.getByKey(val) || val;
      //     property.values[key] = ref;
      //   });
      // }
    });

    // Resolve the key types to the real types
    array.keys.forEach(function (name, type, i) {
      if (typeof type === 'string') {
        array.keys.types[i] = state.resolveKeyType(type);
      }
    });
  }); 
  return state;
};

State.prototype.getProperty = function (property) {
  return this.arrays[property.index.name].getProperty(property);
};


State.prototype.forEachProperty = function (callback) {
  var self = this;
  self.forEachArray(function (array) {
    array.forEachProperty(callback);
  });
};

State.prototype.forEachArray = function (callback) {
  var self = this;
  Object.keys(this.arrays).forEach(function (name) {
    var index = self.arrays[name];
    if (!(index instanceof Restricted)) {
      callback(index);
    }
  });
};

State.prototype.forAllArray = function (callback) {
  var self = this;
  Object.keys(this.arrays).forEach(function (name) {
    var index = self.arrays[name];
    callback(index);
  });
};

State.prototype.forEachEntity = function (callback) {
  var self = this;
  Object.keys(this.arrays).forEach(function (name) {
    if (self.arrays[name] instanceof Table)
      callback(self.arrays[name]);
  });
};

State.prototype.propagate = function () {
  var self = this;
  var changed = false;
  this.forEachEntity(function (entity) {
    entity.forEachState(function (key) {
      // console.log(entity.name +"["+key+"] deleted?");
      if (entity.exists(key) && self.deleted(key, entity)) {
        entity.setDeleted(key);
      }
    });
  });
};

State.prototype.deleted = function (key, entity) {
  var self = this;

  // Index/Table
  if (typeof entity !== 'undefined' && entity instanceof Index) {
    var entry = entity.getByKey(key);

    // Table
    if (entity instanceof Table) {
      if (entry === null)
        return true;

      if (entity.deleted(key))
        return true;
    }

    var del = false;
    entry.forEachKey(function (name, value) {
      var type = entity.keys.getTypeOf(name);

      // when types are not stored as real references to the types but rather as their names:
      // if (typeof type !== 'undefined')
      //   type = self.get(type);
     // console.log('key deleted? ' + value + " of type " + type + "(" + name+ ")");
      if (self.deleted(value, type))
        del = true;
    });
    return del;
  }

  // // Array
  // if (typeof entity !== 'undefined' && entity instanceof Index) {
  //   var del = false;
  //   var entry = entity.get(key);
  //   entry.forEachKey(function (name, value) {
  //     var type = entity.keys.getTypeOf(name);
  //     if (self.deleted(value, type))
  //       del = true;
  //   });
  //   return del;
  // }

  // string/int
  return false;
};



State.prototype._join = function (rev, target) {
  var master = (this === target) ? rev : this;
  var self = this;
  
  // console.log('joining ' + Object.keys(master.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  // console.log('with ' + Object.keys(target.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  

  // (1) Perform the join
  master.forEachArray(function (array) {

    // If the target is restricted and we got an index in the master, this means access was granted to the that index
    // -> install the complete new index (references to the new index are set in (2))
    if (target.get(array.name) instanceof Restricted) {
      // TODO: make actual copy of it for local usage (not important right now)
      target.add(array); 


    // Otherwise do a property-key-wise join on each property of each entry
    } else array.forEachProperty(function (property) {

      // Joining Cloud Types (CInt/CString/CDate...) => semantics in the Cloud Type implementation
      if (CloudType.isCloudType(property.CType)) {
        property.forEachKey(function (key) {
          var joiner = rev.getProperty(property).getByKey(key);
          var joinee = self.getProperty(property).getByKey(key);
          var t = target.getProperty(property).getByKey(key);
          joinee._join(joiner, t);
        });

      // Joining Table references => last writer semantics
      } else {
        // fix types for typechecker
        rev.getProperty(property).CType = target.getProperty(property).CType;
        property.forEachKey(function (key) {
          var joiner = rev.getProperty(property).getByKey(key);
          target.getProperty(property).set(key, joiner);
        });
      }
    });
  });

  // (2) Fix references to replaced Restricted Tables
  target.forEachArray(function (index) {
    index.forEachProperty(function (property) {
      if (property.CType instanceof Restricted) {
        property.CType = target.get(property.CType.name);
      }
    });

    index.keys.forEach(function (key, type, i) {
      if (type instanceof Restricted) {
        index.keys.types[i] = target.get(type.name);
      }
    });
  });

  // (3) Join the states of the Tables (deleted/created)
  master.forEachEntity(function (entity) {
    var joiner = rev.get(entity.name);
    var joinee = self.get(entity.name);
    var t = target.get(entity.name);
    entity.forEachState(function (key) {
      t.setMax(joinee, joiner, key);
    });

  });
  target.propagate();
};

State.prototype.joinIn = function (rev) {
  return this._join(rev, rev);
};

State.prototype.join = function (rev) {
  return this._join(rev, this);
};

// State.prototype.fork = function () {
//   var forked = new State();
//   var forker = this;
  
//   forker.forEachArray(function (index) {
//     var fIndex = index.fork();
//     forked.declare(index.name, fIndex);
//   });

//   // set new references
//   forked.forEachArray(function (index) {
//     index.forEachProperty(function (property) {
//       if (!CloudType.isCloudType(property.CType)) {
//         var fIndex = forked.get(property.CType.name);
//         property.CType = fIndex;
//         // property.forEachKey(function (key, val) {
//         //   var ref = fIndex.getByKey(val);
//         //   property.values[key] = .apply(fIndex, val.keys);
//         // });
//       }
//     });
//   });
//   return forked;
// };

State.prototype.restrictedFork = function (group) {
  var forked = new State();
  var forker = this;

  forker.forAllArray(function (index) {
    var fIndex;
    if (forker.authedFor('read', index, group)) {
      // console.log('authed for: ' + index.name);
      fIndex = index.fork();
    } else {
      // console.log('NOT authed for: ' + index.name);
      fIndex = new Restricted();
    }
    fIndex.name = index.name;
    fIndex.state = forked;
    forked.add(fIndex);
  });

  // Fix Type references
  forked.forEachArray(function (index) {
    index.forEachProperty(function (property) {

      // Table Reference Type: replace by the new Table
      if (!CloudType.isCloudType(property.CType)) {
        var fIndex = forked.get(property.CType.name);
        property.CType = fIndex;
        // property.forEachKey(function (key, val) {
        //   var ref = fIndex.getByKey(val);
        //   property.values[key] = .apply(fIndex, val.keys);
        // });
      }

      // if CSet property -> give reference to the proxy entity
      if (property.CType.prototype === CSetPrototype) {
        property.CType.entity      = forked.get(index.name + property.name);
        if (property.CType.elementType instanceof Table) {
          property.CType.elementType = forked.get(property.CType.elementType.name);
        }
      }
    });

    index.keys.forEach(function (key, type, i) {
      if (type instanceof Table) {
        index.keys.types[i] = forked.get(type.name);
      }
    });
  });
  return forked;
};

State.prototype.applyFork = function () {
  var self = this;
  self.forEachProperty(function (property) {
    if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var type = property.getByKey(key);
        type.applyFork();
      });
    }
  });
};

State.prototype.replaceBy = function (state) {
  var self = this;
  state.forEachProperty(function (property) {
    if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var type1 = property.getByKey(key);
        var type2 = self.getProperty(property).getByKey(key);
        type2.replaceBy(type1);
      });
    }
  });
  state.forEachEntity(function (entity) {
    self.get(entity.name).states = entity.states;
  });
};


// Try to resolve to real property type from a string
State.prototype.resolvePropertyType = function (type) {
  var rType = type;
  if (typeof type === 'string') {
    // 1) try to declare as regular CloudType
    rType = CloudType.declareFromTag(type);

    // 2) try to declare as reference to an Index
    if (typeof rType === 'undefined') {
      rType = this.get(type);
    }
  }

  if (typeof rType === 'undefined') {
    throw new Error("Undefined Property Type: " + type);
  }
  return rType;
};

// Try to resolve to a real key type from a string
State.prototype.resolveKeyType = function (type) {
  if (type instanceof Table) {
    return type;
  }
  if (typeof type === 'string') {
    if (type === 'string' || type === 'int') {
      return type;
    }
    var rType = this.get(type);
    if (typeof rType !== 'undefined' && rType instanceof Table) {
      return rType;
    }
  }
  throw new Error("Only int, string or Table identifiers are allowed as keys, given " + type);
};



/* Authentication */

State.prototype.getPrivileges = function () {
  throw new Error("Has to be implemented by server/client State");
};



State.prototype.authedFor = function (action, table, group) {
  var self = this;

  // already restricted
  if (table instanceof Restricted)
    return false;

  // Find authorization for this table
  var authed = this.get('SysAuth').where(function (auth) {
    return (auth.get('tname').equals(table.name) &&
            auth.get('group').equals(group) &&
            auth.get(action).equals('Y'));
  }).all().length > 0;

  if (!authed) {
    return false;
  }

  // Has to be authorized for all tables of keys
  table.keys.forEach(function (key, type) {
    if (type instanceof Table && !self.authedFor(action, type, group)) {
      authed = false;
    } 
  });

  // Has to be authrozied for all tables of properties ( NOT!!)
  // table.forEachProperty(function (property) {
  //   if (property.CType instanceof Table && !authedFor(property.CType, auths)) {
  //     authed = false;
  //   }
  // });

  return authed;
};

State.prototype.revoke = function (action, table, group) {
  var self = this;
  var Auth = this.get('SysAuth');
  action = action || 'read';
  if (typeof table === 'string') {
    table = self.get(table);    
  }
  if (typeof group === 'string') {
    group = self.get('SysGroup').getByProperties({name: group});
  }

  self.checkGrantPermission(action, table, group);
  Auth.all().forEach(function (auth) {
    if (auth.get('group').equals(group) &&
        auth.get('tname').equals(table.name)) {
      auth.set(action, 'N');
    console.log('revoked '+ action+ ' from ' + group.get('name').get());
    }
  });
  return this;
};

State.prototype.grant = function (action, table, group, grantOpt) {
  var self = this;
  grantOpt = grantOpt || 'N';
  action   = action || 'read';
  if (typeof table === 'string') {
    table = self.get(table);
  }
  if (typeof group === 'string') {
    group = self.get('SysGroup').getByProperties({name: group});
  }

  self.checkGrantPermission(action, table, group);
  this.get('SysAuth').all().forEach(function (auth) {
    if (auth.get('group').equals(group) &&
        auth.get('tname').equals(table.name) &&
        auth.get('grantopt').equals(grantOpt)) {
      auth.set(action, 'Y');
      console.log('granted '+ action + ' to ' + group.get('name').get() + ' grantOpt: ' + grantOpt);
    }
  });

  // Perform same grant on the proxy table of CSet properties of given table
  table.forEachProperty(function (property) {
    if (property.CType.prototype === CSetPrototype) {
      console.log(property.CType.prototype);
      self.grant(group, property.CType.entity, action, grantOpt);
    }
  });
  console.log('granted read to ' + group.get('name').get() + ' grantOpt: ' + grantOpt);
  return this;
};

State.prototype.checkPermission = function (action, index, group) {
  if (!this.authedFor(action, index, group)) {
    throw new Error("Not authorized to perform " + action + " on " + index.name);
  }
};

State.prototype.checkGrantPermission = function (action, table, group) {
  var self = this;
  var Auth = this.get('SysAuth');
  var permission = Auth.where(function (auth) {
    return (auth.get('group').equals(self.client.group) &&
            auth.get('tname').equals(table.name) &&
            auth.get(action).equals('Y') &&
            auth.get('grantopt').equals('Y'));
  }).all().length > 0;
  if (!permission) {
    throw new Error("You don't have " + action + " grant permissions for " + table.name);
  }
};

State.prototype.print = function () {
  console.log(require('util').inspect(this, {depth: null}));
};