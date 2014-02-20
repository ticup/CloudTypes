var State       = require('./extensions/State');
var Table     = require('../shared/Table');
var Keys     = require('../shared/Keys');
var Properties  = require('../shared/Properties');
var Property    = require('../shared/Property');
var CloudType   = require('../shared/CloudType');
var CInt        = require('./extensions/CInt');
var CString     = require('./extensions/CString');
var should      = require('should');
var stubs       = require('./stubs');
var util        = require('util');
var TableEntry = require('../shared/TableEntry');

describe('Table state independent operations', function () {
  var entity;

  beforeEach(function () {
    var keyNames = [{name: "string"}];
    var properties = {address: "CString"};
    entity = Table.declare(keyNames, properties);
  });

  // Private
  describe('#new(keyDeclarations, propertyDeclarations)', function () {
    var keyNames = [{name: "foo", type: "string"}];
    var properties = {address: "CString"};
    var entity = new Table(keyNames, properties);
    it('should create a new Table object', function () {
      entity.should.be.an.instanceOf(Table);
    });
    it('should have properties property', function () {
      entity.should.have.property('properties');
      entity.properties.should.equal(properties);
    });
    it('should have keys property', function () {
      entity.should.have.property('keys');
      entity.keys.should.be.an.instanceof(Keys);
    });
  });

  // Private
  describe('#new(keys, PropertyDeclarations)', function () {
    var keys = new Keys();
    var properties = {toBuy: "CInt"};
    var entity = new Table(keys, properties);
    it('should create a new Table object', function () {
      entity.should.be.an.instanceOf(Table);
    });
    it('should have properties property', function () {
      entity.should.have.property('properties');
      entity.properties.should.equal(properties);
    });
    it('should have keys property', function () {
      entity.should.have.property('keys');
      entity.keys.should.be.an.instanceof(Keys);
      entity.keys.should.equal(keys);
    });
  });

  describe('#fromJSON(json)', function () {
    it('should create a Table', function () {
      var json = entity.toJSON();
      var entity2 = Table.fromJSON(stubs.customerUnchanged);
      should.exist(entity2);
      entity2.should.be.an.instanceof(Table);
      entity2.getProperty('name').should.be.an.instanceof(Property);
    });

    it('should create a Table for all stubs', function () {
      stubs.entities.map(function (json) {
        return [json, Table.fromJSON(json)];
      }).forEach(function (result) {
        var json = result[0];
        var cEntity = result[1];
        should.exist(cEntity);
        cEntity.should.be.an.instanceof(Table);
        json.properties.forEach(function (jsonProperty) {
          should.exist(cEntity.getProperty(jsonProperty.name));
       });
     });
    });
  });

  describe('.toJSON()', function () {
    it('should create a JSON representation', function () {
      var json = entity.toJSON();
      should.exist(json);
      should.exist(json.keys);
      should.exist(json.properties);
      json.keys.should.eql(entity.keys.toJSON());
      json.properties.should.eql(entity.properties.toJSON())
    });
    it('should be complementary with fromJSON for all stubs', function () {
      stubs.entities.map(function (json) {
        json.should.eql(Table.fromJSON(json).toJSON());
      });
    });
  });

  // Public
  describe('#declare(keyNames, properties)', function () {
    var keyNames = [{name: "string"}];
    var properties = {address: "CString"};
    var entity2 = Table.declare(keyNames, properties);
    it('should create a new Table object', function () {
      entity2.should.be.an.instanceOf(Table);
    });
    it('should have keys property', function () {
      entity2.should.have.property('keys');
      entity2.keys.should.be.an.instanceof(Keys);
    });
    it('should have initialized properties property', function () {
      entity2.should.have.property('properties');
      entity2.properties.should.be.instanceof(Properties);
      should.exist(entity2.properties.get('address'));
      entity2.properties.get('address').should.be.instanceof(Property);
    });
  });

  describe('.get(key)', function () {
    it('should return a TableEntry for that key and cEntity', function () {
      var entry = entity.get('foo');
      should.exist(entry);
      entry.should.be.an.instanceof(TableEntry);
      entry.should.have.property('cArray');
      entry.should.have.property('keys');
      entry.cArray.should.equal(entity);
    });
  });

  describe('.all()', function () {
    it('should return an array with all non-deleted entries', function () {
      var entity1 = Table.fromJSON(stubs.customerUnchanged);
      var entity2 = Table.fromJSON(stubs.customerChanged);
      entity1.all().length.should.equal(1);
      entity2.all().length.should.equal(4);
    });
  });

  describe('.forEachState(callback)', function () {
    it('should call callback for every entry in states', function () {
      var ctr = 0;
      entity.forEachState(function (idx) {
        ctr++
      });
      ctr.should.equal(0);
      var entity2 = Table.fromJSON(stubs.customerChanged);
      entity2.forEachState(function (idx) {
        ctr++
      });
      ctr.should.equal(5);
    });
  });

  describe('.forEachProperty(callback)', function () {
    it('should call the callback for each property', function () {
      var ctr = 0;
      entity.forEachProperty(function (property) {
        property.should.be.an.instanceof(Property);
        property.name.should.equal("address");
        property.CType.should.equal(CString);
        ctr++;
      });
      ctr.should.equal(1);
    });
  });

  describe('.getProperty', function () {
    describe('.getProperty(propertyName)', function () {
      it('sould return the property with that name', function () {
        var property = entity.getProperty('address');
        should.exist(property);
        property.should.be.an.instanceof(Property);
        property.name.should.equal('address');
      });
    });

    describe('.getProperty(property)', function () {
      it('sould return the property with the same name', function () {
        var property = entity.getProperty('address');
        var property2 = entity.getProperty(property);
        should.exist(property2);
        property2.should.be.an.instanceof(Property);
        property2.name.should.equal(property.name);
      });
    });
  });


  describe('.setMax(entity1, entity2, key)', function () {
    it('should set the max value of entity1 and entity2 for state of key (max: undefined < OK < DELETED)', function () {
      var entity1 = Table.fromJSON(stubs.customerUnchanged);
      var entity2 = Table.fromJSON(stubs.customerChanged);

      // undefined < OK
      should.not.exist(entity1.states['[Customer:0#1]']);
      entity2.states['[Customer:0#1]'].should.equal("ok");
      entity1.setMax(entity1, entity2, '[Customer:0#1]');
      entity1.states['[Customer:0#1]'].should.equal("ok");

      // OK < DELETED
      entity1.states['[Customer:0#0]'].should.equal("ok");
      entity2.states['[Customer:0#0]'].should.equal("deleted");
      entity1.setMax(entity1, entity2, '[Customer:0#0]');
      entity1.states['[Customer:0#0]'].should.equal("deleted");

      // undefined < DELETED
      entity2.states['[Customer:0#7]'] = "deleted";
      should.not.exist(entity1.states['[Customer:0#7]']);
      entity1.setMax(entity1, entity2, '[Customer:0#7]');
      entity1.states['[Customer:0#7]'].should.equal("deleted");

    });
  });






});

describe('Table state dependent operations: ', function () {
  describe('Table initialized in state', function () {
    it('should have a property state', function () {
      var state  = State.fromJSON(stubs.stateChanged);
      var Order = state.get('Order');
      should.exist(state);
      should.exist(Order);
      Order.should.have.property('state');
      Order.state.should.equal(state);
    })
  });

  describe('.where(callback)', function () {
    var state  = State.fromJSON(stubs.stateChanged);
    var Order = state.get('Order');
    var where = Order.where(function (entry) { return true; });

    it('should return an object with methods where and all', function () {
      should.exist(where);
      where.should.have.property('where');
      where.should.have.property('all');
      where.where.should.be.a.Function;
      where.all.should.be.a.Function;
    });

    describe('.all()', function () {
      it('should return all entities that cohere to the previously added filter', function () {
        var all = where.all();
        should.exist(all);
        all.length.should.equal(3);
      });
      it('should return entries initialized with proper keys', function () {
        var order = where.all()[0];
        console.log(order);
        should.exist(order.key('customer'));
      });
    });

//    describe('.where(callback)', function () {
//      it('should be chaining all the filters', function () {
//        var all = Customer.where(function (entry) {
//          entry.get('quantity').where(function (entry) { return entry.get('name').get() === 'foo'; }).all();
//        }
//        should.exist(all);
//        all.length.should.equal(1)
//      });
//    });
  });


});