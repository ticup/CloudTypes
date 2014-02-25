var State     = require('./extensions/State');
var CloudType = require('../shared/CloudType');
var Index     = require('../shared/Index');
var Table     = require('../shared/Table');
var Property  = require('../shared/Property');
var CSet      = require('../shared/CSet').Declaration;
var CInt      = require('./extensions/CInt');
var CString   = require('./extensions/CString');
var should    = require('should');
var stubs     = require('./stubs');
var util      = require('util');


describe('scenarios#', function () {
  describe('Creating Index entries', function () {
    var state = new State();
    var Grocery = state.declare('Grocery', new Index([{name: 'string'}], {toBuy: CInt}));
    var Grocery2 = state.declare('Grocery2', new Index([{name: 'string'}], {toBuy: CInt}));
    var foo = Grocery.get('foo');
    var bar = Grocery.get('bar');
    var fb = Grocery2.get('fb');
    foo.get('toBuy').set(20);
    bar.get('toBuy').set(10);
    bar.get('toBuy').add(5);
    fb.get('toBuy').set(100);

    it('should have the given value for CInt before serialization', function () {
      Grocery.get('foo').get('toBuy').get().should.equal(20);
      Grocery.get('bar').get('toBuy').get().should.equal(15);
      Grocery2.get('fb').get('toBuy').get().should.equal(100);
    });

    describe('and serializing/deserializing the state', function () {
      var state2 = State.fromJSON(state.toJSON());
      var Grocery12 = state.get('Grocery');
      var Grocery22 = state.get('Grocery2');

      it('should have the declared Indexes', function () {
        should.exist(Grocery12);
        should.exist(Grocery22);
      });

      it('should have the same values for the properties', function () {
        Grocery12.get('foo').get('toBuy').get().should.equal(20);
        Grocery12.get('bar').get('toBuy').get().should.equal(15);
        Grocery22.get('fb').get('toBuy').get().should.equal(100);
      });
    });
  });



  describe('Creating Table entries', function () {
    var state = new State();
    var thing1 = state.declare('Thing1', new Table({row1: CInt, row2: CString}));
    var thing2 = state.declare('Thing2', new Table({row1: CInt, row2: CString}));
    var t11 = thing1.create();
    var t12 = thing1.create();
    var t21 = thing2.create();
    var t22 = thing2.create();

    it('should have the created entries', function () {
      should.exist(t11);
      should.exist(t12);
      should.exist(t21);
      should.exist(t22);
      thing1.all().length.should.equal(1);
      thing2.all().length.should.equal(1);
    });

    describe('and deleting some', function () {
      t11.delete();
      t21.delete();

      it('should have the created entries, but not the deleted', function () {
        thing1.all().length.should.equal(1);
        thing1.all()[0].equals(t12).should.be.true;
        thing2.all().length.should.equal(1);
        thing2.all()[0].equals(t22).should.be.true;
      });

      describe('and serializing/deserializing', function () {
        var state2 = State.fromJSON(state.toJSON());
        var thing21 = state.get('Thing1');
        var thing22 = state.get('Thing2');

        it('should still have the created entries, but not the deleted', function () {
          thing21.all().length.should.equal(1);
          thing22.all().length.should.equal(1);
        });
      });
    });
  });


  describe('Creating cyclic entries with self property', function () {
    var state = new State();
    var thing1 = state.declare('Thing1', new Table({row1: CInt, row2: 'Thing1'}));
    var t1 = thing1.create();
    var t2 = thing1.create();
    var t3 = thing1.create();
    t1.set('row2', t2);
    t2.set('row2', t3);
    t3.set('row2', t1);
    var all = thing1.all();

    it('should have the created entries', function () {
      should.exist(t1);
      should.exist(t2);
      should.exist(t3);
      all.length.should.equal(3);
    });

    it('should return null for the deleted reference', function () {
      should.equal(t1.get('row2'), null);
    });

    it('should have the remaining', function () {
      t3.get('row2').equals(t1).should.equal(true);
    });

    describe(' and deleting one', function () {
      t2.delete();
      var all2 = thing1.all()
      it('should leave the other two', function () {
        all2.length.should.equal(2);
      });

      describe('and serializing/deserializing', function () {
        var state2 = State.fromJSON(state.toJSON());
        var thing2 = state2.get('Thing1');
        var all2 = thing2.all();

        it('should still have the declared Table', function () {
          should.exist(thing2);
        });

        it('should still have the two entries', function () {
          all2.length.should.equal(2);
        });

        it('should still have the entry references', function () {
          all2[1].get('row2').equals(all2[0]).should.equal(true);
        });
      });


    });
   });


  describe('Creating CSet cyclic references', function () {
    var state = new State();
    var thing1 = state.declare('Thing1', new Table({row1: CInt, things: new CSet('Thing1')}));
    var t1 = thing1.create();
    var t2 = thing1.create();
    var t3 = thing1.create();
    t1.get('things').add(t2);
    t1.get('things').add(t3);
    var all = t1.get('things').get();

    it('should have the created entries added to the set', function () {
      should.exist(t1);
      should.exist(t2);
      should.exist(t3);
      all.length.should.equal(2);
    });

    describe('and deleting one', function () {
      t2.delete();debugger;
      var all2 = t1.get('things').get();

      it('should have the item removed from the set', function () {
        console.log(all2);
        all2.length.should.equal(1);
      });

    })


   });
});