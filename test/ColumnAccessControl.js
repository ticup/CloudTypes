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
    describe('READ access on a column of a table without access', function () {
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
              should.not.exist(thing.get('column2'));
              done();
            });
          });
        });
      });
    });

    // describe('READ access with GRANTOP on a table', function () {
    //   it('should allow the group to grant the privilege', function (done) {
    //     client.login("root", "root", function () {
    //       state.grant("read", "Thing1", "Guest", "Y");
    //       state.flush(function () {
    //         createClient(function (client2, state2) {
    //           state2.get('Thing1').should.be.an.instanceOf(Table);
    //           state2.grant("read", "Thing1", "Guest", "Y");
    //           done();
    //         });
    //       });
    //     });
    //   });
    // });


    // describe('CREATE access on a table', function () {
    //   it('should be able to create new entries', function (done) {
    //     client.login("root", "root", function () {
    //       state.grant("create", "Thing1", "Guest");
    //       state.grant("create", "Thing2", "Guest");
    //       state.flush(function () {
    //         createClient(function (client2, state2) {
    //           var t1 = state2.get('Thing1').create('foo');
    //           done();
    //         });
    //       });
    //     });
    //   });
    // });

    // describe('CREATE access with GRANTOP on a table', function () {
    //   it('should allow the group to grant the privilege', function (done) {
    //     client.login("root", "root", function () {
    //       state.grant("create", "Thing1", "Guest", "Y");
    //       state.flush(function () {
    //         createClient(function (client2, state2) {
    //             state2.get('Thing1').create('foo');
    //           state.grant("create", "Thing1", "Guest", "Y");
    //           done();
    //         });
    //       });
    //     });
    //   });
    // });


    // describe('UPDATE access on a table', function () {
    //   it('should make the table (and all dependencies) available to that group', function (done) {
    //     client.login("root", "root", function () {
    //       state.grant("update", "Thing1", "Guest");
    //       state.flush(function () {
    //         createClient(function (client2, state2) {
    //           state2.get('Thing1').all()[0].set('column1', 1);
    //           done();
    //         });
    //       });
    //     });
    //   });
    // });

    // describe('UPDATE access with GRANTOP on a table', function () {
    //   it('should allow the group to grant the privilege', function (done) {
    //     client.login("root", "root", function () {
    //       state.grant("update", "Thing1", "Guest", "Y");
    //       state.flush(function () {
    //         createClient(function (client2, state2) {
    //           state2.get('Thing1').all()[0].set('column1', 1);
    //           state.grant("update", "Thing1", "Guest", "Y");
    //           done();
    //         });
    //       });
    //     });
    //   });
    // });


    // describe('DELETE access on a table', function () {
    //   it('should allow the create an entry of that table', function (done) {
    //     client.login("root", "root", function () {
    //       state.grant("delete", "Thing1", "Guest");
    //       state.flush(function () {
    //         createClient(function (client2, state2) {
    //           state2.get('Thing1').all()[0].delete();
    //           done();
    //         });
    //       });
    //     });
    //   });
    // });

    // describe('DELETE access with GRANTOP on a table', function () {
    //   it('should allow the group to grant the privilege', function (done) {
    //     client.login("root", "root", function () {
    //       state.grant("delete", "Thing1", "Guest", "Y");
    //       state.flush(function () {
    //         createClient(function (client2, state2) {
    //           state2.get('Thing1').all()[0].delete();
    //           state.grant("delete", "Thing1", "Guest", "Y");
    //           done();
    //         });
    //       });
    //     });
    //   });
    // });

  });

  // describe('Revoking', function () {

  //   describe('READ access on a Table', function () {
  //     it('should have a Restricted object for the revoked table and all depending tables', function (done) {
  //       client.login("root", "root", function (err, success) {
  //         state.revoke("read", "Thing1", "Guest");
  //         state.flush(function () {
  //           createClient(function (client2, state2) {
  //             state2.get('Thing1').should.be.an.instanceOf(Restricted);
  //             state2.get('Thing2').should.be.an.instanceOf(Restricted);
  //             state2.get('Thing3').should.be.an.instanceOf(Restricted);
  //             done();
  //           });
  //         });
  //       });
  //     });

  //     describe('and subsequently Granting READ access again', function () {
  //       it('should make the Tables available again on the next sync', function (done) {
  //         client.login("root", "root", function (err, success) {
  //           state.revoke("read", "Thing1", "Guest");
  //           state.flush(function () {
  //             console.log('FLUSHED');
  //             createClient(function (client2, state2) {
  //               console.log('MADE CLIENT');
  //               state2.get('Thing1').should.be.an.instanceOf(Restricted);
  //               state2.get('Thing2').should.be.an.instanceOf(Restricted);
  //               state2.get('Thing3').should.be.an.instanceOf(Restricted);
  //               state2.get('Thing4').should.be.an.instanceOf(Table);

  //               console.log('GRANTING');
  //               state.grant("read", "Thing1", "Guest", "N");
  //               state.flush(function () {
  //                 console.log('GRANTED');
  //                 state2.flush(function () {
  //                   console.log('FLUSHED CLIENT');
  //                   state2.get('Thing1').should.be.an.instanceOf(Table);
  //                   state2.get('Thing2').should.be.an.instanceOf(Table);
  //                   state2.get('Thing3').should.be.an.instanceOf(Table);
  //                   state2.get('Thing4').should.be.an.instanceOf(Table);
  //                   done();
  //                 });
  //               });
  //             });
  //           });
  //         });
  //       });
  //     });
  //   });

    
  //   describe('CREATE access on a Table', function () {
  //     it('should not be able to update the table and all dependend tables', function (done) {
  //       client.login("root", "root", function (err, success) {
  //         state.grant("create", "Thing1", "Guest", "N");
  //         state.grant("create", "Thing2", "Guest", "N");
  //         state.grant("create", "Thing3", "Guest", "N");
  //         state.revoke("create", "Thing1", "Guest");
  //         state.flush(function () {
  //           createClient(function (client2, state2) {
  //             (function () {
  //               state2.get('Thing1').create();
  //             }).should.throwError("Not authorized to perform create on Thing1");
  //             (function () {
  //               state2.get('Thing2').create(state2.get('Thing1').all()[0]);
  //             }).should.throwError("Not authorized to perform create on Thing2");
  //             (function () {
  //               state2.get('Thing3').create(state2.get('Thing2').all()[0]);
  //             }).should.throwError("Not authorized to perform create on Thing3");
  //            done();
  //           });
  //         });
  //       });
  //     });

  //     describe('and subsequently Granting CREATE access again', function () {
  //       it('should make the Tables available again on the next sync', function (done) {
  //         client.login("root", "root", function (err, success) {
  //           state.grant("create", "Thing1", "Guest", "N");
  //           state.grant("create", "Thing2", "Guest", "N");
  //           state.grant("create", "Thing3", "Guest", "N");
  //           state.revoke("create", "Thing1", "Guest");
  //           state.flush(function () {
  //             createClient(function (client2, state2) {
  //               (function () {
  //                 state2.get('Thing1').all()[0].set('column1', 1);
  //               }).should.throwError();
  //               state.grant("create", "Thing1", "Guest", "N");
  //               state.flush(function () {
  //                 state2.flush(function () {
  //                   var t1 = state2.get('Thing1').create('foo');
  //                   var t2 = state2.get('Thing2').create(t1);
  //                   state2.get('Thing3').create(t2);
  //                   done();
  //                 });
  //               });
  //             });
  //           });
  //         });
  //       });
  //     });
  //   });

      
  //   describe('UPDATE access on a Table', function () {
  //     it('should not be able to update the table and all dependend tables', function (done) {
  //       client.login("root", "root", function (err, success) {
  //         state.grant("update", "Thing1", "Guest", "N");
  //         state.grant("update", "Thing2", "Guest", "N");
  //         state.grant("update", "Thing3", "Guest", "N");
  //         state.revoke("update", "Thing1", "Guest");
  //         state.flush(function () {
  //           createClient(function (client2, state2) {
  //             (function () {
  //               state2.get('Thing1').all()[0].set('column1', 1);
  //             }).should.throwError("Not authorized to perform update on Thing1.column1");
  //             (function () {
  //               state2.get('Thing2').all()[0].set('column1', 1);
  //             }).should.throwError("Not authorized to perform update on Thing2.column1");
  //             (function () {
  //               state2.get('Thing3').all()[0].set('column1', 1);
  //             }).should.throwError("Not authorized to perform update on Thing3.column1");
  //             done();
  //           });
  //         });
  //       });
  //     });

  //     describe('and subsequently Granting UPDATE access again', function () {
  //       it('should make the Tables available again on the next sync', function (done) {
  //         client.login("root", "root", function (err, success) {
  //           state.grant("update", "Thing1", "Guest", "N");
  //           state.grant("update", "Thing2", "Guest", "N");
  //           state.grant("update", "Thing3", "Guest", "N");
  //           state.revoke("update", "Thing1", "Guest");
  //           state.flush(function () {
  //             createClient(function (client2, state2) {
  //               (function () {
  //                 state2.get('Thing1').all()[0].set('column1', 1);
  //               }).should.throwError();
  //               state.grant("update", "Thing1", "Guest", "N");
  //               state.flush(function () {
  //                 state2.flush(function () {
  //                   state2.get('Thing1').all()[0].set('column1', 1);
  //                   state2.get('Thing2').all()[0].set('column1', 1);
  //                   state2.get('Thing3').all()[0].set('column1', 1);
  //                   done();
  //                 });
  //               });
  //             });
  //           });
  //         });
  //       });
  //     });

     


  //   });

  // });
});