function Indexes(keys) {
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

Indexes.prototype.forEach = function (callback) {
  for (var i = 0; i<this.names.length; i++) {
    callback(this.names[i], this.types[i]);
  }
};

Indexes.prototype.length = function () {
  return this.names.length;
};

Indexes.prototype.getType = function (position) {
  return this.types[position];
};

Indexes.prototype.getName = function (position) {
  return this.names[position];
};

Indexes.prototype.getTypeOf = function (name) {
  var position = this.getPositionOf(name);
  return this.types[position];
};

Indexes.prototype.getPositionOf = function (name) {
  return this.names.indexOf(name);
};

Indexes.prototype.get = function (keys) {
  var key = Indexes.createIndex(keys);
  return key;
};

Indexes.createIndex = function createIndex(keys) {
  if (! (keys instanceof Array))
    throw Error("createIndex: expects an array of keys, given: " + keys);
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

Indexes.getIndexes = function getIndexes(key, cArray) {
  // Flattened string given: unflatten
  if (! (key instanceof Array)) {
    key = unParseIndex(key);
  }

  for (var i = 0; i<key.length; i++) {
    var type = cArray.keys.getType(i);
    if (type === 'string') {
      continue;
    }
    if (type === 'int') {
      key[i] = parseInt(key[i], 10);
      continue;
    }

    // If entry is given, just store key!
    if (typeof key[i] !== 'string' && typeof key[i] !== 'number')
      key[i] = key[i].serialKey();

  }
  return key;
};

Indexes.prototype.toJSON = function () {
  return {
    names: this.names,
    types: this.types
  };
};

Indexes.fromJSON = function (json) {
  var keys = new Indexes();
  keys.names = json.names;
  keys.types = json.types;
  return keys;
};

// names can be shared, because they are immutable.
Indexes.prototype.fork = function () {
  var keys = new Indexes();
  keys.names = this.names;
  keys.types = this.types;
  return keys;
};

module.exports = Indexes;