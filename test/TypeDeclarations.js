var should = require('should');
var State  = require('../server/state');
var CloudTypes = require('../server/main');

var CInt    = CloudTypes.CInt;
var CString = CloudTypes.CString;
var CSet    = CloudTypes.CSet;
var Index   = CloudTypes.Index;
var Table   = CloudTypes.Table;

describe('Type Declarations API |', function () {
  
  var state;

  beforeEach(function () {
    state = new State();
  });

  describe('Declaring a Table with columns, using strings as types', function () {
    it('should return a Table object', function () {
      var table = state.declare('Thing', new Table({'column1': 'CInt', 'column2': 'CString'}));
      should.exist(table);
      table.should.be.an.instanceOf(Table);
    });
  });

  describe('Declaring a Table with columns, using the real types as types', function () {
    it('should return a Table object', function () {
      var table = state.declare('Thing', new Table({'column1': CInt, 'column2': CString, 'column3': new CSet('Thing')}));
      should.exist(table);
      table.should.be.an.instanceOf(Table);
    });
  });

  describe('Declaring an Index with keys and fields, using strings as types', function () {
    it('should return an Index object', function () {
      var index = state.declare('Thing', new Index([], {'column1': 'CInt', 'column2': 'CString'}));
      should.exist(index);
      index.should.be.an.instanceOf(Index);
    });
  });

  describe('Declaring an Index with keys and fields, using the real types as types', function () {
    it('should return an Index object', function () {
      var index = state.declare('Thing', new Index([], {'column1': CInt, 'column2': CString, 'column3': new CSet('Thing')}));
      should.exist(index);
      index.should.be.an.instanceOf(Index);
    });
  });

});