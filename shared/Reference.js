/**
 * Created by ticup on 10/03/14.
 */
var CloudType = require('./CloudType');


function ReferenceDeclaration(table) { 
  function Reference(uid, isSet, entry) {
    this.uid = uid;
    this.isSet = isSet || false;
    this.type = Reference;
    this.entry = entry;
  }


  Reference.resolveTable = function (state) {
    table = state.get(table);
    Reference.prototype.table = table;
  };

  // Reference.table = function () {
  //   return table;
  // };

  Reference.isTypeOf = function (entry) {
    return entry.index == Reference.prototype.table;
  };

  Reference.newFor = function (entry, property) {
    var ref = new Reference(null);
    ref.entry = entry;
    ref.property = property;
    return ref;
  };

  Reference.getByKey = function (key) {
    return Reference.prototype.table.getByKey(key);
  };

  Reference.fork = function () {
    return new ReferenceDeclaration(Reference.prototype.table.name);
  };

  Reference.toJSON = function () {
    return { tag: ReferenceDeclaration.tag, table: Reference.prototype.table.name };
  };

  // Retrieves an instance of a declared type CInt from json
  // Not the complement of CInt.toJSON, but complement of CInt.prototype._toJSON!!
  Reference.fromJSON = function (json, entry, property) {
    var ref = new Reference(json.uid, json.isSet);
    ref.entry = entry;
    ref.property = property;
    return ref;
  };

  Reference.isReference = function () {
    return true;
  };

  Reference.toString = function () {
    return "Reference<" + Reference.prototype.table.name + ">";
  };

  Reference.tag = "Reference";
  Reference.prototype = Object.create(ReferencePrototype);

  Reference.prototype.fork = function () {
    var ref = new Reference(this.uid, false);
    this.applyFork();
    return ref;
  };

  Reference.prototype.get = function () {
    if (Array.prototype.slice.call(arguments).length > 0) {
      throw new Error("cannot call get on reference with arguments");
    }
    return this.table.getByKey(this.uid);
  };

  Reference.prototype.table = table;

  return Reference;
}

ReferenceDeclaration.declare = function (table) {
  return new ReferenceDeclaration(table);
};

ReferenceDeclaration.fromJSON = function (json) {
  return new ReferenceDeclaration(json.table);
};

// register this declaration as usable (will also allow to create CSet with CloudType.fromJSON())
ReferenceDeclaration.tag = "Reference";
CloudType.register(ReferenceDeclaration);


var ReferencePrototype = Object.create(CloudType.prototype);


// Puts an instance of a declared type CInt to json
ReferencePrototype.toJSON = function () {
  return {
    uid: this.uid,
    isSet: this.isSet
  };
};

// semantic operations
ReferencePrototype.set = function (row) {
  this.uid = row.serialKey()  ;
  this.isSet = true;
};



// Defining _join(cint, target) provides the join and joinIn methods
// by the CloudType prototype.
ReferencePrototype._join = function (ref, target) {
  if (ref.isSet) {
    target.isSet  = true;
    target.uid    = ref.uid;
  } else {
    target.isSet  = this.isSet;
    target.uid    = this.uid;
  }
};

ReferencePrototype.applyFork = function () {
  this.isSet = false;
  return this;
};

ReferencePrototype.replaceBy = function (ref) {
  this.uid    = ref.uid;
  this.isSet  = ref.isSet;
};

ReferencePrototype.equals = function (row) {
  var val = this.get();
  if (val === null && row === null) {
    return true;
  }
  if (val === null || row === null) {
    return false;
  }
  if (row.prototype == ReferencePrototype) {
    return this.uid === row.uid;
  }
  return val.equals(row);
};

ReferencePrototype.isDefault = function () {
  return (this.get() === null);
};

ReferencePrototype.isChanged = function (ref) {
  return ref.isSet;
};

ReferencePrototype.toString = function () {
  return "Reference<" + this.uid + ">";
};

exports.isReferenceDeclaration = function (type) {
  return (typeof type.isReference === 'function' && type.isReference());
};

exports.Declaration = ReferenceDeclaration;
exports.Prototype = ReferencePrototype;