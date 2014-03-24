/**
 * Created by ticup on 18/03/14.
 */

// CloudTypes Grocery Example Server
////////////////////////////////////
var CloudTypes = require('../../../server/main.js');

function declare(server) {
  var guest = server.auth.guestGroup;

  var Group    = server.declare('Group',   CloudTypes.Table([], {name: 'CString', token: 'CString', users: CloudTypes.CSet('SysUser')}));
  var Request  = server.declare('Request', CloudTypes.Table([], {token: 'CString', user: 'SysUser'}));

  var Grocery = server.declare('Grocery',  CloudTypes.Index([{group: 'Group'}, {name: 'string'}], {toBuy: 'CInt'}));

  var MyGroup = server.view('MyGroup', 'Group', function (group, context) {
    return group.get('users').contains(context.current_user);
  });

  server.state.grantView('all', MyGroup, guest);
  server.state.grant(['read', 'create'], Request, guest);
  server.state.grant('all', Grocery, guest);

  Request.onCreate(function (request) {
    console.log('calling on create!!!');
    Group.all().forEach(function (group) {
      if (group.get('token').equals(request.get('token').get())) {
        var user = request.get('user').get();
        group.get('users').add(user);
        request.delete();
        console.log('request deleted');
      }
    });
  });

  Group.onCreate(function (group) {
    console.log(group.get('name').get() + ' was created');
    console.log(Group.states);
  });

  server.state.get('Groupusers').onCreate(function (gu) {
    console.log(server.state.get('Groupusers').keyValues);
    console.log('groupuser created for ' + gu.key('element').get('name').get());
  });

  // console.log(' can crate: ' + server.state.canCreateOnTable(server.state.get('Group'), server.auth.guest));

  // var group = Group.create();
  // group.get('users').add(server.auth.guest);
  // console.log(group.get('users').get());
  // console.log(server.state.get('Groupusers').all()[0].key('entry'));
  return server;
}



//   var MyRequest = server.view('MyRequest', 'Request', function (request, context) {
//     var allowed = false;
//     Group.all().forEach(function (group) {
//       if (group.get('users').contains(context.current_user) && request.get('token').equals(group.get('token').get())) {
//         allowed = true;
//       }
//     });
//     return allowed;
//   });
  
//   return server;
// };


module.exports = declare;