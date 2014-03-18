var Restricted = require('./Restricted');
var Index      = require('./Index');
var Table      = require('./Table');
var CSetPrototype = require('./CSet').CSetPrototype;
var Property = require('./Property');
var IndexEntry = require('./IndexEntry');

function addAuthentication(State) {


  /* Granting */
  /************/

  /* grant('action',
   *       tableRef || 'tablename' || propertyRef,
   *       userRef || 'userName',
   *       [grantopt])
   */
  
  State.prototype.grant = function (action, table, user, grantopt) {
    var self = this;

    if (typeof grantopt === 'undefined') {
      grantopt = 'N';
    }

    // if (typeof user === 'string') {
    //   user = self.get('SysUser').getByProperties({name: user});
    // }

    if (!(user instanceof IndexEntry) || (!user.isEntryOf(self.get('SysUser')) && !user.isEntryOf(self.get('SysGroup')))) {
      throw new Error("Must give either a SysUser or a SysGroup entry, given: " + user);
    }

    if (typeof table === 'string') {

      // table name was given
      var theTable = self.get(table);    
      if (typeof theTable !== 'undefined') {
        return this.grantTable(action, theTable, user, grantopt);
      }
    }

    if (table instanceof Index) {
      return this.grantTable(action, table, user, grantopt);
    }

    if (table instanceof Property) {
      return this.grantColumn(action, table.index, table.name, user, grantopt);
    }

    throw new Error("Incorrect input for grant");
  };


  State.prototype.grantView = function (action, view, column, user, grantopt) {
    var self = this;
    
    if (typeof user === 'undefined') {
      user = 'N';
    }

    // granting complete view
    if (user === 'Y' || user === 'N') {
      grantopt = user;
      user = column;
      if (typeof user === 'string') {
        user = self.get('SysUser').getByProperties({name: user});
      }

      var theView = self.views.get(view);
      if (typeof theView !== 'undefined') {
        return this.grantViewTable(action, theView, user, grantopt);
      }

    // granting column on view
    } else {

      if (typeof grantopt === 'undefined') {
        grantopt = 'N';
      }

      if (typeof user === 'string') {
        user = self.get('SysUser').getByProperties({name: user});
      }

      var theView = self.views.get(view);
      if (typeof theView !== 'undefined') {
        return this.grantViewColumn(action, theView, column, user, grantopt);
      }

    }

    throw new Error("Incorrect input for grantView");
  };




  // Table 
  State.prototype.grantTable = function (action, table, user, grantopt) {
    var self = this;
    var group = null;
    var granted = false;

    if (user.isEntryOf(self.get('SysGroup'))) {
      group = user;
    }

    // Can we grant action on table?
    self.checkGrantTablePermission(action, table, self.getUser());

    // Do the granting
    self.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('type').equals('T') &&
          auth.get('tname').equals(table.name) &&
          auth.get('grantopt').equals(grantopt) &&
          (group ? auth.get('group').equals(group) : auth.get('user').equals(user)) &&
          auth.get('priv').equals(action)) {
        auth.set('active', 'Y');
        granted = true;
      }
    });
              
    if (!granted) {
      var auth = self.get('SysAuth').create();
      auth.set('type', 'T')
          .set('tname', table.name)
          .set('grantopt', grantopt)
          .set('priv', action)
          .set('active', 'Y');
      (group ? auth.set('group', group) : auth.set('user', user));

    }

    // Grant to all columns if column action (read/update)
    if (action === 'read' || action === 'update') {
      table.forEachProperty(function (property) {
        granted = false;
        self.get('SysColAuth').all().forEach(function (colAuth) {
          if (colAuth.get('type').equals('T') &&
              colAuth.get('tname').equals(table.name) &&
              colAuth.get('grantopt').equals(grantopt) &&
              (group ? colAuth.get('group').equals(group) : colAuth.get('user').equals(user)) &&
              colAuth.get('priv').equals(action)) {
            colAuth.set('active', 'Y');
            granted = true;
          }
        });

        if (!granted) {
          var auth = self.get('SysColAuth').create();
          auth.set('type', 'T')
              .set('tname', table.name)
              .set('cname', property.name)
              .set('grantopt', grantopt)
              .set('priv', action)
              .set('active', 'Y');
          (group ? auth.set('group', group) : auth.set('user', user));
        }
      }); 
    }   
    

    // Perform same grant on the proxy table of CSet properties of given table
    table.forEachProperty(function (property) {
      if (property.CType.prototype === CSetPrototype) {
        // console.log(property.CType.prototype);
        self.grantTable(action, property.CType.entity, user, grantopt);
      }
    });
    console.log('granted read to ' + user.get('name').get() + ' grantOpt: ' + grantopt);
    return this;
  };

    // Table 
  State.prototype.grantViewTable = function (action, view, user, grantopt) {
    var self = this;

    console.log('granting ' + action + ' on ' + view.name + ' for ' + user.get('name').get() + ' with ' + grantopt);
    // Can we grant action on table?
    self.checkGrantViewPermission(action, view, self.getUser());

    console.log('granted');
    // Do the granting
    self.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('user').equals(user) &&
          auth.get('type').equals('V') &&
          auth.get('vname').equals(view.name) &&
          auth.get('grantopt').equals(grantopt)) {
        auth.set(action, 'Y');
      }
    });


    // read/update are column actions, update their column rows accordingly
    if (action === 'read' || action === 'update') {
      self.get('SysColAuth').all().forEach(function (colAuth) {
        if (colAuth.get('user').equals(user) &&
            colAuth.get('type').equals('V') &&
            colAuth.get('vname').equals(view.name) &&
            colAuth.get('grantopt').equals(grantopt)) {
          colAuth.set(action, 'Y');
        }
      });
    }   

    // Perform same grant on the proxy table of CSet properties of given table
    // table.forEachProperty(function (property) {
    //   if (property.CType.prototype === CSetPrototype) {
    //     // console.log(property.CType.prototype);
    //     self.grantView(action, property.CType.entity, user, grantopt);
    //   }
    // });
    console.log('granted read to ' + user.get('name').get() + ' grantOpt: ' + grantopt);
    return this;
  };

  // Column
  State.prototype.grantColumn = function (action, table, columnName, user, grantopt) {
    var col;
    var self = this;
    var granted = false;
    grantopt = grantopt || 'N';

    if (action !== 'read' && action !== 'update') {
      throw new Error("Only read and update are column actions");
    }

    // If column is a CSet, perform grant on proxy table instead
    var property = table.getProperty(columnName);
    if (property.CType.prototype === CSetPrototype) {
      return self.grantTable(action, property.CType.entity, user, grantopt);
    }

    // Can we grant action on given column?
    self.checkGrantColumnPermission(action, table, columnName, self.getUser());

    // Do the grant on the column
    self.get('SysColAuth').all().forEach(function (colAuth) {
      if (colAuth.get('user').equals(user) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(columnName) &&
          colAuth.get('type').equals('T') &&
          colAuth.get('priv').equals(action) &&
          colAuth.get('grantopt').equals(grantopt)) {
        colAuth.set('active', 'Y');
        granted = true;
      }
    });

    if (!granted) {
      var auth = self.get('SysColAuth').create();
      auth.set('type', 'T')
          .set('tname', table.name)
          .set('cname', columnName)
          .set('grantopt', grantopt)
          .set('user', user)
          .set('priv', action)
          .set('active', 'Y');
    }

    return this;
  };

  // ViewColumn
  State.prototype.grantViewColumn = function (action, view, columnName, user, grantopt) {
    var col;
    var self = this;
    var granted = false;

    if (action !== 'read' && action !== 'update') {
      throw new Error("Only read and update are column actions");
    }

    // If column is a CSet, perform grant on proxy table instead
    
    // var property = table.getProperty(columnName);
    // if (property.CType.prototype === CSetPrototype) {
    //   return self.grantTable(action, property.CType.entity, user, grantopt);
    // }

    // Can we grant action on given column?
    self.checkGrantColumnPermission(action, table, columnName, self.getUser());
    
    // Make the Table accessible
    self.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('user').equals(user) &&
          auth.get('type').equals('V') &&
          auth.get('vname').equals(view.name) &&
          auth.get('grantopt').equals(grantopt)) {
        auth.set(action, 'Y');
        console.log('granted '+ action + ' to ' + user.get('name').get() + ' grantopt: ' + grantopt);
      }
    });

    // Do the grant on the column
    self.get('SysColAuth').all().forEach(function (colAuth) {
      if (colAuth.get('user').equals(user) &&
          colAuth.get('type').equals('V') &&
          colAuth.get('vname').equals(view.name) &&
          colAuth.get('cname').equals(columnName) &&
          colAuth.get('grantopt').equals(grantopt)) {
        colAuth.set(action, 'Y');
      }
    });

    return this;
  };



  /* Revoking */
  /***********/

  State.prototype.revoke = function (action, table, user) {
    var self = this;
    if (typeof user === 'string') {
      user = self.get('SysUser').getByProperties({name: user});
    }

    if (typeof table === 'string') {

      // table name was given
      var theTable = self.get(table);    
      if (typeof theTable !== 'undefined') {
        return this.revokeTable(action, theTable, user);
      }

    }

    if (table instanceof Index) {
      return this.revokeTable(action, table, user);
    }

    if (table instanceof Property) {
      return this.revokeColumn(action, table.index, table.name, user);
    }

    throw new Error("Incorrect input for revoke");
  };


  State.prototype.revokeView = function (action, view, column, user) {
    var self = this;
    
    if (typeof user === 'undefined') {
      user = 'N';
    }

    // granting complete view
    if (user === 'Y' || user === 'N') {
      user = column;
      if (typeof user === 'string') {
        user = self.get('SysUser').getByProperties({name: user});
      }

      var theView = self.views.get(view);
      if (typeof theView !== 'undefined') {
        return this.revokeViewTable(action, theView, user);
      }

    // granting column on view
    } else {

      if (typeof user === 'string') {
        user = self.get('SysUser').getByProperties({name: user});
      }

      var theView = self.views.get(view);
      if (typeof theView !== 'undefined') {
        return this.revokeViewColumn(action, theView, column, user);
      }

    }

    throw new Error("Incorrect input for grantView");
  };

  // Revoke View
  State.prototype.revokeViewTable = function (action, view, user) {
    var self = this;

    console.log('Revoking view ' + view.name);
    // Can we revoke action from table?
    self.checkGrantViewPermission(action, view, self.getUser());
    console.log('allowed');
    // Revoke action (both with and without grantopt) from the Table
    self.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('user').equals(user) &&
          auth.get('vname').equals(view.name) &&
          auth.get('type').equals('V')) {
          auth.set(action, 'N');
      }
    });
    console.log('removing columns');
    // Revoke action (both with and without grantopt) from columns if action = column operation
    if (action === 'read' || action === 'update') {
      self.get('SysColAuth').all().forEach(function (colAuth) {
        if (colAuth.get('user').equals(user) &&
            colAuth.get('vname').equals(view.name) &&
            colAuth.get('type').equals('V')) {
          colAuth.set(action, 'N');
        }
      });
    }
      
    console.log('revoked '+ action+ ' from ' + user.get('name').get() + ' on view ' + view.name);
    return this;
  };


  // Revoke Table
  State.prototype.revokeTable = function (action, table, user) {
    var self = this;

    console.log('checking permission');
    // Can we revoke action from table?
    self.checkGrantTablePermission(action, table, self.getUser());
    console.log('allowed');
    // Revoke action (both with and without grantopt) from the Table
    self.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('user').equals(user) &&
          auth.get('tname').equals(table.name) &&
          auth.get('type').equals('T') &&
          auth.get('priv').equals(action)) {
        auth.set('active', 'N');
      }
    });
    console.log('removing columns');
    // Revoke action (both with and without grantopt) from columns if action = column operation
    if (action === 'read' || action === 'update') {
      self.get('SysColAuth').all().forEach(function (colAuth) {
        if (colAuth.get('user').equals(user) &&
            colAuth.get('tname').equals(table.name) &&
            colAuth.get('type').equals('T') &&
            colAuth.get('priv').equals(action)) {
          colAuth.set('active', 'N');
        }
      });
    }
      
    console.log('revoked '+ action+ ' from ' + user.get('name').get());
    return this;
  };

  // Revoke Column
  State.prototype.revokeColumn = function (action, table, cname, user) {
    var self = this;
    var tname = table.name;

    // Can we revoke action from column?
    self.checkGrantColumnPermission(action, table, cname, self.getUser());

    // Revoke action from columns
    self.get('SysColAuth').all().forEach(function (colAuth) {
      if (colAuth.get('user').equals(user) &&
          colAuth.get('tname').equals(tname) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('type').equals('T') &&
          colAuth.get('priv').equals(action)) {
        colAuth.set('active', 'N');
      }
    });

    return this;
  };


  // Revoke Column
  State.prototype.revokeViewColumn = function (action, view, cname, user) {
    var self = this;

    // Can we revoke action from column?
    self.checkGrantViewColumnPermission(action, view, cname, self.getUser());

    // Revoke action from columns
    self.get('SysColAuth').all().forEach(function (colAuth) {
      if (colAuth.get('user').equals(user) &&
          colAuth.get('vname').equals(view.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('type').equals('V')) {
        colAuth.set(action, 'N');
      }
    });

    return this;
  };





  /* Deny: negative authorization */
  /********************************/
  /* Not allowed on Views, only on Tables and columns */

  // State.prototype.deny = function (action, table, cname, user) {
  //   var self = this;
    
  //   // Denying table
  //   if (typeof user === 'undefined') {
  //     user = cname;

  //     if (typeof user === 'string') {
  //       user = self.get('SysUser').getByProperties({name: user});
  //     }

  //     if (typeof table === 'string') {
  //       table = self.get(table);
  //     }

  //     if (typeof table !== 'undefined') {
  //       return this.denyTable(action, table, user);
  //     }

  //   }

  //   throw new Error("Incorrect input for grantView");
  // };

  // // Deny Table
  // State.prototype.denyTable = function (action, table, user) {
  //   var self = this;

  //   console.log('checking permission for denial of ' + action + ' on ' + table.name + ' for ' + user.get('name').get());
  //   // Can we revoke action from table?
  //   self.checkGrantTablePermission(action, table, self.getUser());
  //   console.log('allowed');

  //   // Already denied
  //   if (self.isTableDenied(action, table, user)) {
  //     return this;
  //   }
  //   console.log('not denied yet');

  //   // Add negative authorization for Table
  //   var auth = self.get('SysAuth').create();
  //   auth.set('user', user)
  //       .set('tname', table.name)
  //       .set('type', 'T')
  //       .set('privtype', '-')
  //       .set(action, 'Y');
      
  //   console.log('denied '+ action+ ' from ' + table.name + ' for ' + user.get('name').get());
  //   return this;
  // };


  // State.prototype.isTableDenied = function (action, table, user) {
  //   var self = this;
  //   return self.get('SysAuth').where(function (auth) {
  //     return auth.get('user').equals(user) &&
  //            auth.get('tname').equals(table.name) &&
  //            auth.get('privtype').equals('-') &&
  //            auth.get('type').equals('T') &&
  //            auth.get(action).equals('Y');
  //   }).all().length > 0;
  // }

  // State.prototype.isColumnDenied = function (action, table, cname, user) {
  //   var self = this;
  //   return self.get('SysColAuth').where(function (auth) {
  //     return auth.get('user').equals(user) &&
  //            auth.get('tname').equals(table.name) &&
  //            auth.get('cname').equals(cname) &&
  //            auth.get('privtype').equals('-') &&
  //            auth.get('type').equals('T')) &&
  //            auth.get(action).equals('Y');
  //   }).all().length > 0;
  // };



  /* Permission Checks */
  /*********************/

  // State.prototype.checkTablePermission = function (action, index, user) {
  //   if (!this.authedForTable(action, index, user)) {
  //     throw new Error("Not authorized to perform " + action + " on " + index.name);
  //   }
  // };

  // State.prototype.checkColumnPermission = function (action, index, columnName, group) {
  //   if (!this.authedForColumn(action, index, columnName, group)) {
  //     throw new Error("Not authorized to perform " + action + " on " + index.name + "." + columnName);
  //   }
  // };

  State.prototype.checkEntryPropertyPermission = function (action, entry, property, user) {
    if (!this.authedForEntryProperty(action, entry, property, user)) {
      throw new Error("Not authorized to perform " + action + " on " + property.index.name + "." + property.name);
    }
  };

  State.prototype.checkCreateOnTablePermission = function (table, grantingUser) {
    if (!this.canCreateOnTable(table, grantingUser)) {
      throw new Error("You don't have create access for " + table.name);
    }
  };



  State.prototype.checkGrantTablePermission = function (action, table, grantingUser) {
    if (!this.canGrantTable(action, table, grantingUser)) {
      throw new Error("You don't have " + action + " grant permissions for " + table.name);
    }
  };


  State.prototype.checkGrantViewPermission = function (action, view, grantingUser) {
    if (!this.canGrantView(action, view, grantingUser)) {
      throw new Error("You don't have " + action + " grant permissions for " + table.name);
    }
  };


  State.prototype.checkGrantColumnPermission = function (action, table, columnName, grantingUser) {
    if (!this.canGrantColumn(action, table, columnName, grantingUser)) {
      throw new Error("You (" + grantingUser.get('name').get() + ") don't have " + action + " grant permissions for " + table.name + "." + columnName);
    }
  };

    State.prototype.checkGrantViewColumnPermission = function (action, view, columnName, grantingUser) {
    if (!this.canGrantViewColumn(action, view, columnName, grantingUser)) {
      throw new Error("You (" + grantingUser.get('name').get() + ") don't have " + action + " grant permissions for " + view.name + "." + columnName);
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

    // already restricted
    if (table instanceof Restricted)
      return false;

    // Find any (base or view) table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) &&
          auth.get('user').equals(user) &&
          auth.get('priv').equals('read') &&
          auth.get('active').equals('Y')) {
        authed = true;
      }
    });

    if (!authed) {
      console.log(user.get('name').get() + ' not authed for ' + table.name);
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

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'T') or for a column on a view on that Table (type = 'V')
      if (colAuth.get('user').equals(user) &&
          colAuth.get('type').equals('T') &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('priv').equals('read') &&
          colAuth.get('active').equals('Y')) {
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

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'T') or for a column on a view on that Table (type = 'V')
      if (colAuth.get('user').equals(user) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('priv').equals('read') &&
          colAuth.get('active').equals('Y')) {
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

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'T') or for a column on a view on that Table (type = 'V')
      if (colAuth.get('user').equals(user) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('type').equals('V') &&
          colAuth.get('priv').equals(action) &&
          colAuth.get('active').equals('Y')) {
        var view = self.views.get(colAuth.get('vname').get());
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
    var table = entry.index;


    // console.log(user.get('name').get() + ' authed for row ' + entry.uid + '?');

    // already restricted
    if (table instanceof Restricted)
      return false;

    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) &&
          auth.get('user').equals(user) &&
          auth.get('priv').equals(action) &&
          auth.get('active').equals('Y')) {

        // Authed for whole table
        if (auth.get('type').equals('T')) {
          authed = true;

        // Authed for view
        } else {
          var view = self.views.get(auth.get('vname').get());
          if (view.includes(entry)) {
            authed = true;
          }
        }
      }
    });

    if (!authed) {
      
      // Implicit authorization for delete
      if (action === 'delete') {
        console.log('looking for implicit delete authorization');
        table.keys.forEach(function (key, type, i) {
        // TODO: change to Index, when indexes are taken into account
          if (type instanceof Table) {
            var keyEntry = entry.key(key);
            if (self.authedForRow(action, keyEntry, user)) {
              authed = true;
            }
          }
        });
      } else {
        console.log(user.get('name').get() + ' not authed for ' + table.name);
        return false;
      } 
    }


    

    // Needs to have read access to the key entries
    table.keys.forEach(function (key, type, i) {
      if (type instanceof Table) {
        var keyEntry = entry.key(key);
        
        // key is restricted
        if (!keyEntry) {
          authed = false;
          return;
        }
        if (!self.authedForRow('read', keyEntry, user)) {
          console.log(user.get('name').get() + ' not authed for ' + table.name + ' because no read access for keys');
          authed = false;
        }
      }
    });

    return authed;
  };


  State.prototype.authedForEntryProperty = function (action, entry, property, user) {
    var self = this;
    var authed = true;
    var table = entry.index;
    var cname = property.name;

    // console.log('checking ' + action + ' on ' + table.name + '.' + cname);

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
          console.log('not authed for the rows of the keys!');
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
      if (colAuth.get('user').equals(user) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('priv').equals(action) &&
          colAuth.get('active').equals('Y')) {

        // 2.1) Full column access (Table)
        if (colAuth.get('type').equals('T')) {
              authed = true;

        // 2.2) Column row access (View)
        } else {
          var view = self.views.get(colAuth.get('vname').get());
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
  State.prototype.canCreateOnTable = function (table, user) {
    var self = this;
    var permission = false;

    // already restricted
    if (table instanceof Restricted)
      return false;

    // Find any (base or view) table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) &&
          auth.get('user').equals(user) &&
          auth.get('type').equals('T') &&
          auth.get('priv').equals('create') &&
          auth.get('active').equals('Y')) {
          permission = true;
      }
    });

    if (!permission) {
      console.log(user.get('name').get() + ' not authed for create on ' + table.name);
      return false;
    }

    // Has to be authorized for all Tables of keys
    // table.keys.forEach(function (key, type) {
    //   if (type instanceof Table && !self.canSeeTable(type, user)) {
    //     authed = false;
    //   }
    // });

    return permission;
  };
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
    var permission = Auth.where(function (auth) {
      return (auth.get('user').equals(grantingUser) &&
              auth.get('tname').equals(table.name) &&
              auth.get('priv').equals(action) &&
              auth.get('active').equals('Y') &&
              auth.get('grantopt').equals('Y'));
    }).all().length > 0;

    // If column action, also needs granting rights over all columns
    if (permission && (action === 'read' || action === 'update')) {
      table.forEachProperty(function (property) {
        if (!self.canGrantColumn(action, table, property.name, grantingUser)) {
          console.log(property.name + " stopped access to grant " + action + " on " + table.name + " for " + grantingUser.get('name').get());
          permission = false;
        }
      });
    }

    return permission;
  };

  // View
  State.prototype.canGrantView = function (action, view, grantingUser) {
    var self = this;
    var Auth = this.get('SysAuth');
    var permission = Auth.where(function (auth) {
      return (auth.get('user').equals(grantingUser) &&
              auth.get('type').equals('V') &&
              auth.get('vname').equals(view.name) &&
              auth.get('priv').equals(action) &&
              auth.get('active').equals('Y') &&
              auth.get('grantopt').equals('Y'));
    }).all().length > 0;

    // If column action, also needs granting rights over all columns
    if (permission && (action === 'read' || action === 'update')) {
      view.table.forEachProperty(function (property) {
        if (!self.canGrantViewColumn(action, view, property.name, grantingUser)) {
          console.log(property.name + " stopped access to grant " + action + " on " + view.name + " for " + grantingUser.get('name').get());
          permission = false;
        }
      });
    }

    return permission;
  };

  // Column
  State.prototype.canGrantColumn = function (action, table, columnName, grantingUser) {
    var self = this;

    // Only read and update can be granted column-wise
    if (action !== 'read' && action !== 'update') {
      return false;
    }

    // Find the authorizing row
    var permission = self.get('SysColAuth').where(function (colAuth) {
      return (colAuth.get('user').equals(grantingUser) &&
              colAuth.get('tname').equals(table.name) &&
              colAuth.get('priv').equals(action) &&
              colAuth.get('active').equals('Y') &&
              colAuth.get('grantopt').equals('Y'));
    }).all().length > 0;
    return permission;
  };

  // View Column
  State.prototype.canGrantViewColumn = function (action, view, columnName, grantingUser) {
    var self = this;

    // Only read and update can be granted column-wise
    if (action !== 'read' && action !== 'update') {
      return false;
    }

    // Find the authorizing row
    var permission = self.get('SysColAuth').where(function (colAuth) {
      return (colAuth.get('user').equals(grantingUser) &&
              colAuth.get('type').equals('V') &&
              colAuth.get('vname').equals(view.name) &&
              colAuth.get('priv').equals(action) &&
              colAuth.get('active').equals('Y') &&
              colAuth.get('grantopt').equals('Y'));
    }).all().length > 0;
    return permission;
  };


}

module.exports = addAuthentication;