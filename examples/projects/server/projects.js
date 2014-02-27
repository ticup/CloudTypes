/**
 * Created by ticup on 31/10/13.
 */

// CloudTypes Grocery Example
/////////////////////////////
var CloudTypes = require('../../../server/main.js');

function declareProjects(server) {
  return server
      .declare('Member' , new CloudTypes.Table({name: 'CString'}))
      .declare('Project', new CloudTypes.Table({name: 'CString'}))
      .declare('Task'   , new CloudTypes.Table({assignee: 'Member', project: 'Project', description: 'CString', priority: 'CInt'}));
}

module.exports = declareProjects; 