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

describe('Access Control | ', function () {
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

  describe('Application Data Access', function () {


    describe('Guest Group (non logged in users)', function () {
      it('should have READ access', function () {
        should.exist(state.get('Thing1'));
        should.exist(state.get('Thing2'));
        state.get('Thing1').should.be.an.instanceOf(Table);
        state.get('Thing2').should.be.an.instanceOf(Table);
        state.get('Thing1').all().length.should.equal(1);
      });

      it('should NOT have CREATE access', function () {
        (function () { 
          state.get('Thing1').create('foo');
        }).should.throwError("Not authorized to perform create on Thing1");
      });

      it('should NOT have UPDATE access', function () {
        state.get('Thing1').should.be.an.instanceOf(Table);
        (function () {
          var t1 = state.get('Thing1').all()[0];
          t1.set('column1', 10);
        }).should.throwError("Not authorized to perform update on Thing1.column1");
      });

      it('should NOT have DELETE access', function () {
        state.get('Thing1').should.be.an.instanceOf(Table);
        (function () {
          var t1 = state.get('Thing1').all()[0];
          t1.delete();
        }).should.throwError("Not authorized to perform delete on Thing1");
      });
    });



    describe('Root Group', function () {
      it('should have READ access', function (done) {
        client.login("root", "root", function (err) {
          state.get('Thing1').should.be.an.instanceOf(Table);
          state.get('Thing2').should.be.an.instanceOf(Table);
          state.get('Thing1').all().length.should.equal(1);
          done();
        });
      });

      it('should have CREATE access', function (done) {
        client.login("root", "root", function (err) {
          state.get('Thing1').create('foo');
          done();
        });
      });

      it('should have UPDATE access', function () {
        client.login("root", "root", function (err) {
          state.get('Thing1').all()[0].set('column1', 10);
        });
      });

      it('should have DELETE access', function () {
        client.login("root", "root", function (err) {
          state.get('Thing1').all()[0].delete();
        });
      });
    });
  });




  describe('Application Data Granting', function () {


    describe('Guest Group (non logged in users)', function () {
      it('should NOT have READ GRANT permissions', function () {
        (function () {
          state.grant("read", "Thing1", "Guest");
        }).should.throwError("You don't have read grant permissions for Thing1");
      });

      it('should NOT have CREATE GRANT permissions', function () {
        (function () { 
          state.grant("create", "Thing1", "Guest");
        }).should.throwError("You don't have create grant permissions for Thing1");
      });

      it('should NOT have UPDATE GRANT permissions', function () {
        (function () {
          state.grant("update", "Thing1", "Guest");
        }).should.throwError("You don't have update grant permissions for Thing1");
      });

      it('should NOT have DELETE GRANT permissions', function () {
        (function () {
          state.grant("delete", "Thing1", "Guest");
        }).should.throwError("You don't have delete grant permissions for Thing1");
      });
    });



    describe('Root Group', function () {
      it('should have READ GRANT permissions', function (done) {
        client.login("root", "root", function () {
          state.grant("read", "Thing1", "Guest");
          done();
        });
      });

      it('should have CREATE GRANT permissions', function (done) {
        client.login("root", "root", function () {
          state.grant("create", "Thing1", "Guest");
          done();
        });
      });

      it('should have UPDATE GRANT permissions', function (done) {
        client.login("root", "root", function () {
          state.grant("update", "Thing1", "Guest");
          done();
        });
      });

      it('should have DELETE GRANT permissions', function (done) {
        client.login("root", "root", function () {
          state.grant("delete", "Thing1", "Guest");
          done();
        });
      });
    });

  });

  
  describe('Granting', function () {
    describe('READ access on a table', function () {
      it('should make the table (and all dependencies) available to that group', function (done) {
        client.login("root", "root", function () {
          state.grant("read", "Thing1", "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').should.be.an.instanceOf(Table);
              done();
            });
          });
        });
      });
    });

    describe('READ access with GRANTOP on a table', function () {
      it('should allow the group to grant the privilege', function (done) {
        client.login("root", "root", function () {
          state.grant("read", "Thing1", "Guest", "Y");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').should.be.an.instanceOf(Table);
              state2.grant("read", "Thing1", "Guest", "Y");
              done();
            });
          });
        });
      });
    });


    describe('CREATE access on a table', function () {
      it('should be able to create new entries', function (done) {
        client.login("root", "root", function () {
          state.grant("create", "Thing1", "Guest");
          state.grant("create", "Thing2", "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              var t1 = state2.get('Thing1').create('foo');
              done();
            });
          });
        });
      });
    });

    describe('CREATE access with GRANTOP on a table', function () {
      it('should allow the group to grant the privilege', function (done) {
        client.login("root", "root", function () {
          state.grant("create", "Thing1", "Guest", "Y");
          state.flush(function () {
            createClient(function (client2, state2) {
                state2.get('Thing1').create('foo');
              state.grant("create", "Thing1", "Guest", "Y");
              done();
            });
          });
        });
      });
    });


    describe('UPDATE access on a table', function () {
      it('should make the table (and all dependencies) available to that group', function (done) {
        client.login("root", "root", function () {
          state.grant("update", "Thing1", "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').all()[0].set('column1', 1);
              done();
            });
          });
        });
      });
    });

    describe('UPDATE access with GRANTOP on a table', function () {
      it('should allow the group to grant the privilege', function (done) {
        client.login("root", "root", function () {
          state.grant("update", "Thing1", "Guest", "Y");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').all()[0].set('column1', 1);
              state.grant("update", "Thing1", "Guest", "Y");
              done();
            });
          });
        });
      });
    });


    describe('DELETE access on a table', function () {
      it('should allow the create an entry of that table', function (done) {
        client.login("root", "root", function () {
          state.grant("delete", "Thing1", "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').all()[0].delete();
              done();
            });
          });
        });
      });
    });

    describe('DELETE access with GRANTOP on a table', function () {
      it('should allow the group to grant the privilege', function (done) {
        client.login("root", "root", function () {
          state.grant("delete", "Thing1", "Guest", "Y");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').all()[0].delete();
              state.grant("delete", "Thing1", "Guest", "Y");
              done();
            });
          });
        });
      });
    });

  });

  describe('Revoking', function () {

    describe('READ access on a Table', function () {
      it('should have a Restricted object for the revoked table and all depending tables', function (done) {
        client.login("root", "root", function (err, success) {
          state.revoke("read", "Thing1", "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              state2.get('Thing1').should.be.an.instanceOf(Restricted);
              state2.get('Thing2').should.be.an.instanceOf(Restricted);
              state2.get('Thing3').should.be.an.instanceOf(Restricted);
              done();
            });
          });
        });
      });

      describe('and subsequently Granting READ access again', function () {
        it('should make the Tables available again on the next sync', function (done) {
          client.login("root", "root", function (err, success) {
            state.revoke("read", "Thing1", "Guest");
            state.flush(function () {
              console.log('FLUSHED');
              createClient(function (client2, state2) {
                console.log('MADE CLIENT');
                state2.get('Thing1').should.be.an.instanceOf(Restricted);
                state2.get('Thing2').should.be.an.instanceOf(Restricted);
                state2.get('Thing3').should.be.an.instanceOf(Restricted);
                state2.get('Thing4').should.be.an.instanceOf(Table);

                console.log('GRANTING');
                state.grant("read", "Thing1", "Guest", "N");
                state.flush(function () {
                  console.log('GRANTED');
                  state2.flush(function () {
                    console.log('FLUSHED CLIENT');
                    state2.get('Thing1').should.be.an.instanceOf(Table);
                    state2.get('Thing2').should.be.an.instanceOf(Table);
                    state2.get('Thing3').should.be.an.instanceOf(Table);
                    state2.get('Thing4').should.be.an.instanceOf(Table);
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

    
    describe('CREATE access on a Table', function () {
      it('should not be able to update the table and all dependend tables', function (done) {
        client.login("root", "root", function (err, success) {
          state.grant("create", "Thing1", "Guest", "N");
          state.grant("create", "Thing2", "Guest", "N");
          state.grant("create", "Thing3", "Guest", "N");
          state.revoke("create", "Thing1", "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              (function () {
                state2.get('Thing1').create();
              }).should.throwError("Not authorized to perform create on Thing1");
              (function () {
                state2.get('Thing2').create(state2.get('Thing1').all()[0]);
              }).should.throwError("Not authorized to perform create on Thing2");
              (function () {
                state2.get('Thing3').create(state2.get('Thing2').all()[0]);
              }).should.throwError("Not authorized to perform create on Thing3");
             done();
            });
          });
        });
      });

      describe('and subsequently Granting CREATE access again', function () {
        it('should make the Tables available again on the next sync', function (done) {
          client.login("root", "root", function (err, success) {
            state.grant("create", "Thing1", "Guest", "N");
            state.grant("create", "Thing2", "Guest", "N");
            state.grant("create", "Thing3", "Guest", "N");
            state.revoke("create", "Thing1", "Guest");
            state.flush(function () {
              createClient(function (client2, state2) {
                (function () {
                  state2.get('Thing1').all()[0].set('column1', 1);
                }).should.throwError();
                state.grant("create", "Thing1", "Guest", "N");
                state.flush(function () {
                  state2.flush(function () {
                    var t1 = state2.get('Thing1').create('foo');
                    var t2 = state2.get('Thing2').create(t1);
                    state2.get('Thing3').create(t2);
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

      
    describe('UPDATE access on a Table', function () {
      it('should not be able to update the table and all dependend tables', function (done) {
        client.login("root", "root", function (err, success) {
          state.grant("update", "Thing1", "Guest", "N");
          state.grant("update", "Thing2", "Guest", "N");
          state.grant("update", "Thing3", "Guest", "N");
          state.revoke("update", "Thing1", "Guest");
          state.flush(function () {
            createClient(function (client2, state2) {
              (function () {
                state2.get('Thing1').all()[0].set('column1', 1);
              }).should.throwError("Not authorized to perform update on Thing1.column1");
              (function () {
                state2.get('Thing2').all()[0].set('column1', 1);
              }).should.throwError("Not authorized to perform update on Thing2.column1");
              (function () {
                state2.get('Thing3').all()[0].set('column1', 1);
              }).should.throwError("Not authorized to perform update on Thing3.column1");
              done();
            });
          });
        });
      });

      describe('and subsequently Granting UPDATE access again', function () {
        it('should make the Tables available again on the next sync', function (done) {
          client.login("root", "root", function (err, success) {
            state.grant("update", "Thing1", "Guest", "N");
            state.grant("update", "Thing2", "Guest", "N");
            state.grant("update", "Thing3", "Guest", "N");
            state.revoke("update", "Thing1", "Guest");
            state.flush(function () {
              createClient(function (client2, state2) {
                (function () {
                  state2.get('Thing1').all()[0].set('column1', 1);
                }).should.throwError();
                state.grant("update", "Thing1", "Guest", "N");
                state.flush(function () {
                  state2.flush(function () {
                    state2.get('Thing1').all()[0].set('column1', 1);
                    state2.get('Thing2').all()[0].set('column1', 1);
                    state2.get('Thing3').all()[0].set('column1', 1);
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