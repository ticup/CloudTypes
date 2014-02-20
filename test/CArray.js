var State       = require('./extensions/State');
var CArray      = require('../shared/CArray');
var CEntity     = require('../shared/CEntity');
var CArrayEntry = require('../shared/CArrayEntry');
var Indexes     = require('../shared/Indexes');
var Properties  = require('../shared/Properties');
var Property    = require('../shared/Property');
var CloudType   = require('../shared/CloudType');
var CInt        = require('./extensions/CInt');
var CString     = require('./extensions/CString');
var should      = require('should');
var stubs       = require('./stubs');
var util        = require('util');


function createCArray() {
  var keyNames = [{name: "string"}];
  var properties = {toBuy: "CInt", shop: "CString"};
  var array = CArray.declare(keyNames, properties);
  return array;
}

describe('CArray', function () {
  var array, intArray;

  beforeEach(function () {
    array = createCArray();
    intArray = CArray.declare([{slot: "int"}], {toBuy: "CInt"});

  });

  // Private
  describe('#new(keys, properties)', function () {
    var keys = [{name: "string"}];
    var properties = {toBuy: "CInt"};
    var array = new CArray(keys, properties);
    it('should create a new CArray object', function () {
      array.should.be.an.instanceOf(CArray);
    });
    it('should have properties property', function () {
      array.should.have.property('properties');
      array.properties.should.equal(properties);
    });
    it('should have keys property', function () {
      array.should.have.property('keys');
      array.keys.should.be.an.instanceof(Indexes);
    });
  });

  // Private
  describe('#new(keys, properties)', function () {
    var keys = new Indexes();
    var properties = {toBuy: "CInt"};
    var array = new CArray(keys, properties);
    it('should create a new CArray object', function () {
      array.should.be.an.instanceOf(CArray);
    });
    it('should have properties property', function () {
      array.should.have.property('properties');
      array.properties.should.equal(properties);
    });
    it('should have keys property', function () {
      array.should.have.property('keys');
      array.keys.should.be.an.instanceof(Indexes);
      array.keys.should.equal(keys);
    });
  });

  describe('#fromJSON(json)', function () {
    var cArrays = stubs.arrays.map(function (json) {
      return CArray.fromJSON(json);
    });
    it('should create a CArray', function () {
      var json = array.toJSON();
      var array2 = CArray.fromJSON(stubs.groceryUnchanged);
      should.exist(array2);
      array2.should.be.an.instanceof(CArray);
      array2.getProperty('toBuy').should.be.an.instanceof(Property);
    });
    it('should create a CArray for all stubs', function () {
      stubs.arrays.map(function (json) {
        return [json, CArray.fromJSON(json)];
      }).forEach(function (result) {
        var json = result[0];
        var cArray = result[1];
        should.exist(cArray);
        cArray.should.be.an.instanceof(CArray);
        json.properties.forEach(function (jsonProperty) {
          should.exist(cArray.getProperty(jsonProperty.name));
        });
      });
    });
  });

  describe('.toJSON()', function () {
    it('should create a JSON representation', function () {
      var json = array.toJSON();
      should.exist(json);
      should.exist(json.keys);
      should.exist(json.properties);
      json.keys.should.eql(array.keys.toJSON());
      json.properties.should.eql(array.properties.toJSON())
    });
    it('should be complementary with fromJSON for all stubs', function () {
      stubs.arrays.map(function (json) {
        json.should.eql(CArray.fromJSON(json).toJSON());
      });
    });
  });

  // Public
  describe('#declare(keyNames, properties)', function () {
    var keyNames = [{name: "string"}];
    var properties = {toBuy: "CInt"};
    var array = CArray.declare(keyNames, properties);
    it('should create a new CArray object', function () {
      array.should.be.an.instanceOf(CArray);
    });
    it('should have keys property', function () {
      array.should.have.property('keys');
      array.keys.should.be.an.instanceof(Indexes);
    });
    it('should have initialized properties property', function () {
      array.should.have.property('properties');
      array.properties.should.be.instanceof(Properties);
      should.exist(array.properties.get('toBuy'));
      array.properties.get('toBuy').should.be.instanceof(Property);
    });
  });

  describe('.forEachProperty(callback)', function () {
    it('should call the callback for each property', function () {
      var ctr = 0;
      array.forEachProperty(function (property) {
        property.should.be.an.instanceof(Property);
        if (property.name === "toBuy")
          property.CType.should.equal(CInt);

        if (property.name === "shop")
          property.CType.should.equal(CString);
       ctr++;
      });
      ctr.should.equal(2);
    });
  });

  describe('.getProperty(propertyName)', function () {
    it('sould return the property with that name', function () {
      var property = array.getProperty('toBuy');
      should.exist(property);
      property.should.be.an.instanceof(Property);
      property.name.should.equal('toBuy');
    });
  });

  describe('.getProperty(property)', function () {
    it('sould return the property with the same name', function () {
      var property = array.getProperty('toBuy');
      var property2 = array.getProperty(property);
      should.exist(property2);
      property2.should.be.an.instanceof(Property);
      property2.name.should.equal('toBuy');
    });
  });


  describe('.get(keys)', function () {
    it('should return a CArrayEntry', function () {
      var entry = array.get('foo');
      should.exist(entry);
      entry.should.be.an.instanceof(CArrayEntry);
    });

    it('should return a CArrayEntry', function () {
      var entry = array.get('foo');
      should.exist(entry);
    });

    describe('.key(name)', function () {
      it('should return the value for given key', function () {
        var entry = array.get('foo');
        should.exist(entry.key('name'));
      });

      it('should be a string if key is of type string', function () {
        var entry = array.get('bar');
        should.exist(entry.key('name'));
        (typeof entry.key('name')).should.equal('string');
      });

      it('should be a number if key is of type int', function () {
        var entry = intArray.get(1);
        should.exist(entry.key('slot'));
        (typeof entry.key('slot')).should.equal('number');
      });

      it('should be a CArray if key is of declared Array type', function () {
        var state = new State();
        var array1 = state.declare('array1', CArray.declare([{name: 'string'}], {prop: 'CString'}));
        var array2 = state.declare('array2', CArray.declare([{ref: 'array1'}], {prop: 'CString'}));
        var entry1 = array1.get('foo');
        var entry2 = array2.get(entry1);
        should.exist(entry2);
        should.exist(entry2.key('ref'));
        entry2.key('ref').should.be.an.instanceof(CArrayEntry);
        should(entry2.key('ref').equals(entry1));
      });

      it('should be a CEntity if key is of declared Entity type', function () {
        var state = new State();
        var entity = state.declare('entity', CEntity.declare([{name: 'string'}], {prop: 'CString'}));
        var array  = state.declare('array', CArray.declare([{ref: 'entity'}], {prop: 'CString'}));
        var entry1 = entity.create('foo');
        var entry2 = array.get(entry1);
        should.exist(entry2);
        should.exist(entry2.key('ref'));
        entry2.key('ref').should.be.an.instanceof(CArrayEntry);
      });

    });


  });






});