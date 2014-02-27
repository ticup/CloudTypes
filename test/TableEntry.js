var State       = require('./extensions/State');
var Keys        = require('../shared/Keys');
var Properties  = require('../shared/Properties');
var Property    = require('../shared/Property');
var stubs       = require('./stubs');
var util        = require('util');
var should      = require('should');
var TableEntry  = require('../shared/TableEntry');

var CloudTypes  = require('../server/main');
var CInt        = CloudTypes.CInt;
var CString     = CloudTypes.CString;
var CSet        = CloudTypes.CSet;
var Index       = CloudTypes.Index;
var Table       = CloudTypes.Table


describe('TableEntry |', function () {
  var state, table1, table2, table3, entry, entry1, entry2, entry3, entry4;
  
  before(function () {
    state  = new State();
    table1 = state.declare('Thing1', Table([{'key1': 'int'}, {'key2': 'string'}], {'column1': CInt, 'column2': CString}));
    table2 = state.declare('Thing2', Table([{'key1': table1}], {'column1': CInt, 'column2': table1}));
    table3 = state.declare('Thing3', Table({'column1': CInt, 'column2': 'Thing3'}));
  });

  describe('.create([key1, key2,...])', function () {
    it('should return a TableEntry object', function () {
      entry = table1.create(1, "foo");
      entry2 = table2.create(entry);
      entry3 = table3.create();
      entry4 = table3.create();
      should.exist(entry);
      should.exist(entry2);
      entry.should.be.an.instanceOf(TableEntry);
      entry2.should.be.an.instanceOf(TableEntry);
    });

    it('should have a uid property', function () {
      entry.should.have.property('uid');
      entry2.should.have.property('uid');
    });

    it('should have a keys property which is a serialized array of the keys', function () {
      entry.should.have.property('keys');
      entry2.should.have.property('keys');
      entry.keys.should.eql([1, "foo"]);
      entry2.keys.should.eql([entry.serialKey()]);
    });

    it('should have a reference to the table', function () {
      entry.should.have.property('index');
      entry2.should.have.property('index');
      entry.index.should.equal(table1);
      entry2.index.should.equal(table2);
    });
  });

  describe('.key(name)', function () {
    it('should return the key in the correct type', function () {
      entry.key('key1').should.equal(1);
      entry.key('key2').should.equal("foo");
      entry2.key('key1').should.eql(entry);
    });

    it('should throw an error if an incorrect name is given', function () {
      (function () {
        entry.key('doesnotexist');
      }).should.throwError();
      (function () {
        entry2.key('doesnotexist');
      }).should.throwError();
    });
  });

  describe('get(name)', function () {
    it('should return the column of the correct type', function () {
      entry.get('column1').should.be.an.instanceOf(CInt);
      entry.get('column2').should.be.an.instanceOf(CString);
      entry2.get('column1').should.be.an.instanceOf(CInt);
    });

    it('should return null if the column is a reference that has not been set', function () {
      should.not.exist(entry2.get('column2'));
    })

    it('should throw an error if an incorrect name is given', function () {
      (function () {
        entry.get('doesnotexist');
      }).should.throwError();
      (function () {
        entry2.get('doesnotexist');
      }).should.throwError();
    })
  });

  describe('set(name, val)', function () {
    it('should call .set(val) on the column of the entry if it is a Cloud Type', function () {
      entry.set('column1', 10);
      entry.set('column2', "bar");
      entry.get('column1').get().should.equal(10);
      entry.get('column2').get().should.equal("bar");
    });

    it('should replace the reference if it is a reference to a Table', function () {
      entry2.set('column2', entry);
      entry2.get('column2').equals(entry).should.equal(true);
      entry3.set('column2', entry3);
      entry3.get('column2').equals(entry3).should.equal(true);
      entry3.get('column2').equals(entry4).should.equal(false);
      entry3.set('column2', entry4);
      entry3.get('column2').equals(entry3).should.equal(false);
      entry3.get('column2').equals(entry4).should.equal(true);
    });

  
  });

  describe('.forEachKey(callback)', function () {
    it('should call callback for each key, val pair', function () {
      var keys = {};
      entry.forEachKey(function (name, val) {
        keys[name] = val;
      });
      Object.keys(keys).length.should.equal(2);
      keys["key1"].should.equal(1);
      keys["key2"].should.equal("foo");
      keys = {};
      entry2.forEachKey(function (name, val) {
        keys[name] = val;
      });
      Object.keys(keys).length.should.equal(1);
      keys["key1"];
    });
  });

  describe('.forEachColumn(callback)', function () {
    it('should call callback for each column, value pair', function () {
      entry.set('column1', 20);
      entry.set('column2', "foo");
      var columns = {};
      entry.forEachColumn(function (name, val) {
        columns[name] = val;
      });
      Object.keys(columns).length.should.equal(2);
      columns["column1"].get().should.equal(20);
      columns["column2"].get().should.equal("foo");
      columns = {};
      entry2.forEachColumn(function (name, val) {
        columns[name] = val;
      });
      Object.keys(columns).length.should.equal(2);
      columns["column1"].get().should.equal(0);
      columns["column2"].should.eql(entry);
      var entry3 = table2.create(entry);
      columns = {};
      entry3.forEachColumn(function (name, val) {
        columns[name] = val;
      });
      Object.keys(columns).length.should.equal(2);
      columns["column1"].get().should.equal(0);
      should.equal(columns["column2"], null);
    });
  });

});