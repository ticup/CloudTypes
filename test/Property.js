var should    = require('should');
var util      = require('util');
var State     = require('./extensions/State');
var Index    = require('../shared/Index');
var CloudType = require('../shared/CloudType');
var CInt      = require('./extensions/CInt');
var Property  = require('../shared/Property');
var Keys   = require('../shared/Keys');
var stubs     = require('./stubs');

describe('Property state independent operations', function () {
  var keys, property, index1, index2, index, state, name;
  var CType =  CInt;

  beforeEach(function () {
    state = new State();

    index1 = new Index([{string: 'string'}], {name: 'CInt'});
    index2 = new Index([{string: 'string'}, {int: 'int'}], { name: 'CInt'});
    state.declare("Customer1", index1);
    state.declare("Customer2", index2);
    name1 = state.get("Customer1").getProperty('name');
    name2 = state.get("Customer2").getProperty('name');
  });

  describe('#new(name, CType, index)', function () {
    index   = new Index([], {});
    property = new Property("propName", CType, index);

    it('should create a new Property object', function () {
      should.exist(property);
      property.should.be.an.instanceOf(Property);
    });
    it('should have a name property', function () {
      property.should.have.property('name');
      property.name.should.equal("propName");
    });
    it('should have an keys property', function () {
      property.should.have.property('keys');
      property.keys.should.equal(index.keys);
    });
    it('should have a CType property', function () {
      property.should.have.property('CType');
      property.CType.should.equal(CType);

    });
    it('should have a values property', function () {
      property.should.have.property('values');
    });
  });


  describe('.forEachKey(callback)', function () {
    it('should not be called if no keys are accessed', function () {
      var ctr = 0;
      name1.forEachKey(function (key) {
        ctr++;
      });
      ctr.should.equal(0);
    });

    it('should be called for every key that has been accessed', function () {
      var idxs = [];
      name1.getByKey('[foo]');
      name1.getByKey('[bar]');
      name1.getByKey('[foobar]');
      name1.getByKey('[foo]');
      name1.forEachKey(function (key) {
        idxs.push(key);
      });
      idxs.length.should.equal(3);
      idxs.should.include('[foo]');
      idxs.should.include('[bar]');
      idxs.should.include('[foobar]');
    });
  });

  describe('.toJSON()', function () {
    it('should return a json representation', function () {
      var json = name1.toJSON();
      should.exist(json);
      json.should.have.property('name');
      json.should.have.property('type');
      json.should.have.property('values');
      json.name.should.equal('name');
      json.type.should.eql(CType.toJSON());
      json.values.should.be.an.instanceof(Object);
    });

    it('should include all accessed values', function () {
      var json = name1.toJSON();
      Object.keys(json.values).length.should.equal(0);
      name1.getByKey('[foo]');
      name1.getByKey('[bar]');
      json = name1.toJSON();
      Object.keys(json.values).length.should.equal(2);
      name1.forEachKey(function (key) {
        json.values[key].should.eql(name1.getByKey(key).toJSON());
      });
    });
  });

  describe('#fromJSON(json, index)', function () {
    it('should create a Property object', function () {
      var json = name1.toJSON();
      var convert = Property.fromJSON(json, index);
      should.exist(convert);
      convert.should.be.an.instanceof(Property);
    });

    it('should have all accessed properties of the original object', function () {
//      name1.get(['foo']);
//      name1.get(['bar']);
//      var json = property.toJSON();
//      console.log('json:');
//      console.log(json);
//
//      var convert = Property.fromJSON(json, index);
//      convert.keys = property.keys;
//      should.exist(convert);
//      console.log(convert);
//      convert.should.be.an.instanceof(Property);
//      name1.forEachKey(function (key) {
//        convert.get([key]).should.eql(name.get([key]));
//      });
    });

  });

});

describe('Property state dependent operations', function () {
  var state1 = State.fromJSON(stubs.stateUnchanged);
  var state2 = State.fromJSON(stubs.stateChanged);

  describe('.entries()', function () {
    var orderQuantity1 = state1.get('Order').getProperty('quantity').entries();
    var orderQuantity2 = state2.get('Order').getProperty('quantity').entries();
    var orderProduct1 = state1.get('Order').getProperty('product').entries();
    var orderProduct2 = state2.get('Order').getProperty('product').entries();

    var customerName1 = state1.get('Customer').getProperty('name').entries();
    var customerName2 = state2.get('Customer').getProperty('name').entries();
    it('should should return all entries that are not deleted or default', function () {
      should.exist(orderQuantity1);
      should.exist(orderQuantity2);
      should.exist(orderProduct1);
      should.exist(orderProduct2);
      should.exist(customerName2);
      should.exist(customerName2);

      /* Unchanged State */
      // 1 order: - Customer:0#0.quantity (not default) => 1
      orderQuantity1.length.should.equal(1);
      // 1 order: + Customer:0#0.product (default) => 0
      orderProduct1.length.should.equal(0);

      // 1 customer: - Customer:0#0.name (default) => 0
      customerName1.length.should.equal(0);

      /* Changed State */
      // 7 orders:
      // - Order:0#2.Customer:0#1 (deleted)
      // - Order:0#4.Customer:0#1 (deleted)
      // - Order:0#0.Customer:0#0 (Customer:0#0 deleted)
      // - Order:0#1.Customer:0#0 (Customer:0#0 deleted)
      // => 1
      orderQuantity2.length.should.equal(3);

      // 7 orders:
      // - Order:0#2.Customer:0#1 (deleted)
      // - Order:0#4.Customer:0#1 (deleted)
      // - Order:0#0.Customer:0#0 (Customer:0#0 deleted)
      // - Order:0#1.Customer:0#0 (Customer:0#0 deleted)
      // - Order:0#3.Customer:0#1.product (default)
      orderProduct2.length.should.equal(2);

      // 5 customers:
      // - Customer:0#0 (deleted)
      // - Customer:0#1.name (default)
      // - Customer:0#4.name (default)
      // => 2
      customerName2.length.should.equal(2)

    });
  });
});