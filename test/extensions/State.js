var State = require('../../shared/State');
var CloudType = require('../../shared/CloudType');
var should = require('should');

module.exports = State;

var OK = 'ok';
var DELETED = 'deleted';
// State.prototype.isForkOf = function (state) {
//   var fState = this;
//   var isFork = true;
//   // each type in state should have an equivalent forked type in fState
//   state.eachType(function (name, type) {
//     var fType = fState.get(name);
//     if (!fType)
//       isFork = false;
//     if (!fType.isForkOf(type))
//       isFork = false;
//   });

//   if (state.numTypes() != fState.numTypes())
//     isFork = false;


//   return isFork;
// };

// State.prototype.isJoinOf = function (state1, state2) {
//   var isJoin = true;
//   this.eachType(function (name, jType) {
//     var type1 = state1.get(name);
//     var type2 = state2.get(name);
//     if (!type1 || !type2)
//       isJoin = false;
//     if (!(jType.isJoinOf(type1, type2)))
//       isJoin = false;
//   });

//   if (state2.numTypes() !== state2.numTypes())
//     throw "joined states do not have same number of types";

//   if (this.numTypes() !== state1.numTypes())
//     isJoin = false;

//   return isJoin;
// };

State.prototype.forPairs = function (state2, callback) {
  var state1 = this;
  state1.forEachProperty(function (property) {
    if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var type1 = property.getByKey(key);
        var type2 = state2.getProperty(property).getByKey(key);
        should.exist(type2);
        callback(type1, type2);
      });
    }
  });
};

State.prototype.isForkOf = function (state) {
  this.forPairs(state, function (forked, forker) {
    forked.isForkOf(forker);
  });
};

State.prototype.isJoinOf = function (state1, state2) {
  var self = this;
  this.forEachProperty(function (property) {
    if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var jType = property.getByKey(key);
        var type1 = state1.getProperty(property).getByKey(key);
        var type2 = state2.getProperty(property).getByKey(key);
        should.exist(type1);
        should.exist(type2);
        jType.isJoinOf(type1, type2);
      });
    }
  });
  this.forEachEntity(function (entity) {
    entity.forEachState(function (key) {
      var val  = entity.states[key];
      var val1 = state1.get(entity.name).states[key];
      var val2 = state2.get(entity.name).states[key];
      if (val1 === DELETED || val2 === DELETED)
        return self.get(entity.name).states[key].should.equal(DELETED);
      if (val1 === OK || val2 === OK)
        return self.get(entity.name).states[key].should.equal(OK);
    });
  });
};

State.prototype.isEqual = function (state) {
  this.forPairs(state, function (type1, type2) {
    type1.isEqual(type2);
  });
  this.forEachEntity(function (entity) {
    entity.states.should.eql(state.get(entity.name).states);
  });
};

State.prototype.isConsistent = function (state) {
  this.forPairs(state, function (type1, type2) {
//    console.log(require('util').inspect(type1.get()) + " consistent? " + require('util').inspect(type2.get()));
    type1.isConsistent(type2);
  });
  this.forEachEntity(function (entity) {
//      console.log(require('util').inspect(entity.states) + " consistent? " + require('util').inspect(state.get(entity.name).states));
    entity.forEachState(function (key) {
//      console.log('key: ' + key);
//      console.log(entity.states[key] + " ?= " + state.get(entity.name).states[key]);
      entity.states[key].should.equal(state.get(entity.name).states[key]);
    });
  });
};