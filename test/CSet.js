/**
 * Created by ticup on 09/11/13.
 */
var State       = require('./extensions/State');
var Table       = require('../shared/Table');
var Index       = require('../shared/Index');
var Keys        = require('../shared/Keys');
var Properties  = require('../shared/Properties');
var Property    = require('../shared/Property');
var CloudType   = require('../shared/CloudType');
var CInt        = require('./extensions/CInt');
var CSet        = require('./extensions/CSet').Declaration;
var CString     = require('./extensions/CString');
var should      = require('should');
var stubs       = require('./stubs');
var util        = require('util');
var TableEntry = require('../shared/TableEntry');

describe('CSet Property', function () {

  describe('declared for Index', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    state.declare(name, new Table({slots: new CSet('int')}));

    it('should add the array to the arrays map with given name', function () {
      state.arrays.should.have.property(name);
    });
    it('should install reference of self in index', function () {
      state.arrays[name].state.should.equal(state);
    });
    it('should install reference of name in index', function () {
      state.arrays[name].name.should.equal(name);
    });
    it('should add an entity for the slot property with name <array.name><slot.name>', function () {
      should.exist(state.arrays[entityName]);
      state.arrays[entityName].should.be.an.instanceof(Table);
    });
    it('should install a reference to the entity in the CType of the property', function () {
      should.exist(state.arrays[name].properties.get('slots').CType.entity);
      state.arrays[name].properties.get('slots').CType.entity.should.equal(state.arrays[entityName]);
    });
  });

  describe('with own Index declared for Index', function () {
    var state = new State();
    var name  = 'User';
    var User  = state.declare(name, new Table({friends: new CSet(name)}));

    it('should add the array to the arrays map with given name', function () {
      state.arrays.should.have.property(name);
    });
    it('should install reference of self in index', function () {
      state.arrays[name].state.should.equal(state);
    });
    it('should install reference of name in index', function () {
      state.arrays[name].name.should.equal(name);
    });
    it('should have itself as type for the property', function () {
      should.exist(User.getProperty('friends').CType.elementType);
      User.getProperty('friends').CType.elementType.should.equal(User);
    });
  });

  describe('with other Index declared for Index', function () {
    var state = new State();
    var name  = 'Group';
    var Group = state.declare("Group", new Table({name:CString}));
    var User  = state.declare("User" , new Table({groups: new CSet(name)}));

    it('should add the array to the arrays map with given name', function () {
      state.arrays.should.have.property(name);
    });
    it('should install reference of self in index', function () {
      state.arrays[name].state.should.equal(state);
    });
    it('should install reference of name in index', function () {
      state.arrays[name].name.should.equal(name);
    });
    it('should have itself as type for the property', function () {
      should.exist(User.getProperty('groups').CType.elementType);
      User.getProperty('groups').CType.elementType.should.equal(Group);
    });
  });

  describe('JSON operations', function () {
    var state1 = new State();
    var name = "moments";
    var entityName = name+"slots";
    state1.declare(name, new Table({slots: new CSet('int')}));
    var json = state1.toJSON();
    var state2 = State.fromJSON(json);

    it('should add the array to the arrays map with given name', function () {
      state2.arrays.should.have.property(name);
    });
    it('should install reference of self in index', function () {
      state2.arrays[name].state.should.equal(state2);
    });
    it('should install reference of name in index', function () {
      state2.arrays[name].name.should.equal(name);
    });
    it('should add an entity for the slot property with name <array.name><slot.name>', function () {
      should.exist(state2.arrays[entityName]);
      state2.arrays[entityName].should.be.an.instanceof(Table);
    });
    it('sould install a reference to the entity in the CType of the property', function () {
      should.exist(state2.arrays[name].properties.get('slots').CType.entity);
      state2.arrays[name].properties.get('slots').CType.entity.should.equal(state2.arrays[entityName]);
    });
  });

  describe('Retrieving a CSet instance for a particular key', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    var CSetDecl = new CSet('int');
    var Thing = state.declare(name, new Table({slots: CSetDecl}));
    var thing = Thing.create();
    var set = thing.get('slots');

    it('should return an instance of the declared CSet', function () {
      should.exist(set);
      set.should.be.an.instanceof(CSetDecl);
    });

    it('should have a type property pointing to the type of the instance', function () {
      should.exist(set.type);
      set.type.should.equal(CSetDecl);
    });

  });

  describe('.add(element) with integer type', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    var CSetDecl = new CSet('int');
    var App = state.declare(name, new Table({slots: CSetDecl}));
    var app = App.create();
    var set = app.get('slots');
    var entity = state.get(entityName);
    set.add(1);

    it('should create an entity in the dedicated CSet Entity with key [entryIndex, element]', function () {
      var entry = entity.where(function (entry) {
        return (entry.key('entry').equals(app) && entry.key('element') === 1);}).all();
      should.exist(entry);
      entry.length.should.equal(1);
    });
  });

  describe('.add(element) with string type', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    var CSetDecl = new CSet('string');
    var App = state.declare(name, new Table({slots: CSetDecl}));
    var app = App.create();
    var set = app.get('slots');
    var entity = state.get(entityName);
    set.add("1");

    it('should create an entity in the dedicated CSet Entity with key [entryIndex, element]', function () {
      var entry = entity.where(function (entry) {
        return (entry.key('entry').equals(app) && entry.key('element') === "1");}).all();
      should.exist(entry);
      entry.length.should.equal(1);
    });
  });


  describe('.add(element) with Table type', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    var User = state.declare("User", new Table({name: 'CString'}));
    var App = state.declare(name, new Table({slots: new CSet(User)}));
    var app = App.create();
    var set = app.get('slots');
    var entity = state.get(entityName);
    var user = User.create();
    set.add(user);

    it('should create an entity in the dedicated CSet Entity with key [entryIndex, element]', function () {
      var entry = entity.where(function (entry) {
        return (entry.key('entry').equals(app) && entry.key('element').equals(user)); }).all();
      should.exist(entry);
      entry.length.should.equal(1);
    });
  });


  describe('.add(element) with recursive Table type', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    var App = state.declare(name, new Table({slots: new CSet(name)}));
    var app = App.create();
    var app1 = App.create();
    var set = app.get('slots');
    var entity = state.get(entityName);
    set.add(app1);

    it('should create an entity in the dedicated CSet Entity with key [entryIndex, element]', function () {
      var entry = entity.where(function (entry) {
        return (entry.key('entry').equals(app) && entry.key('element').equals(app1));}).all();
      should.exist(entry);
      entry.length.should.equal(1);
    });
  });


  describe('.contains(element) with integer type', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    var App = state.declare(name, new Table({slots: new CSet('int')}));
    var app = App.create();
    var set = app.get('slots');
    var entity = state.get(entityName);
    set.add(1);

    it('should return false if element has not been added yet', function () {
      set.contains(2).should.equal(false);
    });

    it('should return true if element has been added', function () {
      set.contains(1).should.equal(true);
      set.add(2);
      set.contains(2).should.equal(true);
    });
  });

  describe('.contains(element) with string type', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    var App = state.declare(name, new Table({slots: new CSet('string')}));
    var app = App.create();
    var set = app.get('slots');
    var entity = state.get(entityName);
    set.add("1");

    it('should return false if element has not been added yet', function () {
      set.contains("2").should.equal(false);
    });

    it('should return true if element has been added', function () {
      set.contains("1").should.equal(true);
      set.add("2");
      set.contains("2").should.equal(true);
    });
  });

  describe('.contains(element) with Table type', function () {
    var set, user1, user2;
    it('should return false if element has not been added yet', function () {
      var state = new State();
      var User = state.declare("User", new Table({name: 'CString'}));
      var App = state.declare("Appointment", new Table({slots: new CSet(User)}));
      var app = App.create();
      set = app.get('slots');
      user1 = User.create();
      user2 = User.create();
      set.add(user1);
      set.contains(user2).should.equal(false);
    });

    it('should return true if element has been added', function () {
      set.contains(user1).should.equal(true);
      set.add(user2);
      set.contains(user2).should.equal(true);
    });
  });


  describe('.remove(element) with integer type', function () {
    it('should remove the element from the set', function () {
      var state = new State();
      var name = "moments";
      var entityName = name+"slots";
      var App = state.declare(name, new Table({slots: new CSet('int')}));
      var app = App.create();
      var set = app.get('slots');
      var entity = state.get(entityName);
      set.add(1);

      set.contains(1).should.equal(true);
      set.remove(1);
      set.contains(1).should.equal(false);
    });
  });

  describe('.remove(element) with string type', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    var App = state.declare(name, new Table({slots: new CSet('string')}));
    var app = App.create();
    var set = app.get('slots');
    var entity = state.get(entityName);
    set.add("1");
    
    it('should remove the element from the set', function () {
      set.contains("1").should.equal(true);
      set.remove("1");
      set.contains("1").should.equal(false);
    });
  });

  describe('.remove(element) with Table type', function () {
    it('should remove the element from the set', function () {
      var state = new State();
      var User = state.declare("User", new Table({name: 'CString'}));
      var App = state.declare("Appointment", new Table({slots: new CSet(User)}));
      var app = App.create();
      var set = app.get('slots');
      var user1 = User.create();
      var user2 = User.create();
      set.add(user1);
      set.contains(user1).should.equal(true);
      set.remove(user1);
      set.contains(user1).should.equal(false);
    });
  });

  describe('subsequent add/delete of same element of integer type', function () {
    it('should keeps its semantics', function () {
      var state = new State();
      var Thing = state.declare("Thing", new Table({slots: new CSet('int')}));
      var thing = Thing.create();
      var set = thing.get('slots');
      set.contains(1).should.equal(false);
      set.add(1);
      set.contains(1).should.equal(true);
      set.remove(1);
      set.contains(1).should.equal(false);
      set.add(1);
      set.contains(1).should.equal(true);
    });
  });

  describe('subsequent add/delete of same element of string type', function () {
    it('should keeps its semantics', function () {
      var state = new State();
      var Thing = state.declare("Thing", new Table({slots: new CSet('string')}));
      var thing = Thing.create();
      var set = thing.get('slots');
      set.contains("1").should.equal(false);
      set.add("1");
      set.contains("1").should.equal(true);
      set.remove("1");
      set.contains("1").should.equal(false);
      set.add("1");
      set.contains("1").should.equal(true);
    });
  });

  describe('subsequent add/delete of same element of Table type', function () {
    it('should keeps its semantics', function () {
      var state = new State();
      var User = state.declare("User", new Table({name: 'CString'}));
      var App = state.declare("Appointment", new Table({slots: new CSet(User)}));
      var app = App.create();
      var set = app.get('slots');
      var user1 = User.create();
      var user2 = User.create();
      set.contains(user1).should.equal(false);
      set.add(user1);
      set.contains(user1).should.equal(true);
      set.remove(user1);
      set.contains(user1).should.equal(false);
      set.add(user1);
      set.contains(user1).should.equal(true);
    });
  });



  describe('deleting an entry contained in the set', function () {
    var state = new State();
    var name = "moments";
    var entityName = name+"slots";
    var User = state.declare("User", new Table({name: 'CString'}));
    var App = state.declare(name, new Table({slots: new CSet(User)}));
    state.print();
    var app = App.create();
    var set = app.get('slots');
    var entity = state.get(entityName);
    var user = User.create();
    set.add(user);

    it('should remove the entry from the set', function () {
      set.get().length.should.equal(1);
      user.delete();
      set.get().length.should.equal(0);
    });
  });



});