(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var CIntModule = require('../shared/CInt');
var CInt = CIntModule.CInt;

module.exports = CIntModule;

// var update = CInt.prototype.set;
// CInt.prototype.set = function (val) {
//   this.entry.index.state.checkEntryPropertyPermission('update', this.entry, this.property, this.entry.index.state.getUser());
//   update.call(this, val);
// };
},{"../shared/CInt":17}],2:[function(require,module,exports){
var CStringModule = require('../shared/CString');
var CString = CStringModule.CString;

module.exports = CStringModule;

// var update = CString.prototype.set;
// CString.prototype.set = function (val) {
//   console.log(this.entry);
//   console.log(this.property);
//   this.entry.index.state.checkEntryPropertyPermission('update', this.entry, this.property, this.entry.index.state.getUser());
//   update.call(this, val);
// };
},{"../shared/CString":19}],3:[function(require,module,exports){
var State = require('../shared/State');
var CSetPrototype  = require('../shared/CSet').CSetPrototype;
var Restricted = require('../shared/Restricted');
var Index = require('../shared/Index');
var Table = require('./Table');

module.exports = State;

State.prototype.init = function (cid, client) {
  this.pending  = false;
  this.received = false;
  this.cid      = cid;
  this.uid      = 0;
  this.client   = client;
};

State.prototype.reinit = function (client) {
  this.client   = client;
  this.pending  = false;
  this.received = false;
};

State.prototype.yieldPull = function (state) {
  this.pending  = false;
  this.received = true;
  this.toJoin   = state;
};

State.prototype.yield = function () {
  var self = this;

  // (B) Revision from the server arrived, merge
  if (this.received) {
    console.log('yield: got revision from server');
    this.toJoin.joinIn(this);
    this.received = false;
    return this;
  }
  // (C) expecting a revision, but not present yet
  if (this.pending) {
    console.log('yield: waiting for server response');
    return this;
  }
  // (A) Not expecting server response, send state to server
  console.log('yield: pushing to server');
  this.checkCreations();
  this.client.yieldPush(this);
  this.applyFork();
  this.pending  = true;
  this.received = false;
};

State.prototype.checkCreations = function () {
  var self = this;
  self.forEachEntity(function (table) {
    // table.forEachFreshCreated(function (key) {
  //     var entry = table.getByKey(key);
  //     if (!self.canCreateTableEntry(entry, self.getUser())) {
  //       throw new Error("Not authorized to create " + entry);
  //     }
  //   });
    table.resetFreshCreated();
  });
};

// callback should take 1 argument that is set if it could not flush with server
State.prototype.flush = function (callback, timeout) {
  var self = this;

  timeout = timeout || 3000;
  var offline = setTimeout(function () {
    callback("Flush: could not sync on time with server (" + timeout + "ms)");
  }, timeout);

  this.client.flushPush(this, function flushPull(state) {
    // should actually replace this state,
    // but since there should be no operations done merging is the same.
    // self.print();
    console.log('received flushpull on client');

    // console.log('received: ' + Object.keys(state.arrays).map(function (n) { return n + "(" + state.arrays[n].constructor.name+")";}));

    state.joinIn(self);

    clearTimeout(offline);
    callback();
  });
  self.applyFork();
  return this;
};

State.prototype.getUser = function () {
  return this.client.user;
};

var join = State.prototype.joinIn;
State.prototype.joinIn = function (state) {
  var self = this;

  var deleted = {};
  
  // Retract data to which the state has no access anymore
  state.forEachArray(function (array) {
    var mArray = self.get(array.name);
    if (typeof mArray === 'undefined' || mArray instanceof Restricted) {
      deleted[array.name] = state.arrays[array.name];
      delete state.arrays[array.name];
      return;
    }
    array.forEachProperty(function (property) {
      // try {
       var mProperty = mArray.getProperty(property);
      if (typeof mProperty === 'undefined') {
        delete array.properties.properties[property.name];
        return;
      }
      // } catch(e) {
        
      // }
      property.forEachKey(function (key) {
        var value = property.getByKey(key);
        var mValue = mProperty.getByKey(key);
        if (typeof mValue === 'undefined') {
          property.obliterate(key);
        }
      })
    });
    if (array instanceof Table) {
        array.forEachState(function (key) {
          if (!mArray.defined(key) && !array.isFreshCreated(key)) {
            console.log('removing ' + key);
            array.obliterate(key);
          }
        });
      }
  });

  state.forEachArray(function (index) {
    index.forEachProperty(function (property) {
      if (property.CType instanceof Index) {
        property.CType = state.get(property.CType.name);
      }
    });

    index.keys.forEach(function (key, type, i) {
      if (type instanceof Index) {
        index.keys.types[i] = state.get(type.name);
      }
    });
  });
  self.propagate();


  join.call(this, state);
  return state;
};


// var checkTablePermission = State.prototype.checkTablePermission;

// State.prototype.checkTablePermission = function (action, table) {
//   return checkTablePermission.call(this, action, table, this.client.group);
// };

// var checkColumnPermission = State.prototype.checkColumnPermission;

// State.prototype.checkColumnPermission = function (action, table, cname) {
//   return checkColumnPermission.call(this, action, table, cname, this.client.group);
// };
},{"../shared/CSet":18,"../shared/Index":21,"../shared/Restricted":28,"../shared/State":29,"./Table":6}],4:[function(require,module,exports){
var CloudType = require('../shared/CloudType');

module.exports = CloudType;

CloudType.forEachUpdateOperation(function (type, name){
  var operation = type.prototype[name];
  type.prototype[name] = function () {
    var args = Array.prototype.slice.call(arguments);
    // this.entry.index.state.checkEntryPropertyPermission('update', this.entry, this.property, this.entry.index.state.getUser());
    return operation.apply(this, args);
  };
});
},{"../shared/CloudType":20}],5:[function(require,module,exports){
(function (global){
var State       = require('./ClientState');
var Views       = require('../shared/Views');
var io          = require('socket.io-client');

global.io = io;

module.exports = Client;

function Client() {
  this.initialized = false;
  this.listeners = {};
}

Client.prototype.connect = function (host, options, connected, reconnected, disconnected) {
  var self = this;
  if (typeof options === 'function') {
    disconnected = reconnected;
    reconnected = connected;
    connected = options;
    options  = {};
  }
  options['force new connection'] = options['force new connection'] ? options['force new connection'] : true;
  options['max reconnection attempts'] = options['max reconnection attempts'] ? options ['max reconnection attempts'] : Infinity;
  this.host = host;
  this.options = options;
  this.connected = connected;
  this.reconnected = reconnected;
  this.disconnected = disconnected;

  this.socket = io.connect(host, options);
  this.socket.on('connect', function () {
    if (typeof self.uid === 'undefined') {
      console.log('client connected for first time');
      self.socket.emit('init', function (json) {
        console.log('client id: ' + json.uid);
        state = State.fromJSON(json.state);
        self.views = Views.fromJSON(json.views, state);
        // state.print();
        self.uid = json.uid;
        self.state = state;
        self.state.init(json.cid, self);
        self.user = state.get('SysUser').getByProperties({name: 'guest'});
        connected(self.state);
      });
    } else {
      console.log("client reconnected");
      self.state.reinit(self);
      if (typeof reconnected === 'function') {
        reconnected(self.state);
      }
    }
  });
  this.socket.on('disconnect', function () {
    if (typeof disconnected === 'function') {
      disconnected();
    }
  });
};

Client.prototype.reconnect = function () {
  return this.connect(this.host, this.options, this.connected, this.reconnected, this.disconnected);
};

Client.prototype.disconnect = function () {
  return this.socket.disconnect();
};

Client.prototype.close = function () {
  return this.disconnect();
};

Client.prototype.unrecognizedClient = function () {
  this.disconnect();
  throw new Error("Sorry, his client is unrecognized by the server! The server probably restarted and your data is lost... Please refresh.");
};

Client.prototype.yieldPush = function (pushState) {
  var self = this;
  var state = this.state;
  this.socket.emit('YieldPush', {uid: this.uid, state: pushState}, function (error, stateJson) {
    if (error) {
      return self.unrecognizedClient();
    }
    var pullState = State.fromJSON(stateJson);
    // TODO: with callback like flushpush
    state.yieldPull(pullState);
  });
};

Client.prototype.flushPush = function (pushState, flushPull) {
  var self = this;
  var state = this.state;
  this.socket.emit('FlushPush', {uid: this.uid, state: pushState}, function (error, stateJson) {
    if (error) {
      return self.unrecognizedClient();
    }
    var pullState = State.fromJSON(stateJson);
    flushPull(pullState);
  });
};

/* Authentication */
Client.prototype.register = function (username, password, finish) {
  var self = this;
  if (typeof this.socket === 'undefined')
    return finish("not connected");
  this.socket.emit('Register', {username: username, password: password}, function (err, userKey) {
     if (err)
      return finish(err);
    self.state.flush(function (state) {
      self.user = self.state.get('SysUser').getByKey(userKey);
      console.log('key ' + userKey);
      console.log('setting user to ' + self.user.get('name').get());
      finish(null, true); 
    });
  });
};

Client.prototype.login = function (username, password, finish) {
  var self = this;
  if (typeof this.socket === 'undefined')
    return finish("not connected");
  this.socket.emit('Login', {username: username, password: password}, function (err, userKey) {
    if (err)
      return finish(err);
    self.user = self.state.get('SysUser').getByKey(userKey);
    finish(null, true);
  });
};

Client.prototype.getUser = function () {
  return this.user;
};
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../shared/Views":35,"./ClientState":3,"socket.io-client":15}],6:[function(require,module,exports){
var Table = require('../shared/Table');
module.exports = Table;

var create = Table.prototype.create;
Table.prototype.create = function () {
  console.log('CREATING');
  this.state.checkCreateOnTablePermission(this, this.state.getUser());
  var entry = create.apply(this, Array.prototype.slice.apply(arguments));
  this.setFreshCreated(entry.uid);
  return entry;
};

Table.prototype.setFreshCreated = function (uid) {
  if (typeof this.freshCreated === 'undefined') {
    this.resetFreshCreated();
  }
  this.freshCreated[uid] = true;
};

Table.prototype.isFreshCreated = function (uid) {
  return ((typeof this.freshCreated !== 'undefined') && this.freshCreated[uid]);
};

Table.prototype.resetFreshCreated = function () {
  this.freshCreated = {};
};

Table.prototype.forEachFreshCreated = function (callback) {
  if (typeof this.freshCreated === 'undefined') return;
  Object.keys(this.freshCreated).forEach(callback);
};
},{"../shared/Table":30}],7:[function(require,module,exports){
var TableEntry = require('../shared/TableEntry');
module.exports = TableEntry;

var create = TableEntry.prototype.create;

// var update = TableEntry.prototype.set;
// TableEntry.prototype.set = function () {
//   var args = Array.prototype.slice.call(arguments);
//   console.log('UPDATING ' + Array.prototype.slice.apply(arguments));
//   this.index.state.checkEntryPropertyPermission('update', this, args[0], this.index.state.getUser());
//   console.log('checked updating permissions');
//   return update.apply(this, args);
// };


var remove = TableEntry.prototype.delete;
TableEntry.prototype.delete = function () {
  console.log('DELETING');
  this.index.state.checkTablePermission('delete', this.index, this.index.state.getUser());
  return remove.apply(this, Array.prototype.slice.apply(arguments));
};  
},{"../shared/TableEntry":31}],8:[function(require,module,exports){
(function (global){
var CloudTypeClient = require('./CloudTypeClient');
var ClientState     = require('./ClientState');

var CInt            = require('./CInt');
var CString         = require('./CString');
var Index           = require('../shared/Index');
var Restricted      = require('../shared/Restricted');
var Table           = require('./Table');
var TableEntry      = require('./TableEntry');

// needs to be loaded after all CloudTypes (modifies them)
var CloudType       = require('./CloudType');


var View            = require('./views/View');
var ListView        = require('./views/ListView');
var EntryView       = require('./views/EntryView');
var EditableListView = require('./views/EditableListView');

var CloudTypes = {
  // Client
  createClient: function () {
    return new CloudTypeClient();
  },

  // Views
  View: View,
  ListView: ListView,
  EntryView: EntryView,
  EditableListView: EditableListView,

  // Types
  Table: Table.declare,
  Index: Index.declare,
  Restricted: Restricted,
  CInt: CInt,
  CString: CString

};

global.CloudTypes = CloudTypes;
module.exports = CloudTypes;
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../shared/Index":21,"../shared/Restricted":28,"./CInt":1,"./CString":2,"./ClientState":3,"./CloudType":4,"./CloudTypeClient":5,"./Table":6,"./TableEntry":7,"./views/EditableListView":9,"./views/EntryView":10,"./views/ListView":11,"./views/View":12}],9:[function(require,module,exports){
/**
 * Created by ticup on 06/11/13.
 */
var ListView = require('./ListView');

var EditableListView = ListView.extend({
  edit: function (entry) {
    this.forEachView(function (view) {
      if (view.entry.equals(entry)) {
        view.edit();
      }
    });
  },
  finishEdit: function () {
    this.forEachView(function (view) {
      view.finishEdit();
    });
  }
});

module.exports = EditableListView;
},{"./ListView":11}],10:[function(require,module,exports){
/**
 * Created by ticup on 04/11/13.
 */
var View = require('./View');

// EntryView
/////////////
var EntryView = View.extend({
  initialize: function () {
    defaults(this);
    EntryView.__super__.initialize.call(this);
    var html = this.html;
    this.entry.forEachKey(function (name, value) {
      html.find('.key-'+name).html(value);
    });
  },

  update: function () {
    var self = this;
    this.entry.forEachProperty(function (name, value) {
      self.html.find('.property-'+name).html(value.get());
    });
  }
});

function defaults(entryView) {
//  if (typeof entryView.entry === 'undefined')
//    throw new Error("EntryView requires an Entry property");
  if (typeof entryView.html === 'undefined') {
    var entry = entryView.entry;
    var html  = entryView.html = $("<li class='list-group-item' data-key='" + entry.key() + "'></li>");
    entry.forEachKey(function (name, value) {
      html.append("<div class='key-" + name + "'>" + value + "</div>");
    });
    entry.forEachProperty(function (name) {
      html.append("<div class='property-" + name + "'></div>");
    });
  }
}

module.exports = EntryView;
},{"./View":12}],11:[function(require,module,exports){
/**
 * Created by ticup on 04/11/13.
 */
var View = require('./View');

// ListView
////////////
var ListView = View.extend({
  initialize: function () {
    ListView.__super__.initialize.call(this);
    this.views = {};
  },

  update: function () {
    var self  = this;
    var views = this.views;
    var app   = this.app;
    var ctr = 0;
    var newViews = {};

    // create new views or update existing ones
    this.value().forEach(function (item) {
      var id = item.    key();
      var view = views[id];

      // view already present: update + delete from old views
      if (typeof view !== 'undefined') {
        view.update();
        delete views[id];

        // reposition
        if (view.position !== ctr) {
          insertAt(self.html, ctr, view.html);
        }

        // view not present: create, update and insert html in DOM
      } else {
        view = self.createItemView(item, ctr);
        view.update();
        insertAt(self.html, ctr, view.html);
      }
      view.position = ctr++;
      newViews[id] = view;
    });

    // remove old views that have no model anymore
    Object.keys(views).forEach(function (id) {
      views[id].html.remove();
      delete views[id];
    });

    // set the new views
    this.views = newViews;
  },

  getView: function (position) {
    var result;
    this.forEachView(function (view) {
      if (view.position === position) {
        result = view;
      }
    });
    return result;
  },

  createItemView: function (item) {
    throw Error("ListView.createItemView(item): should be implemented by extending object");
  },

  forEachView: function (callback) {
    var views = this.views;
    Object.keys(views).forEach(function (key) {
      callback(views[key]);
    });
  }
});

// Utility
///////////

function insertAt(parent, key, html) {
  console.log('inserting at ' + key + ' ' + html);
  console.log(parent);
  if (key === 0)
    return parent.prepend(html);
  parent.children(':nth-child(' + key + ')').after(html);
}

module.exports = ListView;
},{"./View":12}],12:[function(require,module,exports){
/**
 * Created by ticup on 04/11/13.
 */

function View(attrs) {
  var view = this;
  if (typeof attrs !== 'undefined') {
    Object.keys(attrs).forEach(function (attr) {
      view[attr] = attrs[attr];
    });
  }
  if (typeof this.initialize === 'function')
    this.initialize();
}

View.extend = function (protoProps, staticProps) {
  var parent = this;
  var child;

  // The constructor function for the new subclass is either defined by you
  // (the "constructor" property in your `extend` definition), or defaulted
  // by us to simply call the parent's constructor.
  if (protoProps && (Object.hasOwnProperty(protoProps, 'constructor'))) {
    child = protoProps.constructor;
  } else {
    child = function (){ return parent.apply(this, arguments); };
  }


  // Add constructor properties of parent to the child constructor function
  Object.keys(parent).forEach(function (prop) {
    child[prop] = parent[prop];
  });

  // Add supplied constructor properties to the constructor function.
  if (staticProps)
    Object.keys(staticProps).forEach(function (prop) {
      child[prop] = staticProps[prop];
    });

  // Set prototype chain to inherit from parent
  child.prototype = Object.create(parent.prototype);

  // Add supplied prototype properties (instance properties) to the child's prototype
  if (protoProps) {
    Object.keys(protoProps).forEach(function (prop) {
      child.prototype[prop] = protoProps[prop];
    });
  }

  // Set a convenience property in case the parent's prototype is needed
  // later.
  child.__super__ = parent.prototype;

  child.__parent__ = parent;

  return child;
};

View.prototype.initialize = function () {
  this.html = $(this.html);
};

module.exports = View;
},{}],13:[function(require,module,exports){
(function (Buffer){

// Taken from node's assert module, because it sucks
// and exposes next to nothing useful.

module.exports = _deepEqual;

var pSlice = Array.prototype.slice;

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == "object",
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual === expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical "prototype" property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull (value) {
  return value === null || value === undefined;
}

function isArguments (object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv (a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical "prototype" property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try{
    var ka = Object.keys(a),
      kb = Object.keys(b),
      key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key] ))
       return false;
  }
  return true;
}

}).call(this,require("buffer").Buffer)
},{"buffer":43}],14:[function(require,module,exports){
/*!
 * Should
 * Copyright(c) 2010-2012 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var util = require('util')
  , http = require('http')
  , assert = require('assert')
  , AssertionError = assert.AssertionError
  , statusCodes = http.STATUS_CODES
  , eql = require('./eql')
  , i = util.inspect;

/**
 * Expose assert as should.
 *
 * This allows you to do things like below
 * without require()ing the assert module.
 *
 *    should.equal(foo.bar, undefined);
 *
 */

exports = module.exports = assert;

/**
 * Assert _obj_ exists, with optional message.
 *
 * @param {Mixed} obj
 * @param {String} [msg]
 * @api public
 */

exports.exist = exports.exists = function(obj, msg){
  if (null == obj) {
    throw new AssertionError({
        message: msg || ('expected ' + i(obj) + ' to exist')
      , stackStartFunction: exports.exist
    });
  }
};

/**
 * Asserts _obj_ does not exist, with optional message.
 *
 * @param {Mixed} obj
 * @param {String} [msg]
 * @api public
 */

exports.not = {};
exports.not.exist = exports.not.exists = function(obj, msg){
  if (null != obj) {
    throw new AssertionError({
        message: msg || ('expected ' + i(obj) + ' to not exist')
      , stackStartFunction: exports.not.exist
    });
  }
};

/**
 * Expose api via `Object#should`.
 *
 * @api public
 */

Object.defineProperty(Object.prototype, 'should', {
  set: function(){},
  get: function(){
    return new Assertion(this.valueOf() == this ? this.valueOf() : this);
  },
  configurable: true
});

/**
 * Initialize a new `Assertion` with the given _obj_.
 *
 * @param {Mixed} obj
 * @api private
 */

var Assertion = exports.Assertion = function Assertion(obj) {
  this.obj = obj;
};

/**
 * Prototype.
 */

Assertion.prototype = {

  /**
   * HACK: prevents double require() from failing.
   */

  exports: exports,

  /**
   * Assert _expr_ with the given _msg_ and _negatedMsg_.
   *
   * @param {Boolean} expr
   * @param {String} msg
   * @param {String} negatedMsg
   * @param {Object} expected
   * @api private
   */

  assert: function(expr, msg, negatedMsg, expected, showDiff){
    var msg = this.negate ? negatedMsg : msg
      , ok = this.negate ? !expr : expr
      , obj = this.obj;

    if (ok) return;

    var err = new AssertionError({
        message: msg.call(this)
      , actual: obj
      , expected: expected
      , stackStartFunction: this.assert
      , negated: this.negate
    });

    err.showDiff = showDiff;

    throw err;
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get an() {
    return this;
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get and() {
    return this;
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get be() {
    return this;
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get have() {
    return this;
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get with() {
    return this;
  },

  /**
   * Negation modifier.
   *
   * @api public
   */

  get not() {
    this.negate = true;
    return this;
  },

  /**
   * Get object inspection string.
   *
   * @return {String}
   * @api private
   */

  get inspect() {
    return i(this.obj);
  },

  /**
   * Assert instanceof `Arguments`.
   *
   * @api public
   */

  get arguments() {
    this.assert(
        '[object Arguments]' == Object.prototype.toString.call(this.obj)
      , function(){ return 'expected ' + this.inspect + ' to be arguments' }
      , function(){ return 'expected ' + this.inspect + ' to not be arguments' });
    return this;
  },

  /**
   * Assert that an object is empty aka length of 0.
   *
   * @api public
   */

  get empty() {
    this.obj.should.have.property('length');
    this.assert(
        0 === this.obj.length
      , function(){ return 'expected ' + this.inspect + ' to be empty' }
      , function(){ return 'expected ' + this.inspect + ' not to be empty' });
    return this;
  },

  /**
   * Assert ok.
   *
   * @api public
   */

  get ok() {
    this.assert(
        this.obj
      , function(){ return 'expected ' + this.inspect + ' to be truthy' }
      , function(){ return 'expected ' + this.inspect + ' to be falsey' });
    return this;
  },

  /**
   * Assert true.
   *
   * @api public
   */

  get true() {
    this.assert(
        true === this.obj
      , function(){ return 'expected ' + this.inspect + ' to be true' }
      , function(){ return 'expected ' + this.inspect + ' not to be true' });
    return this;
  },

  /**
   * Assert false.
   *
   * @api public
   */

  get false() {
    this.assert(
        false === this.obj
      , function(){ return 'expected ' + this.inspect + ' to be false' }
      , function(){ return 'expected ' + this.inspect + ' not to be false' });
    return this;
  },

  /**
   * Assert equal.
   *
   * @param {Mixed} val
   * @param {String} description
   * @api public
   */

  eql: function(val, desc){
    this.assert(
        eql(val, this.obj)
      , function(){ return 'expected ' + this.inspect + ' to equal ' + i(val) + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' to not equal ' + i(val) + (desc ? " | " + desc : "") }
      , val
      , true);
    return this;
  },

  /**
   * Assert strict equal.
   *
   * @param {Mixed} val
   * @param {String} description
   * @api public
   */

  equal: function(val, desc){
    this.assert(
        val === this.obj
      , function(){ return 'expected ' + this.inspect + ' to equal ' + i(val) + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' to not equal ' + i(val) + (desc ? " | " + desc : "") }
      , val);
    return this;
  },

  /**
   * Assert within start to finish (inclusive).
   *
   * @param {Number} start
   * @param {Number} finish
   * @param {String} description
   * @api public
   */

  within: function(start, finish, desc){
    var range = start + '..' + finish;
    this.assert(
        this.obj >= start && this.obj <= finish
      , function(){ return 'expected ' + this.inspect + ' to be within ' + range + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' to not be within ' + range + (desc ? " | " + desc : "") });
    return this;
  },

  /**
   * Assert within value +- delta (inclusive).
   *
   * @param {Number} value
   * @param {Number} delta
   * @param {String} description
   * @api public
   */

  approximately: function(value, delta, description) {
    return this.within(value - delta, value + delta, description);
  },

  /**
   * Assert typeof.
   *
   * @param {Mixed} type
   * @param {String} description
   * @api public
   */

  a: function(type, desc){
    this.assert(
        type == typeof this.obj
      , function(){ return 'expected ' + this.inspect + ' to be a ' + type + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' not to be a ' + type  + (desc ? " | " + desc : "") })
    return this;
  },

  /**
   * Assert instanceof.
   *
   * @param {Function} constructor
   * @param {String} description
   * @api public
   */

  instanceof: function(constructor, desc){
    var name = constructor.name;
    this.assert(
        this.obj instanceof constructor
      , function(){ return 'expected ' + this.inspect + ' to be an instance of ' + name + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' not to be an instance of ' + name + (desc ? " | " + desc : "") });
    return this;
  },

  /**
   * Assert numeric value above _n_.
   *
   * @param {Number} n
   * @param {String} description
   * @api public
   */

  above: function(n, desc){
    this.assert(
        this.obj > n
      , function(){ return 'expected ' + this.inspect + ' to be above ' + n + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' to be below ' + n + (desc ? " | " + desc : "") });
    return this;
  },

  /**
   * Assert numeric value below _n_.
   *
   * @param {Number} n
   * @param {String} description
   * @api public
   */

  below: function(n, desc){
    this.assert(
        this.obj < n
      , function(){ return 'expected ' + this.inspect + ' to be below ' + n + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' to be above ' + n + (desc ? " | " + desc : "") });
    return this;
  },

  /**
   * Assert string value matches _regexp_.
   *
   * @param {RegExp} regexp
   * @param {String} description
   * @api public
   */

  match: function(regexp, desc){
    this.assert(
        regexp.exec(this.obj)
      , function(){ return 'expected ' + this.inspect + ' to match ' + regexp + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' not to match ' + regexp + (desc ? " | " + desc : "") });
    return this;
  },

  /**
   * Assert property "length" exists and has value of _n_.
   *
   * @param {Number} n
   * @param {String} description
   * @api public
   */

  length: function(n, desc){
    this.obj.should.have.property('length');
    var len = this.obj.length;
    this.assert(
        n == len
      , function(){ return 'expected ' + this.inspect + ' to have a length of ' + n + ' but got ' + len + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' to not have a length of ' + len + (desc ? " | " + desc : "") });
    return this;
  },

  /**
   * Assert property _name_ exists, with optional _val_.
   *
   * @param {String} name
   * @param {Mixed} [val]
   * @param {String} description
   * @api public
   */

  property: function(name, val, desc){
    if (this.negate && undefined !== val) {
      if (undefined === this.obj[name]) {
        throw new Error(this.inspect + ' has no property ' + i(name) + (desc ? " | " + desc : ""));
      }
    } else {
      this.assert(
          undefined !== this.obj[name]
        , function(){ return 'expected ' + this.inspect + ' to have a property ' + i(name) + (desc ? " | " + desc : "") }
        , function(){ return 'expected ' + this.inspect + ' to not have a property ' + i(name) + (desc ? " | " + desc : "") });
    }

    if (undefined !== val) {
      this.assert(
          val === this.obj[name]
        , function(){ return 'expected ' + this.inspect + ' to have a property ' + i(name)
          + ' of ' + i(val) + ', but got ' + i(this.obj[name]) + (desc ? " | " + desc : "") }
        , function(){ return 'expected ' + this.inspect + ' to not have a property ' + i(name) + ' of ' + i(val) + (desc ? " | " + desc : "") });
    }

    this.obj = this.obj[name];
    return this;
  },

  /**
   * Assert own property _name_ exists.
   *
   * @param {String} name
   * @param {String} description
   * @api public
   */

  ownProperty: function(name, desc){
    this.assert(
        this.obj.hasOwnProperty(name)
      , function(){ return 'expected ' + this.inspect + ' to have own property ' + i(name) + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' to not have own property ' + i(name) + (desc ? " | " + desc : "") });
    this.obj = this.obj[name];
    return this;
  },

  /**
   * Assert that `obj` is present via `.indexOf()`.
   *
   * @param {Mixed} obj
   * @param {String} description
   * @api public
   */

  include: function(obj, desc){
    if (obj.constructor == Object){
      var cmp = {};
      for (var key in obj) cmp[key] = this.obj[key];
      this.assert(
          eql(cmp, obj)
        , function(){ return 'expected ' + this.inspect + ' to include an object equal to ' + i(obj) + (desc ? " | " + desc : "") }
        , function(){ return 'expected ' + this.inspect + ' to not include an object equal to ' + i(obj) + (desc ? " | " + desc : "") });
    } else {
      this.assert(
          ~this.obj.indexOf(obj)
        , function(){ return 'expected ' + this.inspect + ' to include ' + i(obj) + (desc ? " | " + desc : "") }
        , function(){ return 'expected ' + this.inspect + ' to not include ' + i(obj) + (desc ? " | " + desc : "") });
    }
    return this;
  },

  /**
   * Assert that an object equal to `obj` is present.
   *
   * @param {Array} obj
   * @param {String} description
   * @api public
   */

  includeEql: function(obj, desc){
    this.assert(
      this.obj.some(function(item) { return eql(obj, item); })
      , function(){ return 'expected ' + this.inspect + ' to include an object equal to ' + i(obj) + (desc ? " | " + desc : "") }
      , function(){ return 'expected ' + this.inspect + ' to not include an object equal to ' + i(obj) + (desc ? " | " + desc : "") });
    return this;
  },

  /**
   * Assert that the array contains _obj_.
   *
   * @param {Mixed} obj
   * @api public
   */

  contain: function(obj){
    console.warn('should.contain() is deprecated, use should.include()');
    this.obj.should.be.an.instanceof(Array);
    this.assert(
        ~this.obj.indexOf(obj)
      , function(){ return 'expected ' + this.inspect + ' to contain ' + i(obj) }
      , function(){ return 'expected ' + this.inspect + ' to not contain ' + i(obj) });
    return this;
  },

  /**
   * Assert exact keys or inclusion of keys by using
   * the `.include` modifier.
   *
   * @param {Array|String ...} keys
   * @api public
   */

  keys: function(keys){
    var str
      , ok = true;

    keys = keys instanceof Array
      ? keys
      : Array.prototype.slice.call(arguments);

    if (!keys.length) throw new Error('keys required');

    var actual = Object.keys(this.obj)
      , len = keys.length;

    // make sure they're all present
    ok = keys.every(function(key){
      return ~actual.indexOf(key);
    });

    // matching length
    ok = ok && keys.length == actual.length;

    // key string
    if (len > 1) {
      keys = keys.map(function(key){
        return i(key);
      });
      var last = keys.pop();
      str = keys.join(', ') + ', and ' + last;
    } else {
      str = i(keys[0]);
    }

    // message
    str = 'have ' + (len > 1 ? 'keys ' : 'key ') + str;

    this.assert(
        ok
      , function(){ return 'expected ' + this.inspect + ' to ' + str }
      , function(){ return 'expected ' + this.inspect + ' to not ' + str });

    return this;
  },

  /**
   * Assert that header `field` has the given `val`.
   *
   * @param {String} field
   * @param {String} val
   * @return {Assertion} for chaining
   * @api public
   */

  header: function(field, val){
    this.obj.should
      .have.property('headers').and
      .have.property(field.toLowerCase(), val);
    return this;
  },

  /**
   * Assert `.statusCode` of `code`.
   *
   * @param {Number} code
   * @return {Assertion} for chaining
   * @api public
   */

  status:  function(code){
    this.obj.should.have.property('statusCode');
    var status = this.obj.statusCode;

    this.assert(
        code == status
      , function(){ return 'expected response code of ' + code + ' ' + i(statusCodes[code])
        + ', but got ' + status + ' ' + i(statusCodes[status]) }
      , function(){ return 'expected to not respond with ' + code + ' ' + i(statusCodes[code]) });

    return this;
  },

  /**
   * Assert that this response has content-type: application/json.
   *
   * @return {Assertion} for chaining
   * @api public
   */

  get json() {
    this.obj.should.have.property('headers');
    this.obj.headers.should.have.property('content-type');
    this.obj.headers['content-type'].should.include('application/json');
    return this;
  },

  /**
   * Assert that this response has content-type: text/html.
   *
   * @return {Assertion} for chaining
   * @api public
   */

  get html() {
    this.obj.should.have.property('headers');
    this.obj.headers.should.have.property('content-type');
    this.obj.headers['content-type'].should.include('text/html');
    return this;
  },

  /**
   * Assert that this function will or will not
   * throw an exception.
   *
   * @return {Assertion} for chaining
   * @api public
   */

  throw: function(message){
    var fn = this.obj
      , err = {}
      , errorInfo = ''
      , ok = true;

    try {
      fn();
      ok = false;
    } catch (e) {
      err = e;
    }

    if (ok) {
      if ('string' == typeof message) {
        ok = message == err.message;
      } else if (message instanceof RegExp) {
        ok = message.test(err.message);
      } else if ('function' == typeof message) {
        ok = err instanceof message;
      }

      if (message && !ok) {
        if ('string' == typeof message) {
          errorInfo = " with a message matching '" + message + "', but got '" + err.message + "'";
        } else if (message instanceof RegExp) {
          errorInfo = " with a message matching " + message + ", but got '" + err.message + "'";
        } else if ('function' == typeof message) {
          errorInfo = " of type " + message.name + ", but got " + err.constructor.name;
        }
      }
    }

    this.assert(
        ok
      , function(){ return 'expected an exception to be thrown' + errorInfo }
      , function(){ return 'expected no exception to be thrown, got "' + err.message + '"' });

    return this;
  }
};

/**
 * Aliases.
 */

(function alias(name, as){
  Assertion.prototype[as] = Assertion.prototype[name];
  return alias;
})
('instanceof', 'instanceOf')
('throw', 'throwError')
('length', 'lengthOf')
('keys', 'key')
('ownProperty', 'haveOwnProperty')
('above', 'greaterThan')
('below', 'lessThan');


},{"./eql":13,"assert":40,"http":47,"util":67}],15:[function(require,module,exports){
/*! Socket.IO.js build:0.9.16, development. Copyright(c) 2011 LearnBoost <dev@learnboost.com> MIT Licensed */

var io = ('undefined' === typeof module ? {} : module.exports);
(function() {

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, global) {

  /**
   * IO namespace.
   *
   * @namespace
   */

  var io = exports;

  /**
   * Socket.IO version
   *
   * @api public
   */

  io.version = '0.9.16';

  /**
   * Protocol implemented.
   *
   * @api public
   */

  io.protocol = 1;

  /**
   * Available transports, these will be populated with the available transports
   *
   * @api public
   */

  io.transports = [];

  /**
   * Keep track of jsonp callbacks.
   *
   * @api private
   */

  io.j = [];

  /**
   * Keep track of our io.Sockets
   *
   * @api private
   */
  io.sockets = {};


  /**
   * Manages connections to hosts.
   *
   * @param {String} uri
   * @Param {Boolean} force creation of new socket (defaults to false)
   * @api public
   */

  io.connect = function (host, details) {
    var uri = io.util.parseUri(host)
      , uuri
      , socket;

    if (global && global.location) {
      uri.protocol = uri.protocol || global.location.protocol.slice(0, -1);
      uri.host = uri.host || (global.document
        ? global.document.domain : global.location.hostname);
      uri.port = uri.port || global.location.port;
    }

    uuri = io.util.uniqueUri(uri);

    var options = {
        host: uri.host
      , secure: 'https' == uri.protocol
      , port: uri.port || ('https' == uri.protocol ? 443 : 80)
      , query: uri.query || ''
    };

    io.util.merge(options, details);

    if (options['force new connection'] || !io.sockets[uuri]) {
      socket = new io.Socket(options);
    }

    if (!options['force new connection'] && socket) {
      io.sockets[uuri] = socket;
    }

    socket = socket || io.sockets[uuri];

    // if path is different from '' or /
    return socket.of(uri.path.length > 1 ? uri.path : '');
  };

})('object' === typeof module ? module.exports : (this.io = {}), this);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, global) {

  /**
   * Utilities namespace.
   *
   * @namespace
   */

  var util = exports.util = {};

  /**
   * Parses an URI
   *
   * @author Steven Levithan <stevenlevithan.com> (MIT license)
   * @api public
   */

  var re = /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

  var parts = ['source', 'protocol', 'authority', 'userInfo', 'user', 'password',
               'host', 'port', 'relative', 'path', 'directory', 'file', 'query',
               'anchor'];

  util.parseUri = function (str) {
    var m = re.exec(str || '')
      , uri = {}
      , i = 14;

    while (i--) {
      uri[parts[i]] = m[i] || '';
    }

    return uri;
  };

  /**
   * Produces a unique url that identifies a Socket.IO connection.
   *
   * @param {Object} uri
   * @api public
   */

  util.uniqueUri = function (uri) {
    var protocol = uri.protocol
      , host = uri.host
      , port = uri.port;

    if ('document' in global) {
      host = host || document.domain;
      port = port || (protocol == 'https'
        && document.location.protocol !== 'https:' ? 443 : document.location.port);
    } else {
      host = host || 'localhost';

      if (!port && protocol == 'https') {
        port = 443;
      }
    }

    return (protocol || 'http') + '://' + host + ':' + (port || 80);
  };

  /**
   * Mergest 2 query strings in to once unique query string
   *
   * @param {String} base
   * @param {String} addition
   * @api public
   */

  util.query = function (base, addition) {
    var query = util.chunkQuery(base || '')
      , components = [];

    util.merge(query, util.chunkQuery(addition || ''));
    for (var part in query) {
      if (query.hasOwnProperty(part)) {
        components.push(part + '=' + query[part]);
      }
    }

    return components.length ? '?' + components.join('&') : '';
  };

  /**
   * Transforms a querystring in to an object
   *
   * @param {String} qs
   * @api public
   */

  util.chunkQuery = function (qs) {
    var query = {}
      , params = qs.split('&')
      , i = 0
      , l = params.length
      , kv;

    for (; i < l; ++i) {
      kv = params[i].split('=');
      if (kv[0]) {
        query[kv[0]] = kv[1];
      }
    }

    return query;
  };

  /**
   * Executes the given function when the page is loaded.
   *
   *     io.util.load(function () { console.log('page loaded'); });
   *
   * @param {Function} fn
   * @api public
   */

  var pageLoaded = false;

  util.load = function (fn) {
    if ('document' in global && document.readyState === 'complete' || pageLoaded) {
      return fn();
    }

    util.on(global, 'load', fn, false);
  };

  /**
   * Adds an event.
   *
   * @api private
   */

  util.on = function (element, event, fn, capture) {
    if (element.attachEvent) {
      element.attachEvent('on' + event, fn);
    } else if (element.addEventListener) {
      element.addEventListener(event, fn, capture);
    }
  };

  /**
   * Generates the correct `XMLHttpRequest` for regular and cross domain requests.
   *
   * @param {Boolean} [xdomain] Create a request that can be used cross domain.
   * @returns {XMLHttpRequest|false} If we can create a XMLHttpRequest.
   * @api private
   */

  util.request = function (xdomain) {

    if (xdomain && 'undefined' != typeof XDomainRequest && !util.ua.hasCORS) {
      return new XDomainRequest();
    }

    if ('undefined' != typeof XMLHttpRequest && (!xdomain || util.ua.hasCORS)) {
      return new XMLHttpRequest();
    }

    if (!xdomain) {
      try {
        return new window[(['Active'].concat('Object').join('X'))]('Microsoft.XMLHTTP');
      } catch(e) { }
    }

    return null;
  };

  /**
   * XHR based transport constructor.
   *
   * @constructor
   * @api public
   */

  /**
   * Change the internal pageLoaded value.
   */

  if ('undefined' != typeof window) {
    util.load(function () {
      pageLoaded = true;
    });
  }

  /**
   * Defers a function to ensure a spinner is not displayed by the browser
   *
   * @param {Function} fn
   * @api public
   */

  util.defer = function (fn) {
    if (!util.ua.webkit || 'undefined' != typeof importScripts) {
      return fn();
    }

    util.load(function () {
      setTimeout(fn, 100);
    });
  };

  /**
   * Merges two objects.
   *
   * @api public
   */

  util.merge = function merge (target, additional, deep, lastseen) {
    var seen = lastseen || []
      , depth = typeof deep == 'undefined' ? 2 : deep
      , prop;

    for (prop in additional) {
      if (additional.hasOwnProperty(prop) && util.indexOf(seen, prop) < 0) {
        if (typeof target[prop] !== 'object' || !depth) {
          target[prop] = additional[prop];
          seen.push(additional[prop]);
        } else {
          util.merge(target[prop], additional[prop], depth - 1, seen);
        }
      }
    }

    return target;
  };

  /**
   * Merges prototypes from objects
   *
   * @api public
   */

  util.mixin = function (ctor, ctor2) {
    util.merge(ctor.prototype, ctor2.prototype);
  };

  /**
   * Shortcut for prototypical and static inheritance.
   *
   * @api private
   */

  util.inherit = function (ctor, ctor2) {
    function f() {};
    f.prototype = ctor2.prototype;
    ctor.prototype = new f;
  };

  /**
   * Checks if the given object is an Array.
   *
   *     io.util.isArray([]); // true
   *     io.util.isArray({}); // false
   *
   * @param Object obj
   * @api public
   */

  util.isArray = Array.isArray || function (obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  };

  /**
   * Intersects values of two arrays into a third
   *
   * @api public
   */

  util.intersect = function (arr, arr2) {
    var ret = []
      , longest = arr.length > arr2.length ? arr : arr2
      , shortest = arr.length > arr2.length ? arr2 : arr;

    for (var i = 0, l = shortest.length; i < l; i++) {
      if (~util.indexOf(longest, shortest[i]))
        ret.push(shortest[i]);
    }

    return ret;
  };

  /**
   * Array indexOf compatibility.
   *
   * @see bit.ly/a5Dxa2
   * @api public
   */

  util.indexOf = function (arr, o, i) {

    for (var j = arr.length, i = i < 0 ? i + j < 0 ? 0 : i + j : i || 0;
         i < j && arr[i] !== o; i++) {}

    return j <= i ? -1 : i;
  };

  /**
   * Converts enumerables to array.
   *
   * @api public
   */

  util.toArray = function (enu) {
    var arr = [];

    for (var i = 0, l = enu.length; i < l; i++)
      arr.push(enu[i]);

    return arr;
  };

  /**
   * UA / engines detection namespace.
   *
   * @namespace
   */

  util.ua = {};

  /**
   * Whether the UA supports CORS for XHR.
   *
   * @api public
   */

  util.ua.hasCORS = 'undefined' != typeof XMLHttpRequest && (function () {
    try {
      var a = new XMLHttpRequest();
    } catch (e) {
      return false;
    }

    return a.withCredentials != undefined;
  })();

  /**
   * Detect webkit.
   *
   * @api public
   */

  util.ua.webkit = 'undefined' != typeof navigator
    && /webkit/i.test(navigator.userAgent);

   /**
   * Detect iPad/iPhone/iPod.
   *
   * @api public
   */

  util.ua.iDevice = 'undefined' != typeof navigator
      && /iPad|iPhone|iPod/i.test(navigator.userAgent);

})('undefined' != typeof io ? io : module.exports, this);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.EventEmitter = EventEmitter;

  /**
   * Event emitter constructor.
   *
   * @api public.
   */

  function EventEmitter () {};

  /**
   * Adds a listener
   *
   * @api public
   */

  EventEmitter.prototype.on = function (name, fn) {
    if (!this.$events) {
      this.$events = {};
    }

    if (!this.$events[name]) {
      this.$events[name] = fn;
    } else if (io.util.isArray(this.$events[name])) {
      this.$events[name].push(fn);
    } else {
      this.$events[name] = [this.$events[name], fn];
    }

    return this;
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  /**
   * Adds a volatile listener.
   *
   * @api public
   */

  EventEmitter.prototype.once = function (name, fn) {
    var self = this;

    function on () {
      self.removeListener(name, on);
      fn.apply(this, arguments);
    };

    on.listener = fn;
    this.on(name, on);

    return this;
  };

  /**
   * Removes a listener.
   *
   * @api public
   */

  EventEmitter.prototype.removeListener = function (name, fn) {
    if (this.$events && this.$events[name]) {
      var list = this.$events[name];

      if (io.util.isArray(list)) {
        var pos = -1;

        for (var i = 0, l = list.length; i < l; i++) {
          if (list[i] === fn || (list[i].listener && list[i].listener === fn)) {
            pos = i;
            break;
          }
        }

        if (pos < 0) {
          return this;
        }

        list.splice(pos, 1);

        if (!list.length) {
          delete this.$events[name];
        }
      } else if (list === fn || (list.listener && list.listener === fn)) {
        delete this.$events[name];
      }
    }

    return this;
  };

  /**
   * Removes all listeners for an event.
   *
   * @api public
   */

  EventEmitter.prototype.removeAllListeners = function (name) {
    if (name === undefined) {
      this.$events = {};
      return this;
    }

    if (this.$events && this.$events[name]) {
      this.$events[name] = null;
    }

    return this;
  };

  /**
   * Gets all listeners for a certain event.
   *
   * @api publci
   */

  EventEmitter.prototype.listeners = function (name) {
    if (!this.$events) {
      this.$events = {};
    }

    if (!this.$events[name]) {
      this.$events[name] = [];
    }

    if (!io.util.isArray(this.$events[name])) {
      this.$events[name] = [this.$events[name]];
    }

    return this.$events[name];
  };

  /**
   * Emits an event.
   *
   * @api public
   */

  EventEmitter.prototype.emit = function (name) {
    if (!this.$events) {
      return false;
    }

    var handler = this.$events[name];

    if (!handler) {
      return false;
    }

    var args = Array.prototype.slice.call(arguments, 1);

    if ('function' == typeof handler) {
      handler.apply(this, args);
    } else if (io.util.isArray(handler)) {
      var listeners = handler.slice();

      for (var i = 0, l = listeners.length; i < l; i++) {
        listeners[i].apply(this, args);
      }
    } else {
      return false;
    }

    return true;
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Based on JSON2 (http://www.JSON.org/js.html).
 */

(function (exports, nativeJSON) {
  "use strict";

  // use native JSON if it's available
  if (nativeJSON && nativeJSON.parse){
    return exports.JSON = {
      parse: nativeJSON.parse
    , stringify: nativeJSON.stringify
    };
  }

  var JSON = exports.JSON = {};

  function f(n) {
      // Format integers to have at least two digits.
      return n < 10 ? '0' + n : n;
  }

  function date(d, key) {
    return isFinite(d.valueOf()) ?
        d.getUTCFullYear()     + '-' +
        f(d.getUTCMonth() + 1) + '-' +
        f(d.getUTCDate())      + 'T' +
        f(d.getUTCHours())     + ':' +
        f(d.getUTCMinutes())   + ':' +
        f(d.getUTCSeconds())   + 'Z' : null;
  };

  var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
      escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
      gap,
      indent,
      meta = {    // table of character substitutions
          '\b': '\\b',
          '\t': '\\t',
          '\n': '\\n',
          '\f': '\\f',
          '\r': '\\r',
          '"' : '\\"',
          '\\': '\\\\'
      },
      rep;


  function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

      escapable.lastIndex = 0;
      return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
          var c = meta[a];
          return typeof c === 'string' ? c :
              '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
      }) + '"' : '"' + string + '"';
  }


  function str(key, holder) {

// Produce a string from holder[key].

      var i,          // The loop counter.
          k,          // The member key.
          v,          // The member value.
          length,
          mind = gap,
          partial,
          value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

      if (value instanceof Date) {
          value = date(key);
      }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

      if (typeof rep === 'function') {
          value = rep.call(holder, key, value);
      }

// What happens next depends on the value's type.

      switch (typeof value) {
      case 'string':
          return quote(value);

      case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

          return isFinite(value) ? String(value) : 'null';

      case 'boolean':
      case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

          return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

      case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

          if (!value) {
              return 'null';
          }

// Make an array to hold the partial results of stringifying this object value.

          gap += indent;
          partial = [];

// Is the value an array?

          if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

              length = value.length;
              for (i = 0; i < length; i += 1) {
                  partial[i] = str(i, value) || 'null';
              }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

              v = partial.length === 0 ? '[]' : gap ?
                  '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']' :
                  '[' + partial.join(',') + ']';
              gap = mind;
              return v;
          }

// If the replacer is an array, use it to select the members to be stringified.

          if (rep && typeof rep === 'object') {
              length = rep.length;
              for (i = 0; i < length; i += 1) {
                  if (typeof rep[i] === 'string') {
                      k = rep[i];
                      v = str(k, value);
                      if (v) {
                          partial.push(quote(k) + (gap ? ': ' : ':') + v);
                      }
                  }
              }
          } else {

// Otherwise, iterate through all of the keys in the object.

              for (k in value) {
                  if (Object.prototype.hasOwnProperty.call(value, k)) {
                      v = str(k, value);
                      if (v) {
                          partial.push(quote(k) + (gap ? ': ' : ':') + v);
                      }
                  }
              }
          }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

          v = partial.length === 0 ? '{}' : gap ?
              '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}' :
              '{' + partial.join(',') + '}';
          gap = mind;
          return v;
      }
  }

// If the JSON object does not yet have a stringify method, give it one.

  JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

      var i;
      gap = '';
      indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

      if (typeof space === 'number') {
          for (i = 0; i < space; i += 1) {
              indent += ' ';
          }

// If the space parameter is a string, it will be used as the indent string.

      } else if (typeof space === 'string') {
          indent = space;
      }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

      rep = replacer;
      if (replacer && typeof replacer !== 'function' &&
              (typeof replacer !== 'object' ||
              typeof replacer.length !== 'number')) {
          throw new Error('JSON.stringify');
      }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

      return str('', {'': value});
  };

// If the JSON object does not yet have a parse method, give it one.

  JSON.parse = function (text, reviver) {
  // The parse method takes a text and an optional reviver function, and returns
  // a JavaScript value if the text is a valid JSON text.

      var j;

      function walk(holder, key) {

  // The walk method is used to recursively walk the resulting structure so
  // that modifications can be made.

          var k, v, value = holder[key];
          if (value && typeof value === 'object') {
              for (k in value) {
                  if (Object.prototype.hasOwnProperty.call(value, k)) {
                      v = walk(value, k);
                      if (v !== undefined) {
                          value[k] = v;
                      } else {
                          delete value[k];
                      }
                  }
              }
          }
          return reviver.call(holder, key, value);
      }


  // Parsing happens in four stages. In the first stage, we replace certain
  // Unicode characters with escape sequences. JavaScript handles many characters
  // incorrectly, either silently deleting them, or treating them as line endings.

      text = String(text);
      cx.lastIndex = 0;
      if (cx.test(text)) {
          text = text.replace(cx, function (a) {
              return '\\u' +
                  ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
          });
      }

  // In the second stage, we run the text against regular expressions that look
  // for non-JSON patterns. We are especially concerned with '()' and 'new'
  // because they can cause invocation, and '=' because it can cause mutation.
  // But just to be safe, we want to reject all unexpected forms.

  // We split the second stage into 4 regexp operations in order to work around
  // crippling inefficiencies in IE's and Safari's regexp engines. First we
  // replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
  // replace all simple value tokens with ']' characters. Third, we delete all
  // open brackets that follow a colon or comma or that begin the text. Finally,
  // we look to see that the remaining characters are only whitespace or ']' or
  // ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

      if (/^[\],:{}\s]*$/
              .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                  .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                  .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

  // In the third stage we use the eval function to compile the text into a
  // JavaScript structure. The '{' operator is subject to a syntactic ambiguity
  // in JavaScript: it can begin a block or an object literal. We wrap the text
  // in parens to eliminate the ambiguity.

          j = eval('(' + text + ')');

  // In the optional fourth stage, we recursively walk the new structure, passing
  // each name/value pair to a reviver function for possible transformation.

          return typeof reviver === 'function' ?
              walk({'': j}, '') : j;
      }

  // If the text is not JSON parseable, then a SyntaxError is thrown.

      throw new SyntaxError('JSON.parse');
  };

})(
    'undefined' != typeof io ? io : module.exports
  , typeof JSON !== 'undefined' ? JSON : undefined
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Parser namespace.
   *
   * @namespace
   */

  var parser = exports.parser = {};

  /**
   * Packet types.
   */

  var packets = parser.packets = [
      'disconnect'
    , 'connect'
    , 'heartbeat'
    , 'message'
    , 'json'
    , 'event'
    , 'ack'
    , 'error'
    , 'noop'
  ];

  /**
   * Errors reasons.
   */

  var reasons = parser.reasons = [
      'transport not supported'
    , 'client not handshaken'
    , 'unauthorized'
  ];

  /**
   * Errors advice.
   */

  var advice = parser.advice = [
      'reconnect'
  ];

  /**
   * Shortcuts.
   */

  var JSON = io.JSON
    , indexOf = io.util.indexOf;

  /**
   * Encodes a packet.
   *
   * @api private
   */

  parser.encodePacket = function (packet) {
    var type = indexOf(packets, packet.type)
      , id = packet.id || ''
      , endpoint = packet.endpoint || ''
      , ack = packet.ack
      , data = null;

    switch (packet.type) {
      case 'error':
        var reason = packet.reason ? indexOf(reasons, packet.reason) : ''
          , adv = packet.advice ? indexOf(advice, packet.advice) : '';

        if (reason !== '' || adv !== '')
          data = reason + (adv !== '' ? ('+' + adv) : '');

        break;

      case 'message':
        if (packet.data !== '')
          data = packet.data;
        break;

      case 'event':
        var ev = { name: packet.name };

        if (packet.args && packet.args.length) {
          ev.args = packet.args;
        }

        data = JSON.stringify(ev);
        break;

      case 'json':
        data = JSON.stringify(packet.data);
        break;

      case 'connect':
        if (packet.qs)
          data = packet.qs;
        break;

      case 'ack':
        data = packet.ackId
          + (packet.args && packet.args.length
              ? '+' + JSON.stringify(packet.args) : '');
        break;
    }

    // construct packet with required fragments
    var encoded = [
        type
      , id + (ack == 'data' ? '+' : '')
      , endpoint
    ];

    // data fragment is optional
    if (data !== null && data !== undefined)
      encoded.push(data);

    return encoded.join(':');
  };

  /**
   * Encodes multiple messages (payload).
   *
   * @param {Array} messages
   * @api private
   */

  parser.encodePayload = function (packets) {
    var decoded = '';

    if (packets.length == 1)
      return packets[0];

    for (var i = 0, l = packets.length; i < l; i++) {
      var packet = packets[i];
      decoded += '\ufffd' + packet.length + '\ufffd' + packets[i];
    }

    return decoded;
  };

  /**
   * Decodes a packet
   *
   * @api private
   */

  var regexp = /([^:]+):([0-9]+)?(\+)?:([^:]+)?:?([\s\S]*)?/;

  parser.decodePacket = function (data) {
    var pieces = data.match(regexp);

    if (!pieces) return {};

    var id = pieces[2] || ''
      , data = pieces[5] || ''
      , packet = {
            type: packets[pieces[1]]
          , endpoint: pieces[4] || ''
        };

    // whether we need to acknowledge the packet
    if (id) {
      packet.id = id;
      if (pieces[3])
        packet.ack = 'data';
      else
        packet.ack = true;
    }

    // handle different packet types
    switch (packet.type) {
      case 'error':
        var pieces = data.split('+');
        packet.reason = reasons[pieces[0]] || '';
        packet.advice = advice[pieces[1]] || '';
        break;

      case 'message':
        packet.data = data || '';
        break;

      case 'event':
        try {
          var opts = JSON.parse(data);
          packet.name = opts.name;
          packet.args = opts.args;
        } catch (e) { }

        packet.args = packet.args || [];
        break;

      case 'json':
        try {
          packet.data = JSON.parse(data);
        } catch (e) { }
        break;

      case 'connect':
        packet.qs = data || '';
        break;

      case 'ack':
        var pieces = data.match(/^([0-9]+)(\+)?(.*)/);
        if (pieces) {
          packet.ackId = pieces[1];
          packet.args = [];

          if (pieces[3]) {
            try {
              packet.args = pieces[3] ? JSON.parse(pieces[3]) : [];
            } catch (e) { }
          }
        }
        break;

      case 'disconnect':
      case 'heartbeat':
        break;
    };

    return packet;
  };

  /**
   * Decodes data payload. Detects multiple messages
   *
   * @return {Array} messages
   * @api public
   */

  parser.decodePayload = function (data) {
    // IE doesn't like data[i] for unicode chars, charAt works fine
    if (data.charAt(0) == '\ufffd') {
      var ret = [];

      for (var i = 1, length = ''; i < data.length; i++) {
        if (data.charAt(i) == '\ufffd') {
          ret.push(parser.decodePacket(data.substr(i + 1).substr(0, length)));
          i += Number(length) + 1;
          length = '';
        } else {
          length += data.charAt(i);
        }
      }

      return ret;
    } else {
      return [parser.decodePacket(data)];
    }
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.Transport = Transport;

  /**
   * This is the transport template for all supported transport methods.
   *
   * @constructor
   * @api public
   */

  function Transport (socket, sessid) {
    this.socket = socket;
    this.sessid = sessid;
  };

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(Transport, io.EventEmitter);


  /**
   * Indicates whether heartbeats is enabled for this transport
   *
   * @api private
   */

  Transport.prototype.heartbeats = function () {
    return true;
  };

  /**
   * Handles the response from the server. When a new response is received
   * it will automatically update the timeout, decode the message and
   * forwards the response to the onMessage function for further processing.
   *
   * @param {String} data Response from the server.
   * @api private
   */

  Transport.prototype.onData = function (data) {
    this.clearCloseTimeout();

    // If the connection in currently open (or in a reopening state) reset the close
    // timeout since we have just received data. This check is necessary so
    // that we don't reset the timeout on an explicitly disconnected connection.
    if (this.socket.connected || this.socket.connecting || this.socket.reconnecting) {
      this.setCloseTimeout();
    }

    if (data !== '') {
      // todo: we should only do decodePayload for xhr transports
      var msgs = io.parser.decodePayload(data);

      if (msgs && msgs.length) {
        for (var i = 0, l = msgs.length; i < l; i++) {
          this.onPacket(msgs[i]);
        }
      }
    }

    return this;
  };

  /**
   * Handles packets.
   *
   * @api private
   */

  Transport.prototype.onPacket = function (packet) {
    this.socket.setHeartbeatTimeout();

    if (packet.type == 'heartbeat') {
      return this.onHeartbeat();
    }

    if (packet.type == 'connect' && packet.endpoint == '') {
      this.onConnect();
    }

    if (packet.type == 'error' && packet.advice == 'reconnect') {
      this.isOpen = false;
    }

    this.socket.onPacket(packet);

    return this;
  };

  /**
   * Sets close timeout
   *
   * @api private
   */

  Transport.prototype.setCloseTimeout = function () {
    if (!this.closeTimeout) {
      var self = this;

      this.closeTimeout = setTimeout(function () {
        self.onDisconnect();
      }, this.socket.closeTimeout);
    }
  };

  /**
   * Called when transport disconnects.
   *
   * @api private
   */

  Transport.prototype.onDisconnect = function () {
    if (this.isOpen) this.close();
    this.clearTimeouts();
    this.socket.onDisconnect();
    return this;
  };

  /**
   * Called when transport connects
   *
   * @api private
   */

  Transport.prototype.onConnect = function () {
    this.socket.onConnect();
    return this;
  };

  /**
   * Clears close timeout
   *
   * @api private
   */

  Transport.prototype.clearCloseTimeout = function () {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
  };

  /**
   * Clear timeouts
   *
   * @api private
   */

  Transport.prototype.clearTimeouts = function () {
    this.clearCloseTimeout();

    if (this.reopenTimeout) {
      clearTimeout(this.reopenTimeout);
    }
  };

  /**
   * Sends a packet
   *
   * @param {Object} packet object.
   * @api private
   */

  Transport.prototype.packet = function (packet) {
    this.send(io.parser.encodePacket(packet));
  };

  /**
   * Send the received heartbeat message back to server. So the server
   * knows we are still connected.
   *
   * @param {String} heartbeat Heartbeat response from the server.
   * @api private
   */

  Transport.prototype.onHeartbeat = function (heartbeat) {
    this.packet({ type: 'heartbeat' });
  };

  /**
   * Called when the transport opens.
   *
   * @api private
   */

  Transport.prototype.onOpen = function () {
    this.isOpen = true;
    this.clearCloseTimeout();
    this.socket.onOpen();
  };

  /**
   * Notifies the base when the connection with the Socket.IO server
   * has been disconnected.
   *
   * @api private
   */

  Transport.prototype.onClose = function () {
    var self = this;

    /* FIXME: reopen delay causing a infinit loop
    this.reopenTimeout = setTimeout(function () {
      self.open();
    }, this.socket.options['reopen delay']);*/

    this.isOpen = false;
    this.socket.onClose();
    this.onDisconnect();
  };

  /**
   * Generates a connection url based on the Socket.IO URL Protocol.
   * See <https://github.com/learnboost/socket.io-node/> for more details.
   *
   * @returns {String} Connection url
   * @api private
   */

  Transport.prototype.prepareUrl = function () {
    var options = this.socket.options;

    return this.scheme() + '://'
      + options.host + ':' + options.port + '/'
      + options.resource + '/' + io.protocol
      + '/' + this.name + '/' + this.sessid;
  };

  /**
   * Checks if the transport is ready to start a connection.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  Transport.prototype.ready = function (socket, fn) {
    fn.call(this);
  };
})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports.Socket = Socket;

  /**
   * Create a new `Socket.IO client` which can establish a persistent
   * connection with a Socket.IO enabled server.
   *
   * @api public
   */

  function Socket (options) {
    this.options = {
        port: 80
      , secure: false
      , document: 'document' in global ? document : false
      , resource: 'socket.io'
      , transports: io.transports
      , 'connect timeout': 10000
      , 'try multiple transports': true
      , 'reconnect': true
      , 'reconnection delay': 500
      , 'reconnection limit': Infinity
      , 'reopen delay': 3000
      , 'max reconnection attempts': 10
      , 'sync disconnect on unload': false
      , 'auto connect': true
      , 'flash policy port': 10843
      , 'manualFlush': false
    };

    io.util.merge(this.options, options);

    this.connected = false;
    this.open = false;
    this.connecting = false;
    this.reconnecting = false;
    this.namespaces = {};
    this.buffer = [];
    this.doBuffer = false;

    if (this.options['sync disconnect on unload'] &&
        (!this.isXDomain() || io.util.ua.hasCORS)) {
      var self = this;
      io.util.on(global, 'beforeunload', function () {
        self.disconnectSync();
      }, false);
    }

    if (this.options['auto connect']) {
      this.connect();
    }
};

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(Socket, io.EventEmitter);

  /**
   * Returns a namespace listener/emitter for this socket
   *
   * @api public
   */

  Socket.prototype.of = function (name) {
    if (!this.namespaces[name]) {
      this.namespaces[name] = new io.SocketNamespace(this, name);

      if (name !== '') {
        this.namespaces[name].packet({ type: 'connect' });
      }
    }

    return this.namespaces[name];
  };

  /**
   * Emits the given event to the Socket and all namespaces
   *
   * @api private
   */

  Socket.prototype.publish = function () {
    this.emit.apply(this, arguments);

    var nsp;

    for (var i in this.namespaces) {
      if (this.namespaces.hasOwnProperty(i)) {
        nsp = this.of(i);
        nsp.$emit.apply(nsp, arguments);
      }
    }
  };

  /**
   * Performs the handshake
   *
   * @api private
   */

  function empty () { };

  Socket.prototype.handshake = function (fn) {
    var self = this
      , options = this.options;

    function complete (data) {
      if (data instanceof Error) {
        self.connecting = false;
        self.onError(data.message);
      } else {
        fn.apply(null, data.split(':'));
      }
    };

    var url = [
          'http' + (options.secure ? 's' : '') + ':/'
        , options.host + ':' + options.port
        , options.resource
        , io.protocol
        , io.util.query(this.options.query, 't=' + +new Date)
      ].join('/');

    if (this.isXDomain() && !io.util.ua.hasCORS) {
      var insertAt = document.getElementsByTagName('script')[0]
        , script = document.createElement('script');

      script.src = url + '&jsonp=' + io.j.length;
      insertAt.parentNode.insertBefore(script, insertAt);

      io.j.push(function (data) {
        complete(data);
        script.parentNode.removeChild(script);
      });
    } else {
      var xhr = io.util.request();

      xhr.open('GET', url, true);
      if (this.isXDomain()) {
        xhr.withCredentials = true;
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
          xhr.onreadystatechange = empty;

          if (xhr.status == 200) {
            complete(xhr.responseText);
          } else if (xhr.status == 403) {
            self.onError(xhr.responseText);
          } else {
            self.connecting = false;            
            !self.reconnecting && self.onError(xhr.responseText);
          }
        }
      };
      xhr.send(null);
    }
  };

  /**
   * Find an available transport based on the options supplied in the constructor.
   *
   * @api private
   */

  Socket.prototype.getTransport = function (override) {
    var transports = override || this.transports, match;

    for (var i = 0, transport; transport = transports[i]; i++) {
      if (io.Transport[transport]
        && io.Transport[transport].check(this)
        && (!this.isXDomain() || io.Transport[transport].xdomainCheck(this))) {
        return new io.Transport[transport](this, this.sessionid);
      }
    }

    return null;
  };

  /**
   * Connects to the server.
   *
   * @param {Function} [fn] Callback.
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.connect = function (fn) {
    if (this.connecting) {
      return this;
    }

    var self = this;
    self.connecting = true;
    
    this.handshake(function (sid, heartbeat, close, transports) {
      self.sessionid = sid;
      self.closeTimeout = close * 1000;
      self.heartbeatTimeout = heartbeat * 1000;
      if(!self.transports)
          self.transports = self.origTransports = (transports ? io.util.intersect(
              transports.split(',')
            , self.options.transports
          ) : self.options.transports);

      self.setHeartbeatTimeout();

      function connect (transports){
        if (self.transport) self.transport.clearTimeouts();

        self.transport = self.getTransport(transports);
        if (!self.transport) return self.publish('connect_failed');

        // once the transport is ready
        self.transport.ready(self, function () {
          self.connecting = true;
          self.publish('connecting', self.transport.name);
          self.transport.open();

          if (self.options['connect timeout']) {
            self.connectTimeoutTimer = setTimeout(function () {
              if (!self.connected) {
                self.connecting = false;

                if (self.options['try multiple transports']) {
                  var remaining = self.transports;

                  while (remaining.length > 0 && remaining.splice(0,1)[0] !=
                         self.transport.name) {}

                    if (remaining.length){
                      connect(remaining);
                    } else {
                      self.publish('connect_failed');
                    }
                }
              }
            }, self.options['connect timeout']);
          }
        });
      }

      connect(self.transports);

      self.once('connect', function (){
        clearTimeout(self.connectTimeoutTimer);

        fn && typeof fn == 'function' && fn();
      });
    });

    return this;
  };

  /**
   * Clears and sets a new heartbeat timeout using the value given by the
   * server during the handshake.
   *
   * @api private
   */

  Socket.prototype.setHeartbeatTimeout = function () {
    clearTimeout(this.heartbeatTimeoutTimer);
    if(this.transport && !this.transport.heartbeats()) return;

    var self = this;
    this.heartbeatTimeoutTimer = setTimeout(function () {
      self.transport.onClose();
    }, this.heartbeatTimeout);
  };

  /**
   * Sends a message.
   *
   * @param {Object} data packet.
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.packet = function (data) {
    if (this.connected && !this.doBuffer) {
      this.transport.packet(data);
    } else {
      this.buffer.push(data);
    }

    return this;
  };

  /**
   * Sets buffer state
   *
   * @api private
   */

  Socket.prototype.setBuffer = function (v) {
    this.doBuffer = v;

    if (!v && this.connected && this.buffer.length) {
      if (!this.options['manualFlush']) {
        this.flushBuffer();
      }
    }
  };

  /**
   * Flushes the buffer data over the wire.
   * To be invoked manually when 'manualFlush' is set to true.
   *
   * @api public
   */

  Socket.prototype.flushBuffer = function() {
    this.transport.payload(this.buffer);
    this.buffer = [];
  };
  

  /**
   * Disconnect the established connect.
   *
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.disconnect = function () {
    if (this.connected || this.connecting) {
      if (this.open) {
        this.of('').packet({ type: 'disconnect' });
      }

      // handle disconnection immediately
      this.onDisconnect('booted');
    }

    return this;
  };

  /**
   * Disconnects the socket with a sync XHR.
   *
   * @api private
   */

  Socket.prototype.disconnectSync = function () {
    // ensure disconnection
    var xhr = io.util.request();
    var uri = [
        'http' + (this.options.secure ? 's' : '') + ':/'
      , this.options.host + ':' + this.options.port
      , this.options.resource
      , io.protocol
      , ''
      , this.sessionid
    ].join('/') + '/?disconnect=1';

    xhr.open('GET', uri, false);
    xhr.send(null);

    // handle disconnection immediately
    this.onDisconnect('booted');
  };

  /**
   * Check if we need to use cross domain enabled transports. Cross domain would
   * be a different port or different domain name.
   *
   * @returns {Boolean}
   * @api private
   */

  Socket.prototype.isXDomain = function () {

    var port = global.location.port ||
      ('https:' == global.location.protocol ? 443 : 80);

    return this.options.host !== global.location.hostname 
      || this.options.port != port;
  };

  /**
   * Called upon handshake.
   *
   * @api private
   */

  Socket.prototype.onConnect = function () {
    if (!this.connected) {
      this.connected = true;
      this.connecting = false;
      if (!this.doBuffer) {
        // make sure to flush the buffer
        this.setBuffer(false);
      }
      this.emit('connect');
    }
  };

  /**
   * Called when the transport opens
   *
   * @api private
   */

  Socket.prototype.onOpen = function () {
    this.open = true;
  };

  /**
   * Called when the transport closes.
   *
   * @api private
   */

  Socket.prototype.onClose = function () {
    this.open = false;
    clearTimeout(this.heartbeatTimeoutTimer);
  };

  /**
   * Called when the transport first opens a connection
   *
   * @param text
   */

  Socket.prototype.onPacket = function (packet) {
    this.of(packet.endpoint).onPacket(packet);
  };

  /**
   * Handles an error.
   *
   * @api private
   */

  Socket.prototype.onError = function (err) {
    if (err && err.advice) {
      if (err.advice === 'reconnect' && (this.connected || this.connecting)) {
        this.disconnect();
        if (this.options.reconnect) {
          this.reconnect();
        }
      }
    }

    this.publish('error', err && err.reason ? err.reason : err);
  };

  /**
   * Called when the transport disconnects.
   *
   * @api private
   */

  Socket.prototype.onDisconnect = function (reason) {
    var wasConnected = this.connected
      , wasConnecting = this.connecting;

    this.connected = false;
    this.connecting = false;
    this.open = false;

    if (wasConnected || wasConnecting) {
      this.transport.close();
      this.transport.clearTimeouts();
      if (wasConnected) {
        this.publish('disconnect', reason);

        if ('booted' != reason && this.options.reconnect && !this.reconnecting) {
          this.reconnect();
        }
      }
    }
  };

  /**
   * Called upon reconnection.
   *
   * @api private
   */

  Socket.prototype.reconnect = function () {
    this.reconnecting = true;
    this.reconnectionAttempts = 0;
    this.reconnectionDelay = this.options['reconnection delay'];

    var self = this
      , maxAttempts = this.options['max reconnection attempts']
      , tryMultiple = this.options['try multiple transports']
      , limit = this.options['reconnection limit'];

    function reset () {
      if (self.connected) {
        for (var i in self.namespaces) {
          if (self.namespaces.hasOwnProperty(i) && '' !== i) {
              self.namespaces[i].packet({ type: 'connect' });
          }
        }
        self.publish('reconnect', self.transport.name, self.reconnectionAttempts);
      }

      clearTimeout(self.reconnectionTimer);

      self.removeListener('connect_failed', maybeReconnect);
      self.removeListener('connect', maybeReconnect);

      self.reconnecting = false;

      delete self.reconnectionAttempts;
      delete self.reconnectionDelay;
      delete self.reconnectionTimer;
      delete self.redoTransports;

      self.options['try multiple transports'] = tryMultiple;
    };

    function maybeReconnect () {
      if (!self.reconnecting) {
        return;
      }

      if (self.connected) {
        return reset();
      };

      if (self.connecting && self.reconnecting) {
        return self.reconnectionTimer = setTimeout(maybeReconnect, 1000);
      }

      if (self.reconnectionAttempts++ >= maxAttempts) {
        if (!self.redoTransports) {
          self.on('connect_failed', maybeReconnect);
          self.options['try multiple transports'] = true;
          self.transports = self.origTransports;
          self.transport = self.getTransport();
          self.redoTransports = true;
          self.connect();
        } else {
          self.publish('reconnect_failed');
          reset();
        }
      } else {
        if (self.reconnectionDelay < limit) {
          self.reconnectionDelay *= 2; // exponential back off
        }

        self.connect();
        self.publish('reconnecting', self.reconnectionDelay, self.reconnectionAttempts);
        self.reconnectionTimer = setTimeout(maybeReconnect, self.reconnectionDelay);
      }
    };

    this.options['try multiple transports'] = false;
    this.reconnectionTimer = setTimeout(maybeReconnect, this.reconnectionDelay);

    this.on('connect', maybeReconnect);
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.SocketNamespace = SocketNamespace;

  /**
   * Socket namespace constructor.
   *
   * @constructor
   * @api public
   */

  function SocketNamespace (socket, name) {
    this.socket = socket;
    this.name = name || '';
    this.flags = {};
    this.json = new Flag(this, 'json');
    this.ackPackets = 0;
    this.acks = {};
  };

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(SocketNamespace, io.EventEmitter);

  /**
   * Copies emit since we override it
   *
   * @api private
   */

  SocketNamespace.prototype.$emit = io.EventEmitter.prototype.emit;

  /**
   * Creates a new namespace, by proxying the request to the socket. This
   * allows us to use the synax as we do on the server.
   *
   * @api public
   */

  SocketNamespace.prototype.of = function () {
    return this.socket.of.apply(this.socket, arguments);
  };

  /**
   * Sends a packet.
   *
   * @api private
   */

  SocketNamespace.prototype.packet = function (packet) {
    packet.endpoint = this.name;
    this.socket.packet(packet);
    this.flags = {};
    return this;
  };

  /**
   * Sends a message
   *
   * @api public
   */

  SocketNamespace.prototype.send = function (data, fn) {
    var packet = {
        type: this.flags.json ? 'json' : 'message'
      , data: data
    };

    if ('function' == typeof fn) {
      packet.id = ++this.ackPackets;
      packet.ack = true;
      this.acks[packet.id] = fn;
    }

    return this.packet(packet);
  };

  /**
   * Emits an event
   *
   * @api public
   */
  
  SocketNamespace.prototype.emit = function (name) {
    var args = Array.prototype.slice.call(arguments, 1)
      , lastArg = args[args.length - 1]
      , packet = {
            type: 'event'
          , name: name
        };

    if ('function' == typeof lastArg) {
      packet.id = ++this.ackPackets;
      packet.ack = 'data';
      this.acks[packet.id] = lastArg;
      args = args.slice(0, args.length - 1);
    }

    packet.args = args;

    return this.packet(packet);
  };

  /**
   * Disconnects the namespace
   *
   * @api private
   */

  SocketNamespace.prototype.disconnect = function () {
    if (this.name === '') {
      this.socket.disconnect();
    } else {
      this.packet({ type: 'disconnect' });
      this.$emit('disconnect');
    }

    return this;
  };

  /**
   * Handles a packet
   *
   * @api private
   */

  SocketNamespace.prototype.onPacket = function (packet) {
    var self = this;

    function ack () {
      self.packet({
          type: 'ack'
        , args: io.util.toArray(arguments)
        , ackId: packet.id
      });
    };

    switch (packet.type) {
      case 'connect':
        this.$emit('connect');
        break;

      case 'disconnect':
        if (this.name === '') {
          this.socket.onDisconnect(packet.reason || 'booted');
        } else {
          this.$emit('disconnect', packet.reason);
        }
        break;

      case 'message':
      case 'json':
        var params = ['message', packet.data];

        if (packet.ack == 'data') {
          params.push(ack);
        } else if (packet.ack) {
          this.packet({ type: 'ack', ackId: packet.id });
        }

        this.$emit.apply(this, params);
        break;

      case 'event':
        var params = [packet.name].concat(packet.args);

        if (packet.ack == 'data')
          params.push(ack);

        this.$emit.apply(this, params);
        break;

      case 'ack':
        if (this.acks[packet.ackId]) {
          this.acks[packet.ackId].apply(this, packet.args);
          delete this.acks[packet.ackId];
        }
        break;

      case 'error':
        if (packet.advice){
          this.socket.onError(packet);
        } else {
          if (packet.reason == 'unauthorized') {
            this.$emit('connect_failed', packet.reason);
          } else {
            this.$emit('error', packet.reason);
          }
        }
        break;
    }
  };

  /**
   * Flag interface.
   *
   * @api private
   */

  function Flag (nsp, name) {
    this.namespace = nsp;
    this.name = name;
  };

  /**
   * Send a message
   *
   * @api public
   */

  Flag.prototype.send = function () {
    this.namespace.flags[this.name] = true;
    this.namespace.send.apply(this.namespace, arguments);
  };

  /**
   * Emit an event
   *
   * @api public
   */

  Flag.prototype.emit = function () {
    this.namespace.flags[this.name] = true;
    this.namespace.emit.apply(this.namespace, arguments);
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports.websocket = WS;

  /**
   * The WebSocket transport uses the HTML5 WebSocket API to establish an
   * persistent connection with the Socket.IO server. This transport will also
   * be inherited by the FlashSocket fallback as it provides a API compatible
   * polyfill for the WebSockets.
   *
   * @constructor
   * @extends {io.Transport}
   * @api public
   */

  function WS (socket) {
    io.Transport.apply(this, arguments);
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(WS, io.Transport);

  /**
   * Transport name
   *
   * @api public
   */

  WS.prototype.name = 'websocket';

  /**
   * Initializes a new `WebSocket` connection with the Socket.IO server. We attach
   * all the appropriate listeners to handle the responses from the server.
   *
   * @returns {Transport}
   * @api public
   */

  WS.prototype.open = function () {
    var query = io.util.query(this.socket.options.query)
      , self = this
      , Socket


    if (!Socket) {
      Socket = global.MozWebSocket || global.WebSocket;
    }

    this.websocket = new Socket(this.prepareUrl() + query);

    this.websocket.onopen = function () {
      self.onOpen();
      self.socket.setBuffer(false);
    };
    this.websocket.onmessage = function (ev) {
      self.onData(ev.data);
    };
    this.websocket.onclose = function () {
      self.onClose();
      self.socket.setBuffer(true);
    };
    this.websocket.onerror = function (e) {
      self.onError(e);
    };

    return this;
  };

  /**
   * Send a message to the Socket.IO server. The message will automatically be
   * encoded in the correct message format.
   *
   * @returns {Transport}
   * @api public
   */

  // Do to a bug in the current IDevices browser, we need to wrap the send in a 
  // setTimeout, when they resume from sleeping the browser will crash if 
  // we don't allow the browser time to detect the socket has been closed
  if (io.util.ua.iDevice) {
    WS.prototype.send = function (data) {
      var self = this;
      setTimeout(function() {
         self.websocket.send(data);
      },0);
      return this;
    };
  } else {
    WS.prototype.send = function (data) {
      this.websocket.send(data);
      return this;
    };
  }

  /**
   * Payload
   *
   * @api private
   */

  WS.prototype.payload = function (arr) {
    for (var i = 0, l = arr.length; i < l; i++) {
      this.packet(arr[i]);
    }
    return this;
  };

  /**
   * Disconnect the established `WebSocket` connection.
   *
   * @returns {Transport}
   * @api public
   */

  WS.prototype.close = function () {
    this.websocket.close();
    return this;
  };

  /**
   * Handle the errors that `WebSocket` might be giving when we
   * are attempting to connect or send messages.
   *
   * @param {Error} e The error.
   * @api private
   */

  WS.prototype.onError = function (e) {
    this.socket.onError(e);
  };

  /**
   * Returns the appropriate scheme for the URI generation.
   *
   * @api private
   */
  WS.prototype.scheme = function () {
    return this.socket.options.secure ? 'wss' : 'ws';
  };

  /**
   * Checks if the browser has support for native `WebSockets` and that
   * it's not the polyfill created for the FlashSocket transport.
   *
   * @return {Boolean}
   * @api public
   */

  WS.check = function () {
    return ('WebSocket' in global && !('__addTask' in WebSocket))
          || 'MozWebSocket' in global;
  };

  /**
   * Check if the `WebSocket` transport support cross domain communications.
   *
   * @returns {Boolean}
   * @api public
   */

  WS.xdomainCheck = function () {
    return true;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('websocket');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.flashsocket = Flashsocket;

  /**
   * The FlashSocket transport. This is a API wrapper for the HTML5 WebSocket
   * specification. It uses a .swf file to communicate with the server. If you want
   * to serve the .swf file from a other server than where the Socket.IO script is
   * coming from you need to use the insecure version of the .swf. More information
   * about this can be found on the github page.
   *
   * @constructor
   * @extends {io.Transport.websocket}
   * @api public
   */

  function Flashsocket () {
    io.Transport.websocket.apply(this, arguments);
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(Flashsocket, io.Transport.websocket);

  /**
   * Transport name
   *
   * @api public
   */

  Flashsocket.prototype.name = 'flashsocket';

  /**
   * Disconnect the established `FlashSocket` connection. This is done by adding a 
   * new task to the FlashSocket. The rest will be handled off by the `WebSocket` 
   * transport.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.open = function () {
    var self = this
      , args = arguments;

    WebSocket.__addTask(function () {
      io.Transport.websocket.prototype.open.apply(self, args);
    });
    return this;
  };
  
  /**
   * Sends a message to the Socket.IO server. This is done by adding a new
   * task to the FlashSocket. The rest will be handled off by the `WebSocket` 
   * transport.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.send = function () {
    var self = this, args = arguments;
    WebSocket.__addTask(function () {
      io.Transport.websocket.prototype.send.apply(self, args);
    });
    return this;
  };

  /**
   * Disconnects the established `FlashSocket` connection.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.close = function () {
    WebSocket.__tasks.length = 0;
    io.Transport.websocket.prototype.close.call(this);
    return this;
  };

  /**
   * The WebSocket fall back needs to append the flash container to the body
   * element, so we need to make sure we have access to it. Or defer the call
   * until we are sure there is a body element.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  Flashsocket.prototype.ready = function (socket, fn) {
    function init () {
      var options = socket.options
        , port = options['flash policy port']
        , path = [
              'http' + (options.secure ? 's' : '') + ':/'
            , options.host + ':' + options.port
            , options.resource
            , 'static/flashsocket'
            , 'WebSocketMain' + (socket.isXDomain() ? 'Insecure' : '') + '.swf'
          ];

      // Only start downloading the swf file when the checked that this browser
      // actually supports it
      if (!Flashsocket.loaded) {
        if (typeof WEB_SOCKET_SWF_LOCATION === 'undefined') {
          // Set the correct file based on the XDomain settings
          WEB_SOCKET_SWF_LOCATION = path.join('/');
        }

        if (port !== 843) {
          WebSocket.loadFlashPolicyFile('xmlsocket://' + options.host + ':' + port);
        }

        WebSocket.__initialize();
        Flashsocket.loaded = true;
      }

      fn.call(self);
    }

    var self = this;
    if (document.body) return init();

    io.util.load(init);
  };

  /**
   * Check if the FlashSocket transport is supported as it requires that the Adobe
   * Flash Player plug-in version `10.0.0` or greater is installed. And also check if
   * the polyfill is correctly loaded.
   *
   * @returns {Boolean}
   * @api public
   */

  Flashsocket.check = function () {
    if (
        typeof WebSocket == 'undefined'
      || !('__initialize' in WebSocket) || !swfobject
    ) return false;

    return swfobject.getFlashPlayerVersion().major >= 10;
  };

  /**
   * Check if the FlashSocket transport can be used as cross domain / cross origin 
   * transport. Because we can't see which type (secure or insecure) of .swf is used
   * we will just return true.
   *
   * @returns {Boolean}
   * @api public
   */

  Flashsocket.xdomainCheck = function () {
    return true;
  };

  /**
   * Disable AUTO_INITIALIZATION
   */

  if (typeof window != 'undefined') {
    WEB_SOCKET_DISABLE_AUTO_INITIALIZATION = true;
  }

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('flashsocket');
})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/*	SWFObject v2.2 <http://code.google.com/p/swfobject/> 
	is released under the MIT License <http://www.opensource.org/licenses/mit-license.php> 
*/
if ('undefined' != typeof window) {
var swfobject=function(){var D="undefined",r="object",S="Shockwave Flash",W="ShockwaveFlash.ShockwaveFlash",q="application/x-shockwave-flash",R="SWFObjectExprInst",x="onreadystatechange",O=window,j=document,t=navigator,T=false,U=[h],o=[],N=[],I=[],l,Q,E,B,J=false,a=false,n,G,m=true,M=function(){var aa=typeof j.getElementById!=D&&typeof j.getElementsByTagName!=D&&typeof j.createElement!=D,ah=t.userAgent.toLowerCase(),Y=t.platform.toLowerCase(),ae=Y?/win/.test(Y):/win/.test(ah),ac=Y?/mac/.test(Y):/mac/.test(ah),af=/webkit/.test(ah)?parseFloat(ah.replace(/^.*webkit\/(\d+(\.\d+)?).*$/,"$1")):false,X=!+"\v1",ag=[0,0,0],ab=null;if(typeof t.plugins!=D&&typeof t.plugins[S]==r){ab=t.plugins[S].description;if(ab&&!(typeof t.mimeTypes!=D&&t.mimeTypes[q]&&!t.mimeTypes[q].enabledPlugin)){T=true;X=false;ab=ab.replace(/^.*\s+(\S+\s+\S+$)/,"$1");ag[0]=parseInt(ab.replace(/^(.*)\..*$/,"$1"),10);ag[1]=parseInt(ab.replace(/^.*\.(.*)\s.*$/,"$1"),10);ag[2]=/[a-zA-Z]/.test(ab)?parseInt(ab.replace(/^.*[a-zA-Z]+(.*)$/,"$1"),10):0}}else{if(typeof O[(['Active'].concat('Object').join('X'))]!=D){try{var ad=new window[(['Active'].concat('Object').join('X'))](W);if(ad){ab=ad.GetVariable("$version");if(ab){X=true;ab=ab.split(" ")[1].split(",");ag=[parseInt(ab[0],10),parseInt(ab[1],10),parseInt(ab[2],10)]}}}catch(Z){}}}return{w3:aa,pv:ag,wk:af,ie:X,win:ae,mac:ac}}(),k=function(){if(!M.w3){return}if((typeof j.readyState!=D&&j.readyState=="complete")||(typeof j.readyState==D&&(j.getElementsByTagName("body")[0]||j.body))){f()}if(!J){if(typeof j.addEventListener!=D){j.addEventListener("DOMContentLoaded",f,false)}if(M.ie&&M.win){j.attachEvent(x,function(){if(j.readyState=="complete"){j.detachEvent(x,arguments.callee);f()}});if(O==top){(function(){if(J){return}try{j.documentElement.doScroll("left")}catch(X){setTimeout(arguments.callee,0);return}f()})()}}if(M.wk){(function(){if(J){return}if(!/loaded|complete/.test(j.readyState)){setTimeout(arguments.callee,0);return}f()})()}s(f)}}();function f(){if(J){return}try{var Z=j.getElementsByTagName("body")[0].appendChild(C("span"));Z.parentNode.removeChild(Z)}catch(aa){return}J=true;var X=U.length;for(var Y=0;Y<X;Y++){U[Y]()}}function K(X){if(J){X()}else{U[U.length]=X}}function s(Y){if(typeof O.addEventListener!=D){O.addEventListener("load",Y,false)}else{if(typeof j.addEventListener!=D){j.addEventListener("load",Y,false)}else{if(typeof O.attachEvent!=D){i(O,"onload",Y)}else{if(typeof O.onload=="function"){var X=O.onload;O.onload=function(){X();Y()}}else{O.onload=Y}}}}}function h(){if(T){V()}else{H()}}function V(){var X=j.getElementsByTagName("body")[0];var aa=C(r);aa.setAttribute("type",q);var Z=X.appendChild(aa);if(Z){var Y=0;(function(){if(typeof Z.GetVariable!=D){var ab=Z.GetVariable("$version");if(ab){ab=ab.split(" ")[1].split(",");M.pv=[parseInt(ab[0],10),parseInt(ab[1],10),parseInt(ab[2],10)]}}else{if(Y<10){Y++;setTimeout(arguments.callee,10);return}}X.removeChild(aa);Z=null;H()})()}else{H()}}function H(){var ag=o.length;if(ag>0){for(var af=0;af<ag;af++){var Y=o[af].id;var ab=o[af].callbackFn;var aa={success:false,id:Y};if(M.pv[0]>0){var ae=c(Y);if(ae){if(F(o[af].swfVersion)&&!(M.wk&&M.wk<312)){w(Y,true);if(ab){aa.success=true;aa.ref=z(Y);ab(aa)}}else{if(o[af].expressInstall&&A()){var ai={};ai.data=o[af].expressInstall;ai.width=ae.getAttribute("width")||"0";ai.height=ae.getAttribute("height")||"0";if(ae.getAttribute("class")){ai.styleclass=ae.getAttribute("class")}if(ae.getAttribute("align")){ai.align=ae.getAttribute("align")}var ah={};var X=ae.getElementsByTagName("param");var ac=X.length;for(var ad=0;ad<ac;ad++){if(X[ad].getAttribute("name").toLowerCase()!="movie"){ah[X[ad].getAttribute("name")]=X[ad].getAttribute("value")}}P(ai,ah,Y,ab)}else{p(ae);if(ab){ab(aa)}}}}}else{w(Y,true);if(ab){var Z=z(Y);if(Z&&typeof Z.SetVariable!=D){aa.success=true;aa.ref=Z}ab(aa)}}}}}function z(aa){var X=null;var Y=c(aa);if(Y&&Y.nodeName=="OBJECT"){if(typeof Y.SetVariable!=D){X=Y}else{var Z=Y.getElementsByTagName(r)[0];if(Z){X=Z}}}return X}function A(){return !a&&F("6.0.65")&&(M.win||M.mac)&&!(M.wk&&M.wk<312)}function P(aa,ab,X,Z){a=true;E=Z||null;B={success:false,id:X};var ae=c(X);if(ae){if(ae.nodeName=="OBJECT"){l=g(ae);Q=null}else{l=ae;Q=X}aa.id=R;if(typeof aa.width==D||(!/%$/.test(aa.width)&&parseInt(aa.width,10)<310)){aa.width="310"}if(typeof aa.height==D||(!/%$/.test(aa.height)&&parseInt(aa.height,10)<137)){aa.height="137"}j.title=j.title.slice(0,47)+" - Flash Player Installation";var ad=M.ie&&M.win?(['Active'].concat('').join('X')):"PlugIn",ac="MMredirectURL="+O.location.toString().replace(/&/g,"%26")+"&MMplayerType="+ad+"&MMdoctitle="+j.title;if(typeof ab.flashvars!=D){ab.flashvars+="&"+ac}else{ab.flashvars=ac}if(M.ie&&M.win&&ae.readyState!=4){var Y=C("div");X+="SWFObjectNew";Y.setAttribute("id",X);ae.parentNode.insertBefore(Y,ae);ae.style.display="none";(function(){if(ae.readyState==4){ae.parentNode.removeChild(ae)}else{setTimeout(arguments.callee,10)}})()}u(aa,ab,X)}}function p(Y){if(M.ie&&M.win&&Y.readyState!=4){var X=C("div");Y.parentNode.insertBefore(X,Y);X.parentNode.replaceChild(g(Y),X);Y.style.display="none";(function(){if(Y.readyState==4){Y.parentNode.removeChild(Y)}else{setTimeout(arguments.callee,10)}})()}else{Y.parentNode.replaceChild(g(Y),Y)}}function g(ab){var aa=C("div");if(M.win&&M.ie){aa.innerHTML=ab.innerHTML}else{var Y=ab.getElementsByTagName(r)[0];if(Y){var ad=Y.childNodes;if(ad){var X=ad.length;for(var Z=0;Z<X;Z++){if(!(ad[Z].nodeType==1&&ad[Z].nodeName=="PARAM")&&!(ad[Z].nodeType==8)){aa.appendChild(ad[Z].cloneNode(true))}}}}}return aa}function u(ai,ag,Y){var X,aa=c(Y);if(M.wk&&M.wk<312){return X}if(aa){if(typeof ai.id==D){ai.id=Y}if(M.ie&&M.win){var ah="";for(var ae in ai){if(ai[ae]!=Object.prototype[ae]){if(ae.toLowerCase()=="data"){ag.movie=ai[ae]}else{if(ae.toLowerCase()=="styleclass"){ah+=' class="'+ai[ae]+'"'}else{if(ae.toLowerCase()!="classid"){ah+=" "+ae+'="'+ai[ae]+'"'}}}}}var af="";for(var ad in ag){if(ag[ad]!=Object.prototype[ad]){af+='<param name="'+ad+'" value="'+ag[ad]+'" />'}}aa.outerHTML='<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"'+ah+">"+af+"</object>";N[N.length]=ai.id;X=c(ai.id)}else{var Z=C(r);Z.setAttribute("type",q);for(var ac in ai){if(ai[ac]!=Object.prototype[ac]){if(ac.toLowerCase()=="styleclass"){Z.setAttribute("class",ai[ac])}else{if(ac.toLowerCase()!="classid"){Z.setAttribute(ac,ai[ac])}}}}for(var ab in ag){if(ag[ab]!=Object.prototype[ab]&&ab.toLowerCase()!="movie"){e(Z,ab,ag[ab])}}aa.parentNode.replaceChild(Z,aa);X=Z}}return X}function e(Z,X,Y){var aa=C("param");aa.setAttribute("name",X);aa.setAttribute("value",Y);Z.appendChild(aa)}function y(Y){var X=c(Y);if(X&&X.nodeName=="OBJECT"){if(M.ie&&M.win){X.style.display="none";(function(){if(X.readyState==4){b(Y)}else{setTimeout(arguments.callee,10)}})()}else{X.parentNode.removeChild(X)}}}function b(Z){var Y=c(Z);if(Y){for(var X in Y){if(typeof Y[X]=="function"){Y[X]=null}}Y.parentNode.removeChild(Y)}}function c(Z){var X=null;try{X=j.getElementById(Z)}catch(Y){}return X}function C(X){return j.createElement(X)}function i(Z,X,Y){Z.attachEvent(X,Y);I[I.length]=[Z,X,Y]}function F(Z){var Y=M.pv,X=Z.split(".");X[0]=parseInt(X[0],10);X[1]=parseInt(X[1],10)||0;X[2]=parseInt(X[2],10)||0;return(Y[0]>X[0]||(Y[0]==X[0]&&Y[1]>X[1])||(Y[0]==X[0]&&Y[1]==X[1]&&Y[2]>=X[2]))?true:false}function v(ac,Y,ad,ab){if(M.ie&&M.mac){return}var aa=j.getElementsByTagName("head")[0];if(!aa){return}var X=(ad&&typeof ad=="string")?ad:"screen";if(ab){n=null;G=null}if(!n||G!=X){var Z=C("style");Z.setAttribute("type","text/css");Z.setAttribute("media",X);n=aa.appendChild(Z);if(M.ie&&M.win&&typeof j.styleSheets!=D&&j.styleSheets.length>0){n=j.styleSheets[j.styleSheets.length-1]}G=X}if(M.ie&&M.win){if(n&&typeof n.addRule==r){n.addRule(ac,Y)}}else{if(n&&typeof j.createTextNode!=D){n.appendChild(j.createTextNode(ac+" {"+Y+"}"))}}}function w(Z,X){if(!m){return}var Y=X?"visible":"hidden";if(J&&c(Z)){c(Z).style.visibility=Y}else{v("#"+Z,"visibility:"+Y)}}function L(Y){var Z=/[\\\"<>\.;]/;var X=Z.exec(Y)!=null;return X&&typeof encodeURIComponent!=D?encodeURIComponent(Y):Y}var d=function(){if(M.ie&&M.win){window.attachEvent("onunload",function(){var ac=I.length;for(var ab=0;ab<ac;ab++){I[ab][0].detachEvent(I[ab][1],I[ab][2])}var Z=N.length;for(var aa=0;aa<Z;aa++){y(N[aa])}for(var Y in M){M[Y]=null}M=null;for(var X in swfobject){swfobject[X]=null}swfobject=null})}}();return{registerObject:function(ab,X,aa,Z){if(M.w3&&ab&&X){var Y={};Y.id=ab;Y.swfVersion=X;Y.expressInstall=aa;Y.callbackFn=Z;o[o.length]=Y;w(ab,false)}else{if(Z){Z({success:false,id:ab})}}},getObjectById:function(X){if(M.w3){return z(X)}},embedSWF:function(ab,ah,ae,ag,Y,aa,Z,ad,af,ac){var X={success:false,id:ah};if(M.w3&&!(M.wk&&M.wk<312)&&ab&&ah&&ae&&ag&&Y){w(ah,false);K(function(){ae+="";ag+="";var aj={};if(af&&typeof af===r){for(var al in af){aj[al]=af[al]}}aj.data=ab;aj.width=ae;aj.height=ag;var am={};if(ad&&typeof ad===r){for(var ak in ad){am[ak]=ad[ak]}}if(Z&&typeof Z===r){for(var ai in Z){if(typeof am.flashvars!=D){am.flashvars+="&"+ai+"="+Z[ai]}else{am.flashvars=ai+"="+Z[ai]}}}if(F(Y)){var an=u(aj,am,ah);if(aj.id==ah){w(ah,true)}X.success=true;X.ref=an}else{if(aa&&A()){aj.data=aa;P(aj,am,ah,ac);return}else{w(ah,true)}}if(ac){ac(X)}})}else{if(ac){ac(X)}}},switchOffAutoHideShow:function(){m=false},ua:M,getFlashPlayerVersion:function(){return{major:M.pv[0],minor:M.pv[1],release:M.pv[2]}},hasFlashPlayerVersion:F,createSWF:function(Z,Y,X){if(M.w3){return u(Z,Y,X)}else{return undefined}},showExpressInstall:function(Z,aa,X,Y){if(M.w3&&A()){P(Z,aa,X,Y)}},removeSWF:function(X){if(M.w3){y(X)}},createCSS:function(aa,Z,Y,X){if(M.w3){v(aa,Z,Y,X)}},addDomLoadEvent:K,addLoadEvent:s,getQueryParamValue:function(aa){var Z=j.location.search||j.location.hash;if(Z){if(/\?/.test(Z)){Z=Z.split("?")[1]}if(aa==null){return L(Z)}var Y=Z.split("&");for(var X=0;X<Y.length;X++){if(Y[X].substring(0,Y[X].indexOf("="))==aa){return L(Y[X].substring((Y[X].indexOf("=")+1)))}}}return""},expressInstallCallback:function(){if(a){var X=c(R);if(X&&l){X.parentNode.replaceChild(l,X);if(Q){w(Q,true);if(M.ie&&M.win){l.style.display="block"}}if(E){E(B)}}a=false}}}}();
}
// Copyright: Hiroshi Ichikawa <http://gimite.net/en/>
// License: New BSD License
// Reference: http://dev.w3.org/html5/websockets/
// Reference: http://tools.ietf.org/html/draft-hixie-thewebsocketprotocol

(function() {
  
  if ('undefined' == typeof window || window.WebSocket) return;

  var console = window.console;
  if (!console || !console.log || !console.error) {
    console = {log: function(){ }, error: function(){ }};
  }
  
  if (!swfobject.hasFlashPlayerVersion("10.0.0")) {
    console.error("Flash Player >= 10.0.0 is required.");
    return;
  }
  if (location.protocol == "file:") {
    console.error(
      "WARNING: web-socket-js doesn't work in file:///... URL " +
      "unless you set Flash Security Settings properly. " +
      "Open the page via Web server i.e. http://...");
  }

  /**
   * This class represents a faux web socket.
   * @param {string} url
   * @param {array or string} protocols
   * @param {string} proxyHost
   * @param {int} proxyPort
   * @param {string} headers
   */
  WebSocket = function(url, protocols, proxyHost, proxyPort, headers) {
    var self = this;
    self.__id = WebSocket.__nextId++;
    WebSocket.__instances[self.__id] = self;
    self.readyState = WebSocket.CONNECTING;
    self.bufferedAmount = 0;
    self.__events = {};
    if (!protocols) {
      protocols = [];
    } else if (typeof protocols == "string") {
      protocols = [protocols];
    }
    // Uses setTimeout() to make sure __createFlash() runs after the caller sets ws.onopen etc.
    // Otherwise, when onopen fires immediately, onopen is called before it is set.
    setTimeout(function() {
      WebSocket.__addTask(function() {
        WebSocket.__flash.create(
            self.__id, url, protocols, proxyHost || null, proxyPort || 0, headers || null);
      });
    }, 0);
  };

  /**
   * Send data to the web socket.
   * @param {string} data  The data to send to the socket.
   * @return {boolean}  True for success, false for failure.
   */
  WebSocket.prototype.send = function(data) {
    if (this.readyState == WebSocket.CONNECTING) {
      throw "INVALID_STATE_ERR: Web Socket connection has not been established";
    }
    // We use encodeURIComponent() here, because FABridge doesn't work if
    // the argument includes some characters. We don't use escape() here
    // because of this:
    // https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Functions#escape_and_unescape_Functions
    // But it looks decodeURIComponent(encodeURIComponent(s)) doesn't
    // preserve all Unicode characters either e.g. "\uffff" in Firefox.
    // Note by wtritch: Hopefully this will not be necessary using ExternalInterface.  Will require
    // additional testing.
    var result = WebSocket.__flash.send(this.__id, encodeURIComponent(data));
    if (result < 0) { // success
      return true;
    } else {
      this.bufferedAmount += result;
      return false;
    }
  };

  /**
   * Close this web socket gracefully.
   */
  WebSocket.prototype.close = function() {
    if (this.readyState == WebSocket.CLOSED || this.readyState == WebSocket.CLOSING) {
      return;
    }
    this.readyState = WebSocket.CLOSING;
    WebSocket.__flash.close(this.__id);
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {string} type
   * @param {function} listener
   * @param {boolean} useCapture
   * @return void
   */
  WebSocket.prototype.addEventListener = function(type, listener, useCapture) {
    if (!(type in this.__events)) {
      this.__events[type] = [];
    }
    this.__events[type].push(listener);
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {string} type
   * @param {function} listener
   * @param {boolean} useCapture
   * @return void
   */
  WebSocket.prototype.removeEventListener = function(type, listener, useCapture) {
    if (!(type in this.__events)) return;
    var events = this.__events[type];
    for (var i = events.length - 1; i >= 0; --i) {
      if (events[i] === listener) {
        events.splice(i, 1);
        break;
      }
    }
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {Event} event
   * @return void
   */
  WebSocket.prototype.dispatchEvent = function(event) {
    var events = this.__events[event.type] || [];
    for (var i = 0; i < events.length; ++i) {
      events[i](event);
    }
    var handler = this["on" + event.type];
    if (handler) handler(event);
  };

  /**
   * Handles an event from Flash.
   * @param {Object} flashEvent
   */
  WebSocket.prototype.__handleEvent = function(flashEvent) {
    if ("readyState" in flashEvent) {
      this.readyState = flashEvent.readyState;
    }
    if ("protocol" in flashEvent) {
      this.protocol = flashEvent.protocol;
    }
    
    var jsEvent;
    if (flashEvent.type == "open" || flashEvent.type == "error") {
      jsEvent = this.__createSimpleEvent(flashEvent.type);
    } else if (flashEvent.type == "close") {
      // TODO implement jsEvent.wasClean
      jsEvent = this.__createSimpleEvent("close");
    } else if (flashEvent.type == "message") {
      var data = decodeURIComponent(flashEvent.message);
      jsEvent = this.__createMessageEvent("message", data);
    } else {
      throw "unknown event type: " + flashEvent.type;
    }
    
    this.dispatchEvent(jsEvent);
  };
  
  WebSocket.prototype.__createSimpleEvent = function(type) {
    if (document.createEvent && window.Event) {
      var event = document.createEvent("Event");
      event.initEvent(type, false, false);
      return event;
    } else {
      return {type: type, bubbles: false, cancelable: false};
    }
  };
  
  WebSocket.prototype.__createMessageEvent = function(type, data) {
    if (document.createEvent && window.MessageEvent && !window.opera) {
      var event = document.createEvent("MessageEvent");
      event.initMessageEvent("message", false, false, data, null, null, window, null);
      return event;
    } else {
      // IE and Opera, the latter one truncates the data parameter after any 0x00 bytes.
      return {type: type, data: data, bubbles: false, cancelable: false};
    }
  };
  
  /**
   * Define the WebSocket readyState enumeration.
   */
  WebSocket.CONNECTING = 0;
  WebSocket.OPEN = 1;
  WebSocket.CLOSING = 2;
  WebSocket.CLOSED = 3;

  WebSocket.__flash = null;
  WebSocket.__instances = {};
  WebSocket.__tasks = [];
  WebSocket.__nextId = 0;
  
  /**
   * Load a new flash security policy file.
   * @param {string} url
   */
  WebSocket.loadFlashPolicyFile = function(url){
    WebSocket.__addTask(function() {
      WebSocket.__flash.loadManualPolicyFile(url);
    });
  };

  /**
   * Loads WebSocketMain.swf and creates WebSocketMain object in Flash.
   */
  WebSocket.__initialize = function() {
    if (WebSocket.__flash) return;
    
    if (WebSocket.__swfLocation) {
      // For backword compatibility.
      window.WEB_SOCKET_SWF_LOCATION = WebSocket.__swfLocation;
    }
    if (!window.WEB_SOCKET_SWF_LOCATION) {
      console.error("[WebSocket] set WEB_SOCKET_SWF_LOCATION to location of WebSocketMain.swf");
      return;
    }
    var container = document.createElement("div");
    container.id = "webSocketContainer";
    // Hides Flash box. We cannot use display: none or visibility: hidden because it prevents
    // Flash from loading at least in IE. So we move it out of the screen at (-100, -100).
    // But this even doesn't work with Flash Lite (e.g. in Droid Incredible). So with Flash
    // Lite, we put it at (0, 0). This shows 1x1 box visible at left-top corner but this is
    // the best we can do as far as we know now.
    container.style.position = "absolute";
    if (WebSocket.__isFlashLite()) {
      container.style.left = "0px";
      container.style.top = "0px";
    } else {
      container.style.left = "-100px";
      container.style.top = "-100px";
    }
    var holder = document.createElement("div");
    holder.id = "webSocketFlash";
    container.appendChild(holder);
    document.body.appendChild(container);
    // See this article for hasPriority:
    // http://help.adobe.com/en_US/as3/mobile/WS4bebcd66a74275c36cfb8137124318eebc6-7ffd.html
    swfobject.embedSWF(
      WEB_SOCKET_SWF_LOCATION,
      "webSocketFlash",
      "1" /* width */,
      "1" /* height */,
      "10.0.0" /* SWF version */,
      null,
      null,
      {hasPriority: true, swliveconnect : true, allowScriptAccess: "always"},
      null,
      function(e) {
        if (!e.success) {
          console.error("[WebSocket] swfobject.embedSWF failed");
        }
      });
  };
  
  /**
   * Called by Flash to notify JS that it's fully loaded and ready
   * for communication.
   */
  WebSocket.__onFlashInitialized = function() {
    // We need to set a timeout here to avoid round-trip calls
    // to flash during the initialization process.
    setTimeout(function() {
      WebSocket.__flash = document.getElementById("webSocketFlash");
      WebSocket.__flash.setCallerUrl(location.href);
      WebSocket.__flash.setDebug(!!window.WEB_SOCKET_DEBUG);
      for (var i = 0; i < WebSocket.__tasks.length; ++i) {
        WebSocket.__tasks[i]();
      }
      WebSocket.__tasks = [];
    }, 0);
  };
  
  /**
   * Called by Flash to notify WebSockets events are fired.
   */
  WebSocket.__onFlashEvent = function() {
    setTimeout(function() {
      try {
        // Gets events using receiveEvents() instead of getting it from event object
        // of Flash event. This is to make sure to keep message order.
        // It seems sometimes Flash events don't arrive in the same order as they are sent.
        var events = WebSocket.__flash.receiveEvents();
        for (var i = 0; i < events.length; ++i) {
          WebSocket.__instances[events[i].webSocketId].__handleEvent(events[i]);
        }
      } catch (e) {
        console.error(e);
      }
    }, 0);
    return true;
  };
  
  // Called by Flash.
  WebSocket.__log = function(message) {
    console.log(decodeURIComponent(message));
  };
  
  // Called by Flash.
  WebSocket.__error = function(message) {
    console.error(decodeURIComponent(message));
  };
  
  WebSocket.__addTask = function(task) {
    if (WebSocket.__flash) {
      task();
    } else {
      WebSocket.__tasks.push(task);
    }
  };
  
  /**
   * Test if the browser is running flash lite.
   * @return {boolean} True if flash lite is running, false otherwise.
   */
  WebSocket.__isFlashLite = function() {
    if (!window.navigator || !window.navigator.mimeTypes) {
      return false;
    }
    var mimeType = window.navigator.mimeTypes["application/x-shockwave-flash"];
    if (!mimeType || !mimeType.enabledPlugin || !mimeType.enabledPlugin.filename) {
      return false;
    }
    return mimeType.enabledPlugin.filename.match(/flashlite/i) ? true : false;
  };
  
  if (!window.WEB_SOCKET_DISABLE_AUTO_INITIALIZATION) {
    if (window.addEventListener) {
      window.addEventListener("load", function(){
        WebSocket.__initialize();
      }, false);
    } else {
      window.attachEvent("onload", function(){
        WebSocket.__initialize();
      });
    }
  }
  
})();

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   *
   * @api public
   */

  exports.XHR = XHR;

  /**
   * XHR constructor
   *
   * @costructor
   * @api public
   */

  function XHR (socket) {
    if (!socket) return;

    io.Transport.apply(this, arguments);
    this.sendBuffer = [];
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(XHR, io.Transport);

  /**
   * Establish a connection
   *
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.open = function () {
    this.socket.setBuffer(false);
    this.onOpen();
    this.get();

    // we need to make sure the request succeeds since we have no indication
    // whether the request opened or not until it succeeded.
    this.setCloseTimeout();

    return this;
  };

  /**
   * Check if we need to send data to the Socket.IO server, if we have data in our
   * buffer we encode it and forward it to the `post` method.
   *
   * @api private
   */

  XHR.prototype.payload = function (payload) {
    var msgs = [];

    for (var i = 0, l = payload.length; i < l; i++) {
      msgs.push(io.parser.encodePacket(payload[i]));
    }

    this.send(io.parser.encodePayload(msgs));
  };

  /**
   * Send data to the Socket.IO server.
   *
   * @param data The message
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.send = function (data) {
    this.post(data);
    return this;
  };

  /**
   * Posts a encoded message to the Socket.IO server.
   *
   * @param {String} data A encoded message.
   * @api private
   */

  function empty () { };

  XHR.prototype.post = function (data) {
    var self = this;
    this.socket.setBuffer(true);

    function stateChange () {
      if (this.readyState == 4) {
        this.onreadystatechange = empty;
        self.posting = false;

        if (this.status == 200){
          self.socket.setBuffer(false);
        } else {
          self.onClose();
        }
      }
    }

    function onload () {
      this.onload = empty;
      self.socket.setBuffer(false);
    };

    this.sendXHR = this.request('POST');

    if (global.XDomainRequest && this.sendXHR instanceof XDomainRequest) {
      this.sendXHR.onload = this.sendXHR.onerror = onload;
    } else {
      this.sendXHR.onreadystatechange = stateChange;
    }

    this.sendXHR.send(data);
  };

  /**
   * Disconnects the established `XHR` connection.
   *
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.close = function () {
    this.onClose();
    return this;
  };

  /**
   * Generates a configured XHR request
   *
   * @param {String} url The url that needs to be requested.
   * @param {String} method The method the request should use.
   * @returns {XMLHttpRequest}
   * @api private
   */

  XHR.prototype.request = function (method) {
    var req = io.util.request(this.socket.isXDomain())
      , query = io.util.query(this.socket.options.query, 't=' + +new Date);

    req.open(method || 'GET', this.prepareUrl() + query, true);

    if (method == 'POST') {
      try {
        if (req.setRequestHeader) {
          req.setRequestHeader('Content-type', 'text/plain;charset=UTF-8');
        } else {
          // XDomainRequest
          req.contentType = 'text/plain';
        }
      } catch (e) {}
    }

    return req;
  };

  /**
   * Returns the scheme to use for the transport URLs.
   *
   * @api private
   */

  XHR.prototype.scheme = function () {
    return this.socket.options.secure ? 'https' : 'http';
  };

  /**
   * Check if the XHR transports are supported
   *
   * @param {Boolean} xdomain Check if we support cross domain requests.
   * @returns {Boolean}
   * @api public
   */

  XHR.check = function (socket, xdomain) {
    try {
      var request = io.util.request(xdomain),
          usesXDomReq = (global.XDomainRequest && request instanceof XDomainRequest),
          socketProtocol = (socket && socket.options && socket.options.secure ? 'https:' : 'http:'),
          isXProtocol = (global.location && socketProtocol != global.location.protocol);
      if (request && !(usesXDomReq && isXProtocol)) {
        return true;
      }
    } catch(e) {}

    return false;
  };

  /**
   * Check if the XHR transport supports cross domain requests.
   *
   * @returns {Boolean}
   * @api public
   */

  XHR.xdomainCheck = function (socket) {
    return XHR.check(socket, true);
  };

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.htmlfile = HTMLFile;

  /**
   * The HTMLFile transport creates a `forever iframe` based transport
   * for Internet Explorer. Regular forever iframe implementations will 
   * continuously trigger the browsers buzy indicators. If the forever iframe
   * is created inside a `htmlfile` these indicators will not be trigged.
   *
   * @constructor
   * @extends {io.Transport.XHR}
   * @api public
   */

  function HTMLFile (socket) {
    io.Transport.XHR.apply(this, arguments);
  };

  /**
   * Inherits from XHR transport.
   */

  io.util.inherit(HTMLFile, io.Transport.XHR);

  /**
   * Transport name
   *
   * @api public
   */

  HTMLFile.prototype.name = 'htmlfile';

  /**
   * Creates a new Ac...eX `htmlfile` with a forever loading iframe
   * that can be used to listen to messages. Inside the generated
   * `htmlfile` a reference will be made to the HTMLFile transport.
   *
   * @api private
   */

  HTMLFile.prototype.get = function () {
    this.doc = new window[(['Active'].concat('Object').join('X'))]('htmlfile');
    this.doc.open();
    this.doc.write('<html></html>');
    this.doc.close();
    this.doc.parentWindow.s = this;

    var iframeC = this.doc.createElement('div');
    iframeC.className = 'socketio';

    this.doc.body.appendChild(iframeC);
    this.iframe = this.doc.createElement('iframe');

    iframeC.appendChild(this.iframe);

    var self = this
      , query = io.util.query(this.socket.options.query, 't='+ +new Date);

    this.iframe.src = this.prepareUrl() + query;

    io.util.on(window, 'unload', function () {
      self.destroy();
    });
  };

  /**
   * The Socket.IO server will write script tags inside the forever
   * iframe, this function will be used as callback for the incoming
   * information.
   *
   * @param {String} data The message
   * @param {document} doc Reference to the context
   * @api private
   */

  HTMLFile.prototype._ = function (data, doc) {
    // unescape all forward slashes. see GH-1251
    data = data.replace(/\\\//g, '/');
    this.onData(data);
    try {
      var script = doc.getElementsByTagName('script')[0];
      script.parentNode.removeChild(script);
    } catch (e) { }
  };

  /**
   * Destroy the established connection, iframe and `htmlfile`.
   * And calls the `CollectGarbage` function of Internet Explorer
   * to release the memory.
   *
   * @api private
   */

  HTMLFile.prototype.destroy = function () {
    if (this.iframe){
      try {
        this.iframe.src = 'about:blank';
      } catch(e){}

      this.doc = null;
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;

      CollectGarbage();
    }
  };

  /**
   * Disconnects the established connection.
   *
   * @returns {Transport} Chaining.
   * @api public
   */

  HTMLFile.prototype.close = function () {
    this.destroy();
    return io.Transport.XHR.prototype.close.call(this);
  };

  /**
   * Checks if the browser supports this transport. The browser
   * must have an `Ac...eXObject` implementation.
   *
   * @return {Boolean}
   * @api public
   */

  HTMLFile.check = function (socket) {
    if (typeof window != "undefined" && (['Active'].concat('Object').join('X')) in window){
      try {
        var a = new window[(['Active'].concat('Object').join('X'))]('htmlfile');
        return a && io.Transport.XHR.check(socket);
      } catch(e){}
    }
    return false;
  };

  /**
   * Check if cross domain requests are supported.
   *
   * @returns {Boolean}
   * @api public
   */

  HTMLFile.xdomainCheck = function () {
    // we can probably do handling for sub-domains, we should
    // test that it's cross domain but a subdomain here
    return false;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('htmlfile');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports['xhr-polling'] = XHRPolling;

  /**
   * The XHR-polling transport uses long polling XHR requests to create a
   * "persistent" connection with the server.
   *
   * @constructor
   * @api public
   */

  function XHRPolling () {
    io.Transport.XHR.apply(this, arguments);
  };

  /**
   * Inherits from XHR transport.
   */

  io.util.inherit(XHRPolling, io.Transport.XHR);

  /**
   * Merge the properties from XHR transport
   */

  io.util.merge(XHRPolling, io.Transport.XHR);

  /**
   * Transport name
   *
   * @api public
   */

  XHRPolling.prototype.name = 'xhr-polling';

  /**
   * Indicates whether heartbeats is enabled for this transport
   *
   * @api private
   */

  XHRPolling.prototype.heartbeats = function () {
    return false;
  };

  /** 
   * Establish a connection, for iPhone and Android this will be done once the page
   * is loaded.
   *
   * @returns {Transport} Chaining.
   * @api public
   */

  XHRPolling.prototype.open = function () {
    var self = this;

    io.Transport.XHR.prototype.open.call(self);
    return false;
  };

  /**
   * Starts a XHR request to wait for incoming messages.
   *
   * @api private
   */

  function empty () {};

  XHRPolling.prototype.get = function () {
    if (!this.isOpen) return;

    var self = this;

    function stateChange () {
      if (this.readyState == 4) {
        this.onreadystatechange = empty;

        if (this.status == 200) {
          self.onData(this.responseText);
          self.get();
        } else {
          self.onClose();
        }
      }
    };

    function onload () {
      this.onload = empty;
      this.onerror = empty;
      self.retryCounter = 1;
      self.onData(this.responseText);
      self.get();
    };

    function onerror () {
      self.retryCounter ++;
      if(!self.retryCounter || self.retryCounter > 3) {
        self.onClose();  
      } else {
        self.get();
      }
    };

    this.xhr = this.request();

    if (global.XDomainRequest && this.xhr instanceof XDomainRequest) {
      this.xhr.onload = onload;
      this.xhr.onerror = onerror;
    } else {
      this.xhr.onreadystatechange = stateChange;
    }

    this.xhr.send(null);
  };

  /**
   * Handle the unclean close behavior.
   *
   * @api private
   */

  XHRPolling.prototype.onClose = function () {
    io.Transport.XHR.prototype.onClose.call(this);

    if (this.xhr) {
      this.xhr.onreadystatechange = this.xhr.onload = this.xhr.onerror = empty;
      try {
        this.xhr.abort();
      } catch(e){}
      this.xhr = null;
    }
  };

  /**
   * Webkit based browsers show a infinit spinner when you start a XHR request
   * before the browsers onload event is called so we need to defer opening of
   * the transport until the onload event is called. Wrapping the cb in our
   * defer method solve this.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  XHRPolling.prototype.ready = function (socket, fn) {
    var self = this;

    io.util.defer(function () {
      fn.call(self);
    });
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('xhr-polling');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {
  /**
   * There is a way to hide the loading indicator in Firefox. If you create and
   * remove a iframe it will stop showing the current loading indicator.
   * Unfortunately we can't feature detect that and UA sniffing is evil.
   *
   * @api private
   */

  var indicator = global.document && "MozAppearance" in
    global.document.documentElement.style;

  /**
   * Expose constructor.
   */

  exports['jsonp-polling'] = JSONPPolling;

  /**
   * The JSONP transport creates an persistent connection by dynamically
   * inserting a script tag in the page. This script tag will receive the
   * information of the Socket.IO server. When new information is received
   * it creates a new script tag for the new data stream.
   *
   * @constructor
   * @extends {io.Transport.xhr-polling}
   * @api public
   */

  function JSONPPolling (socket) {
    io.Transport['xhr-polling'].apply(this, arguments);

    this.index = io.j.length;

    var self = this;

    io.j.push(function (msg) {
      self._(msg);
    });
  };

  /**
   * Inherits from XHR polling transport.
   */

  io.util.inherit(JSONPPolling, io.Transport['xhr-polling']);

  /**
   * Transport name
   *
   * @api public
   */

  JSONPPolling.prototype.name = 'jsonp-polling';

  /**
   * Posts a encoded message to the Socket.IO server using an iframe.
   * The iframe is used because script tags can create POST based requests.
   * The iframe is positioned outside of the view so the user does not
   * notice it's existence.
   *
   * @param {String} data A encoded message.
   * @api private
   */

  JSONPPolling.prototype.post = function (data) {
    var self = this
      , query = io.util.query(
             this.socket.options.query
          , 't='+ (+new Date) + '&i=' + this.index
        );

    if (!this.form) {
      var form = document.createElement('form')
        , area = document.createElement('textarea')
        , id = this.iframeId = 'socketio_iframe_' + this.index
        , iframe;

      form.className = 'socketio';
      form.style.position = 'absolute';
      form.style.top = '0px';
      form.style.left = '0px';
      form.style.display = 'none';
      form.target = id;
      form.method = 'POST';
      form.setAttribute('accept-charset', 'utf-8');
      area.name = 'd';
      form.appendChild(area);
      document.body.appendChild(form);

      this.form = form;
      this.area = area;
    }

    this.form.action = this.prepareUrl() + query;

    function complete () {
      initIframe();
      self.socket.setBuffer(false);
    };

    function initIframe () {
      if (self.iframe) {
        self.form.removeChild(self.iframe);
      }

      try {
        // ie6 dynamic iframes with target="" support (thanks Chris Lambacher)
        iframe = document.createElement('<iframe name="'+ self.iframeId +'">');
      } catch (e) {
        iframe = document.createElement('iframe');
        iframe.name = self.iframeId;
      }

      iframe.id = self.iframeId;

      self.form.appendChild(iframe);
      self.iframe = iframe;
    };

    initIframe();

    // we temporarily stringify until we figure out how to prevent
    // browsers from turning `\n` into `\r\n` in form inputs
    this.area.value = io.JSON.stringify(data);

    try {
      this.form.submit();
    } catch(e) {}

    if (this.iframe.attachEvent) {
      iframe.onreadystatechange = function () {
        if (self.iframe.readyState == 'complete') {
          complete();
        }
      };
    } else {
      this.iframe.onload = complete;
    }

    this.socket.setBuffer(true);
  };

  /**
   * Creates a new JSONP poll that can be used to listen
   * for messages from the Socket.IO server.
   *
   * @api private
   */

  JSONPPolling.prototype.get = function () {
    var self = this
      , script = document.createElement('script')
      , query = io.util.query(
             this.socket.options.query
          , 't='+ (+new Date) + '&i=' + this.index
        );

    if (this.script) {
      this.script.parentNode.removeChild(this.script);
      this.script = null;
    }

    script.async = true;
    script.src = this.prepareUrl() + query;
    script.onerror = function () {
      self.onClose();
    };

    var insertAt = document.getElementsByTagName('script')[0];
    insertAt.parentNode.insertBefore(script, insertAt);
    this.script = script;

    if (indicator) {
      setTimeout(function () {
        var iframe = document.createElement('iframe');
        document.body.appendChild(iframe);
        document.body.removeChild(iframe);
      }, 100);
    }
  };

  /**
   * Callback function for the incoming message stream from the Socket.IO server.
   *
   * @param {String} data The message
   * @api private
   */

  JSONPPolling.prototype._ = function (msg) {
    this.onData(msg);
    if (this.isOpen) {
      this.get();
    }
    return this;
  };

  /**
   * The indicator hack only works after onload
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  JSONPPolling.prototype.ready = function (socket, fn) {
    var self = this;
    if (!indicator) return fn.call(this);

    io.util.load(function () {
      fn.call(self);
    });
  };

  /**
   * Checks if browser supports this transport.
   *
   * @return {Boolean}
   * @api public
   */

  JSONPPolling.check = function () {
    return 'document' in global;
  };

  /**
   * Check if cross domain requests are supported
   *
   * @returns {Boolean}
   * @api public
   */

  JSONPPolling.xdomainCheck = function () {
    return true;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('jsonp-polling');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

if (typeof define === "function" && define.amd) {
  define([], function () { return io; });
}
})();
},{}],16:[function(require,module,exports){
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

    if (action === 'all') {
      action = ['read', 'update', 'create', 'delete'];
    }

    if (action instanceof Array) {
      action.forEach(function (act) {
        self.grant(act, table, user, grantopt);
      });
      return;
    }

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
    
    if (action === 'all') {
      action = ['read', 'update', 'create', 'delete'];
    }

    if (action instanceof Array) {
      action.forEach(function (act) {
        self.grantView(act, view, column, user, grantopt);
      });
      return;
    }

    if (typeof user === 'undefined') {
      user = 'N';
    }

    // granting complete view
    if (user === 'Y' || user === 'N') {
      grantopt = user;
      user = column;
      // if (typeof user === 'string') {
      //   user = self.get('SysUser').getByProperties({name: user});
      // }

      // if (typeof view === 'string') {
      //   view = self.views.get(view);
      // }
      if (typeof view !== 'undefined') {
        return this.grantViewTable(action, view, user, grantopt);
      }

    // granting column on view
    } else {

      if (typeof grantopt === 'undefined') {
        grantopt = 'N';
      }

      // if (typeof user === 'string') {
      //   user = self.get('SysUser').getByProperties({name: user});
      // }
      // if (typeof view === 'string') {
      //   view = self.views.get(view);
      // }
      if (typeof view !== 'undefined') {
        return this.grantViewColumn(action, view, column, user, grantopt);
      }

    }

    throw new Error("Incorrect input for grantView");
  };




  // Table 
  State.prototype.grantTable = function (action, table, user, grantopt) {
    var self = this;

    // Can we grant action on table?
    self.checkGrantTablePermission(action, table, self.getUser());

    // Do the granting
    self.doGrantTable(action, table, user, grantopt);

    return this;
  };

  State.prototype.doGrantTable = function (action, table, user, grantopt) {
    var self = this;
    var group = self.setIfGroup(user);
    var granted = false;

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
        self.doGrantColumn(action, table, property.name, user, grantopt);
      }); 
    }   
    

    // Perform same grant on the proxy table of CSet properties of given table
    table.forEachProperty(function (property) {
      if (property.CType.prototype === CSetPrototype) {
        // console.log(property.CType.prototype);
        self.grantTable(action, property.CType.entity, user, grantopt);
      }
    });
    console.log('granted ' + action + ' to ' + user.get('name').get() + ' grantOpt: ' + grantopt);
  }

    // Table 
  State.prototype.grantViewTable = function (action, view, user, grantopt) {
    var self = this

    // console.log('granting ' + action + ' on ' + view.name + ' for ' + user.get('name').get() + ' with ' + grantopt);
    // Can we grant action on table?
    self.checkGrantViewPermission(action, view, self.getUser());

    // console.log('granted');
    self.doGrantViewTable(action, view, user, grantopt);

    console.log('granted read to ' + user.get('name').get() + ' grantOpt: ' + grantopt);
    return this;
  };
  State.prototype.doGrantViewTable = function (action, view, user, grantopt) {
    var self = this;
    var group = self.setIfGroup(user);
    var granted = false;

    // Do the granting
    self.get('SysAuth').all().forEach(function (auth) {
      if ((group ? auth.get('group').equals(group) : auth.get('user').equals(user)) &&
          auth.get('type').equals('V') &&
          auth.get('vname').equals(view.name) &&
          auth.get('priv').equals(action) &&
          auth.get('grantopt').equals(grantopt)) {
        auth.set('active', 'Y');
        granted = true;
      }
    });

    if (!granted) {
      var auth = self.get('SysAuth').create();
      auth.set('type', 'V')
          .set('vname', view.name)
          .set('tname', view.table.name)
          .set('priv', action)
          .set('grantopt', grantopt)
          .set('active', 'Y');
      (group ? auth.set('group', group) : auth.set('user', user));
    }

    // Grant to all columns if column action (read/update)
    if (action === 'read' || action === 'update') {
      view.table.forEachProperty(function (property) {
        // Perform same grant on the proxy table of CSet properties of given table
          // if (property.CType.prototype !== CSetPrototype) {
          //   // console.log(property.CType.prototype);
          //   var propertyView = self.views.get(view.name+'.'+property.name, user, grantopt);
          //   self.grantViewTable(action, propertyView, user, grantopt);
          // } else {
            self.doGrantViewColumn(action, view, property.name, user, grantopt);
          // }
      }); 
    } 

    // Perform same grant on the proxy table of CSet properties of given table
    view.table.forEachProperty(function (property) {
      if (property.CType.prototype === CSetPrototype) {
        // console.log(property.CType.prototype);
        self.grantTable(action, property.CType.entity, user, grantopt);
      }
    });


    return this;
  }

  // Column
  State.prototype.grantColumn = function (action, table, columnName, user, grantopt) {
    var self = this;

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
    self.doGrantColumn(action, table, columnName, user, grantopt);

    return this;
  };

  State.prototype.doGrantColumn = function (action, table, columnName, user, grantopt) {
    var self = this;
    var granted = false;
    var group = self.setIfGroup(user);

    self.get('SysColAuth').all().forEach(function (colAuth) {
      if ((group ? colAuth.get('group').equals(group) : colAuth.get('user').equals(user)) &&
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
          .set('priv', action)
          .set('active', 'Y');
      (group ? auth.set('group', group) : colAuth.set('user', user));
    }
    return this;
  };

  // ViewColumn
  State.prototype.grantViewColumn = function (action, view, columnName, user, grantopt) {
    var self = this;

    if (action !== 'read' && action !== 'update') {
      throw new Error("Only read and update are column actions");
    }

    // If column is a CSet, perform grant on proxy table instead
    
    // var property = table.getProperty(columnName);
    // if (property.CType.prototype === CSetPrototype) {
    //   return self.grantTable(action, property.CType.entity, user, grantopt);
    // }

    // Can we grant action on given column?
    self.checkGrantViewColumnPermission(action, view, columnName, self.getUser());
    
    // Do the grant on the column
    self.doGrantViewColumn(action, view, columnName, user, grantopt);

    return this;
  };

  State.prototype.doGrantViewColumn = function (action, view, columnName, user, grantopt) {
    var self = this;
    var group = self.setIfGroup(user);
    var granted = false;

    console.log('granting view on column ' + columnName);

    self.get('SysColAuth').all().forEach(function (colAuth) {
      if (colAuth.get('type').equals('V') &&
          colAuth.get('vname').equals(view.name) &&
          colAuth.get('cname').equals(columnName) &&
          colAuth.get('grantopt').equals(grantopt) &&
          (group ? colAuth.get('group').equals(group) : colAuth.get('user').equals(user)) &&
          colAuth.get('priv').equals(action)) {
        colAuth.set('active', 'Y');
        granted = true;
      }
    });

    if (!granted) {
      var auth = self.get('SysColAuth').create();
      auth.set('type', 'V')
          .set('vname', view.name)
          .set('tname', view.table.name)
          .set('cname', columnName)
          .set('grantopt', grantopt)
          .set('priv', action)
          .set('active', 'Y');
      (group ? auth.set('group', group) : auth.set('user', user));
    }
  }



  /* Revoking */
  /***********/

  State.prototype.revoke = function (action, table, user) {
    var self = this;

    if (action === 'all') {
      action = ['read', 'update', 'create', 'delete'];
    }

    if (action instanceof Array) {
      action.forEach(function (act) {
        self.revoke(act, table, user);
      });
      return;
    }

    if (!(user instanceof IndexEntry) || (!user.isEntryOf(self.get('SysUser')) && !user.isEntryOf(self.get('SysGroup')))) {
      throw new Error("Must give either a SysUser or a SysGroup entry, given: " + user);
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
    
    if (action === 'all') {
      action = ['read', 'update', 'create', 'delete'];
    }

    if (action instanceof Array) {
      action.forEach(function (act) {
        self.revokeView(act, view, column, user);
      });
      return;
    }

   

    // revoking complete view
    if (typeof user === 'undefined') {
      user = column;

      if (!(user instanceof IndexEntry) || (!user.isEntryOf(self.get('SysUser')) && !user.isEntryOf(self.get('SysGroup')))) {
        throw new Error("Must give either a SysUser or a SysGroup entry, given: " + user);
      }

      var theView = self.views.get(view);
      if (typeof theView !== 'undefined') {
        return this.revokeViewTable(action, theView, user);
      }

    // revoking column on view
    } else {

      if (!(user instanceof IndexEntry) || (!user.isEntryOf(self.get('SysUser')) && !user.isEntryOf(self.get('SysGroup')))) {
        throw new Error("Must give either a SysUser or a SysGroup entry, given: " + user);
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

    // Can we revoke action from table?
    self.checkGrantViewPermission(action, view, self.getUser());

    // Revoke action (both with and without grantopt) from the Table
    self.doRevokeViewTable(action, view, user);
      
    console.log('revoked '+ action+ ' from ' + user.get('name').get() + ' on view ' + view.name);
    return this;
  };

  State.prototype.doRevokeViewTable = function (action, view, user) {
    var self = this;
    var group = self.setIfGroup(user);

    self.get('SysAuth').all().forEach(function (auth) {
      if ((group ? auth.get('group').equals(group) : auth.get('user').equals(user)) &&
          auth.get('vname').equals(view.name) &&
          auth.get('priv').equals(action) &&
          auth.get('type').equals('V')) {
          auth.set('active', 'N');
      }
    });

    // Grant to all columns if column action (read/update)
    if (action === 'read' || action === 'update') {
      view.table.forEachProperty(function (property) {
        self.doRevokeViewColumn(action, view, property.name, user);
      }); 
    }
      
    return this;
  };


  // Revoke Table
  State.prototype.revokeTable = function (action, table, user) {
    var self = this;

    // Can we revoke action from table?
    self.checkGrantTablePermission(action, table, self.getUser());
    
    // Revoke action (both with and without grantopt) from the Table
    self.doRevokeTable(action, table, user);

    console.log('revoked '+ action+ ' from ' + user.get('name').get());
    return this;
  };

  State.prototype.doRevokeTable = function (action, table, user) {
    var self = this;
    var group = self.setIfGroup(user);

    self.get('SysAuth').all().forEach(function (auth) {
      if ((group ? auth.get('group').equals(group) : auth.get('user').equals(user)) &&
          auth.get('tname').equals(table.name) &&
          auth.get('type').equals('T') &&
          auth.get('priv').equals(action)) {
        auth.set('active', 'N');
      }
    });
    console.log('removing columns');
    // Revoke action (both with and without grantopt) from columns if action = column operation
    // Grant to all columns if column action (read/update)
    if (action === 'read' || action === 'update') {
      table.forEachProperty(function (property) {
        self.doRevokeColumn(action, table, property.name, user);
      }); 
    }
  };

  // Revoke Column
  State.prototype.revokeColumn = function (action, table, cname, user) {
    var self = this;

    // Can we revoke action from column?
    self.checkGrantColumnPermission(action, table, cname, self.getUser());

    // Revoke action from columns
    self.doRevokeColumn(action, table, cname, user);

    return this;
  };

  State.prototype.doRevokeColumn = function (action, table, cname, user) {
    var self = this;
    var tname = table.name;
    var group = self.setIfGroup(user);
    
    self.get('SysColAuth').all().forEach(function (colAuth) {
      if ((group ? colAuth.get('group').equals(group) : colAuth.get('user').equals(user)) &&
          colAuth.get('tname').equals(tname) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('type').equals('T') &&
          colAuth.get('priv').equals(action)) {
        colAuth.set('active', 'N');
      }
    });
  }


  // Revoke Column
  State.prototype.revokeViewColumn = function (action, view, cname, user) {
    var self = this;

    // Can we revoke action from column?
    self.checkGrantViewColumnPermission(action, view, cname, self.getUser());
    
    // Revoke action from columns
    self.doRevokeViewColumn(action, view, cname, user);
    

    return this;
  };

  State.prototype.doRevokeViewColumn = function (action, view, cname, user) {
    var self = this;
    var group = self.setIfGroup(user);

    self.get('SysColAuth').all().forEach(function (colAuth) {
      if ((group ? colAuth.get('group').equals(group) : colAuth.get('user').equals(user)) &&
          colAuth.get('vname').equals(view.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('priv').equals(action) &&
          colAuth.get('type').equals('V')) {
        colAuth.set('active', 'N');
      }
    });
  }



  State.prototype.setIfGroup = function (user) {
    if (user.isEntryOf(this.get('SysGroup'))) {
      return user;
    }
    return null;
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
      throw new Error("You don't have " + action + " grant permissions for " + view.name);
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
    var group = user.get('group').get();

    // already restricted
    if (table instanceof Restricted)
      return false;

    var group = 

    // Find any (base or view) table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) &&
          (auth.get('user').equals(user) ||
           auth.get('group').equals(group)) &&     // inherit from group
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
    var group = user.get('group').get();

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'T') or for a column on a view on that Table (type = 'V')
      if ((colAuth.get('user').equals(user) ||
           colAuth.get('group').equals(group)) &&     // inherit from group
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
    var group = user.get('group').get();

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'T') or for a column on a view on that Table (type = 'V')
      if ((colAuth.get('user').equals(user) ||
           colAuth.get('group').equals(group)) &&
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
    var group = user.get('group').get();

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      // Either authorized for the normal Table column (type = 'T') or for a column on a view on that Table (type = 'V')
      if ((colAuth.get('user').equals(user) || colAuth.get('group').equals(group)) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get('type').equals('V') &&
          colAuth.get('priv').equals(action) &&
          colAuth.get('active').equals('Y')) {
        var view = self.views.get(colAuth.get('vname').get());
        if (view.includes(entry, user)) {
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
    var group = user.get('group').get();


    // console.log(user.get('name').get() + ' authed for row ' + entry.uid + '?');

    // already restricted
    if (table instanceof Restricted)
      return false;

    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) &&
          (auth.get('user').equals(user) || auth.get('group').equals(group)) &&
          auth.get('priv').equals(action) &&
          auth.get('active').equals('Y')) {

        // Authed for whole table
        if (auth.get('type').equals('T')) {
          authed = true;

        // Authed for view
        } else {
          var view = self.views.get(auth.get('vname').get());
          if (view.includes(entry, user)) {
            authed = true;
          }
        }
      }
    });

    if (!authed) {
      
      // Implicit authorization for delete
      if (action === 'delete') {
        // console.log('looking for implicit delete authorization');
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
        // console.log(user.get('name').get() + ' not authed for row ' + entry.uid + ' of ' + table.name);
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
          // console.log(user.get('name').get() + ' not authed for ' + table.name + ' because no read access for keys');
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
    var group = user.get('group').get();

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
          // console.log('not authed for the rows of the keys!');
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
      if ((colAuth.get('user').equals(user) || colAuth.get('group').equals(group)) &&
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
          if (view.includes(entry, user)) {
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
    var group = user.get('group').get();

    // already restricted
    if (table instanceof Restricted)
      return false;

    // Find any (base or view) table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) &&
          (auth.get('user').equals(user) || auth.get('group').equals(group)) &&
          auth.get('priv').equals('create') &&
          auth.get('active').equals('Y')) {
          permission = true;
      }
    });

    return permission;
  };

  State.prototype.canCreateTableEntry = function (entry, user) {
    var self = this;
    var permission = false;
    var group = user.get('group').get();
    var table = entry.index;

     // already restricted
    if (table instanceof Restricted)
      return false;

    // Find any (base or view) table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      if (auth.get('tname').equals(table.name) &&
          (auth.get('user').equals(user) || auth.get('group').equals(group)) &&
          auth.get('priv').equals('create') &&
          auth.get('active').equals('Y')) {
        if (auth.get('type').equals('T')) {
          permission = true;
        } else {
          var view = self.views.get(auth.get('vname').get());
          if (view.includes(entry)) {
            permission = true;
          }
        }
      }
    });



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

  State.prototype.canGrantAuth = function (auth, user) {
    if (auth.get('type').equals('T')) {
      return this.canGrantTable(auth.get('priv').get(), this.get(auth.get('tname').get()), user);
    } 
    if (auth.get('type').equals('V')) {
      return this.canGrantView(auth.get('priv').get(), this.views.get(auth.get('vname').get()), user);
    }
    throw new Error("Auth without type: " + auth.get('vname').get());
  };

  State.prototype.canGrantColAuth = function (colAuth, user) {
    if (colAuth.get('type').equals('T')) {
      return this.canGrantColumn(colAuth.get('priv').get(), this.get(colAuth.get('tname').get()), colAuth.get('cname').get(), user);
    }
    if (colAuth.get('type').equals('V')) {
      return this.canGrantViewColumn(colAuth.get('priv').get(), this.views.get(colAuth.get('vname').get()), colAuth.get('cname').get(), user);
    }
    throw new Error("ColAuth without type: " + colAuth.get('vname').get());
  };

  // Table
  State.prototype.canGrantTable = function (action, table, grantingUser) {
    var self = this;
    var Auth = this.get('SysAuth');
    var grantingGroup = grantingUser.get('group').get();

    var permission = Auth.where(function (auth) {
      return ((auth.get('user').equals(grantingUser) || auth.get('group').equals(grantingGroup)) &&
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
    var grantingGroup = grantingUser.get('group').get();

    var permission = Auth.where(function (auth) {
      return ((auth.get('user').equals(grantingUser) || auth.get('group').equals(grantingGroup)) &&
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
    var grantingGroup = grantingUser.get('group').get();

    // Only read and update can be granted column-wise
    if (action !== 'read' && action !== 'update') {
      return false;
    }

    // Find the authorizing row
    var permission = self.get('SysColAuth').where(function (colAuth) {
      return ((colAuth.get('user').equals(grantingUser) || colAuth.get('group').equals(grantingGroup)) &&
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
    var grantingGroup = grantingUser.get('group').get();

    // Only read and update can be granted column-wise
    if (action !== 'read' && action !== 'update') {
      return false;
    }

    // Find the authorizing row
    var permission = self.get('SysColAuth').where(function (colAuth) {
      return ((colAuth.get('user').equals(grantingUser) || colAuth.get('group').equals(grantingGroup)) &&
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
},{"./CSet":18,"./Index":21,"./IndexEntry":22,"./Property":26,"./Restricted":28,"./Table":30}],17:[function(require,module,exports){
/**
 * Created by ticup on 15/11/13.
 */
var CloudType = require('./CloudType');
var util = require('util');

exports.CInt = CInt;
exports.Declaration = CIntDeclaration;


// CIntDeclaration: function that allows the user to declare a property of type CInt
// see CSet as to why this exists (parametrized declarations)
function CIntDeclaration() { }
CIntDeclaration.declare = function () {
  return CInt;
};
CIntDeclaration.fromJSON = function () {
  return CInt;
};


// register this declaration as usable (will also allow to create CInt with CloudType.fromJSON())
CIntDeclaration.tag = "CInt";
CInt.tag = "CInt";
CloudType.register(CIntDeclaration);


// Actual CInt object of which an instance represents a variable of which the property is defined with CIntDeclaration
function CInt(base, offset, isSet) {
  this.base = base || 0;
  this.offset = offset || 0;
  this.isSet = isSet || false;
  // this.entry needs to be set by those that create CInt
  // this.property
}
// put CloudType in prototype chain.
CInt.prototype = Object.create(CloudType.prototype);

CInt.copy = function () {
  return CInt;
};

CInt.toString = function () {
  return "CInt";
};

// Create a new instance of the declared CInt for given entry
CInt.newFor = function (entry, property) {
  var cint = new CInt();
  cint.entry = entry;
  cint.property = property;
  return cint;
};

// Puts the declared type CInt into json representation
CInt.toJSON = function () {
  return { tag: CIntDeclaration.tag };
};


// Retrieves an instance of a declared type CInt from json
// Not the complement of CInt.toJSON, but complement of CInt.prototype._toJSON!!
CInt.fromJSON = function (json, entry, property) {
  var cint = new CInt(json.base, json.offset, json.isSet);
  cint.entry = entry;
  cint.property = property;
  return cint;
};

// Puts an instance of a declared type CInt to json
CInt.prototype.toJSON = function () {
  return {
    base: this.base,
    offset: this.offset,
    isSet: this.isSet
  };
};

// semantic operations
CInt.prototype.set = function (base) {
  if (typeof base !== 'number')
    throw "CInt::set(base) : base should be of type number, given: " + base;
  this.offset = 0;
  this.base = base;
  this.isSet = true;
};
CloudType.updateOperation(CInt, 'set');

CInt.prototype.get = function () {
  return (this.base + this.offset);
};

CInt.prototype.add = function (offset) {
  if (typeof offset !== 'number')
    throw "CInt::add(base) : offset should be of type number, given: " + offset;
  this.offset += offset;
};
CloudType.updateOperation(CInt, 'add');

// Defining _join(cint, target) provides the join and joinIn methods
// by the CloudType prototype.
CInt.prototype._join = function (cint, target) {
  if (cint.isSet) {
    target.isSet  = true;
    target.base   = cint.base;
    target.offset = cint.offset;
  } else {
    target.isSet  = this.isSet;
    target.base   = this.base;
    target.offset = this.offset + cint.offset;
  }
};

CInt.prototype.fork = function () {
  var cint = new CInt(this.base + this.offset, 0, false);
  this.applyFork();
  return cint;
};

CInt.prototype.applyFork = function () {
  this.base = this.base + this.offset;
  this.offset = 0;
  this.isSet = false;
  return this;
};

CInt.prototype.replaceBy = function (cint) {
  this.base   = cint.base;
  this.offset = cint.offset;
  this.isSet  = cint.isSet;
};

CInt.prototype.isDefault = function () {
  return (this.get() === 0);
};

CInt.prototype.isChanged = function (cint) {
  return (cint.isSet || cint.offset !== 0);
};

CInt.prototype.compare = function (cint, reverse) {
  return ((reverse ? -1 : 1) * (this.get() - cint.get()));
};
},{"./CloudType":20,"util":67}],18:[function(require,module,exports){
/**
 * Created by ticup on 08/11/13.
 */
var CloudType  = require('./CloudType');

function CSetDeclaration(elementType) { 
  function CSet(entry) {
    this.type = CSet;
    this.entry = entry;
  }

  // CSet.entity should be set by the state to the entity that is made for this CSet.
  CSet.elementType = elementType;


  CSet.newFor = function (entry, property) {
    var cset = new CSet(entry);
    cset.property = property;
    return cset;
  };

    // Puts the declared (parametrized) CSet into json
  CSet.toJSON = function () {
    return { tag: CSetDeclaration.tag, elementType: elementType };
  };

  // Retrieves an instance of a declared (parametrized) CSet from json
  CSet.fromJSON = function (json, entry) {
    return new CSet(entry);
  };

  CSet.toString = function () {
    return "CSet<" + CSet.elementType.toString() + ">";
  };

  CSet.copy = function () {
    return new CSetDeclaration(elementType);
  };

  CSet.declareProxyTable = function (state, index, property, grant) {
    var Table = require('./Table');
    if (!(index instanceof Table)) {
      throw new Error("Can only create CSet for a Table");
    }
    this.entity = state.declare(index.name + property.name, new Table([{entry: index}, {element: this.elementType}]), grant);
  };

  CSet.tag = "CSet";
  CSet.prototype = CSetPrototype;
  return CSet;
}

CSetDeclaration.declare = function (elementType) {
  new CSetDeclaration(elementType);
};

// called by CloudType to initialize the parametrized CSet for a property
CSetDeclaration.fromJSON = function (json) {
  return new CSetDeclaration(json.elementType);
};

// register this declaration as usable (will also allow to create CSet with CloudType.fromJSON())
CSetDeclaration.tag = "CSet";
CloudType.register(CSetDeclaration);



var CSetPrototype = Object.create(CloudType.prototype);

// Operations for the parametrized CSets



// don't need to save anything for a particular CSet instance of a property:
// The info of the particular set is saved in a dedicated CSetEntity
CSetPrototype.toJSON = function () {
  return {  };
};

// semantic operations (all delegated to the dedicated table)
CSetPrototype.add = function (element) {
  var entry = this.type.entity.create([this.entry, element]);
  return this;
};

CSetPrototype.contains = function (element) {
  var entry = this.entry;
  var elementType = this.type.elementType;
  return (this.type.entity
      .where(function (el) {
        return isEntryForElement(el, entry, elementType, element);
      }).all().length !== 0);
};

CSetPrototype.remove = function (element) {
  var entry = this.entry;
  var elementType = this.type.elementType;
  this.type.entity
      .where(function (el) {
        return isEntryForElement(el, entry, elementType, element);
      }).all().forEach(function (el) {
        el.delete();
      });
};

CSetPrototype.get = function () {
  return this.type.entity.all();
};

function isEntryForElement(el, entry, elementType, element) {
  return (el.key('entry').equals(entry) &&
         ((elementType === 'int' || elementType === 'string') ?
          (el.key('element') === element) :
          (el.key('element').equals(element))));
}

// Defining _join(cint, target) provides the join and joinIn methods
// by the CloudType prototype.
CSetPrototype._join = function (cset, target) {
  // do nothing (everything happens 'automatically' through the tableProxy
};

CSetPrototype.fork = function () {
  // do nothing (everything happens 'automatically' through the tableProxy
  return this;
};

CSetPrototype.applyFork = function () {
  // do nothing (everything happens 'automatically' through the tableProxy
  return this;
};

CSetPrototype.replaceBy = function (cset) {
  // do nothing (everything happens 'automatically' through the tableProxy
};

CSetPrototype.isDefault = function () {
  return (this.get().length !== 0);
};

// Change detection is incorporated through the proxyTable
CSetPrototype.isChanged = function () {
  return false;
};

CSetPrototype.compare = function (cset, reverse) {
  return ((reverse ? -1 : 1) * (this.get().length - cset.get().length));
};


exports.Declaration = CSetDeclaration;
exports.CSetPrototype = CSetPrototype;
},{"./CloudType":20,"./Table":30}],19:[function(require,module,exports){
/**
 * Created by ticup on 15/11/13.
 */
var CloudType = require('./CloudType');
var util = require('util');

exports.CString = CString;
exports.Declaration = CStringDeclaration;


// CIntDeclaration: function that allows the user to declare a property of type CInt
// see CSet as to why this exists (parametrized declarations)
function CStringDeclaration() { }

CStringDeclaration.declare = function () {
  return CString;
};
CStringDeclaration.fromJSON = function () {
  return CString;
};

// register this declaration as usable (will also allow to create CString with CloudType.fromJSON())
CStringDeclaration.tag = "CString";
CString.tag = "CString";
CloudType.register(CStringDeclaration);


// Actual CString object of which an instance represents a variable of which the property is defined with CStringDeclaration
function CString(value, written, cond) {
  this.value   = value   || '';
  this.written = written || false;
  this.cond    = cond    || false;
}
// put CloudType in prototype chain.
CString.prototype = Object.create(CloudType.prototype);

CString.copy = function () {
  return CString;
};

CString.toString = function () {
  return "CString";
};

// Create a new instance of the declared CString for given entry
CString.newFor = function (entry, property) {
  var cstring = new CString();
  cstring.entry = entry;
  cstring.property = property;
  return cstring;
};

CString.toJSON = function () {
  return { tag: CStringDeclaration.tag };
};

CString.fromJSON = function (json, entry, property) {
  var cstring = new CString(json.value, json.written, json.cond);
  cstring.entry = entry;
  cstring.property = property;
  return cstring;
};


// Puts the declared type CString into json representation
CString.prototype.toJSON = function () {
  return {
    value: this.value,
    written: this.written,
    cond: this.cond
  };
};

// semantic operations
CString.prototype.set = function (value) {
  this.value   = value;
  this.written = 'wr';
};
CloudType.updateOperation(CString, 'set');

CString.prototype.get = function () {
  return this.value;
};

CString.prototype.setIfEmpty = function (value) {
  if (this.written === 'wr' && this.value === '') {
    this.value   = value;
    this.written = 'wr';
    this.cond    = false;

  } else if (!this.written && this.value === '') {
    this.value   = value;
    this.written = 'cond';
    this.cond    = value;

  } else if (!this.written && this.value !== '') {
    this.written = 'cond';
    this.cond    = value;

  } else {
    // remain current values
  }
};
CloudType.updateOperation(CString, 'setIfEmpty');


// Defining _join(cstring, target) provides the join and joinIn methods
// by the CloudType prototype.
CString.prototype._join = function (cstring, target) {
  if (cstring.written === 'wr') {
    target.written = 'wr';
    target.value   = cstring.value;
    target.cond    = false;

  } else if (this.written === 'wr' && this.value === '' && cstring.written === 'cond') {
    target.written = 'wr';
    target.value   = cstring.cond;
    target.cond    = false;

  } else if (!this.written && this.value === '' && cstring.written === 'cond') {
    target.written = 'cond';
    target.cond    = cstring.cond;
    target.value   = cstring.cond;

  } else if (!this.written && this.value !== '' && cstring.written === 'cond') {
    target.written = 'cond';
    target.cond    = cstring.cond;
    target.value   = this.value;

  } else {
    target.written = this.written;
    target.cond    = this.cond;
    target.value   = this.value;
  }
};

CString.prototype.fork = function () {
  var cstring = new CString(this.value, false, undefined);
  this.applyFork();
  return cstring;
};

CString.prototype.applyFork = function () {
  this.written = false;
  this.cond    = false;
  return this;
};

CString.prototype.replaceBy = function (cstring) {
  this.written = cstring.written;
  this.cond    = cstring.cond;
  this.value   = cstring.value;
};

CString.prototype.isDefault = function () {
  return (this.get() === '');
};

CString.prototype.isChanged = function (cstring) {
  return !!cstring.written;
};

CString.prototype.compare = function (cstring, reverse) {
  return ((reverse ? -1 : 1) * (this.get().localeCompare(cstring.get())));
};
},{"./CloudType":20,"util":67}],20:[function(require,module,exports){
module.exports = CloudType;

function CloudType() {}

CloudType.types = {};

CloudType.updateOperations = [];

CloudType.register = function (typeDeclaration) {
  CloudType.types[typeDeclaration.tag] = typeDeclaration;
};

CloudType.fromTag = function (tag) {
  return CloudType.types[tag];
};

// Can only be used for non parametrized declarations (CInt/CString/CTime..)
// By using this users can declare such types by their tag instead of by using the real declaration.
CloudType.declareFromTag = function (tag) {
  var type = CloudType.types[tag];
  if (typeof type === 'undefined') {
    return undefined;
  }
  return type.declare();
};

CloudType.isCloudType = function (CType) {
  return ((typeof CType.tag !== 'undefined') &&
          (typeof CloudType.types[CType.tag] !== 'undefined'));
};

CloudType.isCloudTypeVal = function (val) {
  return ((typeof val.constructor !== 'undefined') &&
          (typeof val.constructor.tag !== 'undefined') &&
          (typeof CloudType.types[val.constructor.tag] !== 'undefined'));
};

CloudType.fromJSON = function (json, entry, property) {
  return CloudType.fromTag(json.tag).fromJSON(json, entry, property);
};

CloudType.prototype.join = function (cint) {
  this._join(cint, this);
};

CloudType.prototype.joinIn = function (cint) {
  this._join(cint, cint);
};

CloudType.prototype.equals = function (val) {
  if (CloudType.isCloudTypeVal(val))
      return this.get() === val.get();
  return this.get() === val;
};

CloudType.prototype.toString = function () {
  return this.get();
};

CloudType.updateOperation = function (type, name) {
  CloudType.updateOperations.push([type, name]);
};

CloudType.forEachUpdateOperation = function (callback) {
  CloudType.updateOperations.forEach(function (arr) {
    callback(arr[0], arr[1]);
  });
};
},{}],21:[function(require,module,exports){
var CloudType     = require('./CloudType');
var Keys          = require('./Keys');
var Property      = require('./Property');
var Properties    = require('./Properties');
var IndexEntry    = require('./IndexEntry');
var IndexQuery    = require('./IndexQuery');
var TypeChecker   = require('./TypeChecker');
var util          = require('util');

module.exports = Index;

// keyNames:  { string: IndexType }
// when declared in a State, the state will add itself and the declared name for this Index as properties
// to the Index object.
// todo: create copy of initializers
function Index(keys, fields) {
  var self        = this;
  fields = fields || {};
  if (!keys instanceof Array) {
    throw new Error('Index requires an array of single property objects as first argument to define its keys');
  }
  if (!fields instanceof Object) {
    throw new Error('Index requires and object with properties as second argument to define its fields');
  }

  this.keys       = new Keys(keys);
  this.properties = new Properties();
  this.isProxy    = false;  // set true by State if used as proxy for global CloudType
  Object.keys(fields).forEach(function (propName) {
    var cType = fields[propName];
    self.addProperty(new Property(propName, cType, self));
  });
}

Index.declare = function (keys, fields) {
  return new Index(keys, fields);
};

Index.declare.type = Index;


Index.prototype.forEachProperty = function (callback) {
  return this.properties.forEach(callback);
};

Index.prototype.get = function () {
  var keys = Array.prototype.slice.call(arguments);
  TypeChecker.keys(keys, this.keys);
  return new IndexEntry(this, keys);
};

Index.prototype.getByKey = function (key) {
  return new IndexEntry(this, key);
};

Index.prototype.entries = function (propertyName) {
  return this.properties.get(propertyName).entries();
};

Index.prototype.where = function (filter) {
  return new IndexQuery(this, filter);
};

Index.prototype.getProperty = function (property) {
  var result = this.properties.get(property);
  return result;
};

Index.prototype.addProperty = function (property) {
  return this.properties.add(property);
};

Index.prototype.fork = function () {
  var fKeys = this.keys.fork();
  var index = new Index();
  index.keys = fKeys;
  index.properties = this.properties.fork(index);
  index.isProxy = this.isProxy;
  return index;
};

Index.prototype.shallowFork = function () {
  var fKeys = this.keys.fork();
  var index = new Index();
  index.keys = fKeys;
  index.properties = new Properties();
  index.isProxy = this.isProxy;
  return index;
};

// Index.prototype.restrictedFork = function (group) {
//   var fKeys = this.keys.fork();
//   var index = new Index();
//   index.keys = fKeys;
//   index.properties = this.properties.restrictedFork(index, group);
//   index.isProxy = this.isProxy;
//   return index;
// };

Index.prototype.getKeys = function () {
  return this.keys.names;
};

Index.prototype.getProperties = function () {
  return Object.keys(this.properties.properties);
};

Index.prototype.toString = function () {
  return this.name;
};

Index.prototype.toJSON = function () {
  return {
    type        : 'Array',
    keys        : this.keys.toJSON(),
    properties  : this.properties.toJSON(),
    isProxy     : this.isProxy
  };
};

Index.prototype.skeletonToJSON = function () {
  return {
    type        : 'Array',
    keys        : this.keys.toJSON(),
    properties  : {},
    isProxy     : this.isProxy,
    name        : this.name
  };
};

Index.fromJSON = function (json) {
  var index = new Index();
  index.keys = Keys.fromJSON(json.keys);
  index.properties = Properties.fromJSON(json.properties, index);
  index.isProxy = json.isProxy;
  return index;
};
},{"./CloudType":20,"./IndexEntry":22,"./IndexQuery":23,"./Keys":24,"./Properties":25,"./Property":26,"./TypeChecker":33,"util":67}],22:[function(require,module,exports){
var Keys       = require('./Keys');
var CloudType  = require('./CloudType');
var TypeChecker = require('./TypeChecker');

module.exports = IndexEntry;

// keys: an array of real keys or a flattened string of those keys
function IndexEntry(index, keys) {
  this.index = index;
  this.keys = Keys.getKeys(keys, index);
}

IndexEntry.prototype.get = function (propertyName) {
  var property = this.index.getProperty(propertyName);
  if (typeof property === 'undefined') {
    throw new Error(this.index.name + " does not have property: " + propertyName);
  }
  var key = this.key();
  return property.getByKey(key);
};

IndexEntry.prototype.set = function (propertyName, value) {
  var property = this.index.getProperty(propertyName);
  var key = this.key();
  TypeChecker.property(value, property.CType);

  // If it is a Cloud Type column, retrieve it and call set(value) on it
  // if (CloudType.isCloudType(property.CType)) {
    property.getByKey(key).set(value);
    // return this;
  // }
  
  // Otherwise replace the reference
  // property.set(key, value);
  return this;
};

IndexEntry.prototype.forEachProperty = function (callback) {
  var self = this;
  this.index.forEachProperty(function (property) {
    callback(property.name, self.get(property));
  });
};

IndexEntry.prototype.forEachKey = function (callback) {
  for (var i = 0; i<this.keys.length; i++) {
    var name = this.index.keys.getName(i);
    callback(name, this.key(name));
  }
};

IndexEntry.prototype.key = function (name) {
  if (typeof name === 'undefined') { 
    return this.serialKey();
  }
  var position = this.index.keys.getPositionOf(name);
  if (position === -1)
    throw Error("This Array does not have a key named " + name);
  var type = this.index.keys.getType(position);
  var value =  this.keys[position];
  if (type === 'int') {
    value = parseInt(value, 10);
  }
  if (type !== 'int' && type !== 'string') {
    value = type.getByKey(value);
  }
  return value;
};

IndexEntry.prototype.deleted = function () {
  return (this.index.state.deleted(this.key(), this.index));
};

IndexEntry.prototype.serialKey = function () {
  return Keys.createIndex(this.keys);
};

IndexEntry.prototype.equals = function (entry) {
  if (!(entry instanceof IndexEntry))
    return false;
  
  if (this.index.name !== entry.index.name)
    return false;

  for (var i = 0; i<this.keys.length; i++) {
    if (this.keys[i] !== entry.keys[i])
      return false;
  }
  return true;
};

IndexEntry.prototype.isEntryOf = function (index) {
  return (this.index == index);
};

IndexEntry.prototype.toString = function () {
  return Keys.createIndex(this.keys);
};
},{"./CloudType":20,"./Keys":24,"./TypeChecker":33}],23:[function(require,module,exports){
/**
 * Created by ticup on 07/11/13.
 */
module.exports = IndexQuery;

function IndexQuery(index, filter) {
  this.index = index;
  this.sumFilter = filter;
  this.orderProperty = false;
  this.orderDir = false;
}

IndexQuery.prototype.all = function () {
  var self = this;
  var entities = [];
  Object.keys(self.index.states).forEach(function (key) {
    if (!self.index.state.deleted(key, self.index) && (typeof self.sumFilter === 'undefined' || self.sumFilter(self.index.getByKey(key))))
      entities.push(self.index.getByKey(key));
  });
  if (self.orderProperty) {
    var property = self.index.getProperty(self.orderProperty);
    if (typeof property === 'undefined') {
      throw new Error("orderBy only allowed on properties for the moment");
    }
    return entities.sort(function (entry1, entry2) {
      return entry1.get(self.orderProperty).compare(entry2.get(self.orderProperty), (self.orderDir === "desc"));
    });
  }
  return entities;
};

IndexQuery.prototype.entries = function (propertyName) {
  var self = this;
  var filtered = [];
  var array = this.index.entries(propertyName);
  if (typeof self.sumFilter === 'undefined') {
    filtered = array;
  } else {
    array.forEach(function (entry) {
      if (self.sumFilter(entry))
        filtered.push(entry);
    });
  }

  if (self.orderProperty) {
    var property = self.index.getProperty(self.orderProperty);
    if (typeof property === 'undefined') {
      throw new Error("orderBy only allowed on properties for the moment");
    }
    return filtered.sort(function (entry1, entry2) {
      return entry1.get(self.orderProperty).compare(entry2.get(self.orderProperty), (self.orderDir === "desc"));
    });
  }
  return filtered;
};


IndexQuery.prototype.orderBy = function (propertyName, dir) {
  this.orderProperty = propertyName;
  this.orderDir = dir;
  return this;
};

IndexQuery.prototype.where = function (newFilter) {
  var sumFilter = this.sumFilter;
  this.sumFilter = function (key) { return (sumFilter(key) && newFilter(key)); };
  return this;
};
},{}],24:[function(require,module,exports){
/* Keys */
/********/
/* The names and types of the keys of an Index */

var CloudType = require('./CloudType');

module.exports = Keys;

function Keys(keys, state) {
  var self = this;
  this.names  = [];
  this.types  = [];
  if (typeof keys !== 'undefined') {
    keys.forEach(function (key) {
      var name = Object.keys(key)[0];
      var type = key[name];
      self.names.push(name);
      self.types.push(type);
    });
  }
}

// Calls callback with (name, type, index) for each key
Keys.prototype.forEach = function (callback) {
  for (var i = 0; i<this.names.length; i++) {
    callback(this.names[i], this.types[i], i);
  }
};

// Returns the number of keys
Keys.prototype.length = function () {
  return this.names.length;
};

// Returns the type at given position
Keys.prototype.getType = function (position) {
  return this.types[position];
};

// Returns the name at given position
Keys.prototype.getName = function (position) {
  return this.names[position];
};

// Returns the type of given key name.
Keys.prototype.getTypeOf = function (name) {
  var position = this.getPositionOf(name);
  return this.types[position];
};

// Returns the position of the key with given name
Keys.prototype.getPositionOf = function (name) {
  return this.names.indexOf(name);
};


Keys.prototype.toJSON = function () {
  return {
    names: this.names,
    types: this.types.map(function (type) {
      if (typeof type === 'string') {
        return type;
      }
      return type.name;
    })
  };
};


Keys.fromJSON = function (json) {
  var keys = new Keys();
  keys.names = json.names;
  keys.types = json.types;
  return keys;
};

Keys.prototype.fork = function () {
  var keys = new Keys();
  keys.names = Array.prototype.slice.call(this.names);
  keys.types = Array.prototype.slice.call(this.types);
  return keys;
};


// Takes an array of keys (of type int, string or IndexEntry) and returns a flattened string, representing the array.
Keys.createIndex = function createIndex(keys) {
  if (! (keys instanceof Array))
    throw Error("createIndex: expects an array of keys, given: " + keys);

  if (keys.length === 0)
      return 'singleton';

  return "[" + [].map.call(keys, function (val) { return val.toString(); }).join(".") + "]";
};

function unParseIndex(string) {
  var count = 0;
  var current = "";
  var parts = [];
  string.split("").forEach(function (letter) {
    if (letter === '.' && count === 1) {
      parts.push(current);
      current = "";
      return;
    }

    if (letter === '[') {
      if (++count === 1) {
        return;
      }
    }

    if (letter === ']') {
      if (count-- === 1) {
        parts.push(current);
        return;
      }
    }

    current += letter;
  });
  return parts;
}

// Takes a flattened key and an Index and returns an array of types accordingly (complement of Keys.createIndex())
Keys.getKeys = function getKeys(key, index) {
  var Table = require('./Table');
  // Flattened string given: unflatten
  if (! (key instanceof Array)) {
    key = unParseIndex(key);
  }

  for (var i = 0; i<key.length; i++) {
    var type = index.keys.getType(i);
    if (type === 'string') {
      continue;
    }
    if (type === 'int') {
      key[i] = parseInt(key[i], 10);
      continue;
    }

    // If entry is given, just store key!
    if (typeof key[i] !== 'string' && typeof key[i] !== 'number') {
      key[i] = key[i].serialKey();
    }

  }
  return key;
};


},{"./CloudType":20,"./Table":30}],25:[function(require,module,exports){
var Property = require('./Property');

function Properties(properties) {
  this.properties = properties || {};
}

Properties.prototype.get = function (property) {
  if (typeof property === 'string')
    return this.properties[property];
  return this.properties[property.name];
};

Properties.prototype.add = function (property) {
  this.properties[property.name] = property;
  return property;
};

Properties.prototype.forEach = function (callback) {
  var self = this;
  return Object.keys(self.properties).forEach(function (name) {
    callback(self.properties[name]);
  });
};

Properties.prototype.toJSON = function () {
  var self = this;
  return Object.keys(this.properties).map(function (propName) {
    return self.properties[propName].toJSON();
  });
};

Properties.fromJSON = function (json, index) {
  var properties = {};
  json.forEach(function (propertyJson) {
    properties[propertyJson.name] = Property.fromJSON(propertyJson, index);
  });
  return new Properties(properties);
};

Properties.prototype.fork = function (index) {
  var fProperties = new Properties();
  this.forEach(function (property) {
    fProperties.add(property.fork(index));
  });
  return fProperties;
};

// Properties.prototype.restrictedFork = function (index, group) {
//   var fProperties = new Properties();
//   this.forEach(function (property) {
//     var fork = property.restrictedFork(index, group);
//     if (fork) {
//       fProperties.add(fork);
//     }
//   });
//   return fProperties;
// };

module.exports = Properties;
},{"./Property":26}],26:[function(require,module,exports){
/* 
 * Property
 * ---------
 * A single property: column of Table or field of Index.
 * Stores all the values for that property using the serialized index of an entry of the Index/Table.
 * CloudType values are stored as the real values, Table references as their serialized index.
 */

var CloudType   = require('./CloudType');
var CSet        = require('./CSet');
var TypeChecker = require('./TypeChecker');
var Keys        = require('./Keys');
var Reference   = require('./Reference');

function Property(name, CType, index, values) {
  this.name   = name;
  this.keys   = index.keys;
  this.index  = index;
  this.CType  = CType;
  this.values = values || {};
}

// Calls callback with (keyName, keyEntry) for each valid key of this property
Property.prototype.forEachKey = function (callback) {
  var self = this;
  return Object.keys(this.values).forEach(function (key) {
      callback(key, self.values[key]);
  });
};


// Sets given value for given key and checks the type
Property.prototype.set = function (key, val) {
  // if (this.CType.prototype === CSet.CSetPrototype) {
  //   throw new Error("Can not call set on a CSet propety");
  // }
  TypeChecker.property(val, this.CType);
  
  // If it's a reference, simply store its uid
  // if (this.CType.prototype === Reference.Prototype) {
  //   if (val !== null) {
  //     val = val.serialKey();
  //   }
  // }
  this.values[key] = val;
};

Property.prototype.obliterate = function (key) {
  delete this.values[key];
};

Property.prototype.delete = function (key) {
  delete this.values[key];
};

// Gets the value of given key
// keys is only for the Tables
Property.prototype.getByKey = function (key, keys) {
  var ctype = this.values[key];

  // console.log('getting ' + key + '.' + this.name + ' = ' + ctype + ' (' + typeof ctype + ')');
  
  // If reference: check if reference is still valid, otherwise return null
  if (!CloudType.isCloudType(this.CType) && this.index.state.deleted(key, this.index)) {
    return null;
  }

  // 1) This key does not exist yet
  if (typeof ctype === 'undefined') {
    var entry = this.index.getByKey(key, keys);

    // if it is a Cloud Type, make a new default.
    // if (CloudType.isCloudType(this.CType)) { 
      ctype = this.CType.newFor(entry, this);

      // do not add to values property for a CSet, because it is kept in dedicated Table
      if (this.CType.prototype === CSet.CSetPrototype) {
        return ctype;
      }
    // } else {
      // ctype = Reference.newFor(entry, this);
    // }
      
      // add the new cloudtype to the values property for this key
      this.values[key] = ctype;
      return ctype;

    // if it is a reference and the key does not exist yet, return null
    // } else {
      // return null;
    // }
  }

  // 2) The key exists
  // if it is a Cloud Type, simply return the value
  // if (CloudType.isCloudType(this.CType)) {
  return ctype;
  // }
  // if it's a reference, retrieve the entry for that key from the referred Table.
  // return this.CType.getByKey(ctype);
};


// Returns an array of all entries for which the values of this property are not default
Property.prototype.entries = function () {
  var self = this;
  var result = [];
  this.forEachKey(function (key) {
//    console.log("____entry checking : " + key + "____");
//    console.log("deleted: " + self.index.state.deleted(key, self.index));
//    console.log("default: " + self.index.state.isDefault(self.getByKey(key)));

    if (!self.index.state.deleted(key, self.index) && !self.index.state.isDefault(self.getByKey(key))) {
      result.push(self.index.getByKey(key));
    }
  });
  return result;
};

Property.prototype.toJSON = function () {
  var type;
  var self = this;
  var values = {};
  
  // if (CloudType.isCloudType(this.CType)) {
    type = this.CType.toJSON();
  // } else {
    // type = this.CType.name;
  // }
  self.forEachKey(function (key, val) {
    values[key] = val.toJSON();
  });
  return { name: this.name, type: type, values: values };
};

Property.prototype.skeletonToJSON = function () {
  return { name: this.name, type: this.CType.toJSON(), values: {} };
};

Property.fromJSON = function (json, index) {
  var values = {};
  var CType;
  
  // If the property is a Cloud Type, rebuild all entries
  // if (CloudType.isCloudType(json.type)) {
    CType = CloudType.fromJSON(json.type);
    var property = new Property(json.name, CType, index);
    Object.keys(json.values).forEach(function (key) {
      values[key] = CType.fromJSON(json.values[key], index.getByKey(key), property);
    });
  // } else {
    // Otherwise it's a reference that will be replaced by the real reference in the second scan
    // CType = json.type;
    // Object.keys(json.values).forEach(function (key) {
      // values[key] = Reference.fromJSON(json.values[key], index.getByKey(key), property);
    // });
  // }
    
  // Object.keys(json.values).forEach(function (key) {
  //   values[key] = CType.fromJSON(json.values[key], index.getByKey(key), property);
  // });
  property.values = values;
  return property;  
};

Property.prototype.fork = function (index) {
  var self = this;
  var fProperty, fType;
  // Cloud Types need to be forked
  // if (CloudType.isCloudType(this.CType)) {
  //   fType = this.CType.fork();
  // } else {
    fType = this.CType;
  // }
    fProperty = new Property(this.name, fType, index);
    self.forEachKey(function (key, val) {
      fProperty.values[key] = val.fork();
    });
  // References are just copied
  // } else {
  //   fProperty = new Property(this.name, this.CType, index);
  //   self.forEachKey(function (key, val) {
  //     fProperty.values[key] = val;
  //   });
  // }
  return fProperty;
};

Property.prototype.shallowFork = function (index) {
  // Cloud Types need to be forked
  var fType;
  fType = this.CType.copy();
  return fProperty = new Property(this.name, fType, index);
};

// Property.prototype.restrictedFork = function (index, group) {
//   var self = this;

//   // Need to be authed to read this column
//   if (!self.index.state.authedForColumn('read', self.index, self.name, group)) {
//     return null;
//   }

//   // If its a reference, it needs to be authed to read the reference table
//   if (Reference.isReferenceDeclaration(self.CType) && !self.index.state.authedForTable('read', self.CType.prototype.table, group)) {
//     return null;
//   }
  
//   return self.fork(index);
// };

module.exports = Property;
},{"./CSet":18,"./CloudType":20,"./Keys":24,"./Reference":27,"./TypeChecker":33}],27:[function(require,module,exports){
/**
 * Created by ticup on 10/03/14.
 */
var CloudType = require('./CloudType');


function ReferenceDeclaration(table) { 
  function Reference(uid, isSet, entry) {
    this.uid = uid;
    this.isSet = isSet || false;
    this.type = Reference;
    this.entry = entry;
  }


  Reference.resolveTable = function (state) {
    table = state.get(table);
    Reference.prototype.table = table;
  };

  // Reference.table = function () {
  //   return table;
  // };

  Reference.isTypeOf = function (entry) {
    return entry.index == Reference.prototype.table;
  };

  Reference.newFor = function (entry, property) {
    var ref = new Reference(null);
    ref.entry = entry;
    ref.property = property;
    return ref;
  };

  Reference.getByKey = function (key) {
    return Reference.prototype.table.getByKey(key);
  };

  Reference.copy = function () {
    return new ReferenceDeclaration(Reference.prototype.table.name);
  };

  Reference.toJSON = function () {
    return { tag: ReferenceDeclaration.tag, table: Reference.prototype.table.name };
  };

  // Retrieves an instance of a declared type CInt from json
  // Not the complement of CInt.toJSON, but complement of CInt.prototype._toJSON!!
  Reference.fromJSON = function (json, entry, property) {
    var ref = new Reference(json.uid, json.isSet);
    ref.entry = entry;
    ref.property = property;
    return ref;
  };

  Reference.isReference = function () {
    return true;
  };

  Reference.toString = function () {
    return "Reference<" + Reference.prototype.table.name + ">";
  };

  Reference.tag = "Reference";
  Reference.prototype = Object.create(ReferencePrototype);

  Reference.prototype.fork = function () {
    var ref = new Reference(this.uid, false);
    this.applyFork();
    return ref;
  };

  Reference.prototype.get = function () {
    if (Array.prototype.slice.call(arguments).length > 0) {
      throw new Error("cannot call get on reference with arguments");
    }
    return this.table.getByKey(this.uid);
  };

  Reference.prototype.table = table;

  return Reference;
}

ReferenceDeclaration.declare = function (table) {
  return new ReferenceDeclaration(table);
};

ReferenceDeclaration.fromJSON = function (json) {
  return new ReferenceDeclaration(json.table);
};

// register this declaration as usable (will also allow to create CSet with CloudType.fromJSON())
ReferenceDeclaration.tag = "Reference";
CloudType.register(ReferenceDeclaration);


var ReferencePrototype = Object.create(CloudType.prototype);


// Puts an instance of a declared type CInt to json
ReferencePrototype.toJSON = function () {
  return {
    uid: this.uid,
    isSet: this.isSet
  };
};

// semantic operations
ReferencePrototype.set = function (row) {
  this.uid = row.serialKey()  ;
  this.isSet = true;
  return this;
};
// CloudType.updateOperation(ReferencePrototype, 'set');



// Defining _join(cint, target) provides the join and joinIn methods
// by the CloudType prototype.
ReferencePrototype._join = function (ref, target) {
  if (ref.isSet) {
    target.isSet  = true;
    target.uid    = ref.uid;
  } else {
    target.isSet  = this.isSet;
    target.uid    = this.uid;
  }
};

ReferencePrototype.applyFork = function () {
  this.isSet = false;
  return this;
};

ReferencePrototype.replaceBy = function (ref) {
  this.uid    = ref.uid;
  this.isSet  = ref.isSet;
};

ReferencePrototype.equals = function (row) {
  var val = this.get();
  if (val === null && row === null) {
    return true;
  }
  if (val === null || row === null) {
    return false;
  }
  if (row.prototype == ReferencePrototype) {
    return this.uid === row.uid;
  }
  return val.equals(row);
};

ReferencePrototype.isDefault = function () {
  return (this.get() === null);
};

ReferencePrototype.isChanged = function (ref) {
  return ref.isSet;
};

ReferencePrototype.toString = function () {
  return "Reference<" + this.uid + ">";
};

exports.isReferenceDeclaration = function (type) {
  return (typeof type.isReference === 'function' && type.isReference());
};

exports.Declaration = ReferenceDeclaration;
exports.Prototype = ReferencePrototype;
},{"./CloudType":20}],28:[function(require,module,exports){
module.exports = Restricted;

function Restricted(name) {
  this.name = name;
}

Restricted.prototype.forEachProperty = function (callback) {
  throw new Error("Restricted from table " + this.name);
};

Restricted.prototype.get = function () {
  throw new Error("Restricted from table " + this.name);
};

Restricted.prototype.getByKey = function (key) {
  throw new Error("Restricted from table " + this.name);
};

Restricted.prototype.entries = function (propertyName) {
  throw new Error("Restricted from table " + this.name);
};

Restricted.prototype.where = function (filter) {
  throw new Error("Restricted from table " + this.name);
};

Restricted.prototype.getProperty = function (property) {
  throw new Error("Restricted from table " + this.name);
};

Restricted.prototype.addProperty = function (property) {
  throw new Error("Restricted from table " + this.name);
};

Restricted.prototype.fork = function () {
  return new Restricted(this.name);
};

Restricted.prototype.toJSON = function () {
  return {
    type: 'Restricted'
  };
};

Restricted.fromJSON = function (json) {
  return new Restricted();
};
},{}],29:[function(require,module,exports){
var CloudType  = require('./CloudType');
var Index      = require('./Index');
var Table      = require('./Table');
var Restricted = require('./Restricted');
var Reference  = require('./Reference');
var CSetPrototype = require('./CSet').CSetPrototype;

module.exports = State;


function State() {
  this.arrays = {};
  this.cid = 0;
}

// Adds Authorization methods
require('./Auth')(State);

/* User API */
State.prototype.get = function (name) {
  var array = this.arrays[name];

  // if retrieving a global CloudType, get the value property of its proxy index instead
  if (typeof array !== 'undefined' && array.isProxy) {
    return array.getProperty('value').getByKey('singleton');
  }

  return this.arrays[name];
};

State.prototype.viewExists = function (name) {
  var exists = false;
  this.get('SysAuth').all().forEach(function (auth) {
    if (auth.get('vname').equals(name) && auth.get('type').equals('V')) {
      exists = true;
    }
  });
  return true;
};

State.prototype.all = function () {
  var self = this;
  var tables = [];
  Object.keys(this.arrays).forEach(function (name) {
    var index = self.arrays[name];
    if (!(index instanceof Restricted) && ((name.indexOf('Sys') === -1) || name === 'SysUser' || name === 'SysAuth')) {
      tables.push(index);
    }
  });
  return tables;
};

State.prototype.declare = function (name, array, grant) {
  var self = this;
  if (typeof self.arrays[name] !== 'undefined') {
    throw new Error("A type with name " + name + " is already declared");
  }

  // 1) Index or Table
  if (array instanceof Index) {
    array.state = this;
    array.name  = name;
    self.arrays[name] = array;

    array.forEachProperty(function (property) {

      // Lookup CloudType/Reference of property if necessary
      property.CType = self.resolvePropertyType(property.CType);

      // Special case: CSet property
      if (property.CType.prototype === CSetPrototype) {

        // Lookup Reference of the set if necessary
        property.CType.elementType = self.resolveKeyType(property.CType.elementType);

        // Declare proxy Table and set reference
        property.CType.declareProxyTable(self, array, property, grant);
      }
    });

    array.keys.forEach(function (name, type, i) {
      array.keys.types[i] = self.resolveKeyType(type);
      if (array.keys.types[i] === array)
        throw new Error("Cannot use self as key type: " + name + " (" + type + ")");
    });

  }

  // 2) global (CloudType) => create proxy Index
  else if (CloudType.isCloudType(array)) {
    var CType = array;
    array = new Index([], {value: CType});
    array.state = this;
    array.name  = name;
    array.isProxy = true;
    this.arrays[name] = array;
  } else {
    // Either declare Index (Table is also a Index) or CloudType, nothing else.
    throw new Error("Need an Index or CloudType to declare: " + array);
  }

  if (grant !== 'N') {
    this.auth.grantAll(array.name, 'T');
  }
  return array;
};

State.prototype.add = function (index) {
  this.arrays[index.name] = index;
  index.state = this;
  return this;
};



/* Internal */
/***********/
State.prototype.isDefault = function (cType) {
  return cType.isDefault();
};

State.prototype.createUID = function (uid) {
  var id = this.cid + "#" + uid;
  return id;
};

State.prototype.skeletonToJSON = function () {
  return {
    arrays: {},
    views: this.views.toJSON()
  };
};


State.prototype.toJSON = function () {
  var self = this;
  var arrays = {};
  Object.keys(self.arrays).forEach(function (name) {
    arrays[name] = self.arrays[name].toJSON();
  });
  return {
    arrays: arrays
  };
};

State.fromJSON = function (json) {
  var array, state;
  state = new this();

  // Recreate the indexes
  Object.keys(json.arrays).forEach(function (name) {
    var arrayJson = json.arrays[name];
    if (arrayJson.type === 'Entity') {
      array = Table.fromJSON(arrayJson);
    } else if (arrayJson.type === 'Array') {
      array = Index.fromJSON(arrayJson);
    } else if (arrayJson.type === 'Restricted') {
      array = Restricted.fromJSON(arrayJson);
    } else {
      throw "Unknown type in state: " + json.type;
    }
    array.state = state;
    array.name  = name;
    state.arrays[name] = array;
  });

  // Fix references
  state.forEachArray(function (array) {
    array.forEachProperty(function (property) {
      property.CType = state.resolvePropertyType(property.CType);

      // if CSet property -> give reference to the proxy entity
      if (property.CType.prototype === CSetPrototype) {
        property.CType.entity      = state.get(array.name + property.name);
        property.CType.elementType = state.resolveKeyType(property.CType.elementType);
        if (Reference.isReferenceDeclaration(property.CType.elementType)) {
          property.CType.elementType.resolveTable(state);
        }
      }

      // console.log('checking property ' + property.name + ' : ' + property.CType.table);
      // Reference that needs reference replacement
      // console.log(property.CType.prototype);
      // console.log(ReferencePrototype);
      // console.log(property.CType.prototype == ReferencePrototype);
      if (Reference.isReferenceDeclaration(property.CType)) {
        property.CType.resolveTable(state);
      }

      // If property is a reference, find all the references for all keys of that property
      // if (property.CType instanceof Index) {
      //   var refIndex = property.CType;

      //   property.forAllKeys(function (key, val) {
      //     var ref = refIndex.getByKey(val) || val;
      //     property.values[key] = ref;
      //   });
      // }
    });

    // Resolve the key types to the real types
    array.keys.forEach(function (name, type, i) {
      if (typeof type === 'string') {
        array.keys.types[i] = state.resolveKeyType(type);
      }
      // // console.log(array.keys.types[i]);
      // if (Reference.isReferenceDeclaration(array.keys.types[i])) {
      //   console.log('solving reference key: ' + array.keys.types[i]);
      //   array.keys.types[i].resolveTable(state);
      // }
    });
  }); 
  return state;
};

State.prototype.getProperty = function (property) {
  return this.arrays[property.index.name].getProperty(property);
};


State.prototype.forEachProperty = function (callback) {
  var self = this;
  self.forEachArray(function (array) {
    array.forEachProperty(callback);
  });
};

State.prototype.forEachArray = function (callback) {
  var self = this;
  Object.keys(this.arrays).forEach(function (name) {
    var index = self.arrays[name];
    if (!(index instanceof Restricted)) {
      callback(index);
    }
  });
};

State.prototype.forAllArray = function (callback) {
  var self = this;
  Object.keys(this.arrays).forEach(function (name) {
    var index = self.arrays[name];
    callback(index);
  });
};

State.prototype.forEachEntity = function (callback) {
  var self = this;
  Object.keys(this.arrays).forEach(function (name) {
    if (self.arrays[name] instanceof Table)
      callback(self.arrays[name]);
  });
};

State.prototype.propagate = function () {
  // console.log('propagating');
  var self = this;
  var changed = false;
  this.forEachEntity(function (entity) {
    entity.forEachState(function (key) {
      if (entity.exists(key) && self.deleted(key, entity)) {
        console.log(entity.name +"["+key+"] deleted....!");
        entity.setDeleted(key);
        changed = true;
      }
    });
  });
  this.forEachArray(function (array) {
    array.forEachProperty(function (property) {
      if (Reference.isReferenceDeclaration(property.CType)) {
        property.forEachKey(function (key) {
          var ref = property.getByKey(key);
          if (self.deleted(ref.uid, ref.table)) {
            ref.uid = null;
          }
        });
      }
    });
  });
  if (changed) {
    self.propagate();
  }
};

State.prototype.deleted = function (key, entity) {
  var self = this;

  // Index/Table
  if (typeof entity !== 'undefined' && entity instanceof Index) {
    var entry = entity.getByKey(key);

    // Table
    if (entity instanceof Table) {
      if (entry === null)
        return true;

      if (entity.deleted(key))
        return true;
    }

    var del = false;
    entry.forEachKey(function (name, value) {
      var type = entity.keys.getTypeOf(name);

      // when types are not stored as real references to the types but rather as their names:
      // if (typeof type !== 'undefined')
      //   type = self.get(type);
     // console.log('key deleted? ' + value + " of type " + type + "(" + name+ ")");
      if (self.deleted(value, type)) {
        // console.log('keyname: ' + name);
        // console.log(type == self.get(type.name));
        // console.log('because deleted: ' + value);
        // console.log(entity.states);
        // console.log(entity.states + ' ' + key);
        del = true;
      }
    });
    return del;
  }

  // // Array
  // if (typeof entity !== 'undefined' && entity instanceof Index) {
  //   var del = false;
  //   var entry = entity.get(key);
  //   entry.forEachKey(function (name, value) {
  //     var type = entity.keys.getTypeOf(name);
  //     if (self.deleted(value, type))
  //       del = true;
  //   });
  //   return del;
  // }

  // string/int
  return false;
};


State.prototype.dependendOn = function (child, parent) {
  var self = this;
  var dependend = false;
  child.keys.forEach(function (name, type, i) {
    if (type instanceof Index) {
      if (parent == type || self.dependendOn(type, parent)) {
        dependend = true;
      }
    }
  });
  return dependend;
};


State.prototype._join = function (rev, target) {
  var tArray, tProperty;
  var master = (this === target) ? rev : this;
  var self = this;

  // master === this => client-join
  // otherwise       => server-join
  
  // console.log('joining ' + Object.keys(master.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  // console.log('with ' + Object.keys(target.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  

  // (1) Perform the join
  master.forEachArray(function (array) {

    // If the target is restricted and we got an index in the master, this means access was granted to the that index
    // -> install the complete new index (references to the new index are set in (2))
    tArray = target.get(array.name);
    if (typeof tArray === 'undefined' || tArray instanceof Restricted) {
      // TODO: make actual copy of it for local usage (not important right now)
      return target.add(array);

    }

    // Otherwise do a property-key-wise join on each property of each entry
    array.forEachProperty(function (property) {
      var tProperty = tArray.properties.get(property);
      // If target does not have the property, access was granted to the property, just add it.
      if (rev === target && typeof tProperty === 'undefined') {
        // TODO: make actual copy of it for local usage (not important right now)
        target.get(array.name).addProperty(property); 
        return;
      }
     

      // Joining Cloud Types (CInt/CString/CDate...) => semantics in the Cloud Type implementation
      // if (CloudType.isCloudType(property.CType)) {
        property.forEachKey(function (key) {
          var joiner = rev.getProperty(property).getByKey(key);
          var joinee = self.getProperty(property).getByKey(key);
          var t = target.getProperty(property).getByKey(key);
          joinee._join(joiner, t);
        });

      // Joining Table references => last writer semantics
      // } else {
        // fix types for typechecker
        // rev.getProperty(property).CType = target.getProperty(property).CType;
        // property.forEachKey(function (key) {
        //   var joiner = rev.getProperty(property).getByKey(key);
        //   target.getProperty(property).set(key, joiner);
        // });
      // }
    });
  });

  // (2) Fix references to replaced Restricted Tables
  // target.forEachArray(function (index) {
  //   index.forEachProperty(function (property) {
  //     if (property.CType instanceof Restricted) {
  //       property.CType = target.get(property.CType.name);
  //     }
  //   });

  //   index.keys.forEach(function (key, type, i) {
  //     if (type instanceof Restricted) {
  //       index.keys.types[i] = target.get(type.name);
  //     }
  //   });
  // });

  // var created = [];

  // (3) Join the states of the Tables (deleted/created)
  master.forEachEntity(function (entity) {
    var joiner = rev.get(entity.name);
    var joinee = self.get(entity.name);
    var t = target.get(entity.name);
    entity.forEachState(function (key) {
      if (t.setMax(joinee, joiner, key)) {
        // created.push([t, key]);
        t.triggerCreated(key);
      }
    });

  });

  target.propagate();

  // created.forEach(function (entkey) {
  //   entkey[0].triggerCreated(entkey[1]);
  // });

};

State.prototype.joinIn = function (rev) {
  return this._join(rev, rev);
};

State.prototype.join = function (rev) {
  return this._join(rev, this);
};

State.prototype.fork = function () {
  var forked = new State();
  var forker = this;
  forked.views = forker.views;

  forker.forAllArray(function (index) {
    var fIndex = index.fork();
    fIndex.name = index.name;
    fIndex.state = forked;
    forked.add(fIndex);
  });

  // Fix Type references
  forked.forEachArray(function (index) {
    index.forEachProperty(function (property) {

      // if CSet property -> give reference to the proxy entity
      if (property.CType.prototype === CSetPrototype) {
        property.CType.entity      = forked.get(index.name + property.name);

        // and replace the table with the new table if it has a table as element
        if (property.CType.elementType instanceof Table) {
          property.CType.elementType = forked.get(property.CType.elementType.name);
        }
      }

      // if reference property -> replace the table with the new table
      if (Reference.isReferenceDeclaration(property.CType)) {
        property.CType.prototype.table = forked.get(property.CType.prototype.table.name);
      }
    });

    index.keys.forEach(function (key, type, i) {
      if (type instanceof Table) {
        index.keys.types[i] = forked.get(type.name);
      }
    });
  });
  return forked;
};

State.prototype.restrict = function (user) {
  var self = this;


  self.forAllArray(function (index) {

    // If not authed to read table, replace by Restricted object
    if (!self.canSeeTable(index, user)) {
      // console.log('restricted from ' + index.name);
      var restricted = new Restricted(index.name);
      restricted.state = self;
      self.add(restricted);
      return;
    }

    if (index instanceof Table) {
      index.forEachState(function (key) {
        var entry = index.getByKey(key);
        if (!self.authedForRow('read', entry, user)) {
          // console.log('obliterated ' + key);
          index.obliterate(key);
        }
      });
    }

    // console.log('can see some of ' + index.name);
    index.forEachProperty(function (property) {


      // 1) Can see the whole column
      if (self.canSeeFullColumn(index, property.name, user)) {
        // console.log('can see complete ' + index.name + '.' + property.name);
        return;
      }

      // 2) Can see some of the entries of this column
      if (self.canSeeColumn(index, property.name, user)) {
        
        // delete entries depending on the view
        property.forEachKey(function (key) {
          var entry = index.getByKey(key);
          if (entry && !self.authedForEntryProperty('read', entry, property, user)) {
            property.delete(key);
          }
        });

      // 3) not authed to read any entry of this column, completely remove it
      } else {
        delete index.properties.properties[property.name];
      }

      // // If its a reference, it needs to be authed to read the reference table
      // if (Reference.isReferenceDeclaration(property.CType) && !self.authedForTable('read', property.CType.prototype.table, group)) {
      //   delete index.properties.properties[property.name];
      // }
    });

  });



  return self;
};


State.prototype.restrictedFork = function (user) {
  var view, keys, tname, index, fIndex, cgroup;
  var self = this;
  var json = self.skeletonToJSON();
  var group = user.get('group').get();

  var colAuths = self.get('SysColAuth').where(function (colAuth) {
    return (colAuth.get('user').equals(user) || colAuth.get('group').equals(group));
  }).all();
  console.log(colAuths.length);

  self.get('SysAuth').all().forEach(function (auth) {
    var g = auth.get('group');
      // console.log(auth.get('user') + " | " + g + " | " + auth.get('tname').get() + " | " + auth.get('vname') + " | " + auth.get('priv').get() + " | " + auth.get("active").get());
      // console.log(g.get());
    if ((auth.get('user').equals(user) || auth.get('group').equals(group)) &&
        auth.get('priv').equals('read') &&
        auth.get('active').equals('Y')) {
      cgroup = auth.get('group').equals(group);
      tname = auth.get('tname').get();

      index  = self.get(tname);
      fIndex = json.arrays[tname];
      if (typeof fIndex === 'undefined') {
        fIndex = index.skeletonToJSON();
        json.arrays[tname] = fIndex;
      }
      if (index instanceof Table) {
        if (auth.get('type').equals('T')) {
          index.forEachState(function (key) {
            fIndex.states[key] = index.states[key];
          });

        } else if (auth.get('type').equals('V')) {
          keys = [];
          view = self.views.get(auth.get('vname').get());
          // console.log('setting keys for ' + view.name);
          index.forEachState(function (key) {
            var entry = index.getByKey(key);
            if (entry && view.includes(entry, user)) {
              // console.log('adding ' + key);
              keys.push(key);
              fIndex.states[key] = index.states[key];
            }
          });
        } else {
          throw new Error("incorrect type");
        }
      }

      colAuths.forEach(function (colAuth) {
        if ((cgroup ? colAuth.get('group').equals(auth.get('group').get()) : colAuth.get('user').equals(user)) &&
            colAuth.get('tname').equals(auth.get('tname').get()) &&
            colAuth.get('grantopt').equals(auth.get('grantopt').get()) &&
            colAuth.get('priv').equals('read') &&
            colAuth.get('active').equals('Y')) {
          var cname = colAuth.get('cname').get();
          // console.log('\t.'+cname);
          var property = index.getProperty(cname);
          var fProperty = fIndex.properties[cname];
          if (typeof fProperty === 'undefined') {
            fProperty = property.skeletonToJSON(fIndex);
            fIndex.properties[cname] = fProperty;
          }
          if (colAuth.get('type').equals('T')) {
            // console.log('full:');
            property.forEachKey(function (key, val) {
              fProperty.values[key] = val.fork().toJSON();
            });
          } else if (colAuth.get('vname').equals(auth.get('vname').get())) {
            // console.log('setting columns for ' + colAuth.get('vname').get());
             keys.forEach(function (key) {
              // console.log('\t'+key);
              var val = property.getByKey(key);
              fProperty.values[key] = val.fork().toJSON();
            });
          }
        }
      });
      cgroup = null;
    }
  });


  propagateFilter(json);

  

  // Make an array of the properties instead of a map
  Object.keys(json.arrays).forEach(function (name) {
    var index = json.arrays[name];
    index.properties = Object.keys(index.properties).map(function (pname) {
      return index.properties[pname];
    });
  });

  console.log(json.arrays.SysGroup.states);
  return json;
};

State.prototype.restrictFork = function (user) {
  var view, keys, tname, index, fIndex, cgroup;
  var self = this;
  var group = user.get('group').get();

  var fork = new State();
  fork.views = self.views;

  var colAuths = self.get('SysColAuth').where(function (colAuth) {
    return (colAuth.get('user').equals(user) || colAuth.get('group').equals(group));
  }).all();
  console.log(colAuths.length);

  self.get('SysAuth').all().forEach(function (auth) {
    var g = auth.get('group');
      // console.log(auth.get('user') + " | " + g + " | " + auth.get('tname').get() + " | " + auth.get('vname') + " | " + auth.get('priv').get() + " | " + auth.get("active").get());
      // console.log(g.get());
    if ((auth.get('user').equals(user) || auth.get('group').equals(group)) &&
        auth.get('priv').equals('read') &&
        auth.get('active').equals('Y')) {
      cgroup = auth.get('group').equals(group);
      tname = auth.get('tname').get();

      index  = self.get(tname);
      fIndex = fork.get(tname);
      if (typeof fIndex === 'undefined') {
        fIndex = index.shallowFork();
        fIndex.name = tname;
        fork.add(fIndex);
      }
      if (index instanceof Table) {
        if (auth.get('type').equals('T')) {
          index.forEachState(function (key) {
            fIndex.states[key] = index.states[key];
            fIndex.setKeyValues(key, index.getKeyValues(key));
          });

        } else if (auth.get('type').equals('V')) {
          keys = [];
          view = self.views.get(auth.get('vname').get());
          // console.log('setting keys for ' + view.name);
          index.forEachState(function (key) {
            var entry = index.getByKey(key);
            if (entry && view.includes(entry, user)) {
              // console.log('adding ' + key);
              keys.push(key);
              fIndex.states[key] = index.states[key];
              fIndex.setKeyValues(key, index.getKeyValues(key));
            }
          });
        } else {
          throw new Error("incorrect type");
        }
      }

      colAuths.forEach(function (colAuth) {
        if ((cgroup ? colAuth.get('group').equals(auth.get('group').get()) : colAuth.get('user').equals(user)) &&
            colAuth.get('tname').equals(auth.get('tname').get()) &&
            colAuth.get('grantopt').equals(auth.get('grantopt').get()) &&
            colAuth.get('priv').equals('read') &&
            colAuth.get('active').equals('Y')) {
          var cname = colAuth.get('cname').get();
          // console.log('\t.'+cname);
          var property = index.getProperty(cname);
          var fProperty = fIndex.getProperty(cname);
          if (typeof fProperty === 'undefined') {
            fProperty = property.shallowFork(fIndex);
            fIndex.addProperty(fProperty);
          }
          if (colAuth.get('type').equals('T')) {
            // console.log('full:');
            property.forEachKey(function (key, val) {
              fProperty.set(key, val.fork());
            });
          } else if (colAuth.get('vname').equals(auth.get('vname').get())) {
            // console.log('setting columns for ' + colAuth.get('vname').get());
             keys.forEach(function (key) {
              // console.log('\t'+key);
              var val = property.getByKey(key);
              fProperty.set(key, val.fork());
            });
          }
        }
      });
      cgroup = null;
    }
  });


  // Fix Type references
  fork.forEachArray(function (index) {
    index.forEachProperty(function (property) {

      // if reference property -> replace the table with the new table
      if (Reference.isReferenceDeclaration(property.CType)) {
        property.CType.resolveTable(fork);
        // property.CType.prototype.table = fork.get(property.CType.prototype.table.name);
      }

      // if CSet property -> give reference to the proxy entity
      if (property.CType.prototype === CSetPrototype) {
        property.CType.entity      = fork.get(index.name + property.name);

        // and replace the table with the new table if it has a table as element
        if (property.CType.elementType instanceof Table) {
          property.CType.elementType = fork.get(property.CType.elementType.name);
        }
      }

      
    });

    index.keys.forEach(function (key, type, i) {
      if (type instanceof Table) {
        // console.log('settig new key: ' + type.name);
        index.keys.types[i] = fork.get(type.name);
      }
    });
  });


  fork.propagateFilter();
  return fork;
};


State.prototype.propagateFilter = function () {
  var self = this;
  var changed = false;
  this.forEachEntity(function (entity) {
    entity.forEachState(function (key) {
      if (entity.exists(key) && self.deleted(key, entity)) {
        // console.log(entity.name +"["+key+"] deleted by filter");
        entity.obliterate(key);
        changed = true;
      }
    });
  });
  this.forEachArray(function (array) {
    array.forEachProperty(function (property) {
      if (Reference.isReferenceDeclaration(property.CType)) {
        property.forEachKey(function (key) {
          var ref = property.getByKey(key);
          if (self.deleted(ref.uid, ref.table)) {
            ref.uid = null;
          }
        });
      }
    });
  });
  if (changed) {
    self.propagateFilter();
  }
};

State.prototype.applyFork = function () {
  var self = this;
  self.forEachProperty(function (property) {
    // if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var type = property.getByKey(key);
        type.applyFork();
      });
    // }
  });
};

State.prototype.replaceBy = function (state) {
  var self = this;
  state.forEachProperty(function (property) {
    // if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var type1 = property.getByKey(key);
        var type2 = self.getProperty(property).getByKey(key);
        type2.replaceBy(type1);
      });
    // }
  });
  state.forEachEntity(function (entity) {
    self.get(entity.name).states = entity.states;
  });
};


// Try to resolve to real property type from a string
State.prototype.resolvePropertyType = function (type) {
  var rType = type;
  if (typeof type === 'string') {
    // 1) try to declare as regular CloudType
    rType = CloudType.declareFromTag(type);

    // 2) try to declare as reference to an Index
    if (typeof rType === 'undefined') {
      rType = Reference.Declaration.declare(this.get(type));
    }
  }
  if (type instanceof Table) {
    return Reference.Declaration.declare(type);
  }
  if (Reference.isReferenceDeclaration(type)) {
    return type;
  }
  if (typeof rType === 'undefined') {
    throw new Error("Undefined Property Type: " + type);
  }

  return rType;
};

// Try to resolve to a real key type from a string
State.prototype.resolveKeyType = function (type) {
  // console.log('resvolving ' + type);
  if (typeof type === 'string') {
    if (type === 'string' || type === 'int') {
      return type;
    }
    var rType = this.get(type);
    if (typeof rType !== 'undefined' && rType instanceof Table) {
      return rType;
    }
  }
  if (type instanceof Table) {
    return type;
  }
  // if (Reference.isReferenceDeclaration(type)) {
  //   return type;
  // }
  throw new Error("Only int, string or Table identifiers are allowed as keys, given " + type);
};

State.prototype.print = function () {
  this.forEachArray(function (array) {
    console.log(array.name);
    array.keys.forEach(function (key, type, i) {
      console.log("\t" + key + " : " + type.toString());
    });
    array.forEachProperty(function (property) {
      console.log("\t\t" + property.name + " : " + property.CType.toString());
    });
  });
  // console.log(require('util').inspect(this, {depth: null}));
};
},{"./Auth":16,"./CSet":18,"./CloudType":20,"./Index":21,"./Reference":27,"./Restricted":28,"./Table":30}],30:[function(require,module,exports){
var Index      = require('./Index');
var Keys       = require('./Keys');
var Properties = require('./Properties');
var Property   = require('./Property');
var TableEntry = require('./TableEntry');
var TableQuery = require('./TableQuery');
var TypeChecker = require('./TypeChecker');
module.exports = Table;

var OK = 'ok';
var DELETED = 'deleted';

// when declared in a State, the state will add itself and the declared name for this Index as properties
// to the Table object.
function Table(keys, columns) {
  var self = this;

  // declare with only columns
  if (typeof columns === 'undefined' && !(keys instanceof Array)) {
    columns = keys;
    keys = [];
  }
  // declare with no keys/columns (from json)
  else if (typeof columns === 'undefined' && typeof keys === 'undefined') {
    columns = {};
    keys = [];
  }

  Index.call(this, keys, columns);
  this.keyValues = {};
  this.states    = {};
  this.callbacks = [];
  this.uid       = 0;
  this.cached = {};
}

Table.prototype = Object.create(Index.prototype);
Table.prototype.constructor = Table;

Table.OK = OK;
Table.DELETED = DELETED;

Table.declare = function (keys, columns) {
  return new Table(keys, columns);
};

Table.declare.type = Table;

Table.prototype.create = function (keys) {
  var uid = this.name + ":" + this.state.createUID(this.uid);
  if (!(keys instanceof Array)) {
    keys = Array.prototype.slice.call(arguments, 0);
  }
  TypeChecker.keys(keys, this.keys);
  // keys = Keys.getKeys(keys, this).slice(1);
  this.uid += 1;
  this.setCreated(uid);
  this.setKeyValues(uid, keys);
  return this.getByKey(uid);
};

Table.prototype.delete = function (entry) {
  console.log('deleting: ' + entry.uid);
  this.setDeleted(entry.uid);
  this.state.propagate();
};

Table.prototype.getKeyValues = function (uid) {
  var values = this.keyValues[uid];
  if (typeof values === 'undefined') {
    return [];
  }
  return values;
};

Table.prototype.setKeyValues = function (uid, keys) {
  this.keyValues[uid] = keys;
  return this;
};


// Removes all info about uid, only to be used by restrict
Table.prototype.obliterate = function (uid) {
  delete this.keyValues[uid];
  delete this.states[uid];
  delete this.cached[uid];
  this.forEachProperty(function (property) {
    property.delete(uid);
  });
};

// Pure arguments version (user input version)
// Table.prototype.get = function () {
//   var args = Array.prototype.slice.call(arguments);
//   var key = Keys.createIndex(args);
//   if (this.states[key]) {
//     return new TableEntry(this, args);
//   }
//   return null;
// };

// Pure arguments version (user input version)
// Table.prototype.get = function () {
//   var args = Array.prototype.slice.call(arguments);
//   var key = Keys.createIndex(args);
//   if (this.exists(key)) {
//     return new TableEntry(this, args);
//   }
//   return null;
// };

Table.prototype.get = function () {
  throw new Error("should not call get on table");
};

// Flattened key version (internal version)
Table.prototype.getByKey = function (uid, keys) {
  var self = this;
  if (this.exists(uid)) {
    keys = keys || this.getKeyValues(uid);
    var cache = self.cached[uid];
    if (typeof cache !== 'undefined') {
      cache.keys = Keys.getKeys(keys, self);
      return cache;
    }
    var entry = new TableEntry(this, uid, keys);
    self.cached[uid] = entry;
    return entry;
  }
  return null;
};

Table.prototype.forEachState = function (callback) {
  var self = this;
  return Object.keys(this.states).forEach(function (key) {
    callback(key, self.states[key]);
  });
};

Table.prototype.setMax = function (entity1, entity2, key) {
  var self = this;
  var val1 = entity1.states[key];
  var val2 = entity2.states[key];
  if (val1 === DELETED || val2 === DELETED) {
    self.states[key] = DELETED;
    return;
  }
  if (val1 === OK || val2 === OK) {
    self.states[key] = OK;

    if (val1 === OK && val2 !== OK) {
      entity2.setKeyValues(key, entity1.getKeyValues(key));
      return;
    }

    // newly created by client, coming in to server
    if (val2 === OK && val1 !== OK) {
      entity1.setKeyValues(key, entity2.getKeyValues(key));
      return true;
    }
  }

};

Table.prototype.where = function (filter) {
  return new TableQuery(this, filter);
};

Table.prototype.all = function () {
  var self = this;
  var entities = [];
  Object.keys(this.states).forEach(function (uid) {
    if (!self.state.deleted(uid, self))
      entities.push(self.getByKey(uid));
  });
  return entities;
};

Table.prototype.forEachRow = function (callback) {
  var self = this;
  Object.keys(this.states).forEach(function (uid) {
    if (!self.state.deleted(uid, self))
      callback(self.getByKey(uid));
  });
};

Table.prototype.setDeleted = function (key) {
  console.log('setting to deleted: ' + key);
  this.states[key] = DELETED;
};

Table.prototype.setCreated = function (key) {
  this.states[key] = OK;
};


Table.prototype.getByProperties = function (properties) {
  var results = this.where(function (row) {
    var toReturn = true;
    Object.keys(properties).forEach(function (name) {
      if (!row.get(name).equals(properties[name])) {
        toReturn = false;
      }
    });
    return toReturn;
  }).all();
  if (results.length > 0) {
    return results[0];
  }
  return null;
};

Table.prototype.getByKeys = function (keys) {
  var results = this.where(function (row) {
    var toReturn = true;
    Object.keys(keys).forEach(function (name) {
      var val = row.key(name);
      if (val instanceof TableEntry) {
        if (!(val.equals(keys[name]))) {
          toReturn = false;
        }
      } else {
        if (val !== keys[name]) {
          toReturn = false;
        }
      }
    });
    return toReturn;
  }).all();
  if (results.length > 0) {
    return results[0];
  }
  return null;
};

Table.prototype.find = function (callback) {
  var self = this;
  var result = null;
  self.all().forEach(function (row) {
    if (callback(row)) {
      result = row;
    }
  });
  return result;
}


Table.prototype.onCreate = function (callback) {
  this.callbacks.push(callback);
};

Table.prototype.triggerCreated = function (key) {
  var entry = this.getByKey(key);
  this.callbacks.forEach(function (callback) {
    callback(entry);
  });
};


Table.prototype.exists = function (idx) {
  return (this.defined(idx) && this.created(idx));
};

Table.prototype.created = function (idx) {
  return (this.states[idx] === OK);
};

Table.prototype.defined = function (idx) {
  return (typeof this.states[idx] !== 'undefined');
};

Table.prototype.deleted = function (idx) {
  return (this.states[idx] === DELETED);
};

Table.prototype.fork = function () {
  var self = this;
  var fKeys = this.keys.fork();
  var table = new Table();
  table.keys = fKeys;
  table.properties = self.properties.fork(table);
  table.states     = {};
  Object.keys(self.states).forEach(function (key) {
    table.states[key] = self.states[key];
  });
  table.keyValues  = {};
  Object.keys(self.keyValues).forEach(function (key) {
    table.keyValues[key] = self.keyValues[key];
  })
  table.isProxy    = this.isProxy;
  return table;
};

Table.prototype.shallowFork = function () {
  var self = this;
  var fKeys = this.keys.fork();
  var table = new Table();
  table.keys = fKeys;
  table.properties = new Properties();
  table.isProxy    = this.isProxy;
  return table;
};

// Table.prototype.restrictedFork = function (group) {
//   var fKeys = this.keys.fork();
//   var table = new Table();
//   table.keys = fKeys;
//   table.properties = this.properties.restrictedFork(table, group);
//   table.states     = this.states;
//   table.isProxy    = this.isProxy;
//   table.keyValues  = this.keyValues;
//   return table;
// };

Table.fromJSON = function (json) {
  var table = new Table();
  table.keys = Keys.fromJSON(json.keys);
  table.keyValues = json.keyValues;
  table.states = {};
  Object.keys(json.states).forEach(function (key) {
    table.states[key] = json.states[key];
  });
  table.properties = Properties.fromJSON(json.properties, table);
  return table;
};

Table.prototype.toJSON = function () {
  return {
    type        : 'Entity',
    keys        : this.keys.toJSON(),
    keyValues   : this.keyValues,
    properties  : this.properties.toJSON(),
    states      : this.states,
    isProxy     : this.isProxy
  };
};

Table.prototype.skeletonToJSON = function () {
  return {
    type        : 'Entity',
    keys        : this.keys.toJSON(),
    keyValues   : this.keyValues,
    properties  : {},
    states      : {},
    isProxy     : this.isProxy,
    name        : this.name
  };
};

},{"./Index":21,"./Keys":24,"./Properties":25,"./Property":26,"./TableEntry":31,"./TableQuery":32,"./TypeChecker":33}],31:[function(require,module,exports){
var Keys        = require('./Keys');
var IndexEntry  = require('./IndexEntry');
var CloudType   = require('./CloudType');
var TypeChecker = require('./TypeChecker');
module.exports = TableEntry;

function TableEntry(index, uid, keys) {
  this.index = index;
  this.uid   = uid;
  this.keys  = Keys.getKeys(keys, index);
}
TableEntry.prototype = Object.create(IndexEntry.prototype);

TableEntry.prototype.forEachColumn = function (callback) {
  return this.forEachProperty(callback);
};

TableEntry.prototype.delete = function () {
  return this.index.delete(this);
};    

TableEntry.prototype.equals = function (entry) {
  if (!(entry instanceof TableEntry)) {
    return false;
  }

  if (this.index.name !== entry.index.name) {
    return false;
  }

  return this.uid === entry.uid;
};

TableEntry.prototype.serialKey = function () {
  return this.toString();
};

TableEntry.prototype.toString = function () {
  return this.uid;
};
},{"./CloudType":20,"./IndexEntry":22,"./Keys":24,"./TypeChecker":33}],32:[function(require,module,exports){
/**
 * Created by ticup on 07/11/13.
 */

var IndexQuery = require("./IndexQuery");

module.exports = TableQuery;

function TableQuery(table, filter) {
  IndexQuery.call(this, table, filter);
}
TableQuery.prototype = Object.create(IndexQuery.prototype);

TableQuery.prototype.all = function () {
  var self = this;
  var entities = [];
  Object.keys(self.index.states).forEach(function (uid) {
    if (!self.index.state.deleted(uid, self.index) && (typeof self.sumFilter === 'undefined' || self.sumFilter(self.index.getByKey(uid))))
      entities.push(self.index.getByKey(uid));
  });
  if (self.orderProperty) {
    var property = self.index.getProperty(self.orderProperty);
    if (typeof property === 'undefined') {
      throw new Error("orderBy only allowed on properties for the moment");
    }
    return entities.sort(function (entry1, entry2) {
      return entry1.get(self.orderProperty).compare(entry2.get(self.orderProperty), (self.orderDir === "desc"));
    });
  }
  return entities;
};
},{"./IndexQuery":23}],33:[function(require,module,exports){
var CloudType = require('./CloudType');


var TypeChecker = {
  key: function (val, type) {
    if (type === 'int') {
      if (typeof val !== 'number') {
        throw new Error("uncompatible key for declared type int: " + val);
      }
    } else if (type === 'string') {
      if (typeof val !== 'string') {
        throw new Error("uncompatible key for declared type string: " + val);
      }
    } else {
      if (typeof val.index === 'undefined' || !type.isTypeOf(val)) {
        throw new Error("uncompatible key for declared type " + type.index.name + " : " + val);
      }
    }
  },
  property: function (val, type) {
    // Cloud Type property: value has to be an instance of the declared Cloud Type
    if (CloudType.isCloudType(type)) {
      if (!val instanceof type) {
        throw new Error("uncompatible property for declared property " + type.tag + " : " + val);
      }
    // Reference property: value has to be an entry of declared Table or null.
    } else if (val !== null && (val.index === 'undefined' || !type.isTypeOf(val))) {
        throw new Error("uncompatible property for declared property " + type + " : " + val);
    }
  },
  keys: function (values, keys) {
    if (keys.types.length !== values.length) {
      throw new Error("uncompatible keys for declared type " + keys);
    }
    for (var i = 0; i < keys.types.length; i++) {
      var type = keys.types[i];
      var value = values[i];
      if (type === 'int') {
        if (typeof value !== 'number') {
          throw new Error("uncompatible key for declared type int" + value);
        }
      } else if (type === 'string') {
        if (typeof value !== 'string') {
          throw new Error("uncompatible key for declared type string" + value);
        }
      } else {
        if (typeof value.index === 'undefined' || value.index !== type) {
          throw new Error("uncompatible key for declared type " + value);
        }
      }
    }
  }
};


module.exports = TypeChecker;
},{"./CloudType":20}],34:[function(require,module,exports){
module.exports = View;


function View(name, table, query) {
  this.name = name;
  this.table = table;
  this.query = query;
}

View.prototype.includes = function (entry, user) {
  var self =  this;
  // var included = false;
  // self.table.forEachState(function (key) {
  //   var row = self.table.getByKey(key);
  return self.query(entry, {current_user: user});
};

View.prototype.toJSON = function () {
  return {
    name: this.name,
    table: this.table.name,
    query: this.query.toString(),
  };
};

View.fromJSON = function (json, state) {
  var table = state.get(json.table);
  eval('var query = ' + json.query);
  return new View(json.name, table, query);
}
},{}],35:[function(require,module,exports){
var View = require('./View');
var CSetPrototype = require('./CSet').CSetPrototype;

module.exports = Views;

function Views(state, auth) {
  state.views = this;
  this.state = state;
  this.auth  = auth;
  this.views = {};
}

Views.prototype.create = function (name, table, query) {
  var self = this;
  if (typeof table === 'string') {
    table = this.state.get(table);
  }
  if (typeof this.get(name) !== 'undefined') {
    throw new Error("View " + name + " already exists!");
  }
  var view = new View(name, table, query);
  this.views[name] = view;
  this.auth.grantAllView(view);
  // table.forEachProperty(function (property) {
  //     if (property.CType.prototype === CSetPrototype) {
  //       // console.log(property.CType.prototype);
  //       self.create(name+'.'+property.name, property.CType.entity, query);
  //     }
  //   });
  return view;
};

Views.prototype.get = function (name) {
  return this.views[name];
};

Views.prototype.toJSON = function () {
  var self = this;
  var json = [];
  Object.keys(this.views).forEach(function (name) {
    json.push(self.views[name].toJSON());
  });
  return json;
};

Views.fromJSON = function (json, state) {
  var views = new Views(state);
  json.forEach(function (view) {
    var view = View.fromJSON(view, state);
    views.views[view.name] = view;
  });
  return views;
};
},{"./CSet":18,"./View":34}],36:[function(require,module,exports){

// load normal client file
var main = require('../../client/main');

// extend CloudTypes with test functionalities
exports.CInt     = require('../extensions/CInt');
exports.CString  = require('../extensions/CString');
exports.State    = require('../extensions/State');
},{"../../client/main":8,"../extensions/CInt":37,"../extensions/CString":38,"../extensions/State":39}],37:[function(require,module,exports){
// test/extensions/CInt.js
//
// Extends the CInt CloudType with the necessary test
// functionalities for the tests. 
var CInt = require('../../shared/CInt').CInt;
var should = require('should');

module.exports = CInt;


// Type specific semantics
CInt.prototype.isForkOf = function (type) {
  this.base.should.equal(type.base + type.offset);
  this.isSet.should.equal(false);
  this.offset.should.equal(0);
};

CInt.prototype.isJoinOf = function (type1, type2) {
  if (type2.isSet) {
    this.isSet.should.equal(true);
    this.base.should.equal(type2.base);
    this.offset.should.equal(type2.offset);
  } else {
    this.isSet.should.equal(type1.isSet);
    this.base.should.equal(type1.base);
    this.offset.should.equal(type1.offset + type2.offset);
  }
};

CInt.prototype.isEqual = function (cint) {
  this.isSet.should.equal(cint.isSet);
  this.base.should.equal(cint.base);
  this.offset.should.equal(cint.offset);
};

CInt.prototype.isConsistent = function (cint) {
  this.get().should.equal(cint.get());
};
},{"../../shared/CInt":17,"should":14}],38:[function(require,module,exports){
// test/extensions/CString.js
//
// Extends the CString CloudType with the necessary test
// functionalities for the tests. 
var CString = require('../../shared/CString').CString;
var should  = require('should');
var util    = require('util');

module.exports = CString;


// Type specific semantics
CString.prototype.isEqual = function (cstring) {
  this.value.should.equal(cstring.value);
  this.written.should.equal(cstring.written);
  this.cond.should.equal(cstring.cond);
};

CString.prototype.isForkOf = function (cstring) {
  this.value.should.equal(cstring.value);
  this.written.should.equal(false);
  this.cond.should.equal(false);
};


CString.prototype.isJoinOf = function (type1, type2) {
  if (type2.written === 'wr') {
    this.written.should.equal('wr');
    this.value.should.equal(type2.value);
    this.cond.should.equal(false);

  } else if (type1.written === 'wr' && type1.value === '' && type2.written === 'cond') {
    this.written.should.equal('wr');
    this.value.should.equl(type2.cond);
    this.cond.should.equal(false);

  } else if (type1.written === false && type1.value === '' && type2.written === 'cond') {
    this.written.should.equal('cond');
    this.cond.should.equal(type2.cond);
    this.value.should.equal(type2.cond);

  } else if (type1.written === 'wr' && type1.value !== '' && type2.written === 'cond') {
    this.written.should.equal('cond');
    this.cond.should.equal(type2.cond);
    this.value.should.equal(value1.value);

  } else {
    this.written.should.equal(type1.written);
    this.value.should.equal(type1.value);
    this.cond.should.equal(false);
  }
};

CString.prototype.isConsistent = function (cstring) {
//  console.log(this.get() + " =? " + cint.get());
  this.get().should.equal(cstring.get());
};
},{"../../shared/CString":19,"should":14,"util":67}],39:[function(require,module,exports){
var State = require('../../shared/State');
var CloudType = require('../../shared/CloudType');
var should = require('should');

module.exports = State;

var OK = 'ok';
var DELETED = 'deleted';
// State.prototype.isForkOf = function (state) {
//   var fState = this;
//   var isFork = true;
//   // each type in state should have an equivalent forked type in fState
//   state.eachType(function (name, type) {
//     var fType = fState.get(name);
//     if (!fType)
//       isFork = false;
//     if (!fType.isForkOf(type))
//       isFork = false;
//   });

//   if (state.numTypes() != fState.numTypes())
//     isFork = false;


//   return isFork;
// };

// State.prototype.isJoinOf = function (state1, state2) {
//   var isJoin = true;
//   this.eachType(function (name, jType) {
//     var type1 = state1.get(name);
//     var type2 = state2.get(name);
//     if (!type1 || !type2)
//       isJoin = false;
//     if (!(jType.isJoinOf(type1, type2)))
//       isJoin = false;
//   });

//   if (state2.numTypes() !== state2.numTypes())
//     throw "joined states do not have same number of types";

//   if (this.numTypes() !== state1.numTypes())
//     isJoin = false;

//   return isJoin;
// };

State.prototype.forPairs = function (state2, callback) {
  var state1 = this;
  state1.forEachProperty(function (property) {
    if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var type1 = property.getByKey(key);
        var type2 = state2.getProperty(property).getByKey(key);
        should.exist(type2);
        callback(type1, type2);
      });
    }
  });
};

State.prototype.isForkOf = function (state) {
  this.forPairs(state, function (forked, forker) {
    forked.isForkOf(forker);
  });
};

State.prototype.isJoinOf = function (state1, state2) {
  var self = this;
  this.forEachProperty(function (property) {
    if (CloudType.isCloudType(property.CType)) {
      property.forEachKey(function (key) {
        var jType = property.getByKey(key);
        var type1 = state1.getProperty(property).getByKey(key);
        var type2 = state2.getProperty(property).getByKey(key);
        should.exist(type1);
        should.exist(type2);
        jType.isJoinOf(type1, type2);
      });
    }
  });
  this.forEachEntity(function (entity) {
    entity.forEachState(function (key) {
      var val  = entity.states[key];
      var val1 = state1.get(entity.name).states[key];
      var val2 = state2.get(entity.name).states[key];
      if (val1 === DELETED || val2 === DELETED)
        return self.get(entity.name).states[key].should.equal(DELETED);
      if (val1 === OK || val2 === OK)
        return self.get(entity.name).states[key].should.equal(OK);
    });
  });
};

State.prototype.isEqual = function (state) {
  this.forPairs(state, function (type1, type2) {
    type1.isEqual(type2);
  });
  this.forEachEntity(function (entity) {
    entity.states.should.eql(state.get(entity.name).states);
  });
};

State.prototype.isConsistent = function (state) {
  this.forPairs(state, function (type1, type2) {
//    console.log(require('util').inspect(type1.get()) + " consistent? " + require('util').inspect(type2.get()));
    type1.isConsistent(type2);
  });
  this.forEachEntity(function (entity) {
//      console.log(require('util').inspect(entity.states) + " consistent? " + require('util').inspect(state.get(entity.name).states));
    entity.forEachState(function (key) {
//      console.log('key: ' + key);
//      console.log(entity.states[key] + " ?= " + state.get(entity.name).states[key]);
      entity.states[key].should.equal(state.get(entity.name).states[key]);
    });
  });
};
},{"../../shared/CloudType":20,"../../shared/State":29,"should":14}],40:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":42}],41:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],42:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":41,"/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":52,"inherits":51}],43:[function(require,module,exports){
/**
 * The buffer module from node.js, for the browser.
 *
 * Author:   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * License:  MIT
 *
 * `npm install buffer`
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
   // Detect if browser supports Typed Arrays. Supported browsers are IE 10+,
   // Firefox 4+, Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+.
  if (typeof Uint8Array !== 'function' || typeof ArrayBuffer !== 'function')
    return false

  // Does the browser support adding properties to `Uint8Array` instances? If
  // not, then that's the same as no `Uint8Array` support. We need to be able to
  // add all the node Buffer API methods.
  // Bug in Firefox 4-29, now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var arr = new Uint8Array(0)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // Assume object is an array
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof Uint8Array === 'function' &&
      subject instanceof Uint8Array) {
    // Speed optimization -- use set if we're copying from a Uint8Array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  // copy!
  for (var i = 0; i < end - start; i++)
    target[i + target_start] = this[i + start]
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array === 'function') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment the Uint8Array *instance* (not the class!) with Buffer methods
 */
function augment (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":44,"ieee754":45}],44:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var ZERO   = '0'.charCodeAt(0)
	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	module.exports.toByteArray = b64ToByteArray
	module.exports.fromByteArray = uint8ToBase64
}())

},{}],45:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],46:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      console.trace();
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],47:[function(require,module,exports){
var http = module.exports;
var EventEmitter = require('events').EventEmitter;
var Request = require('./lib/request');
var url = require('url')

http.request = function (params, cb) {
    if (typeof params === 'string') {
        params = url.parse(params)
    }
    if (!params) params = {};
    if (!params.host && !params.port) {
        params.port = parseInt(window.location.port, 10);
    }
    if (!params.host && params.hostname) {
        params.host = params.hostname;
    }
    
    if (!params.scheme) params.scheme = window.location.protocol.split(':')[0];
    if (!params.host) {
        params.host = window.location.hostname || window.location.host;
    }
    if (/:/.test(params.host)) {
        if (!params.port) {
            params.port = params.host.split(':')[1];
        }
        params.host = params.host.split(':')[0];
    }
    if (!params.port) params.port = params.scheme == 'https' ? 443 : 80;
    
    var req = new Request(new xhrHttp, params);
    if (cb) req.on('response', cb);
    return req;
};

http.get = function (params, cb) {
    params.method = 'GET';
    var req = http.request(params, cb);
    req.end();
    return req;
};

http.Agent = function () {};
http.Agent.defaultMaxSockets = 4;

var xhrHttp = (function () {
    if (typeof window === 'undefined') {
        throw new Error('no window object present');
    }
    else if (window.XMLHttpRequest) {
        return window.XMLHttpRequest;
    }
    else if (window.ActiveXObject) {
        var axs = [
            'Msxml2.XMLHTTP.6.0',
            'Msxml2.XMLHTTP.3.0',
            'Microsoft.XMLHTTP'
        ];
        for (var i = 0; i < axs.length; i++) {
            try {
                var ax = new(window.ActiveXObject)(axs[i]);
                return function () {
                    if (ax) {
                        var ax_ = ax;
                        ax = null;
                        return ax_;
                    }
                    else {
                        return new(window.ActiveXObject)(axs[i]);
                    }
                };
            }
            catch (e) {}
        }
        throw new Error('ajax not supported in this browser')
    }
    else {
        throw new Error('ajax not supported in this browser');
    }
})();

http.STATUS_CODES = {
    100 : 'Continue',
    101 : 'Switching Protocols',
    102 : 'Processing',                 // RFC 2518, obsoleted by RFC 4918
    200 : 'OK',
    201 : 'Created',
    202 : 'Accepted',
    203 : 'Non-Authoritative Information',
    204 : 'No Content',
    205 : 'Reset Content',
    206 : 'Partial Content',
    207 : 'Multi-Status',               // RFC 4918
    300 : 'Multiple Choices',
    301 : 'Moved Permanently',
    302 : 'Moved Temporarily',
    303 : 'See Other',
    304 : 'Not Modified',
    305 : 'Use Proxy',
    307 : 'Temporary Redirect',
    400 : 'Bad Request',
    401 : 'Unauthorized',
    402 : 'Payment Required',
    403 : 'Forbidden',
    404 : 'Not Found',
    405 : 'Method Not Allowed',
    406 : 'Not Acceptable',
    407 : 'Proxy Authentication Required',
    408 : 'Request Time-out',
    409 : 'Conflict',
    410 : 'Gone',
    411 : 'Length Required',
    412 : 'Precondition Failed',
    413 : 'Request Entity Too Large',
    414 : 'Request-URI Too Large',
    415 : 'Unsupported Media Type',
    416 : 'Requested Range Not Satisfiable',
    417 : 'Expectation Failed',
    418 : 'I\'m a teapot',              // RFC 2324
    422 : 'Unprocessable Entity',       // RFC 4918
    423 : 'Locked',                     // RFC 4918
    424 : 'Failed Dependency',          // RFC 4918
    425 : 'Unordered Collection',       // RFC 4918
    426 : 'Upgrade Required',           // RFC 2817
    428 : 'Precondition Required',      // RFC 6585
    429 : 'Too Many Requests',          // RFC 6585
    431 : 'Request Header Fields Too Large',// RFC 6585
    500 : 'Internal Server Error',
    501 : 'Not Implemented',
    502 : 'Bad Gateway',
    503 : 'Service Unavailable',
    504 : 'Gateway Time-out',
    505 : 'HTTP Version Not Supported',
    506 : 'Variant Also Negotiates',    // RFC 2295
    507 : 'Insufficient Storage',       // RFC 4918
    509 : 'Bandwidth Limit Exceeded',
    510 : 'Not Extended',               // RFC 2774
    511 : 'Network Authentication Required' // RFC 6585
};
},{"./lib/request":48,"events":46,"url":65}],48:[function(require,module,exports){
var Stream = require('stream');
var Response = require('./response');
var Base64 = require('Base64');
var inherits = require('inherits');

var Request = module.exports = function (xhr, params) {
    var self = this;
    self.writable = true;
    self.xhr = xhr;
    self.body = [];
    
    self.uri = (params.scheme || 'http') + '://'
        + params.host
        + (params.port ? ':' + params.port : '')
        + (params.path || '/')
    ;
    
    if (typeof params.withCredentials === 'undefined') {
        params.withCredentials = true;
    }

    try { xhr.withCredentials = params.withCredentials }
    catch (e) {}
    
    xhr.open(
        params.method || 'GET',
        self.uri,
        true
    );

    self._headers = {};
    
    if (params.headers) {
        var keys = objectKeys(params.headers);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!self.isSafeRequestHeader(key)) continue;
            var value = params.headers[key];
            self.setHeader(key, value);
        }
    }
    
    if (params.auth) {
        //basic auth
        this.setHeader('Authorization', 'Basic ' + Base64.btoa(params.auth));
    }

    var res = new Response;
    res.on('close', function () {
        self.emit('close');
    });
    
    res.on('ready', function () {
        self.emit('response', res);
    });
    
    xhr.onreadystatechange = function () {
        // Fix for IE9 bug
        // SCRIPT575: Could not complete the operation due to error c00c023f
        // It happens when a request is aborted, calling the success callback anyway with readyState === 4
        if (xhr.__aborted) return;
        res.handle(xhr);
    };
};

inherits(Request, Stream);

Request.prototype.setHeader = function (key, value) {
    this._headers[key.toLowerCase()] = value
};

Request.prototype.getHeader = function (key) {
    return this._headers[key.toLowerCase()]
};

Request.prototype.removeHeader = function (key) {
    delete this._headers[key.toLowerCase()]
};

Request.prototype.write = function (s) {
    this.body.push(s);
};

Request.prototype.destroy = function (s) {
    this.xhr.__aborted = true;
    this.xhr.abort();
    this.emit('close');
};

Request.prototype.end = function (s) {
    if (s !== undefined) this.body.push(s);

    var keys = objectKeys(this._headers);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = this._headers[key];
        if (isArray(value)) {
            for (var j = 0; j < value.length; j++) {
                this.xhr.setRequestHeader(key, value[j]);
            }
        }
        else this.xhr.setRequestHeader(key, value)
    }

    if (this.body.length === 0) {
        this.xhr.send('');
    }
    else if (typeof this.body[0] === 'string') {
        this.xhr.send(this.body.join(''));
    }
    else if (isArray(this.body[0])) {
        var body = [];
        for (var i = 0; i < this.body.length; i++) {
            body.push.apply(body, this.body[i]);
        }
        this.xhr.send(body);
    }
    else if (/Array/.test(Object.prototype.toString.call(this.body[0]))) {
        var len = 0;
        for (var i = 0; i < this.body.length; i++) {
            len += this.body[i].length;
        }
        var body = new(this.body[0].constructor)(len);
        var k = 0;
        
        for (var i = 0; i < this.body.length; i++) {
            var b = this.body[i];
            for (var j = 0; j < b.length; j++) {
                body[k++] = b[j];
            }
        }
        this.xhr.send(body);
    }
    else {
        var body = '';
        for (var i = 0; i < this.body.length; i++) {
            body += this.body[i].toString();
        }
        this.xhr.send(body);
    }
};

// Taken from http://dxr.mozilla.org/mozilla/mozilla-central/content/base/src/nsXMLHttpRequest.cpp.html
Request.unsafeHeaders = [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "content-transfer-encoding",
    "date",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via"
];

Request.prototype.isSafeRequestHeader = function (headerName) {
    if (!headerName) return false;
    return indexOf(Request.unsafeHeaders, headerName.toLowerCase()) === -1;
};

var objectKeys = Object.keys || function (obj) {
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var indexOf = function (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (xs[i] === x) return i;
    }
    return -1;
};

},{"./response":49,"Base64":50,"inherits":51,"stream":58}],49:[function(require,module,exports){
var Stream = require('stream');
var util = require('util');

var Response = module.exports = function (res) {
    this.offset = 0;
    this.readable = true;
};

util.inherits(Response, Stream);

var capable = {
    streaming : true,
    status2 : true
};

function parseHeaders (res) {
    var lines = res.getAllResponseHeaders().split(/\r?\n/);
    var headers = {};
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === '') continue;
        
        var m = line.match(/^([^:]+):\s*(.*)/);
        if (m) {
            var key = m[1].toLowerCase(), value = m[2];
            
            if (headers[key] !== undefined) {
            
                if (isArray(headers[key])) {
                    headers[key].push(value);
                }
                else {
                    headers[key] = [ headers[key], value ];
                }
            }
            else {
                headers[key] = value;
            }
        }
        else {
            headers[line] = true;
        }
    }
    return headers;
}

Response.prototype.getResponse = function (xhr) {
    var respType = String(xhr.responseType).toLowerCase();
    if (respType === 'blob') return xhr.responseBlob || xhr.response;
    if (respType === 'arraybuffer') return xhr.response;
    return xhr.responseText;
}

Response.prototype.getHeader = function (key) {
    return this.headers[key.toLowerCase()];
};

Response.prototype.handle = function (res) {
    if (res.readyState === 2 && capable.status2) {
        try {
            this.statusCode = res.status;
            this.headers = parseHeaders(res);
        }
        catch (err) {
            capable.status2 = false;
        }
        
        if (capable.status2) {
            this.emit('ready');
        }
    }
    else if (capable.streaming && res.readyState === 3) {
        try {
            if (!this.statusCode) {
                this.statusCode = res.status;
                this.headers = parseHeaders(res);
                this.emit('ready');
            }
        }
        catch (err) {}
        
        try {
            this._emitData(res);
        }
        catch (err) {
            capable.streaming = false;
        }
    }
    else if (res.readyState === 4) {
        if (!this.statusCode) {
            this.statusCode = res.status;
            this.emit('ready');
        }
        this._emitData(res);
        
        if (res.error) {
            this.emit('error', this.getResponse(res));
        }
        else this.emit('end');
        
        this.emit('close');
    }
};

Response.prototype._emitData = function (res) {
    var respBody = this.getResponse(res);
    if (respBody.toString().match(/ArrayBuffer/)) {
        this.emit('data', new Uint8Array(respBody, this.offset));
        this.offset = respBody.byteLength;
        return;
    }
    if (respBody.length > this.offset) {
        this.emit('data', respBody.slice(this.offset));
        this.offset = respBody.length;
    }
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

},{"stream":58,"util":67}],50:[function(require,module,exports){
;(function () {

  var object = typeof exports != 'undefined' ? exports : this; // #8: web workers
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  function InvalidCharacterError(message) {
    this.message = message;
  }
  InvalidCharacterError.prototype = new Error;
  InvalidCharacterError.prototype.name = 'InvalidCharacterError';

  // encoder
  // [https://gist.github.com/999166] by [https://github.com/nignag]
  object.btoa || (
  object.btoa = function (input) {
    for (
      // initialize result and counter
      var block, charCode, idx = 0, map = chars, output = '';
      // if the next input index does not exist:
      //   change the mapping table to "="
      //   check if d has no fractional digits
      input.charAt(idx | 0) || (map = '=', idx % 1);
      // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
      output += map.charAt(63 & block >> 8 - idx % 1 * 8)
    ) {
      charCode = input.charCodeAt(idx += 3/4);
      if (charCode > 0xFF) {
        throw new InvalidCharacterError("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = block << 8 | charCode;
    }
    return output;
  });

  // decoder
  // [https://gist.github.com/1020396] by [https://github.com/atk]
  object.atob || (
  object.atob = function (input) {
    input = input.replace(/=+$/, '')
    if (input.length % 4 == 1) {
      throw new InvalidCharacterError("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    for (
      // initialize result and counters
      var bc = 0, bs, buffer, idx = 0, output = '';
      // get next character
      buffer = input.charAt(idx++);
      // character found in table? initialize bit storage and add its ascii value;
      ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
        // and if not first of each 4 characters,
        // convert the first 8 bits to one ascii character
        bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) {
      // try to find character in table (0-63, not found => -1)
      buffer = chars.indexOf(buffer);
    }
    return output;
  });

}());

},{}],51:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],52:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],53:[function(require,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],54:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],55:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],56:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":54,"./encode":55}],57:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;
var inherits = require('inherits');
var setImmediate = require('process/browser.js').nextTick;
var Readable = require('./readable.js');
var Writable = require('./writable.js');

inherits(Duplex, Readable);

Duplex.prototype.write = Writable.prototype.write;
Duplex.prototype.end = Writable.prototype.end;
Duplex.prototype._write = Writable.prototype._write;

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  var self = this;
  setImmediate(function () {
    self.end();
  });
}

},{"./readable.js":61,"./writable.js":63,"inherits":51,"process/browser.js":59}],58:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('./readable.js');
Stream.Writable = require('./writable.js');
Stream.Duplex = require('./duplex.js');
Stream.Transform = require('./transform.js');
Stream.PassThrough = require('./passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"./duplex.js":57,"./passthrough.js":60,"./readable.js":61,"./transform.js":62,"./writable.js":63,"events":46,"inherits":51}],59:[function(require,module,exports){
module.exports=require(52)
},{}],60:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./transform.js');
var inherits = require('inherits');
inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./transform.js":62,"inherits":51}],61:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;
Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;
var Stream = require('./index.js');
var Buffer = require('buffer').Buffer;
var setImmediate = require('process/browser.js').nextTick;
var StringDecoder;

var inherits = require('inherits');
inherits(Readable, Stream);

function ReadableState(options, stream) {
  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = false;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // In streams that never have any data, and do push(null) right away,
  // the consumer can miss the 'end' event if they do some I/O before
  // consuming the stream.  So, we don't emit('end') until some reading
  // happens.
  this.calledRead = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (typeof chunk === 'string' && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null || chunk === undefined) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      // update the buffer info.
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) {
        state.buffer.unshift(chunk);
      } else {
        state.reading = false;
        state.buffer.push(chunk);
      }

      if (state.needReadable)
        emitReadable(stream);

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || n === null) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  var state = this._readableState;
  state.calledRead = true;
  var nOrig = n;

  if (typeof n !== 'number' || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;

  // if we currently have less than the highWaterMark, then also read some
  if (state.length - n <= state.highWaterMark)
    doRead = true;

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading)
    doRead = false;

  if (doRead) {
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read called its callback synchronously, then `reading`
  // will be false, and we need to re-evaluate how much data we
  // can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we happened to read() exactly the remaining amount in the
  // buffer, and the EOF has been seen at this point, then make sure
  // that we emit 'end' on the very next tick.
  if (state.ended && !state.endEmitted && state.length === 0)
    endReadable(this);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode &&
      !er) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // if we've ended and we have some data left, then emit
  // 'readable' now to make sure it gets picked up.
  if (state.length > 0)
    emitReadable(stream);
  else
    endReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (state.emittedReadable)
    return;

  state.emittedReadable = true;
  if (state.sync)
    setImmediate(function() {
      emitReadable_(stream);
    });
  else
    emitReadable_(stream);
}

function emitReadable_(stream) {
  stream.emit('readable');
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    setImmediate(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    setImmediate(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    if (readable !== src) return;
    cleanup();
  }

  function onend() {
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (!dest._writableState || dest._writableState.needDrain)
      ondrain();
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  // check for listeners before emit removes one-time listeners.
  var errListeners = EE.listenerCount(dest, 'error');
  function onerror(er) {
    unpipe();
    if (errListeners === 0 && EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  dest.once('error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    // the handler that waits for readable events after all
    // the data gets sucked out in flow.
    // This would be easier to follow with a .once() handler
    // in flow(), but that is too slow.
    this.on('readable', pipeOnReadable);

    state.flowing = true;
    setImmediate(function() {
      flow(src);
    });
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var dest = this;
    var state = src._readableState;
    state.awaitDrain--;
    if (state.awaitDrain === 0)
      flow(src);
  };
}

function flow(src) {
  var state = src._readableState;
  var chunk;
  state.awaitDrain = 0;

  function write(dest, i, list) {
    var written = dest.write(chunk);
    if (false === written) {
      state.awaitDrain++;
    }
  }

  while (state.pipesCount && null !== (chunk = src.read())) {

    if (state.pipesCount === 1)
      write(state.pipes, 0, null);
    else
      forEach(state.pipes, write);

    src.emit('data', chunk);

    // if anyone needs a drain, then we have to wait for that.
    if (state.awaitDrain > 0)
      return;
  }

  // if every destination was unpiped, either before entering this
  // function, or in the while loop, then stop flowing.
  //
  // NB: This is a pretty rare edge case.
  if (state.pipesCount === 0) {
    state.flowing = false;

    // if there were data event listeners added, then switch to old mode.
    if (EE.listenerCount(src, 'data') > 0)
      emitDataEvents(src);
    return;
  }

  // at this point, no one needed a drain, so we just ran out of data
  // on the next readable event, start it over again.
  state.ranOut = true;
}

function pipeOnReadable() {
  if (this._readableState.ranOut) {
    this._readableState.ranOut = false;
    flow(this);
  }
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data' && !this._readableState.flowing)
    emitDataEvents(this);

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        this.read(0);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  emitDataEvents(this);
  this.read(0);
  this.emit('resume');
};

Readable.prototype.pause = function() {
  emitDataEvents(this, true);
  this.emit('pause');
};

function emitDataEvents(stream, startPaused) {
  var state = stream._readableState;

  if (state.flowing) {
    // https://github.com/isaacs/readable-stream/issues/16
    throw new Error('Cannot switch to old mode now.');
  }

  var paused = startPaused || false;
  var readable = false;

  // convert to an old-style stream.
  stream.readable = true;
  stream.pipe = Stream.prototype.pipe;
  stream.on = stream.addListener = Stream.prototype.on;

  stream.on('readable', function() {
    readable = true;

    var c;
    while (!paused && (null !== (c = stream.read())))
      stream.emit('data', c);

    if (c === null) {
      readable = false;
      stream._readableState.needReadable = true;
    }
  });

  stream.pause = function() {
    paused = true;
    this.emit('pause');
  };

  stream.resume = function() {
    paused = false;
    if (readable)
      setImmediate(function() {
        stream.emit('readable');
      });
    else
      this.read(0);
    this.emit('resume');
  };

  // now make it start, just in case it hadn't already.
  stream.emit('readable');
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (typeof stream[i] === 'function' &&
        typeof this[i] === 'undefined') {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, function (x) {
      return self.emit.apply(self, ev, x);
    });
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted && state.calledRead) {
    state.ended = true;
    setImmediate(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,require("/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"))
},{"./index.js":58,"/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":52,"buffer":43,"events":46,"inherits":51,"process/browser.js":59,"string_decoder":64}],62:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./duplex.js');
var inherits = require('inherits');
inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined)
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  var ts = this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('finish', function() {
    if ('function' === typeof this._flush)
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (ts.writechunk && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var rs = stream._readableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./duplex.js":57,"inherits":51}],63:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;
Writable.WritableState = WritableState;

var isUint8Array = typeof Uint8Array !== 'undefined'
  ? function (x) { return x instanceof Uint8Array }
  : function (x) {
    return x && x.constructor && x.constructor.name === 'Uint8Array'
  }
;
var isArrayBuffer = typeof ArrayBuffer !== 'undefined'
  ? function (x) { return x instanceof ArrayBuffer }
  : function (x) {
    return x && x.constructor && x.constructor.name === 'ArrayBuffer'
  }
;

var inherits = require('inherits');
var Stream = require('./index.js');
var setImmediate = require('process/browser.js').nextTick;
var Buffer = require('buffer').Buffer;

inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];
}

function Writable(options) {
  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Stream.Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  setImmediate(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    setImmediate(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (!Buffer.isBuffer(chunk) && isUint8Array(chunk))
    chunk = new Buffer(chunk);
  if (isArrayBuffer(chunk) && typeof Uint8Array !== 'undefined')
    chunk = new Buffer(new Uint8Array(chunk));
  
  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (typeof cb !== 'function')
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb))
    ret = writeOrBuffer(this, state, chunk, encoding, cb);

  return ret;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  state.needDrain = !ret;

  if (state.writing)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    setImmediate(function() {
      cb(er);
    });
  else
    cb(er);

  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished && !state.bufferProcessing && state.buffer.length)
      clearBuffer(stream, state);

    if (sync) {
      setImmediate(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  cb();
  if (finished)
    finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  for (var c = 0; c < state.buffer.length; c++) {
    var entry = state.buffer[c];
    var chunk = entry.chunk;
    var encoding = entry.encoding;
    var cb = entry.callback;
    var len = state.objectMode ? 1 : chunk.length;

    doWrite(stream, state, len, chunk, encoding, cb);

    // if we didn't call the onwrite immediately, then
    // it means that we need to wait until it does.
    // also, that means that the chunk and cb are currently
    // being processed, so move the buffer counter past them.
    if (state.writing) {
      c++;
      break;
    }
  }

  state.bufferProcessing = false;
  if (c < state.buffer.length)
    state.buffer = state.buffer.slice(c);
  else
    state.buffer.length = 0;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (typeof chunk !== 'undefined' && chunk !== null)
    this.write(chunk, encoding);

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    state.finished = true;
    stream.emit('finish');
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      setImmediate(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

},{"./index.js":58,"buffer":43,"inherits":51,"process/browser.js":59}],64:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

function assertEncoding(encoding) {
  if (encoding && !Buffer.isEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  this.charBuffer = new Buffer(6);
  this.charReceived = 0;
  this.charLength = 0;
};


StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  var offset = 0;

  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var i = (buffer.length >= this.charLength - this.charReceived) ?
                this.charLength - this.charReceived :
                buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, offset, i);
    this.charReceived += (i - offset);
    offset = i;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (i == buffer.length) return charStr;

    // otherwise cut off the characters end from the beginning of this buffer
    buffer = buffer.slice(i, buffer.length);
    break;
  }

  var lenIncomplete = this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - lenIncomplete, end);
    this.charReceived = lenIncomplete;
    end -= lenIncomplete;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    this.charBuffer.write(charStr.charAt(charStr.length - 1), this.encoding);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }

  return i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 2;
  this.charLength = incomplete ? 2 : 0;
  return incomplete;
}

function base64DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 3;
  this.charLength = incomplete ? 3 : 0;
  return incomplete;
}

},{"buffer":43}],65:[function(require,module,exports){
/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true*/
(function () {
  "use strict";

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '~', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(delims),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#']
      .concat(unwise).concat(autoEscape),
    nonAuthChars = ['/', '@', '?', '#'].concat(delims),
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-zA-Z0-9][a-z0-9A-Z_-]{0,62}$/,
    hostnamePartStart = /^([a-zA-Z0-9][a-z0-9A-Z_-]{0,62})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always have a path component.
    pathedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && typeof(url) === 'object' && url.href) return url;

  if (typeof url !== 'string') {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var out = {},
      rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    out.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      out.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    // don't enforce full RFC correctness, just be unstupid about it.

    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the first @ sign, unless some non-auth character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    var atSign = rest.indexOf('@');
    if (atSign !== -1) {
      var auth = rest.slice(0, atSign);

      // there *may be* an auth
      var hasAuth = true;
      for (var i = 0, l = nonAuthChars.length; i < l; i++) {
        if (auth.indexOf(nonAuthChars[i]) !== -1) {
          // not a valid auth.  Something like http://foo.com/bar@baz/
          hasAuth = false;
          break;
        }
      }

      if (hasAuth) {
        // pluck off the auth portion.
        out.auth = decodeURIComponent(auth);
        rest = rest.substr(atSign + 1);
      }
    }

    var firstNonHost = -1;
    for (var i = 0, l = nonHostChars.length; i < l; i++) {
      var index = rest.indexOf(nonHostChars[i]);
      if (index !== -1 &&
          (firstNonHost < 0 || index < firstNonHost)) firstNonHost = index;
    }

    if (firstNonHost !== -1) {
      out.host = rest.substr(0, firstNonHost);
      rest = rest.substr(firstNonHost);
    } else {
      out.host = rest;
      rest = '';
    }

    // pull out port.
    var p = parseHost(out.host);
    var keys = Object.keys(p);
    for (var i = 0, l = keys.length; i < l; i++) {
      var key = keys[i];
      out[key] = p[key];
    }

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    out.hostname = out.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = out.hostname[0] === '[' &&
        out.hostname[out.hostname.length - 1] === ']';

    // validate a little.
    if (out.hostname.length > hostnameMaxLen) {
      out.hostname = '';
    } else if (!ipv6Hostname) {
      var hostparts = out.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            out.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    // hostnames are always lower case.
    out.hostname = out.hostname.toLowerCase();

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = out.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      out.hostname = newOut.join('.');
    }

    out.host = (out.hostname || '') +
        ((out.port) ? ':' + out.port : '');
    out.href += out.host;

    // strip [ and ] from the hostname
    if (ipv6Hostname) {
      out.hostname = out.hostname.substr(1, out.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    out.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    out.search = rest.substr(qm);
    out.query = rest.substr(qm + 1);
    if (parseQueryString) {
      out.query = querystring.parse(out.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    out.search = '';
    out.query = {};
  }
  if (rest) out.pathname = rest;
  if (slashedProtocol[proto] &&
      out.hostname && !out.pathname) {
    out.pathname = '/';
  }

  //to support http.request
  if (out.pathname || out.search) {
    out.path = (out.pathname ? out.pathname : '') +
               (out.search ? out.search : '');
  }

  // finally, reconstruct the href based on what has been validated.
  out.href = urlFormat(out);
  return out;
}

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof(obj) === 'string') obj = urlParse(obj);

  var auth = obj.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = obj.protocol || '',
      pathname = obj.pathname || '',
      hash = obj.hash || '',
      host = false,
      query = '';

  if (obj.host !== undefined) {
    host = auth + obj.host;
  } else if (obj.hostname !== undefined) {
    host = auth + (obj.hostname.indexOf(':') === -1 ?
        obj.hostname :
        '[' + obj.hostname + ']');
    if (obj.port) {
      host += ':' + obj.port;
    }
  }

  if (obj.query && typeof obj.query === 'object' &&
      Object.keys(obj.query).length) {
    query = querystring.stringify(obj.query);
  }

  var search = obj.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (obj.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  return protocol + host + pathname + search + hash;
}

function urlResolve(source, relative) {
  return urlFormat(urlResolveObject(source, relative));
}

function urlResolveObject(source, relative) {
  if (!source) return relative;

  source = urlParse(urlFormat(source), false, true);
  relative = urlParse(urlFormat(relative), false, true);

  // hash is always overridden, no matter what.
  source.hash = relative.hash;

  if (relative.href === '') {
    source.href = urlFormat(source);
    return source;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    relative.protocol = source.protocol;
    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[relative.protocol] &&
        relative.hostname && !relative.pathname) {
      relative.path = relative.pathname = '/';
    }
    relative.href = urlFormat(relative);
    return relative;
  }

  if (relative.protocol && relative.protocol !== source.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      relative.href = urlFormat(relative);
      return relative;
    }
    source.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      relative.pathname = relPath.join('/');
    }
    source.pathname = relative.pathname;
    source.search = relative.search;
    source.query = relative.query;
    source.host = relative.host || '';
    source.auth = relative.auth;
    source.hostname = relative.hostname || relative.host;
    source.port = relative.port;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.slashes = source.slashes || relative.slashes;
    source.href = urlFormat(source);
    return source;
  }

  var isSourceAbs = (source.pathname && source.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host !== undefined ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (source.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = source.pathname && source.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = source.protocol &&
          !slashedProtocol[source.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // source.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {

    delete source.hostname;
    delete source.port;
    if (source.host) {
      if (srcPath[0] === '') srcPath[0] = source.host;
      else srcPath.unshift(source.host);
    }
    delete source.host;
    if (relative.protocol) {
      delete relative.hostname;
      delete relative.port;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      delete relative.host;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    source.host = (relative.host || relative.host === '') ?
                      relative.host : source.host;
    source.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : source.hostname;
    source.search = relative.search;
    source.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    source.search = relative.search;
    source.query = relative.query;
  } else if ('search' in relative) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      source.hostname = source.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = source.host && source.host.indexOf('@') > 0 ?
                       source.host.split('@') : false;
      if (authInHost) {
        source.auth = authInHost.shift();
        source.host = source.hostname = authInHost.shift();
      }
    }
    source.search = relative.search;
    source.query = relative.query;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.href = urlFormat(source);
    return source;
  }
  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    delete source.pathname;
    //to support http.request
    if (!source.search) {
      source.path = '/' + source.search;
    } else {
      delete source.path;
    }
    source.href = urlFormat(source);
    return source;
  }
  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (source.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    source.hostname = source.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = source.host && source.host.indexOf('@') > 0 ?
                     source.host.split('@') : false;
    if (authInHost) {
      source.auth = authInHost.shift();
      source.host = source.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (source.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  source.pathname = srcPath.join('/');
  //to support request.http
  if (source.pathname !== undefined || source.search !== undefined) {
    source.path = (source.pathname ? source.pathname : '') +
                  (source.search ? source.search : '');
  }
  source.auth = relative.auth || source.auth;
  source.slashes = source.slashes || relative.slashes;
  source.href = urlFormat(source);
  return source;
}

function parseHost(host) {
  var out = {};
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      out.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) out.hostname = host;
  return out;
}

}());

},{"punycode":53,"querystring":56}],66:[function(require,module,exports){
module.exports=require(41)
},{}],67:[function(require,module,exports){
module.exports=require(42)
},{"./support/isBuffer":66,"/usr/local/lib/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":52,"inherits":51}]},{},[36])