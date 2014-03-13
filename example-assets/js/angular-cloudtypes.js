/**
 * Created by ticup on 17/11/13.
 */
angular
    .module('cloudtypes', [])
    .service('$client', function ($window) {
      var status = 'disconnected';

      // Callbacks
      var connected    = [];
      var disconnected = [];
      var reconnected  = [];
      var yieldclbcks  = [];


      var stopYielding = function () {};

      // Start the periodic yielding (every ms)
      function startYielding(ms) {
        API.stopYielding();
        ms = ms || 1000;
        var yielding = setInterval(function () {
          yieldclbcks.forEach(function (clbck) { clbck(); });
        }, ms);
        API.stopYielding = function() { clearInterval(yielding); };
        return this;
      }


      // Add callback to periodic yielding
      function onYield(clbck) {
        yieldclbcks.push(clbck);
      }

      var API = {
        // Yielding functions
        stopYielding  : function () { },
        startYielding : startYielding,
        onYield       : onYield,

        // CloudTypes Client
        client: CloudTypes.createClient(),
        connect: function connect(host, ms) {
          this.client.connect(host, function (state) {
            status = 'connected';
            connected.forEach(function (clbck) { clbck(state); });
            startYielding(ms);
            onYield(function () { state.yield(); });
          }, function (state) {
            status = 'reconnected';
            reconnected.forEach(function (clbck) { clbck(state); });
          }, function () {
            status = 'disconnected';
            disconnected.forEach(function (clbck) { clbck(); });
          });
          return this;
        },
        reconnect: function reconnect() {
          this.client.reconnect();
        },
        disconnect: function disconnect() {
          this.client.disconnect();
        },

        // CloudTypes Client event handlers
        onConnect: function (callback) {
          connected.push(callback);
          if (status == 'connected') {
            callback();
          }
        },
        onReconnect: function (callback) {
          reconnected.push(callback);
          if (status == 'reconnected') {
            callback();
          }
        },
        onDisconnect: function (callback) {
          disconnected.push(callback);
          if (status == 'disconnected') {
            callback();
          }
        }
      };

      $window.client = API.client;
      return API;
    })

    // Connects to the CloudTypes server and provides a promise for a state.
    .service('$state', function ($window, $q, $client) {
      var deferred = $q.defer();

      $client.connect($window.location.hostname, 1000)
             .onConnect(function (state) {
        $window.state = state; // debug
        deferred.resolve(state);
      });

      return deferred.promise;
    })

    // Takes a function that produces an array of ArrayEntry or EntityEntry objects (produced by all()/entities(name) methods)
    // and creates a cached array with it. Calling update on the array will execute the provided function to update the array, but the
    // cached array will make sure existing entries (from a previous update) will be reused. This is kind of necessary for decent AngularJS
    // integration, otherwise your whole UI will be redrawn every yield.
    .service('$cachedArray', function () {
      function CachedArray(getArray) {
        this.getArray = getArray;
        this.entries = {};
        this.array = [];
        this.update();
      }

      // updates the cached array by getting the new array, reusing exisiting entries and returning the new array to be used on the model.
      CachedArray.prototype.update = function () {
        var entries = this.entries;
        var newEntries = {};

        this.array = this.getArray().map(function (item) {
          var idx = item.key();
          var entry = entries[idx];
          if (entry)
            item = entry;
          newEntries[idx] = item;
          return item;
        });

        this.entries = newEntries;
        return this.array;
      };

      return {
        create: function (getArray) {
          return new CachedArray(getArray);
        }
      };
    })

    .service('$Index', function () {
      return CloudTypes.Index;
    })

    .service('$Table', function () {
      return CloudTypes.Table;
    })

    .service('$CInt', function () {
      return CloudTypes.CInt;
    })

    .service('$CString', function () {
      return CloudTypes.CString;
    });

    // .service('$cachedRows', function () {
    //   function CachedRows(getRows) {
    //     this.getRows = getRows;
    //     this.entries = {};
    //     this.tables = [];
    //     this.update();
    //   }

    //   // updates the cached tables by getting the new array of tables, reusing exisiting entries and returning the new tables to be used on the model.
    //   CachedTables.prototype.update = function () {
    //     var entries = this.entries;
    //     var newEntries = {};

    //     this.tables = this.getTables().map(function (table) {
    //       var idx = table.name;
    //       var entry = entries[idx];
    //       if (entry)
    //         table = entry;
    //       newEntries[idx] = table;
    //       return table;
    //     });

    //     this.entries = newEntries;
    //     return this.tables;
    //   };

    //   return {
    //     create: function (getTables) {
    //       return new CachedTables(getTables);
    //     }
    //   };
    // })


    // .service('$cachedTables', function () {
    //   function CachedTables(getTables) {
    //     this.getTables = getTables;
    //     this.entries = {};
    //     this.tables = [];
    //     this.rows = {};
    //     this.update();
    //   }

    //   // updates the cached tables by getting the new array of tables, reusing exisiting entries and returning the new tables to be used on the model.
    //   CachedTables.prototype.update = function () {
    //     var entries = this.entries;
    //     var rows = this.rows;
    //     var newEntries = {};

    //     this.tables = this.getTables().map(function (table) {
    //       var idx = table.name;
    //       var entry = entries[idx];
    //       if (entry)
    //         table = entry;
    //       newEntries[idx] = table;

    //       if (typeof rows === 'undefined') {

    //       }

    //       table.all().forEach(function (row) {
    //         var key = row.serialKey();
    //         var entry = rows[idx];
    //         if (entry)
    //           row = entry;

    //       });

    //       return table;
    //     });

    //     this.entries = newEntries;
    //     return this.tables;
    //   };

    //   return {
    //     create: function (getTables) {
    //       return new CachedTables(getTables);
    //     }
    //   };
    // });