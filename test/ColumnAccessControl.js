var should      = require('should');
var fs          = require('fs');
var http        = require('http');
var util        = require('util');

var CloudTypes  = require('../client/main.js');
var Table       = CloudTypes.Table;
var Restricted  = CloudTypes.Restricted;

var config      = require('./server/config.js');


var clientOptions = {
  transports: ['websocket'],
  'force new connection': true
};

function createClient(callback) {
  var client = CloudTypes.createClient();
  client.connect(config.host + ':' + config.port, clientOptions, function (state) {
    callback(client, state);
  });
}

describe('Column Access Control | ', function () {
  var server, Thing1, Thing2, Thing3, Thing4, client, state;

  beforeEach(function (done) {
    server = require('child_process').fork(__dirname + '/server/Server.js');
    setTimeout(function () {
      createClient(function (newClient, newState) {
        client = newClient;
        state  = newState;
        done();
      });
    }, 400);
  });

  afterEach(function () {
    server.kill();
  });
  
  describe('Granting', function () {
    describe('READ access', function () {
      it('should make that property available to the group', function (done) {
        client.login("root", "root", function () {
          state.revoke("read", "Thing1", "Guest");
          state.grant("read", state.get('Thing1').getProperty('column1'), "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').should.be.an.instanceOf(Table);
              var thing = state2.get('Thing1').all()[0];
              should.exist(thing);
              should.exist(thing.get('column1'));
              (function () {
                thing.get('column2');
              }).should.throwError();
              done();
            });
          });
        });
      });
    });

    describe('READ access with GRANTOP', function () {
      it('should allow the group to grant the privilege', function (done) {
        client.login("root", "root", function () {
          state.revoke("read", "Thing1", "Guest");
          state.grant("read", state.get('Thing1').getProperty('column1'), "Guest", "Y");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').should.be.an.instanceOf(Table);
              state2.grant("read", state2.get('Thing1').getProperty('column1'), "Guest", "Y");
              done();
            });
          });
        });
      });
    });


  

    describe('UPDATE access', function () {
      it('should allow the table to update the column', function (done) {
        client.login("root", "root", function () {
          state.revoke("update", "Thing1", "Guest");
          state.grant("update", state.get('Thing1').getProperty('column1'), "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').all()[0].set('column1', 1);
              done();
            });
          });
        });
      });
    });

    describe('UPDATE access with GRANTOP', function () {
      it('should allow the group to grant the privilege', function (done) {
        client.login("root", "root", function () {
          state.revoke("update", "Thing1", "Guest");
          state.grant("update", state.get('Thing1').getProperty('column1'), "Guest", "Y");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').all()[0].set('column1', 1);
              state.grant("update", state.get('Thing1').getProperty('column1'), "Guest", "Y");
              done();
            });
          });
        });
      });
    });

  });

  describe('Revoking', function () {

    describe('READ access', function () {
      it('should restrict given property but not the others', function (done) {
        client.login("root", "root", function (err, success) {
          state.revoke("read", state.get('Thing1').getProperty('column1'), "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').should.be.an.instanceOf(Table);
              state2.get('Thing2').should.be.an.instanceOf(Table);
              state2.get('Thing3').should.be.an.instanceOf(Table);
              (function () {
                state2.get('Thing1').all()[0].get('column1');
              }).should.throwError();
              state2.get('Thing1').all()[0].get('column2');
              done();
            });
          });
        });
      });

      describe('and subsequently Granting READ access again', function () {
        it('should make the property available again', function (done) {
          this.timeout(3000);
          client.login("root", "root", function (err, success) {
            state.revoke("read", state.get('Thing1').getProperty('column1'), "Guest");
            state.flush(function () {
              createClient(function (client2, state2) {
                (function () {
                  state2.get('Thing1').all()[0].get('column1');
                }).should.throwError();
                state2.get('Thing1').all()[0].get('column2');

                state.grant("read", state.get('Thing1').getProperty('column1'), "Guest", "N");
                state.flush(function () {
                  console.log('LAST FLUSH');
                  state2.flush(function () {
                    console.log('FLUSHED');
                    should.exist(state2.get('Thing1').all()[0].get('column1'));
                    should.not.exist(state2.get('Thing1').all()[0].get('column2'));
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

  });
});