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
//State.prototype.operation = function (name, keys, propertyName, op) {
//  return op.apply(this.arrays[name].getProperty(propertyName).get(keys), [].slice.call(arguments, 4))
//};
State.prototype.get = function (name) {
  var array = this.arrays[name];
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

    // CSet properties -> declare their proxy Entity and give reference to the CSet properties
    array.forEachProperty(function (property) {
      if (property.CType.prototype === CSetPrototype) {
        self.declare(array.name + property.name, new Table({entryIndex: 'CString', element: 'CString'}));
        property.CType.entity = self.get(array.name + property.name);
      }
    });
    return this.arrays[name] = array;
  }
  // global (CloudType) => create proxy Index
  if (typeof array.prototype !== 'undefined' && array.prototype instanceof CloudType) {
    var CType = array;
    array = new Index([], {value: CType.name});
    array.state = this;
    array.name  = name;
    array.isProxy = true;
    return this.arrays[name] = array;
  }
  // Either declare Index (Table is also a Index) or CloudType, nothing else.
  throw new Error("Need a Index or CloudType to declare: " + array);
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

  // Recreate the types
  Object.keys(json.arrays).forEach(function (name) {
    var arrayJson = json.arrays[name];
    if (arrayJson.type === 'Entity') {
      array = Table.fromJSON(arrayJson);
    } else if (arrayJson.type === 'Array') {
      array = Index.fromJSON(arrayJson);
    } else {
      throw "Unknown type in state: " + json.type;
    }
    state.declare(name, array);
  });

  // Fix references
  state.forEachArray(function (array) {
    array.forEachProperty(function (property) {
      // CSet property -> give reference to the proxy entity
      if (property.CType.prototype === CSetPrototype) {
        property.CType.entity = state.get(array.name + property.name);
      }

      // If property is a reference, find all the references for all keys of that property
      if (!CloudType.isCloudType(property.CType)) {
        var refIndex = state.get(property.CType);
        if (typeof refIndex === 'undefined') {
          throw new Error("undefined property type: " + property.CType);
        }
        property.CType = refIndex;
        property.forEachKey(function (key, val) {
          var ref = refIndex.getByKey(val);
          if (typeof ref === 'undefined') {
            throw new Error("could not find reference: " + val);
          }
          property.values[key] = ref;
        });
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

        // console.log("joining: " + require('util').inspect(joiner) + " and " + require('util').inspect(joinee) + ' in ' + require('util').inspect(t));
        joinee._join(joiner, t);
        // console.log("joined: " + require('util').inspect(t));
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
    })
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
  console.log(require('util').inspect(this.toJSON(), {depth: null}));
};