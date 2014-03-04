module.exports = CloudType;

function CloudType() {}

CloudType.types = {};

CloudType.register = function (typeDeclaration) {
  CloudType.types[typeDeclaration.tag] = typeDeclaration;
};

CloudType.fromTag = function (tag) {
  return CloudType.types[tag];
};

// Can only be used for non parametrized declarations (CInt/CString/CTime..)
// By using this users can declare such types by their tag instead of by using the real declaration.
CloudType.declareFromTag = function (tag) {
  var type = CloudType.types[tag];
  if (typeof type === 'undefined') {
    return undefined;
  }
  return type.declare();
};

CloudType.isCloudType = function (CType) {
  return ((typeof CType.tag !== 'undefined') &&
          (typeof CloudType.types[CType.tag] !== 'undefined'));
};

CloudType.fromJSON = function (json) {
  return CloudType.fromTag(json.tag).fromJSON(json);
};

CloudType.prototype.join = function (cint) {
  this._join(cint, this);
};

CloudType.prototype.joinIn = function (cint) {
  this._join(cint, cint);
};

CloudType.prototype.equals = function (val) {
  if (CloudType.isCloudType(val))
      return this.get() === val.get();
  return this.get() === val;
};