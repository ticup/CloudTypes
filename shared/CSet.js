/**
 * Created by ticup on 08/11/13.
 */
var CloudType  = require('./CloudType');

function CSetDeclaration(elementType) { 
  function CSet(entry) {
    this.type = CSet;
    this.entry = entry;
  }

  // CSet.entity should be set by the state to the entity that is made for this CSet.
  CSet.elementType = elementType;


  CSet.newFor = function (entry) {
    return new CSet(entry);
  };

  // Puts the declared (parametrized) CSet into json
  CSet.toJSON = function () {
    if (typeof elementType === 'string') {
      type = elementType;
    } else {
      type = elementType.name;
    }
    return { tag: CSetDeclaration.tag, elementType: type };
  };

  // Retrieves an instance of a declared (parametrized) CSet from json
  CSet.fromJSON = function (json, entry) {
    return new CSet(entry);
  };

  CSet.fork = function () {
    return new CSetDeclaration(this.elementType);
  };

  CSet.declareProxyTable = function (state, index, property, grant) {
    var Table = require('./Table');
    if (!(index instanceof Table)) {
      throw new Error("Can only create CSet for a Table");
    }
    this.entity = state.declare(index.name + property.name, new Table([{entry: index}, {element: this.elementType}]), grant);
  };

  CSet.tag = "CSet";
  CSet.prototype = CSetPrototype;
  return CSet;
}

CSetDeclaration.declare = function (elementType) {
  new CSsetDeclaration(elementType);
};

// called by CloudType to initialize the parametrized CSet for a property
CSetDeclaration.fromJSON = function (json) {
  return new CSetDeclaration(json.elementType);
};

// register this declaration as usable (will also allow to create CSet with CloudType.fromJSON())
CSetDeclaration.tag = "CSet";
CloudType.register(CSetDeclaration);



var CSetPrototype = Object.create(CloudType.prototype);

// Operations for the parametrized CSets



// don't need to save anything for a particular CSet instance of a property:
// The info of the particular set is saved in a dedicated CSetEntity
CSetPrototype.toJSON = function () {
  return {  };
};

// semantic operations (all delegated to the dedicated table)
CSetPrototype.add = function (element) {
  var entry = this.type.entity.create([this.entry, element]);
  return this;
};

CSetPrototype.contains = function (element) {
  var entry = this.entry;
  var elementType = this.type.elementType;
  return (this.type.entity
      .where(function (el) {
        return isEntryForElement(el, entry, elementType, element);
      }).all().length !== 0);
};

CSetPrototype.remove = function (element) {
  var entry = this.entry;
  var elementType = this.type.elementType;
  this.type.entity
      .where(function (el) {
        return isEntryForElement(el, entry, elementType, element);
      }).all().forEach(function (el) {
        el.delete();
      });
};

CSetPrototype.get = function () {
  return this.type.entity.all();
};

function isEntryForElement(el, entry, elementType, element) {
  return (el.key('entry').equals(entry) &&
         ((elementType === 'int' || elementType === 'string') ?
          (el.key('element') === element) :
          (el.key('element').equals(element))));
}

// Defining _join(cint, target) provides the join and joinIn methods
// by the CloudType prototype.
CSetPrototype._join = function (cset, target) {
  // do nothing (everything happens 'automatically' through the tableProxy
};

CSetPrototype.fork = function () {
  // do nothing (everything happens 'automatically' through the tableProxy
  return this;
};

CSetPrototype.applyFork = function () {
  // do nothing (everything happens 'automatically' through the tableProxy
  return this;
};

CSetPrototype.replaceBy = function (cset) {
  // do nothing (everything happens 'automatically' through the tableProxy
};

CSetPrototype.isDefault = function () {
  return (this.get().length !== 0);
};

CSetPrototype.compare = function (cset, reverse) {
  return ((reverse ? -1 : 1) * (this.get().length - cset.get().length));
};


exports.Declaration = CSetDeclaration;
exports.CSetPrototype = CSetPrototype;