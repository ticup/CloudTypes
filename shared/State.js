var CloudType  = require('./CloudType');
var Index      = require('./Index');
var Table      = require('./Table');
var Restricted = require('./Restricted');
var Reference  = require('./Reference');
var CSetPrototype = require('./CSet').CSetPrototype;

module.exports = State;


function State() {
  this.arrays = {};
  this.cid = 0;
}

// Adds Authorization methods
require('./Auth')(State);

/* User API */
State.prototype.get = function (name) {
  var array = this.arrays[name];

  // if retrieving a global CloudType, get the value property of its proxy index instead
  if (typeof array !== 'undefined' && array.isProxy) {
    return array.getProperty('value').getByKey('singleton');
  }

  return this.arrays[name];
};

State.prototype.viewExists = function (name) {
  var exists = false;
  this.get('SysAuth').all().forEach(function (auth) {
    if (auth.get('vname').equals(name) && auth.get('type').equals('V')) {
      exists = true;
    }
  });
  return true;
};

State.prototype.all = function () {
  var self = this;
  var tables = [];
  Object.keys(this.arrays).forEach(function (name) {
    var index = self.arrays[name];
    if (!(index instanceof Restricted) && ((name.indexOf('Sys') === -1) || name === 'SysUser')) {
      tables.push(index);
    }
  });
  return tables;
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
    this.auth.grantAll(array.name, 'T');
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
        if (Reference.isReferenceDeclaration(property.CType.elementType)) {
          property.CType.elementType.resolveTable(state);
        }
      }

      // console.log('checking property ' + property.name + ' : ' + property.CType.table);
      // Reference that needs reference replacement
      // console.log(property.CType.prototype);
      // console.log(ReferencePrototype);
      // console.log(property.CType.prototype == ReferencePrototype);
      if (Reference.isReferenceDeclaration(property.CType)) {
        property.CType.resolveTable(state);
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
      // // console.log(array.keys.types[i]);
      // if (Reference.isReferenceDeclaration(array.keys.types[i])) {
      //   console.log('solving reference key: ' + array.keys.types[i]);
      //   array.keys.types[i].resolveTable(state);
      // }
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
  this.forEachArray(function (array) {
    array.forEachProperty(function (property) {
      if (Reference.isReferenceDeclaration(property.CType)) {
        property.forEachKey(function (key) {
          var ref = property.getByKey(key);
          if (self.deleted(ref.uid, ref.table)) {
            ref.uid = null;
          }
        });
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


State.prototype.dependendOn = function (child, parent) {
  var self = this;
  var dependend = false;
  child.keys.forEach(function (name, type, i) {
    if (type instanceof Index) {
      if (parent == type || self.dependendOn(type, parent)) {
        dependend = true;
      }
    }
  });
  return dependend;
};


State.prototype._join = function (rev, target) {
  var master = (this === target) ? rev : this;
  var self = this;

  // master === this => client-join
  // otherwise       => server-join
  
  // console.log('joining ' + Object.keys(master.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  // console.log('with ' + Object.keys(target.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  

  // (1) Perform the join
  master.forEachArray(function (array) {

    // If the target is restricted and we got an index in the master, this means access was granted to the that index
    // -> install the complete new index (references to the new index are set in (2))
    if (target.get(array.name) instanceof Restricted) {
      // TODO: make actual copy of it for local usage (not important right now)
      return target.add(array);

    }

    // Otherwise do a property-key-wise join on each property of each entry
    array.forEachProperty(function (property) {

      // If target does not have the property, access was granted to the property, just add it.
      if (rev === target && typeof target.get(array.name).properties.get(property) === 'undefined') {
        // TODO: make actual copy of it for local usage (not important right now)
        target.get(array.name).addProperty(property); 
        return;
      }
     

      // Joining Cloud Types (CInt/CString/CDate...) => semantics in the Cloud Type implementation
      // if (CloudType.isCloudType(property.CType)) {
        property.forEachKey(function (key) {
          var joiner = rev.getProperty(property).getByKey(key);
          var joinee = self.getProperty(property).getByKey(key);
          var t = target.getProperty(property).getByKey(key);
          joinee._join(joiner, t);
        });

      // Joining Table references => last writer semantics
      // } else {
        // fix types for typechecker
        // rev.getProperty(property).CType = target.getProperty(property).CType;
        // property.forEachKey(function (key) {
        //   var joiner = rev.getProperty(property).getByKey(key);
        //   target.getProperty(property).set(key, joiner);
        // });
      // }
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

State.prototype.fork = function () {
  var forked = new State();
  var forker = this;
  forked.views = forker.views;

  forker.forAllArray(function (index) {
    var fIndex = index.fork();
    fIndex.name = index.name;
    fIndex.state = forked;
    forked.add(fIndex);
  });

  // Fix Type references
  forked.forEachArray(function (index) {
    index.forEachProperty(function (property) {

      // if CSet property -> give reference to the proxy entity
      if (property.CType.prototype === CSetPrototype) {
        property.CType.entity      = forked.get(index.name + property.name);

        // and replace the table with the new table if it has a table as element
        if (property.CType.elementType instanceof Table) {
          property.CType.elementType = forked.get(property.CType.elementType.name);
        }
      }

      // if reference property -> replace the table with the new table
      if (Reference.isReferenceDeclaration(property.CType)) {
        property.CType.prototype.table = forked.get(property.CType.prototype.table.name);
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

State.prototype.restrict = function (user) {
  var self = this;


  self.forAllArray(function (index) {

    // If not authed to read table, replace by Restricted object
    if (!self.canSeeTable(index, user)) {
      // console.log('restricted from ' + index.name);
      var restricted = new Restricted(index.name);
      restricted.state = self;
      self.add(restricted);
      return;
    }

    if (index instanceof Table) {
      index.forEachState(function (key) {
        var entry = index.getByKey(key);
        if (!self.authedForRow('read', entry, user)) {
          console.log('obliterated ' + key);
          index.obliterate(key);
        }
      });
    }

    // console.log('can see some of ' + index.name);
    index.forEachProperty(function (property) {


      // 1) Can see the whole column
      if (self.canSeeFullColumn(index, property.name, user)) {
        // console.log('can see complete ' + index.name + '.' + property.name);
        return;
      }

      // 2) Can see some of the entries of this column
      if (self.canSeeColumn(index, property.name, user)) {
        
        // delete entries depending on the view
        property.forEachKey(function (key) {
          var entry = index.getByKey(key);
          if (entry && !self.authedForEntryProperty('read', entry, property, user)) {
            property.delete(key);
          }
        });

      // 3) not authed to read any entry of this column, completely remove it
      } else {
        delete index.properties.properties[property.name];
      }

      // // If its a reference, it needs to be authed to read the reference table
      // if (Reference.isReferenceDeclaration(property.CType) && !self.authedForTable('read', property.CType.prototype.table, group)) {
      //   delete index.properties.properties[property.name];
      // }
    });

  });



  return self;
};

State.prototype.applyFork = function () {
  var self = this;
  self.forEachProperty(function (property) {
    // if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var type = property.getByKey(key);
        type.applyFork();
      });
    // }
  });
};

State.prototype.replaceBy = function (state) {
  var self = this;
  state.forEachProperty(function (property) {
    // if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var type1 = property.getByKey(key);
        var type2 = self.getProperty(property).getByKey(key);
        type2.replaceBy(type1);
      });
    // }
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
      rType = Reference.Declaration.declare(this.get(type));
    }
  }
  if (type instanceof Table) {
    return Reference.Declaration.declare(type);
  }
  if (Reference.isReferenceDeclaration(type)) {
    return type;
  }
  if (typeof rType === 'undefined') {
    throw new Error("Undefined Property Type: " + type);
  }

  return rType;
};

// Try to resolve to a real key type from a string
State.prototype.resolveKeyType = function (type) {
  // console.log('resvolving ' + type);
  if (typeof type === 'string') {
    if (type === 'string' || type === 'int') {
      return type;
    }
    var rType = this.get(type);
    if (typeof rType !== 'undefined' && rType instanceof Table) {
      return rType;
    }
  }
  if (type instanceof Table) {
    return type;
  }
  // if (Reference.isReferenceDeclaration(type)) {
  //   return type;
  // }
  throw new Error("Only int, string or Table identifiers are allowed as keys, given " + type);
};

State.prototype.print = function () {
  this.forEachArray(function (array) {
    console.log(array.name);
    array.keys.forEach(function (key, type, i) {
      console.log("\t" + key + " : " + type.toString());
    });
    array.forEachProperty(function (property) {
      console.log("\t\t" + property.name + " : " + property.CType.toString());
    });
  });
  // console.log(require('util').inspect(this, {depth: null}));
};