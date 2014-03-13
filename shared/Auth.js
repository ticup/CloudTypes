var Restricted = require('./Restricted');
var Index      = require('./Index');
var Table      = require('./Table');
var CSetPrototype = require('./CSet').CSetPrototype;
var Property = require('./Property');

function addAuthentication(State) {


  /* Granting */
  /************/

  State.prototype.grant = function (action, table, group, grantopt) {
    if (typeof table === 'string' || table instanceof Index) {
      return this.grantTable(action, table, group, grantopt);
    } else if (table instanceof Property) {
      return this.grantColumn(action, table.index, table.name, group, grantopt);
    }
    throw new Error("Incorrect input for grant");
  };

  // Table 
  State.prototype.grantTable = function (action, table, group, grantopt) {
    var self = this;
    grantopt = grantopt || 'N';
    if (typeof table === 'string') {
      table = self.get(table);

    }
    if (typeof group === 'string') {
      group = self.get('SysGroup').getByProperties({name: group});
    }

    // Can we grant action on table?
    self.checkGrantTablePermission(action, table, self.getUser());

    // Do the granting
    self.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('group').equals(group) &&
          auth.get('tname').equals(table.name) &&
          auth.get('grantopt').equals(grantopt)) {
        auth.set(action, 'Y');
      }
    });


    // read/update are column actions, update their column rows accordingly
    if (action === 'read' || action === 'update') {
      self.get('SysColAuth').all().forEach(function (colAuth) {
        if (colAuth.get('group').equals(group) &&
            colAuth.get('tname').equals(table.name) &&
            colAuth.get('grantopt').equals(grantopt)) {
          colAuth.set(action, 'Y');
        }
      });
    }    

    // Perform same grant on the proxy table of CSet properties of given table
    table.forEachProperty(function (property) {
      if (property.CType.prototype === CSetPrototype) {
        // console.log(property.CType.prototype);
        self.grantTable(action, property.CType.entity, group, grantopt);
      }
    });
    console.log('granted read to ' + group.get('name').get() + ' grantOpt: ' + grantopt);
    return this;
  };

  // Column
  State.prototype.grantColumn = function (action, table, columnName, group, grantopt) {
    var col;
    var self = this;
    var granted = false;
    grantopt = grantopt || 'N';

    if (typeof table === 'string') {
      table = self.get(table);
    }
    if (typeof group === 'string') {
      group = self.get('SysGroup').getByProperties({name: group});
    }

    if (action !== 'read' && action !== 'update') {
      throw new Error("Only read and update are column actions");
    }

    // If column is a CSet, perform grant on proxy table instead
    var property = table.getProperty(columnName);
    if (property.CType.prototype === CSetPrototype) {
      return self.grantTable(action, property.CType.entity, group, grantopt);
    }

    // Can we grant action on given column?
    self.checkGrantColumnPermission(action, table, columnName, self.getUser());
    
    // Make the Table accessible
    self.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('group').equals(group) &&
          auth.get('tname').equals(table.name) &&
          auth.get('grantopt').equals(grantopt)) {
        auth.set(action, 'Y');
        console.log('granted '+ action + ' to ' + group.get('name').get() + ' grantopt: ' + grantopt);
      }
    });

    // Do the grant on the column
    self.get('SysColAuth').all().forEach(function (colAuth) {
      if (colAuth.get('group').equals(group) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(columnName) &&
          colAuth.get('grantopt').equals(grantopt)) {
        colAuth.set(action, 'Y');
      }
    });

    return this;
  };



  /* Revoking */
  /***********/

  State.prototype.revoke = function (action, table, group) {
    if (typeof table === 'string' || table instanceof Index) {
      return this.revokeTable(action, table, group);
    } else if (table instanceof Property) {
      return this.revokeColumn(action, table.index, table.name, group);
    }
    throw new Error("Incorrect input for grant");
  };


  // Revoke Table
  State.prototype.revokeTable = function (action, table, group) {
    var self = this;

    if (typeof table === 'string') {
      table = self.get(table);    
    }
    if (typeof group === 'string') {
      group = self.get('SysGroup').getByProperties({name: group});
    }

    // Can we revoke action from table?
    self.checkGrantTablePermission(action, table, self.getUser());

    // Revoke action (both with and without grantopt) from the Table
    self.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('group').equals(group) &&
          auth.get('tname').equals(table.name)) {
          auth.set(action, 'N');
      }
    });

    // Revoke action (both with and without grantopt) from columns if action = column operation
    if (action === 'read' || action === 'update') {
      self.get('SysColAuth').all().forEach(function (colAuth) {
        if (colAuth.get('group').equals(group) &&
            colAuth.get('tname').equals(table.name)) {
          colAuth.set(action, 'N');
        }
      });
    }
      
    console.log('revoked '+ action+ ' from ' + group.get('name').get());
    return this;
  };

  // Revoke Column
  State.prototype.revokeColumn = function (action, table, cname, group) {
    var self = this;
    var tname = table.name;

    if (typeof table === 'string') {
      table = self.get(table);    
    }
    if (typeof group === 'string') {
      group = self.get('SysGroup').getByProperties({name: group});
    }

    // Can we revoke action from column?
    self.checkGrantColumnPermission(action, table, cname, self.getUser());

    // Revoke action from columns
    self.get('SysColAuth').all().forEach(function (colAuth) {
      if (colAuth.get('group').equals(group) &&
          colAuth.get('tname').equals(tname) &&
          colAuth.get('cname').equals(cname)) {
        colAuth.set(action, 'N');
      }
    });

    return this;
  };


  /* Permission Checks */
  /*********************/

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

  State.prototype.checkGrantTablePermission = function (action, table, grantingUser) {
    if (!this.canGrantTable(action, table, grantingUser)) {
      throw new Error("You don't have " + action + " grant permissions for " + table.name);
    }
  };

  State.prototype.checkGrantColumnPermission = function (action, table, columnName, grantingUser) {
    if (!this.canGrantColumn(action, table, columnName, grantingUser)) {
      throw new Error("You (" + grantingUser.get('name').get() + ") don't have " + action + " grant permissions for " + table.name + "." + columnName);
    }
  };


  /* Authed for action */
  /*********************/

  // READ actions
  ////////////////

  // Should this table be available to given user?
  State.prototype.canSeeTable = function (table, user) {
    var self = this;
    var authed = false;
    var group = user.get('group').get();

    // already restricted
    if (table instanceof Restricted)
      return false;

    // Find any (base or view) table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) &&
          auth.get('group').equals(group) &&
          auth.get('read').equals('Y')) {
          authed = true;
      }
    });

    if (!authed) {
      console.log(group.get('name').get() + ' not authed for ' + table.name);
      return false;
    }

    // Has to be authorized for all Tables of keys
    table.keys.forEach(function (key, type) {
      if (type instanceof Table && !self.canSeeTable(type, user)) {
        authed = false;
      }
    });

    return authed;
  };

  // should this column be available to given user?
  State.prototype.canSeeFullColumn = function (table, cname, user) {
    var self = this;
    var authed = false;
    var property = table.getProperty(cname);
    var group = user.get('group').get();

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'T') or for a column on a view on that Table (type = 'V')
      if (colAuth.get('group').equals(group) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('read').equals('Y') &&
          colAuth.get('type').equals('T')) {
        authed = true;
      }
    });

    // If the column is a reference to a table, one must be able to see that table
    if (authed && (property.CType instanceof Index)) {
      authed = self.canSeeTable(property.CType, user);
    }

    return authed;
  };


  // should this column be available to given user?
  State.prototype.canSeeColumn = function (table, cname, user) {
    var self = this;
    var authed = false;
    var property = table.getProperty(cname);
    var group = user.get('group').get();
    
    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'T') or for a column on a view on that Table (type = 'V')
      if (colAuth.get('group').equals(group) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('read').equals('Y')) {
        authed = true;
      }
    });

    // If the column is a reference to a table, one must be able to see that table
    if (authed && (property.CType instanceof Index)) {
      authed = self.canSeeTable(property.CType, user);
    }

    return authed;
  };

  // This is only used when we know that the column is not fully authorized, but by a view.
  State.prototype.canSeeEntryColumn = function (entry, property, user) {
    var self = this;
    var authed = false;
    var table = entry.index;
    var key = entry.uid;
    var group = user.get('group').get();

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'T') or for a column on a view on that Table (type = 'V')
      if (colAuth.get('group').equals(group) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('type').equals('V') &&
          colAuth.get('read').equals('Y')) {
        var view = self.getView(colAuth.get('vname').get());
        if (view.includes(entry)) {
          authed = true;
        }
      }
    });

    return authed;
  };





  State.prototype.authedForRow = function (action, entry, user) {
    var self = this;
    var authed = false;
    var group = user.get('group').get();
    var table = entry.index;

    // already restricted
    if (table instanceof Restricted)
      return false;

    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) &&
          auth.get('group').equals(group) &&
          auth.get(action).equals('Y')) {

        // Authed for whole table
        if (auth.get('type').equals('T')) {
          authed = true;

        // Authed for view
        } else {
          var view = self.getView(colAuth.get('vname').get());
          if (view.includes(entry)) {
            authed = true;
          }
        }
      }
    });

    if (!authed) {
      console.log(group.get('name').get() + ' not authed for ' + table.name);
      return false;
    }

    // Needs to have access to the key entries
    table.keys.forEach(function (key, type, i) {
      if (type instanceof Table) {
        var keyEntry = entry.key(key);
        if (!self.authedForRow('read', keyEntry, user)) {
          authed = false;
        }
      }
    });

    return authed;

  };


  State.prototype.authedForEntry = function (action, entry, property, user) {
    var self = this;
    var authed = true;
    var group = user.get('group').get();
    var table = entry.index;

    // Only read and update actions can be column-wise
    if (action !== 'read' && action !== 'update') {
      throw new Error("Can not be authed for " + action + " on a column");
    }

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // 1) Needs to have access to the key entries
    table.keys.forEach(function (key, type, i) {
      if (type instanceof Table) {
        var keyEntry = entry.key(key);
        if (!self.authedForRow('read', keyEntry, user)) {
          authed = false;
        }
      }
    });

    if (!authed) {
      return false;
    }
    authed = false;

    // 2) Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'R') or for a column on a view on that Table (type = 'V')
      if (colAuth.get('group').equals(group) &&
          colAuth.get('tname').equals(entry.index.name) &&
          colAuth.get('cname').equals(property.name) &&
          colAuth.get(action).equals('Y')) {

        // 2.1) Full column access (Table)
        if (colAuth.get('type').equals('T')) {
          authed = true;

        // 2.2) Column row access (View)
        } else {
          var view = self.getView(colAuth.get('vname').get());
          if (view.includes(entry)) {
            authed = true;
          }
        }
      }
    });

    // 4) If the column is a reference to a table, one must also have access to that row
    // if (authed && (property.CType instanceof Index)) {
    //   authed = self.authedForRow('read', property.CType.getByKey(entry.uid), user);
    // }

    return authed;
  };


  // TABLE actions
  ////////////////
  // State.prototype.canSeeTable = function (action, table, user) {
  //   var self = this;
  //   var authed = false;
  //   var group = user.get('group').get();

  //   // already restricted
  //   if (table instanceof Restricted)
  //     return false;

  //   // Find any (base or view) table authorization
  //   this.get('SysAuth').all().forEach(function (auth) {
  //     if (auth.get('tname').equals(table.name) &&
  //         auth.get('group').equals(group) &&
  //         auth.get(action).equals('Y')) {
  //         authed = true;
  //     }
  //   });

  //   if (!authed) {
  //     console.log(group.get('name').get() + ' not authed for ' + table.name);
  //     return false;
  //   }

  //   // Has to be authorized for all Tables of keys
  //   table.keys.forEach(function (key, type) {
  //     if (type instanceof Table && !self.canSeeTable(type, user)) {
  //       authed = false;
  //     }
  //   });

  //   return authed;
  // };

  // State.prototype.authedForColumn = function (action, table, cname, user) {
  //   var self = this;
  //   var authed = false;
  //   var property = table.getProperty(cname);

  //   // Only read and update actions can be column-wise
  //   if (action !== 'read' && action !== 'update') {
  //     throw new Error("Can not be authed for " + action + " on a column");
  //   }

  //   // Already restricted
  //   if (table instanceof Restricted) {
  //     return false;
  //   }

  //   // Needs to be authed for table and dependencies
  //   // if (!self.authedForTable(action, table, group)) {
  //   //   return false;
  //   // }

  //   // Find column authorization
  //   self.get('SysColAuth').all().forEach(function (colAuth) {

  //     // Either authorized for the normal Table column (type = 'R') or for a column on a view on that Table (type = 'V')
  //     if (colAuth.get('group').equals(group) &&
  //         colAuth.get('tname').equals(table.name) &&
  //         colAuth.get('cname').equals(cname) &&
  //         colAuth.get(action).equals('Y')) {
  //       authed = true;
  //     }
  //   });

  //   // If the column is a reference to a table, one must have given access to that table
  //   if (authed && (property.CType instanceof Index)) {
  //     authed = self.authedForTable(action, property.CType, group);
  //   }

  //   return authed;
  // };


  // State.prototype.authedForRow = function (action, table, )

  // State.prototype.restrictedForTable = function (index, group) {
  //   var self = this;
  //   var restricted = true;

  //   // Already restricted
  //   if (index instanceof Restricted) {
  //     return true;
  //   }

  //   // Find full table authorization
  //   this.get('SysAuth').all().forEach(function (auth) {
  //     if (auth.get('tname').equals(index.name) &&
  //         auth.get('group').equals(group) &&
  //         (auth.get('read').equals('All') || auth.get('read').equals('Some'))) {
  //       restricted = false;
  //     }
  //   });


  //   if (restricted) {
  //         console.log(index.name + ' is restricted for ' + group.get('name').get());
    
  //     return true;
  //   }


  //   // If restricted for any table, it is restricted itself
  //   index.keys.forEach(function (key, type) {
  //     if (type instanceof Table && self.restrictedForTable(type, group)) {
  //       restricted = true;
  //     } 
  //   });

  //   return restricted;
  // };


  State.prototype.getGroup = function () {
    throw new Error("should be implemented by client/server");
  };


  /* Can Grant To Others? */
  /************************/

  // Table
  State.prototype.canGrantTable = function (action, table, grantingUser) {
    var self = this;
    var Auth = this.get('SysAuth');
    var grantingGroup = grantingUser.get('group').get();
    var permission = Auth.where(function (auth) {
      return (auth.get('group').equals(grantingGroup) &&
              auth.get('tname').equals(table.name) &&
              auth.get(action).equals('Y') &&
              auth.get('grantopt').equals('Y'));
    }).all().length > 0;

    // If column action, also needs granting rights over all columns
    if (permission && (action === 'read' || action === 'update')) {
      table.forEachProperty(function (property) {
        if (!self.canGrantColumn(action, table, property.name, grantingUser)) {
          console.log(property.name + " stopped access to grant " + action + " on " + table.name + " for " + grantingGroup.get('name').get());
          permission = false;
        }
      });
    }
    return permission;
  };

  // Column
  State.prototype.canGrantColumn = function (action, table, columnName, grantingUser) {
    var self = this;
    var grantingGroup = grantingUser.get('group').get();

    // Only read and update can be granted column-wise
    if (action !== 'read' && action !== 'update') {
      return false;
    }

    // Find the authorizing row
    var permission = self.get('SysColAuth').where(function (colAuth) {
      return (colAuth.get('group').equals(grantingGroup) &&
              colAuth.get('tname').equals(table.name) &&
              colAuth.get(action).equals('Y') &&
              colAuth.get('grantopt').equals('Y'));
    }).all().length > 0;
    return permission;
  };
}

module.exports = addAuthentication;