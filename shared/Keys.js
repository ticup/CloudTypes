/* Keys */
/********/

// The names and types of the keys of an Index
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

Keys.prototype.forEach = function (callback) {
  for (var i = 0; i<this.names.length; i++) {
    callback(this.names[i], this.types[i], i);
  }
};

Keys.prototype.length = function () {
  return this.names.length;
};

Keys.prototype.getType = function (position) {
  return this.types[position];
};

Keys.prototype.getName = function (position) {
  return this.names[position];
};

Keys.prototype.getTypeOf = function (name) {
  var position = this.getPositionOf(name);
  // console.log(name + ' in ' + this.names + "? -> " + position);
  return this.types[position];
};

Keys.prototype.getPositionOf = function (name) {
  return this.names.indexOf(name);
};

Keys.prototype.get = function (keys) {
  var key = Keys.createIndex(keys);
  return key;
};

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

Keys.prototype.toJSON = function () {
  return {
    names: this.names,
    types: this.types
  };
};

Keys.fromJSON = function (json) {
  var keys = new Keys();
  keys.names = json.names;
  keys.types = json.types;
  return keys;
};

// names can be shared, because they are immutable.
Keys.prototype.fork = function () {
  var keys = new Keys();
  keys.names = this.names;
  keys.types = this.types;
  return keys;
};

module.exports = Keys;