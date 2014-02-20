var State       = require('./extensions/State');
var Index      = require('../shared/Index');
var Table     = require('../shared/Table');
var IndexEntry = require('../shared/IndexEntry');
var Keys     = require('../shared/Keys');
var Properties  = require('../shared/Properties');
var Property    = require('../shared/Property');
var CloudType   = require('../shared/CloudType');
var CInt        = require('./extensions/CInt');
var CString     = require('./extensions/CString');
var should      = require('should');
var stubs       = require('./stubs');
var util        = require('util');


function createIndex() {
  var keyNames = [{name: "string"}];
  var properties = {toBuy: "CInt", shop: "CString"};
  var array = Index.declare(keyNames, properties);
  return array;
}

describe('Index', function () {
  var array, intArray;

  beforeEach(function () {
    array = createIndex();
    intArray = Index.declare([{slot: "int"}], {toBuy: "CInt"});

  });

  // Private
  describe('#new(keys, properties)', function () {
    var keys = [{name: "string"}];
    var properties = {toBuy: "CInt"};
    var array = new Index(keys, properties);
    it('should create a new Index object', function () {
      array.should.be.an.instanceOf(Index);
    });
    it('should have properties property', function () {
      array.should.have.property('properties');
      array.properties.should.equal(properties);
    });
    it('should have keys property', function () {
      array.should.have.property('keys');
      array.keys.should.be.an.instanceof(Keys);
    });
  });

  // Private
  describe('#new(keys, properties)', function () {
    var keys = new Keys();
    var properties = {toBuy: "CInt"};
    var array = new Index(keys, properties);
    it('should create a new Index object', function () {
      array.should.be.an.instanceOf(Index);
    });
    it('should have properties property', function () {
      array.should.have.property('properties');
      array.properties.should.equal(properties);
    });
    it('should have keys property', function () {
      array.should.have.property('keys');
      array.keys.should.be.an.instanceof(Keys);
      array.keys.should.equal(keys);
    });
  });

  describe('#fromJSON(json)', function () {
    var indexs = stubs.arrays.map(function (json) {
      return Index.fromJSON(json);
    });
    it('should create a Index', function () {
      var json = array.toJSON();
      var array2 = Index.fromJSON(stubs.groceryUnchanged);
      should.exist(array2);
      array2.should.be.an.instanceof(Index);
      array2.getProperty('toBuy').should.be.an.instanceof(Property);
    });
    it('should create a Index for all stubs', function () {
      stubs.arrays.map(function (json) {
        return [json, Index.fromJSON(json)];
      }).forEach(function (result) {
        var json = result[0];
        var index = result[1];
        should.exist(index);
        index.should.be.an.instanceof(Index);
        json.properties.forEach(function (jsonProperty) {
          should.exist(index.getProperty(jsonProperty.name));
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
        json.should.eql(Index.fromJSON(json).toJSON());
      });
    });
  });

  // Public
  describe('#declare(keyNames, properties)', function () {
    var keyNames = [{name: "string"}];
    var properties = {toBuy: "CInt"};
    var array = Index.declare(keyNames, properties);
    it('should create a new Index object', function () {
      array.should.be.an.instanceOf(Index);
    });
    it('should have keys property', function () {
      array.should.have.property('keys');
      array.keys.should.be.an.instanceof(Keys);
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
    it('should return a IndexEntry', function () {
      var entry = array.get('foo');
      should.exist(entry);
      entry.should.be.an.instanceof(IndexEntry);
    });

    it('should return a IndexEntry', function () {
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

      it('should be a Index if key is of declared Array type', function () {
        var state = new State();
        var array1 = state.declare('array1', Index.declare([{name: 'string'}], {prop: 'CString'}));
        var array2 = state.declare('array2', Index.declare([{ref: 'array1'}], {prop: 'CString'}));
        var entry1 = array1.get('foo');
        var entry2 = array2.get(entry1);
        should.exist(entry2);
        should.exist(entry2.key('ref'));
        entry2.key('ref').should.be.an.instanceof(IndexEntry);
        should(entry2.key('ref').equals(entry1));
      });

      it('should be a Table if key is of declared Entity type', function () {
        var state = new State();
        var entity = state.declare('entity', Table.declare({prop: 'CString'}));
        var array  = state.declare('array', Index.declare([{ref: 'entity'}], {prop: 'CString'}));
        var entry1 = entity.create('foo');
        var entry2 = array.get(entry1);
        should.exist(entry2);
        should.exist(entry2.key('ref'));
        entry2.key('ref').should.be.an.instanceof(IndexEntry);
      });

    });


  });






});