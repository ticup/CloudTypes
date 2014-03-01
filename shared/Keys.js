/* Keys */
/********/
/* The names and types of the keys of an Index */

module.exports = Keys;

function Keys(keys, state) {
  var self = this;
  this.names  = [];
  this.types  = [];
  if (typeof keys !== 'undefined') {
    keys.forEach(function (key) {
      var name = Object.keys(key)[0];
      var type = key[name];
      self.names.push(name);
      self.types.push(type);
    });
  }
}

// Calls callback with (name, type, index) for each key
Keys.prototype.forEach = function (callback) {
  for (var i = 0; i<this.names.length; i++) {
    callback(this.names[i], this.types[i], i);
  }
};

// Returns the number of keys
Keys.prototype.length = function () {
  return this.names.length;
};

// Returns the type at given position
Keys.prototype.getType = function (position) {
  return this.types[position];
};

// Returns the name at given position
Keys.prototype.getName = function (position) {
  return this.names[position];
};

// Returns the type of given key name.
Keys.prototype.getTypeOf = function (name) {
  var position = this.getPositionOf(name);
  return this.types[position];
};

// Returns the position of the key with given name
Keys.prototype.getPositionOf = function (name) {
  return this.names.indexOf(name);
};


Keys.prototype.toJSON = function () {
  var types = this.types.map(function (type) {
    // 'int' or 'string'
    if (typeof type === 'string')
      return type;
    // a Table reference, store the name
    return type.name;
  });
  return {
    names: this.names,
    types: types
  };
};


// The state replaces Table references by the real Table reference in a second scan
Keys.fromJSON = function (json) {
  var keys = new Keys();
  keys.names = json.names;
  keys.types = json.types;
  return keys;
};

// Forking keys: names can be shared, because they are immutable.
Keys.prototype.fork = function () {
  var keys = new Keys();
  keys.names = this.names;
  keys.types = this.types;
  return keys;
};


// Takes an array of keys (of type int, string or IndexEntry) and returns a flattened string, representing the array.
Keys.createIndex = function createIndex(keys) {
  if (! (keys instanceof Array))
    throw Error("createIndex: expects an array of keys, given: " + keys);

  if (keys.length === 0)
      return 'singleton';

  return "[" + [].map.call(keys, function (val) { return val.toString(); }).join(".") + "]";
};

function unParseIndex(string) {
  var count = 0;
  var current = "";
  var parts = [];
  string.split("").forEach(function (letter) {
    if (letter === '.' && count === 1) {
      parts.push(current);
      current = "";
      return;
    }

    if (letter === '[') {
      if (++count === 1) {
        return;
      }
    }

    if (letter === ']') {
      if (count-- === 1) {
        parts.push(current);
        return;
      }
    }

    current += letter;
  });
  return parts;
}

// Takes a flattened key and an Index and returns an array of types accordingly (complement of Keys.createIndex())
Keys.getKeys = function getKeys(key, index) {
  var Table = require('./Table');
  // Flattened string given: unflatten
  if (! (key instanceof Array)) {
    key = unParseIndex(key);
  }

  for (var i = 0; i<key.length; i++) {
    var type = index.keys.getType(i);
    if (type === 'string') {
      continue;
    }
    if (type === 'int') {
      key[i] = parseInt(key[i], 10);
      continue;
    }

    // If entry is given, just store key!
    if (typeof key[i] !== 'string' && typeof key[i] !== 'number') {
      key[i] = key[i].serialKey();
    }

  }
  return key;
};

