var should = require('should');
var State  = require('../server/state');
var CloudTypes = require('../server/main');

var CInt    = CloudTypes.CInt;
var CString = CloudTypes.CString;
var CSet    = CloudTypes.CSet;
var Index   = CloudTypes.Index;
var Table   = CloudTypes.Table

describe('Correct Type Declarations |', function () {

  describe('Declaring a Table with columns, using string names as types', function () {
    it('should return a Table object', function () {
      var state = new State();
      var table1 = state.declare('Thing1', Table({'column1': 'CInt', 'column2': 'CString'}));
      var table2 = state.declare('Thing2', Table({'column1': 'CInt', 'column2': 'CString', 'column3': 'Thing1'}));
      should.exist(table1);
      should.exist(table2);
      table1.should.be.an.instanceOf(Table.type);
      table2.should.be.an.instanceOf(Table.type);
    });
  });

  describe('Declaring a Table with columns, using the real types as types', function () {
    it('should return a Table object', function () {
      var state = new State();
      var table1 = state.declare('Thing1', Table({'column1': CInt, 'column2': CString}));
      var table2 = state.declare('Thing2', Table({'column1': CInt, 'column2': CString, 'column3': table1}));
      should.exist(table1);
      should.exist(table2);
      table1.should.be.an.instanceOf(Table.type);
      table2.should.be.an.instanceOf(Table.type);
    });
  });

  describe('Declaring a Table with keys and columns', function () {
    it('should return a Table object', function () {
      var state = new State();
      var table1 = state.declare('Thing1', Table([{'key1': 'int'}, {'key2': 'string'}], {'column1': CInt, 'column2': CString}));
      var table2 = state.declare('Thing2', Table([{'key1': 'string'}, {'key2': 'string'}], {'column1': CInt, 'column2': CString, 'column3': table1}));
      should.exist(table1);
      should.exist(table2);
      table1.should.be.an.instanceOf(Table.type);
      table2.should.be.an.instanceOf(Table.type);
    });
  });

  describe('Declaring a Table with Table keys (Weak tables) and columns', function () {
    it('should return a Table object', function () {
      var state = new State();
      var table1 = state.declare('Thing1', Table([{'key1': 'int'}, {'key2': 'string'}], {'column1': CInt, 'column2': CString}));
      var table2 = state.declare('Thing2', Table([{'key1': table1}, {'key2': table1}],  {'column1': CInt, 'column2': CString, 'column3': table1}));
      should.exist(table1);
      should.exist(table2);
      table1.should.be.an.instanceOf(Table.type);
      table2.should.be.an.instanceOf(Table.type);
    });
  });



  describe('Declaring an Index with keys and fields, using strings as types', function () {
    it('should return an Index object', function () {
      var state = new State();
      var index = state.declare('Thing', Index([{'key1': 'int'}, {'key2': 'string'}], {'column1': 'CInt', 'column2': 'CString'}));
      should.exist(index);
      index.should.be.an.instanceOf(Index.type);
    });
  });

  describe('Declaring an Index with keys and fields, using the real types as types', function () {
    it('should return an Index object', function () {
      var state = new State();
      var index1 = state.declare('Thing1', Table([{'key1': 'int'}, {'key2': 'string'}], {'column1': CInt, 'column2': CString }));
      var index2 = state.declare('Thing2', Index([{'key1': index1}, {'key2': index1}], {'column1': CInt, 'column2': CString}));
      should.exist(index2);
      index2.should.be.an.instanceOf(Index.type);
    });
  });

  describe('Declaring a global CloudType', function () {
    var state = new State();
    var type1 = state.declare('Type1', CInt);
    var type2 = state.declare('Type2', CString);
    it('should return a CloudType', function () {
      should.exist(type1);
      should.exist(type2);
      type1.should.be.an.instanceOf(CInt);
      type2.should.be.an.instanceOf(CString);
      type1.get().should.equal(0);
      type2.get().should.equal("");
    });
  });  
});

describe('Incorrect Type Declarations |', function () {

  describe('Declaring an Index with a CSet property', function () {
    it('should throw an error', function () {
      var state = new State();
      (function () { var index1 = state.declare('Thing', Index([], {'column1': CInt, 'column2': CString, 'column3': CSet('Thing')})); }).should.throwError();
    });
  });

  describe('Declaring a Table with Index keys', function () {
    it('should throw an error', function () {
      var state = new State();
      var table1 = state.declare('Thing1', Index([{'key1': 'int'}, {'key2': 'string'}], {'column1': CInt, 'column2': CString}));
      (function () {
        state.declare('Thing2', Table([{'key1': table1}, {'key2': table1}],  {'column1': CInt, 'column2': CString, 'column3': table1}));
      }).should.throwError();
    });
  });

  describe('Declaring an Index with Index keys', function () {
    it('should throw an error', function () {
      var state = new State();
      var table1 = state.declare('Thing1', Index([{'key1': 'int'}, {'key2': 'string'}], {'column1': CInt, 'column2': CString}));
      (function () { 
        state.declare('Thing2', Index([{'key1': table1}, {'key2': table1}],  {'column1': CInt, 'column2': CString, 'column3': table1}));
      }).should.throwError();
    });
  });

  describe('Declaring two types with the same name', function () {
    it('should throw an error', function () {
      var state = new State();
      state.declare('Type', CInt);
      (function () { 
        state.declare('Type', CString);
      }).should.throwError();
    });
  })

});