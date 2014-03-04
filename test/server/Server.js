var main        = require('../../server/main.js');
var Table       = main.Table;
var Restricted  = main.Restricted;
var config = require('./config.js');

var server = main.createServer();
var serverState = server.state;
var Thing1 = serverState.declare('Thing1', Table([{'key1': 'string'}], {'column1': 'CInt', 'column2': 'Thing1'}));
var Thing2 = serverState.declare('Thing2', Table([{'key1': 'Thing1'}], {'column1': 'CInt', 'column2': 'Thing1'}));
var Thing3 = serverState.declare('Thing3', Table([{'key1': 'Thing2'}], {'column1': 'CInt'}));
var Thing4 = serverState.declare('Thing4', Table([], {'column1': 'Thing1', 'column2': 'Thing2', 'column3': 'Thing3'}));

var t1 = Thing1.create('1');
var t2 = Thing2.create(t1);
var t3 = Thing3.create(t2);
var t4 = Thing4.create();

server.publish(config.port);

// console.log('## Test server running on ' + config.port + ' ##');