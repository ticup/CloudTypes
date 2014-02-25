var CloudType = require('./CloudType');
var Index     = require('./Index');
var Table     = require('./Table');
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
    return array.getProperty('value').get([]);
  }

  return this.arrays[name];
};


State.prototype.declare = function (name, array) {
  var self = this;

  // Index or Table
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
        property.CType.declareProxyTable(self, array, property);
      }
    });

    return array;
  }

  // global (CloudType) => create proxy Index
  if (typeof array.prototype !== 'undefined' && array.prototype instanceof CloudType) {
    var CType = array;
    array = new Index([], {value: CType});
    array.state = this;
    array.name  = name;
    array.isProxy = true;
    return this.arrays[name] = array;
  }

  // Either declare Index (Table is also a Index) or CloudType, nothing else.
  throw new Error("Need a Index or CloudType to declare: " + array);
};

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

State.prototype.resolveKeyType = function (type) {
  var rType = type;
  if (typeof type === 'string') {
    rType = this.get(type);
    if (typeof rType === 'undefined') {
      rType = type;
    }
  }
  return rType;
};

State.prototype.isDefault = function (cType) {
  return cType.isDefault();
}

/* Private */

State.prototype.createUID = function (uid) {
  var id = this.cid + "#" + uid;
  return id;
}

State.prototype.toJSON = function () {
  var self = this;
  var arrays = {};
  Object.keys(self.arrays).forEach(function (name) {
    return arrays[name] = self.arrays[name].toJSON();
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
  });
  return state;
};

State.prototype.getProperty = function (property) {
  return this.arrays[property.index.name].getProperty(property);
};


State.prototype.forEachProperty = function (callback) {
  var self = this;
  Object.keys(self.arrays).forEach(function (name) {
    self.arrays[name].forEachProperty(callback);
  });
};

State.prototype.forEachArray = function (callback) {
  var self = this;
  Object.keys(this.arrays).forEach(function (name) {
    callback(self.arrays[name]);
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
      if (entity.exists(key) && self.deleted(key, entity)) {
        entity.setDeleted(key);
      }
    });
  });
};

State.prototype.deleted = function (key, entity) {
  var self = this;
  // Entity
  if (typeof entity !== 'undefined' && entity instanceof Table) {
    var entry = entity.getByKey(key);
//    console.log(key + ' of ' + entity.name + ' deleted ?');

    if (entity.deleted(key))
      return true;
    var del = false;
    entry.forEachKey(function (name, value) {
      var type = entity.keys.getTypeOf(name);
      if (typeof type !== 'undefined')
        type = self.get(type);
//      console.log('key deleted? ' + value + " of type " + type);
      if (self.deleted(value, type))
        del = true;
    });
    return del;
  }

  // Array
  if (typeof entity !== 'undefined' && entity instanceof Index) {
    var del = false;
    var entry = entity.get(key);
    entry.forEachKey(function (name, value) {
      var type = entity.keys.getTypeOf(name);
      if (self.deleted(value, type))
        del = true;
    });
    return del;
  }

  // string/int
  return false;
};



State.prototype._join = function (rev, target) {
  var master = (this === target) ? rev : this;
  var self = this;
  
  master.forEachProperty(function (property) {
    if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var joiner = rev.getProperty(property).getByKey(key);
        var joinee = self.getProperty(property).getByKey(key);
        var t = target.getProperty(property).getByKey(key);
        joinee._join(joiner, t);
      });
    }
  });
  
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
  
  // 
  forker.forEachArray(function (index) {
    var fIndex = index.fork();
    forked.declare(index.name, fIndex);
  });

  // set new references
  forked.forEachArray(function (index) {
    index.forEachProperty(function (property) {
      if (!CloudType.isCloudType(property.CType)) {
        var fIndex = forked.get(property.CType.name);
        property.CType = fIndex;
        property.forEachKey(function (key, val) {
          property.values[key] = fIndex.getByKey.apply(fIndex, val.keys);
        });
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

State.prototype.print = function () {
  console.log(require('util').inspect(this, {depth: null}));
};