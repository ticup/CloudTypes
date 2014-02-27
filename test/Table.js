var State       = require('./extensions/State');
var Table       = require('../shared/Table');
var Keys        = require('../shared/Keys');
var Properties  = require('../shared/Properties');
var Property    = require('../shared/Property');
var CloudType   = require('../shared/CloudType');
var CInt        = require('./extensions/CInt');
var CString     = require('./extensions/CString');
var should      = require('should');
var stubs       = require('./stubs');
var util        = require('util');
var TableEntry  = require('../shared/TableEntry');

describe('Table state independent operations |', function () {
  var table, table2;

  beforeEach(function () {
    var keys = [{name: 'string'}, {surname: 'string'}];
    var columns = {address: CString, nr: CInt};
    table = new Table(keys, columns);
  });

  describe('#new(columnDeclarations)', function () {
    it('should create a new Table object', function () {
      table.should.be.an.instanceOf(Table);
    });
    it('should have properties property', function () {
      table.should.have.property('properties');
      table.properties.should.be.an.instanceof(Properties);
    });
    it('should have keys property', function () {
      table.should.have.property('keys');
      table.keys.should.be.an.instanceof(Keys);
    });
  });

  describe('#fromJSON(json)', function () {
    it('should create a Table', function () {
      var json = table.toJSON();
      var table2 = Table.fromJSON(stubs.customerUnchanged);
      should.exist(table2);
      table2.should.be.an.instanceof(Table);
      table2.getProperty('name').should.be.an.instanceof(Property);
    });

    it('should create a Table for all stubs', function () {
      stubs.entities.map(function (json) {
        return [json, Table.fromJSON(json)];
      }).forEach(function (result) {
        var json = result[0];
        var table = result[1];
        should.exist(table);
        table.should.be.an.instanceof(Table);
        json.properties.forEach(function (jsonProperty) {
          should.exist(table.getProperty(jsonProperty.name));
       });
     });
    });
  });

  describe('.all()', function () {
    it('should return an array with all non-deleted entries', function () {
      var table1 = Table.fromJSON(stubs.customerUnchanged);
      var table2 = Table.fromJSON(stubs.customerChanged);
      table1.all().length.should.equal(1);
      table2.all().length.should.equal(4);
    });
  });

  describe('.forEachState(callback)', function () {
    it('should call callback for every entry in states', function () {
      var ctr = 0;
      table.forEachState(function (idx) {
        ctr++
      });
      ctr.should.equal(0);
      var table2 = Table.fromJSON(stubs.customerChanged);
      table2.forEachState(function (idx) {
        ctr++
      });
      ctr.should.equal(5);
    });
  });

  describe('.forEachProperty(callback)', function () {
    it('should call the callback for each property', function () {
      var ctr = 0;
      var props = {};
      table.forEachProperty(function (property) {
        property.should.be.an.instanceof(Property);
        props[property.name] = property;
        ctr++;
      });
      ctr.should.equal(2);
      props["address"].CType.should.equal(CString);
      props["nr"].CType.should.equal(CInt);
    });
  });

  describe('.getProperty', function () {
    describe('.getProperty(propertyName)', function () {
      it('sould return the property with that name', function () {
        var property = table.getProperty('address');
        should.exist(property);
        property.should.be.an.instanceof(Property);
        property.name.should.equal('address');
      });
    });

    describe('.getProperty(property)', function () {
      it('sould return the property with the same name', function () {
        var property = table.getProperty('address');
        var property2 = table.getProperty(property);
        should.exist(property2);
        property2.should.be.an.instanceof(Property);
        property2.name.should.equal(property.name);
      });
    });
  });


  describe('.setMax(table1, table2, key)', function () {
    it('should set the max value of table1 and table2 for state of key (max: undefined < OK < DELETED)', function () {
      var table1 = Table.fromJSON(stubs.customerUnchanged);
      var table2 = Table.fromJSON(stubs.customerChanged);

      // undefined < OK
      should.not.exist(table1.states['Customer:0#1']);
      table2.states['Customer:0#1'].should.equal("ok");
      table1.setMax(table1, table2, 'Customer:0#1');
      table1.states['Customer:0#1'].should.equal("ok");

      // OK < DELETED
      table1.states['Customer:0#0'].should.equal("ok");
      table2.states['Customer:0#0'].should.equal("deleted");
      table1.setMax(table1, table2, 'Customer:0#0');
      table1.states['Customer:0#0'].should.equal("deleted");

      // undefined < DELETED
      table2.states['Customer:0#7'] = "deleted";
      should.not.exist(table1.states['Customer:0#7']);
      table1.setMax(table1, table2, 'Customer:0#7');
      table1.states['Customer:0#7'].should.equal("deleted");

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

      it('should call where callback with all entries', function () {
        var count = 0;
        Order.where(function (entry) {
          entry.should.be.an.instanceof(TableEntry);
          count = count + 1;
        }).all();
        count.should.equal(3);
      });
    });

  });


  describe('deleting an entry', function () {
    var state  = State.fromJSON(stubs.stateChanged);
    var Order = state.get('Order');
    var Customer = state.get('Customer');
    var cust = Customer.all()[1];
    var name = cust.get('name').get();
    Customer.where(function (cust) { return cust.get('name').get() === name; }).all().length.should.equal(1);
    // Order.where(function (order) { 
    //   var c = order.get('customer');
    //   if (c)
    //     return c.equals(cust);
    // }).all().length.should.equal(1);
    cust.delete();

    it('should make it unable to retrieve the table', function () {
      Customer.where(function (cust) { return cust.get('name').get() === name; }).all().length.should.equal(0);
    });

    it('should remove references to it', function () {
      var state = new State();
      var User = state.declare('User', new Table({child:'User'}));
      var u1 = User.create();
      var u2 = User.create();
      u1.set('child', u2);
      u2.delete();
      User.all().length.should.equal(1);
      should.not.exist(u1.get('child'));
    });
  });

});