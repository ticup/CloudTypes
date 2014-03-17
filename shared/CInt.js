/**
 * Created by ticup on 15/11/13.
 */
var CloudType = require('./CloudType');
var util = require('util');

exports.CInt = CInt;
exports.Declaration = CIntDeclaration;


// CIntDeclaration: function that allows the user to declare a property of type CInt
// see CSet as to why this exists (parametrized declarations)
function CIntDeclaration() { }
CIntDeclaration.declare = function () {
  return CInt;
};
CIntDeclaration.fromJSON = function () {
  return CInt;
};


// register this declaration as usable (will also allow to create CInt with CloudType.fromJSON())
CIntDeclaration.tag = "CInt";
CInt.tag = "CInt";
CloudType.register(CIntDeclaration);


// Actual CInt object of which an instance represents a variable of which the property is defined with CIntDeclaration
function CInt(base, offset, isSet) {
  this.base = base || 0;
  this.offset = offset || 0;
  this.isSet = isSet || false;
  // this.entry needs to be set by those that create CInt
  // this.property
}
// put CloudType in prototype chain.
CInt.prototype = Object.create(CloudType.prototype);

CInt.fork = function () {
  return CInt;
};

CInt.toString = function () {
  return "CInt";
};

// Create a new instance of the declared CInt for given entry
CInt.newFor = function (entry, property) {
  var cint = new CInt();
  cint.entry = entry;
  cint.property = property;
  return cint;
};

// Puts the declared type CInt into json representation
CInt.toJSON = function () {
  return { tag: CIntDeclaration.tag };
};


// Retrieves an instance of a declared type CInt from json
// Not the complement of CInt.toJSON, but complement of CInt.prototype._toJSON!!
CInt.fromJSON = function (json, entry, property) {
  var cint = new CInt(json.base, json.offset, json.isSet);
  cint.entry = entry;
  cint.property = property;
  return cint;
};

// Puts an instance of a declared type CInt to json
CInt.prototype.toJSON = function () {
  return {
    base: this.base,
    offset: this.offset,
    isSet: this.isSet
  };
};

// semantic operations
CInt.prototype.set = function (base) {
  if (typeof base !== 'number')
    throw "CInt::set(base) : base should be of type number, given: " + base;
  this.offset = 0;
  this.base = base;
  this.isSet = true;
};
CloudType.updateOperation(CInt, 'set');

CInt.prototype.get = function () {
  return (this.base + this.offset);
};

CInt.prototype.add = function (offset) {
  if (typeof offset !== 'number')
    throw "CInt::add(base) : offset should be of type number, given: " + offset;
  this.offset += offset;
};
CloudType.updateOperation(CInt, 'add');

// Defining _join(cint, target) provides the join and joinIn methods
// by the CloudType prototype.
CInt.prototype._join = function (cint, target) {
  if (cint.isSet) {
    target.isSet  = true;
    target.base   = cint.base;
    target.offset = cint.offset;
  } else {
    target.isSet  = this.isSet;
    target.base   = this.base;
    target.offset = this.offset + cint.offset;
  }
};

CInt.prototype.fork = function () {
  var cint = new CInt(this.base + this.offset, 0, false);
  this.applyFork();
  return cint;
};

CInt.prototype.applyFork = function () {
  this.base = this.base + this.offset;
  this.offset = 0;
  this.isSet = false;
  return this;
};

CInt.prototype.replaceBy = function (cint) {
  this.base   = cint.base;
  this.offset = cint.offset;
  this.isSet  = cint.isSet;
};

CInt.prototype.isDefault = function () {
  return (this.get() === 0);
};

CInt.prototype.isChanged = function (cint) {
  return (cint.isSet || cint.offset !== 0);
};

CInt.prototype.compare = function (cint, reverse) {
  return ((reverse ? -1 : 1) * (this.get() - cint.get()));
};