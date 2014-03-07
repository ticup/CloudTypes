var Restricted = require('./Restricted');
var Index      = require('./Index');
var Table      = require('./Table');
var CSetPrototype = require('./CSet').CSetPrototype;

function addAuthentication(State) {

  State.prototype.getPrivileges = function () {
    throw new Error("Has to be implemented by server/client State");
  };



  State.prototype.authedForTable = function (action, table, group) {
    var self = this;
    var authed = false;

    // already restricted
    if (table instanceof Restricted)
      return false;

    // Find full table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) && auth.get('group').equals(group)) {
        if (auth.get(action).equals('All') || auth.get(action).equals('Y')) {
          authed = true;
        }
      }
    });

    if (!authed) {
      console.log(group.get('name').get() + ' not authed for ' + table.name);
      return false;
    }

    // Has to be authorized for all Tables of keys
    table.keys.forEach(function (key, type) {
      if (type instanceof Table && !self.authedForTable(action, type, group)) {
        authed = false;
      } 
    });

    // Has to be authorized for all tables of properties ( NOT!!)
    // table.forEachProperty(function (property) {
    //   if (property.CType instanceof Table && !authedFor(property.CType, auths)) {
    //     authed = false;
    //   }
    // });

    return authed;
  };


  State.prototype.authedForColumn = function (action, table, cname, group) {
    var self = this;
    var authed = false;

    // Only read and update actions can be column-wise
    if (action !== 'read' && action !== 'update') {
      throw new Error("Can not be authed for " + action + " on a column");
    }

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find full table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) && auth.get('group').equals(group)) {
        if (auth.get(action).equals('All')) {
          authed = true;
        }
        if (auth.get(action).equals('Some')) {
          self.get('SysColAuth').all().forEach(function (colAuth) {
            if (colAuth.get('group').equals(group) &&
                colAuth.get('tname').equals(table.name) &&
                colAuth.get('cname').equals(cname) &&
                colAuth.get(action).equals('Y')) {
              authed = true;
            }
          });
        }
      }
    });

    if (!authed) {
      return false;
    }

    // Has to be authorized for all tables of keys
    table.keys.forEach(function (key, type) {
      if (type instanceof Table && !self.authedForTable(action, type, group)) {
        authed = false;
      } 
    });

    // Has to be authorized for all tables of properties ( NOT!!)
    // table.forEachProperty(function (property) {
    //   if (property.CType instanceof Table && !authedFor(property.CType, auths)) {
    //     authed = false;
    //   }
    // });

    return authed;
  };


  State.prototype.restrictedForTable = function (index, group) {
    var self = this;
    var restricted = true;

    // Already restricted
    if (index instanceof Restricted) {
      return true;
    }

    // Find full table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(index.name) &&
          auth.get('group').equals(group) &&
          (auth.get('read').equals('All') || auth.get('read').equals('Some'))) {
        restricted = false;
      }
    });


    if (restricted) {
          console.log(index.name + ' is restricted for ' + group.get('name').get());
    
      return true;
    }


    // If restricted for any table, it is restricted itself
    index.keys.forEach(function (key, type) {
      if (type instanceof Table && self.restrictedForTable(type, group)) {
        restricted = true;
      } 
    });

    return restricted;
  };


  State.prototype.revoke = function (action, table, group) {
    if (typeof table === 'string' || table instanceof Index) {
      return this.revokeTable(action, table, group);
    } else if (table instanceof Property) {
      return this.revokeColumn(action, table.index, table.name, group);
    }
    throw new Error("Incorrect input for grant");
  };

  State.prototype.revokeTable = function (action, table, group) {
    var self = this;
    var Auth = this.get('SysAuth');
    var ColAuth = this.get('SysColAuth');
    action = action || 'read';
    if (typeof table === 'string') {
      table = self.get(table);    
    }
    if (typeof group === 'string') {
      group = self.get('SysGroup').getByProperties({name: group});
    }

    self.checkGrantTablePermission(action, table, self.getGroup());
    Auth.all().forEach(function (auth) {
      if (auth.get('group').equals(group) &&
          auth.get('tname').equals(table.name)) {
        if (action === 'read' || action === 'update') {
          auth.set(action, 'None');

          ColAuth.all().forEach(function (colAuth) {
            if (colAuth.get('group').equals(group) &&
                colAuth.get('tname').equals(table.name)) {
              colAuth.set(action, 'N');
              if (colAuth.get('read').equals('N') && colAuth.get('update').equals('N')) {
                colAuth.delete();
              }
            }
          });
        } else {
          auth.set(action, 'N');
        }
      console.log('revoked '+ action+ ' from ' + group.get('name').get());
      }
    });
    return this;
  };

  State.prototype.revokeColumn = function (action, table, cname, group) {
    var self = this;
    var tname = table.name;
    var Auth = this.get('SysAuth');
    var ColAuth = this.get('SysColAuth');
    action = action || 'read';
    if (typeof table === 'string') {
      table = self.get(table);    
    }
    if (typeof group === 'string') {
      group = self.get('SysGroup').getByProperties({name: group});
    }

    self.checkGrantColumnPermission(action, table, columnName, self.getGroup());
    Auth.all().forEach(function (auth) {
      if (auth.get('group').equals(group) &&
          auth.get('tname').equals(table.name)) {
        var grantopt = auth.get('grantopt');

        if (auth.get(action).equals('None')) {
          return;
        }

        // if update and read are on All, reorganize the tables to the syscolauth
        if (auth.get('update').equals('All') && auth.get('read').equals('All')) {

          // puplate the column rows
          table.forEachProperty(function (property) {
            var colAuth = ColAuth.create();
            colAuth.set('group', group)
                   .set('tname', tname)
                   .set('cname', property.name)
                   .set('read', 'Y')
                   .set('update', 'Y')
                   .set('grantopt', grantopt);
          });
        }
      console.log('revoked '+ action+ ' from ' + group.get('name').get());
      }

      auth.set(action, 'Some');
    });

    // do the actual revoke on the column table
    ColAuth.all().forEach(function (colAuth) {
      if (colAuth.get('group').equals(group) &&
          colAuth.get('tname').equals(tname) &&
          colAuth.get('cname').equals(cname)) {
        colAuth.set(action, 'N');
      }
    });

    return this;
  };


  State.prototype.grant = function (action, table, group, grantopt) {
    if (typeof table === 'string' || table instanceof Index) {
      return this.grantTable(action, table, group, grantopt);
    } else if (table instanceof Property) {
      return this.grantColumn(action, table.index, table.name, group, grantopt);
    }
    throw new Error("Incorrect input for grant");
  };

  State.prototype.grantTable = function (action, table, group, grantopt) {
    var self = this;
    grantopt = grantopt || 'N';
    action   = action || 'read';
    if (typeof table === 'string') {
      table = self.get(table);
    }
    if (typeof group === 'string') {
      group = self.get('SysGroup').getByProperties({name: group});
    }

    self.checkGrantTablePermission(action, table, self.getGroup());

    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('group').equals(group) &&
          auth.get('tname').equals(table.name) &&
          auth.get('grantopt').equals(grantopt)) {

        // read/update are column actions
        if (action === 'read' || action === 'update') {
          auth.set(action, 'All');

          // cleanup column tables if both column actions are All
          if (auth.get('read').equals('All') && auth.get('update').equals('All')) {
            self.get('SysColAuth').all().forEach(function (colAuth) {
              if (colAuth.get('group').equals(group) &&
                  colAuth.get('tname').equals(table.name) &&
                  colAuth.get('grantopt').equals(grantopt)) {
                colAuth.delete();
              }
            });

          // Otherwise correct the column permissions for granted right
          } else {
            self.get('SysColAuth').all().forEach(function (colAuth) {
              if (colAuth.get('group').equals(group) &&
                  colAuth.get('tname').equals(table.name) &&
                  colAuth.get('grantopt').equals(grantopt)) {
                colAuth.set(action, 'Y');
              }
            });
          }

        // create/delete are table actions
        } else {
          auth.set(action, 'Y');
        }

        console.log('granted '+ action + ' to ' + group.get('name').get() + ' grantopt: ' + grantopt);
      }
    });
    

    // Perform same grant on the proxy table of CSet properties of given table
    table.forEachProperty(function (property) {
      if (property.CType.prototype === CSetPrototype) {
        console.log(property.CType.prototype);
        self.grantTable(action, property.CType.entity, group, grantopt);
      }
    });
    console.log('granted read to ' + group.get('name').get() + ' grantOpt: ' + grantopt);
    return this;
  };

  State.prototype.grantColumn = function (action, table, columnName, group, grantopt) {
    var col;
    var self = this;
    var granted = false;
    grantopt = grantopt || 'N';
    action   = action || 'read';
    if (typeof table === 'string') {
      table = self.get(table);
    }
    if (typeof group === 'string') {
      group = self.get('SysGroup').getByProperties({name: group});
    }

    // If column is a CSet, perform grant on proxy table instead
    var property = table.getProperty(columnName);
    if (property.CType.prototype === CSetPrototype) {
      return self.grantTable(action, property.CType.entity, group, grantopt);
    }

    self.checkGrantColumnPermission(action, table, columnName, self.getGroup());
    
    self.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('group').equals(group) &&
          auth.get('tname').equals(table.name) &&
          auth.get('grantopt').equals(grantopt)) {

        // Already have full table permission for this action
        if (auth.get(action).equals('All')) {
          return;
        }

        // reorganize column rows
        if (auth.get('update').equals('None') && auth.get('read').equals('None')) {

          // puplate the column rows
          table.forEachProperty(function (property) {
            var colAuth = ColAuth.create();
            colAuth.set('group', group)
                   .set('tname', tname)
                   .set('cname', property.name)
                   .set('read', 'N')
                   .set('update', 'N')
                   .set('grantopt', grantopt);
          });
        }

        // perform the actual grant
        self.get('SysColAuth').all().forEach(function (colAuth) {
          if (colAuth.get('group').equals(group) &&
              colAuth.get('tname').equals(table.name) &&
              colAuth.get('cname').equals(columnName) &&
              colAuth.get('grantopt').equals(grantopt)) {
            colAuth.set(action, 'Y');
          }
        });
        console.log('granted '+ action + ' to ' + group.get('name').get() + ' grantopt: ' + grantopt);
      }
    });

    return this;
  };

  State.prototype.checkTablePermission = function (action, index, group) {
    if (!this.authedForTable(action, index, group)) {
      throw new Error("Not authorized to perform " + action + " on " + index.name);
    }
  };

  State.prototype.checkColumnPermission = function (action, index, columnName, group) {
    if (!this.authedForColumn(action, index, columnName, group)) {
      throw new Error("Not authorized to perform " + action + " on " + index.name + "." + columnName);
    }
  };

  State.prototype.checkGrantTablePermission = function (action, table, grantingGroup) {
    if (!this.canGrantTable(action, table, grantingGroup)) {
      throw new Error("You don't have " + action + " grant permissions for " + table.name);
    }
  };

  State.prototype.checkGrantColumnPermission = function (action, table, columnName, grantingGroup) {
    if (!this.canGrantColumn(action, table, columnName, grantingGroup)) {
      throw new Error("You (" + grantingGroup.get('name').get() + ") don't have " + action + " grant permissions for " + table.name + "." + columnName);
    }
  };

  State.prototype.getGroup = function () {
    throw new Error("should be implemented by client/server");
  };

  State.prototype.canGrantTable = function (action, table, grantingGroup) {
    var self = this;
    var Auth = this.get('SysAuth');
    var permission = Auth.where(function (auth) {
      return (auth.get('group').equals(grantingGroup) &&
              auth.get('tname').equals(table.name) &&
              (auth.get(action).equals('Y') || auth.get(action).equals('All')) &&
              auth.get('grantopt').equals('Y'));
    }).all().length > 0;
    return permission;
  };

  State.prototype.canGrantColumn = function (action, table, columnName, grantingGroup) {
    var self = this;

    // Only read and update can be granted column-wise
    if (action !== 'read' && action !== 'update') {
      return false;
    }

    // If we can grant the whole table it is ok
    if (self.canGrant(action, table, grantingGroup)) {
      return true;
    }

    // Otherwise look for the specific column row
    var ColAuth = this.get('SysColAuth');
    var permission = ColAuth.where(function (colAuth) {
      return (colAuth.get('group').equals(grantingGroup) &&
              colAuth.get('tname').equals(table.name) &&
              colAuth.get(action).equals('Y') &&
              colAuth.get('grantopt').equals('Y'));
    }).all().length > 0;
    return permission;
  };
}

module.exports = addAuthentication;