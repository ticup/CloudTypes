;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var CIntModule = require('../shared/CInt');
var CInt = CIntModule.CInt;

module.exports = CIntModule;

var update = CInt.prototype.set;
CInt.prototype.set = function (val) {
  this.entry.index.state.checkColumnPermission('update', this.entry.index, this.property.name, this.entry.index.state.getGroup());
  update.call(this, val);
};
},{"../shared/CInt":13}],2:[function(require,module,exports){
var State = require('../shared/State');
var CSetPrototype  = require('../shared/CSet').CSetPrototype;
var Restricted = require('../shared/Restricted');
var Index = require('../shared/Index');

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
  this.client.yieldPush(this);
  this.applyFork();
  this.pending  = true;
  this.received = false;
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

State.prototype.getGroup = function () {
  return this.client.group;
};

var join = State.prototype.joinIn;
State.prototype.joinIn = function (state) {
  var self = this;
  join.call(this, state);

  var deleted = {};
  
  // Retract data to which the state has no access anymore
  state.forEachArray(function (array) {
    var mArray = self.get(array.name);
    if (mArray instanceof Restricted) {
      deleted[array.name] = state.arrays[array.name];
      state.arrays[array.name] = mArray;
      return;
    }
    array.forEachProperty(function (property) {
      try {
       var mProperty = mArray.getProperty(property);
      } catch(e) {
        delete array.properties.properties[property.name];
      }
    });
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
},{"../shared/CSet":14,"../shared/Index":17,"../shared/Restricted":24,"../shared/State":25}],3:[function(require,module,exports){
var global=typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};var State       = require('./ClientState');
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
        console.log(json.uid);
        state = State.fromJSON(json.state);
        state.print();
        self.uid = json.uid;
        self.state = state;
        self.state.init(json.cid, self);
        self.group = state.get('SysGroup').getByProperties({name: 'Guest'});
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
// Client.prototype.register = function (username, password, group, finish) {
//   if (typeof this.socket === 'undefined')
//     return finish("not connected");
//   this.socket.emit('Register', {username: username, password: password, group: group}, finish);
// };

Client.prototype.login = function (username, password, finish) {
  var self = this;
  if (typeof this.socket === 'undefined')
    return finish("not connected");
  this.socket.emit('Login', {username: username, password: password}, function (err, groupName) {
    if (err)
      throw err;
    self.group = self.state.get('SysGroup').where(function (group) {
      return group.get('name').get() === groupName;
    }).all()[0];
    finish(null, groupName);
  });
};
},{"./ClientState":2,"socket.io-client":11}],4:[function(require,module,exports){
var Table = require('../shared/Table');
module.exports = Table;

var create = Table.prototype.create;
Table.prototype.create = function () {
  console.log('CREATING');
  this.state.checkTablePermission('create', this, this.state.getGroup());
  return create.apply(this, Array.prototype.slice.apply(arguments));
};
},{"../shared/Table":26}],5:[function(require,module,exports){
var TableEntry = require('../shared/TableEntry');
module.exports = TableEntry;

var create = TableEntry.prototype.create;

var update = TableEntry.prototype.set;
TableEntry.prototype.set = function () {
  var args = Array.prototype.slice.apply(arguments);
  console.log('UPDATING ' + Array.prototype.slice.apply(arguments));
  this.index.state.checkColumnPermission('update', this.index, args[0], this.index.state.getGroup());
  return update.apply(this, args);
};


var remove = TableEntry.prototype.delete;
TableEntry.prototype.delete = function () {
  console.log('DELETING');
  this.index.state.checkTablePermission('delete', this.index, this.index.state.getGroup());
  return remove.apply(this, Array.prototype.slice.apply(arguments));
};
},{"../shared/TableEntry":27}],6:[function(require,module,exports){
var global=typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};var CloudTypeClient = require('./CloudTypeClient');
var ClientState     = require('./ClientState');

var CInt            = require('./CInt');
var CString         = require('../shared/CString');
var Index           = require('../shared/Index');
var Restricted      = require('../shared/Restricted');
var Table           = require('./Table');
var TableEntry      = require('./TableEntry');

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
  Table: Table,
  Index: Index,
  Restricted: Restricted,
  CInt: CInt,
  CString: CString

};

global.CloudTypes = CloudTypes;
module.exports = CloudTypes;
},{"../shared/CString":15,"../shared/Index":17,"../shared/Restricted":24,"./CInt":1,"./ClientState":2,"./CloudTypeClient":3,"./Table":4,"./TableEntry":5,"./views/EditableListView":7,"./views/EntryView":8,"./views/ListView":9,"./views/View":10}],7:[function(require,module,exports){
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
},{"./ListView":9}],8:[function(require,module,exports){
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
},{"./View":10}],9:[function(require,module,exports){
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
},{"./View":10}],10:[function(require,module,exports){
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
},{}],11:[function(require,module,exports){
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
},{}],12:[function(require,module,exports){
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
    self.checkGrantTablePermission(action, table, self.getGroup());

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
    self.checkGrantColumnPermission(action, table, columnName, self.getGroup());
    
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
    self.checkGrantTablePermission(action, table, self.getGroup());

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
    self.checkGrantColumnPermission(action, table, cname, self.getGroup());

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


  /* Authed for action */
  /*********************/

  // is group authed to do action on table?
  State.prototype.authedForTable = function (action, table, group) {
    var self = this;
    var authed = false;

    // already restricted
    if (table instanceof Restricted)
      return false;

    // Find full table authorization
    this.get('SysAuth').all().forEach(function (auth) {
      // console.log(auth.get('group').toString() + '?=' + group.toString());
      // console.log(auth.get('group').equals(group));
      if (auth.get('tname').equals(table.name) &&
          auth.get('group').equals(group) &&
          auth.get(action).equals('Y')) {
          authed = true;
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


  // is group authed to do action on the column of table?
  State.prototype.authedForColumn = function (action, table, cname, group) {
    var self = this;
    var authed = false;
    var property = table.getProperty(cname);

    // Only read and update actions can be column-wise
    if (action !== 'read' && action !== 'update') {
      throw new Error("Can not be authed for " + action + " on a column");
    }

    // Already restricted
    if (table instanceof Restricted) {
      return false;
    }

    // Needs to be authed for table and dependencies
    if (!self.authedForTable(action, table, group)) {
      return false;
    }

    // Find column authorization
    self.get('SysColAuth').all().forEach(function (colAuth) {

      if (colAuth.get('group').equals(group) &&
          colAuth.get('tname').equals(table.name) &&
          colAuth.get('cname').equals(cname) &&
          colAuth.get(action).equals('Y')) {
        authed = true;
      }
    });

    // If the column is a reference to a table, one must have given access to that table
    if (authed && (property.CType instanceof Index)) {
      authed = self.authedForTable(action, property.CType, group);
    }

    return authed;
  };


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
  State.prototype.canGrantTable = function (action, table, grantingGroup) {
    var self = this;
    var Auth = this.get('SysAuth');
    var permission = Auth.where(function (auth) {
      return (auth.get('group').equals(grantingGroup) &&
              auth.get('tname').equals(table.name) &&
              auth.get(action).equals('Y') &&
              auth.get('grantopt').equals('Y'));
    }).all().length > 0;

    // If column action, also needs granting rights over all columns
    if (permission && (action === 'read' || action === 'update')) {
      table.forEachProperty(function (property) {
        if (!self.canGrantColumn(action, table, property.name, grantingGroup)) {
          console.log(property.name + " stopped access to grant " + action + " on " + table.name + " for " + grantingGroup.get('name').get());
          permission = false;
        }
      });
    }
    return permission;
  };

  // Column
  State.prototype.canGrantColumn = function (action, table, columnName, grantingGroup) {
    var self = this;

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
},{"./CSet":14,"./Index":17,"./Property":22,"./Restricted":24,"./Table":26}],13:[function(require,module,exports){
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

CInt.fork = function () {
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

CInt.prototype.get = function () {
  return (this.base + this.offset);
};

CInt.prototype.add = function (offset) {
  if (typeof offset !== 'number')
    throw "CInt::add(base) : offset should be of type number, given: " + offset;
  this.offset += offset;
};

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
},{"./CloudType":16,"util":31}],14:[function(require,module,exports){
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


  CSet.newFor = function (entry) {
    return new CSet(entry);
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
  new CSsetDeclaration(elementType);
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
},{"./CloudType":16,"./Table":26}],15:[function(require,module,exports){
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

CString.fork = function () {
  return CString;
};

CString.toString = function () {
  return "CString";
};

// Create a new instance of the declared CString for given entry
CString.newFor = function (entry) {
  var cstring = new CString();
  cstring.entry = entry;
  return cstring;
};

CString.toJSON = function () {
  return { tag: CStringDeclaration.tag };
};

CString.fromJSON = function (json, entry) {
  var cstring = new CString(json.value, json.written, json.cond);
  cstring.entry = entry;
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
},{"./CloudType":16,"util":31}],16:[function(require,module,exports){
module.exports = CloudType;

function CloudType() {}

CloudType.types = {};

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
  if (CloudType.isCloudType(val))
      return this.get() === val.get();
  return this.get() === val;
};

CloudType.prototype.toString = function () {
  return this.get();
};
},{}],17:[function(require,module,exports){
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
  if (typeof result === 'undefined') {
    throw Error(this.name + " does not have property " + property);
  }
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

Index.prototype.restrictedFork = function (group) {
  var fKeys = this.keys.fork();
  var index = new Index();
  index.keys = fKeys;
  index.properties = this.properties.restrictedFork(index, group);
  index.isProxy = this.isProxy;
  return index;
};

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

Index.fromJSON = function (json) {
  var index = new Index();
  index.keys = Keys.fromJSON(json.keys);
  index.properties = Properties.fromJSON(json.properties, index);
  index.isProxy = json.isProxy;
  return index;
};
},{"./CloudType":16,"./IndexEntry":18,"./IndexQuery":19,"./Keys":20,"./Properties":21,"./Property":22,"./TypeChecker":29,"util":31}],18:[function(require,module,exports){
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

IndexEntry.prototype.toString = function () {
  return Keys.createIndex(this.keys);
};
},{"./CloudType":16,"./Keys":20,"./TypeChecker":29}],19:[function(require,module,exports){
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
    var property = self.index.get(self.orderProperty);
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
},{}],20:[function(require,module,exports){
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

// Forking keys: names can be shared, because they are immutable.
Keys.prototype.fork = function () {
  var keys = new Keys();
  keys.names = this.names;
  keys.types = this.types;
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


},{"./CloudType":16,"./Table":26}],21:[function(require,module,exports){
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

Properties.prototype.restrictedFork = function (index, group) {
  var fProperties = new Properties();
  this.forEach(function (property) {
    var fork = property.restrictedFork(index, group);
    if (fork) {
      fProperties.add(fork);
    }
  });
  return fProperties;
};

module.exports = Properties;
},{"./Property":22}],22:[function(require,module,exports){
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
  if (this.CType.prototype === CSet.CSetPrototype) {
    throw new Error("Can not call set on a CSet propety");
  }
  TypeChecker.property(val, this.CType);
  
  // If it's a reference, simply store its uid
  // if (this.CType.prototype === Reference.Prototype) {
  //   if (val !== null) {
  //     val = val.serialKey();
  //   }
  // }
  this.values[key] = val;
};

// Gets the value of given key
Property.prototype.getByKey = function (key) {
  var ctype = this.values[key];

  // console.log('getting ' + key + '.' + this.name + ' = ' + ctype + ' (' + typeof ctype + ')');
  
  // If reference: check if reference is still valid, otherwise return null
  if (!CloudType.isCloudType(this.CType) && this.index.state.deleted(key, this.index)) {
    return null;
  }

  // 1) This key does not exist yet
  if (typeof ctype === 'undefined') {
    var entry = this.index.getByKey(key);

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

Property.prototype.restrictedFork = function (index, group) {
  var self = this;

  // Need to be authed to read this column
  if (!self.index.state.authedForColumn('read', self.index, self.name, group)) {
    return null;
  }

  // If its a reference, it needs to be authed to read the reference table
  if (Reference.isReferenceDeclaration(self.CType) && !self.index.state.authedForTable('read', self.CType.prototype.table, group)) {
    return null;
  }
  
  return self.fork(index);
};

module.exports = Property;
},{"./CSet":14,"./CloudType":16,"./Keys":20,"./Reference":23,"./TypeChecker":29}],23:[function(require,module,exports){
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

  Reference.fork = function () {
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
};



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
},{"./CloudType":16}],24:[function(require,module,exports){
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
},{}],25:[function(require,module,exports){
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

State.prototype.all = function () {
  var self = this;
  var tables = [];
  Object.keys(this.arrays).forEach(function (name) {
    var index = self.arrays[name];
    if (!(index instanceof Restricted) && (name.indexOf('Sys') === -1)) {
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
    this.auth.grantAll(array.name, grant);
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
  var self = this;
  var changed = false;
  this.forEachEntity(function (entity) {
    entity.forEachState(function (key) {
      // console.log(entity.name +"["+key+"] deleted?");
      if (entity.exists(key) && self.deleted(key, entity)) {
        entity.setDeleted(key);
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
      if (self.deleted(value, type))
        del = true;
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



State.prototype._join = function (rev, target) {
  var master = (this === target) ? rev : this;
  var self = this;
  
  // console.log('joining ' + Object.keys(master.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  // console.log('with ' + Object.keys(target.arrays).map(function (n) { return n + "(" + master.arrays[n].constructor.name+")";}));
  

  // (1) Perform the join
  master.forEachArray(function (array) {

    // If the target is restricted and we got an index in the master, this means access was granted to the that index
    // -> install the complete new index (references to the new index are set in (2))
    if (target.get(array.name) instanceof Restricted) {
      // TODO: make actual copy of it for local usage (not important right now)
      return target.add(array);

    }

    // Otherwise do a property-key-wise join on each property of each entry
    array.forEachProperty(function (property) {

      // If target does not have the property, access was granted to the property, just add it.
      if (typeof target.get(array.name).properties.get(property) === 'undefined') {
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
  target.forEachArray(function (index) {
    index.forEachProperty(function (property) {
      if (property.CType instanceof Restricted) {
        property.CType = target.get(property.CType.name);
      }
    });

    index.keys.forEach(function (key, type, i) {
      if (type instanceof Restricted) {
        index.keys.types[i] = target.get(type.name);
      }
    });
  });

  // (3) Join the states of the Tables (deleted/created)
  master.forEachEntity(function (entity) {
    var joiner = rev.get(entity.name);
    var joinee = self.get(entity.name);
    var t = target.get(entity.name);
    entity.forEachState(function (key) {
      t.setMax(joinee, joiner, key);
    });

  });

  target.propagate();
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

  forker.forAllArray(function (index) {
    var fIndex = index.fork();
    fIndex.name = index.name;
    fIndex.state = forked;
    forked.add(fIndex);
  });

  // Fix Type references
  forked.forEachArray(function (index) {
    index.forEachProperty(function (property) {

      // Table Reference Type: replace by the new Table
      // if (!CloudType.isCloudType(property.CType)) {
      //   var fIndex = forked.get(property.CType.name);
      //   property.CType = fIndex;
        // property.forEachKey(function (key, val) {
        //   var ref = fIndex.getByKey(val);
        //   property.values[key] = .apply(fIndex, val.keys);
        // });
      // }

      // if CSet property -> give reference to the proxy entity
      if (property.CType.prototype === CSetPrototype) {
        property.CType.entity      = forked.get(index.name + property.name);
        if (property.CType.elementType instanceof Table) {
          property.CType.elementType = forked.get(property.CType.elementType.name);
        }
      }

      if (Reference.isReferenceDeclaration(property.CType)) {
        property.CType.prototype.table = forked.get(property.CType.prototype.table.name);
      }
    });

    index.keys.forEach(function (key, type, i) {
      if (type instanceof Table) {
        index.keys.types[i] = forked.get(type.name);
      }
      // console.log('key: ' + key);
      // if (Reference.isReferenceDeclaration(type)) {
      //   console.log(type);
      //   type.resolveTable(forked);
      //   console.log(type.prototype.table.name);
      // }
    });
  });
  return forked;
};

State.prototype.restrict = function (group) {
  var self = this;

  self.forAllArray(function (index) {

    // If not authed to read table, replace by Restricted object
    if (!self.authedForTable('read', index, group)) {
      var restricted = new Restricted(index.name);
      restricted.state = self;
      self.add(restricted);
      return;
    }

    index.forEachProperty(function (property) {

      // If not authed to read property, remove the property
      if (!self.authedForColumn('read', index, property.name, group)) {
        delete index.properties.properties[property.name];
      }

      // If its a reference, it needs to be authed to read the reference table
      if (Reference.isReferenceDeclaration(property.CType) && !self.authedForTable('read', property.CType.prototype.table, group)) {
        delete index.properties.properties[property.name];
      }
    });

    // property.forEachKey(function (key) {

    // });
  });
};

State.prototype.restrictedFork = function (group) {
  var forked = new State();
  var forker = this;

  forker.forAllArray(function (index) {
    var fIndex;

    if (!forker.authedForTable('read', index, group)) {
       // console.log('NOT authed for: ' + index.name);
      fIndex = new Restricted();
    } else {
       // console.log('authed for: ' + index.name);
      fIndex = index.restrictedFork(group);
    }
    fIndex.name = index.name;
    fIndex.state = forked;
    forked.add(fIndex);
  });

  // Fix Type references
  forked.forEachArray(function (index) {
    index.forEachProperty(function (property) {

      // Table Reference Type: replace by the new Table
      // if (!CloudType.isCloudType(property.CType)) {
      //   var fIndex = forked.get(property.CType.name);
      //   property.CType = fIndex;
        // property.forEachKey(function (key, val) {
        //   var ref = fIndex.getByKey(val);
        //   property.values[key] = .apply(fIndex, val.keys);
        // });
      // }

      // if CSet property -> give reference to the proxy entity
      if (property.CType.prototype === CSetPrototype) {
        property.CType.entity      = forked.get(index.name + property.name);
        if (property.CType.elementType instanceof Table) {
          property.CType.elementType = forked.get(property.CType.elementType.name);
        }
      }

      if (Reference.isReferenceDeclaration(property.CType)) {
        property.CType.prototype.table = forked.get(property.CType.prototype.table.name);
      }
    });

    index.keys.forEach(function (key, type, i) {
      if (type instanceof Table) {
        index.keys.types[i] = forked.get(type.name);
      }
      // console.log('key: ' + key);
      // if (Reference.isReferenceDeclaration(type)) {
      //   console.log(type);
      //   type.resolveTable(forked);
      //   console.log(type.prototype.table.name);
      // }
    });
  });
  return forked;
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
},{"./Auth":12,"./CSet":14,"./CloudType":16,"./Index":17,"./Reference":23,"./Restricted":24,"./Table":26}],26:[function(require,module,exports){
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
  this.uid       = 0;
  this.cached = {};
}

Table.prototype = Object.create(Index.prototype);

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
Table.prototype.getByKey = function (uid) {
  var self = this;
  if (this.exists(uid)) {
    var keys = this.getKeyValues(uid);
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
  var val1 = entity1.states[key];
  var val2 = entity2.states[key];
  if (val1 === DELETED || val2 === DELETED) {
    this.states[key] = DELETED;
    return;
  }
  if (val1 === OK || val2 === OK) {
    this.states[key] = OK;
    return;
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
  var fKeys = this.keys.fork();
  var table = new Table();
  table.keys = fKeys;
  table.properties = this.properties.fork(table);
  table.states     = this.states;
  table.keyValues  = this.keyValues;
  table.isProxy    = this.isProxy;
  return table;
};

Table.prototype.restrictedFork = function (group) {
  var fKeys = this.keys.fork();
  var table = new Table();
  table.keys = fKeys;
  table.properties = this.properties.restrictedFork(table, group);
  table.states     = this.states;
  table.isProxy    = this.isProxy;
  table.keyValues  = this.keyValues;
  return table;
};

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
    states      : this.states
  };
};

},{"./Index":17,"./Keys":20,"./Properties":21,"./Property":22,"./TableEntry":27,"./TableQuery":28,"./TypeChecker":29}],27:[function(require,module,exports){
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
},{"./CloudType":16,"./IndexEntry":18,"./Keys":20,"./TypeChecker":29}],28:[function(require,module,exports){
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
},{"./IndexQuery":19}],29:[function(require,module,exports){
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
      if (typeof val.index === 'undefined' || !type.isTypeOf(value)) {
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
    } else if (val !== null && (val.index === 'undefined' || !type.isTypeOf(value))) {
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
},{"./CloudType":16}],30:[function(require,module,exports){


//
// The shims in this file are not fully implemented shims for the ES5
// features, but do work for the particular usecases there is in
// the other modules.
//

var toString = Object.prototype.toString;
var hasOwnProperty = Object.prototype.hasOwnProperty;

// Array.isArray is supported in IE9
function isArray(xs) {
  return toString.call(xs) === '[object Array]';
}
exports.isArray = typeof Array.isArray === 'function' ? Array.isArray : isArray;

// Array.prototype.indexOf is supported in IE9
exports.indexOf = function indexOf(xs, x) {
  if (xs.indexOf) return xs.indexOf(x);
  for (var i = 0; i < xs.length; i++) {
    if (x === xs[i]) return i;
  }
  return -1;
};

// Array.prototype.filter is supported in IE9
exports.filter = function filter(xs, fn) {
  if (xs.filter) return xs.filter(fn);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    if (fn(xs[i], i, xs)) res.push(xs[i]);
  }
  return res;
};

// Array.prototype.forEach is supported in IE9
exports.forEach = function forEach(xs, fn, self) {
  if (xs.forEach) return xs.forEach(fn, self);
  for (var i = 0; i < xs.length; i++) {
    fn.call(self, xs[i], i, xs);
  }
};

// Array.prototype.map is supported in IE9
exports.map = function map(xs, fn) {
  if (xs.map) return xs.map(fn);
  var out = new Array(xs.length);
  for (var i = 0; i < xs.length; i++) {
    out[i] = fn(xs[i], i, xs);
  }
  return out;
};

// Array.prototype.reduce is supported in IE9
exports.reduce = function reduce(array, callback, opt_initialValue) {
  if (array.reduce) return array.reduce(callback, opt_initialValue);
  var value, isValueSet = false;

  if (2 < arguments.length) {
    value = opt_initialValue;
    isValueSet = true;
  }
  for (var i = 0, l = array.length; l > i; ++i) {
    if (array.hasOwnProperty(i)) {
      if (isValueSet) {
        value = callback(value, array[i], i, array);
      }
      else {
        value = array[i];
        isValueSet = true;
      }
    }
  }

  return value;
};

// String.prototype.substr - negative index don't work in IE8
if ('ab'.substr(-1) !== 'b') {
  exports.substr = function (str, start, length) {
    // did we get a negative start, calculate how much it is from the beginning of the string
    if (start < 0) start = str.length + start;

    // call the original function
    return str.substr(start, length);
  };
} else {
  exports.substr = function (str, start, length) {
    return str.substr(start, length);
  };
}

// String.prototype.trim is supported in IE9
exports.trim = function (str) {
  if (str.trim) return str.trim();
  return str.replace(/^\s+|\s+$/g, '');
};

// Function.prototype.bind is supported in IE9
exports.bind = function () {
  var args = Array.prototype.slice.call(arguments);
  var fn = args.shift();
  if (fn.bind) return fn.bind.apply(fn, args);
  var self = args.shift();
  return function () {
    fn.apply(self, args.concat([Array.prototype.slice.call(arguments)]));
  };
};

// Object.create is supported in IE9
function create(prototype, properties) {
  var object;
  if (prototype === null) {
    object = { '__proto__' : null };
  }
  else {
    if (typeof prototype !== 'object') {
      throw new TypeError(
        'typeof prototype[' + (typeof prototype) + '] != \'object\''
      );
    }
    var Type = function () {};
    Type.prototype = prototype;
    object = new Type();
    object.__proto__ = prototype;
  }
  if (typeof properties !== 'undefined' && Object.defineProperties) {
    Object.defineProperties(object, properties);
  }
  return object;
}
exports.create = typeof Object.create === 'function' ? Object.create : create;

// Object.keys and Object.getOwnPropertyNames is supported in IE9 however
// they do show a description and number property on Error objects
function notObject(object) {
  return ((typeof object != "object" && typeof object != "function") || object === null);
}

function keysShim(object) {
  if (notObject(object)) {
    throw new TypeError("Object.keys called on a non-object");
  }

  var result = [];
  for (var name in object) {
    if (hasOwnProperty.call(object, name)) {
      result.push(name);
    }
  }
  return result;
}

// getOwnPropertyNames is almost the same as Object.keys one key feature
//  is that it returns hidden properties, since that can't be implemented,
//  this feature gets reduced so it just shows the length property on arrays
function propertyShim(object) {
  if (notObject(object)) {
    throw new TypeError("Object.getOwnPropertyNames called on a non-object");
  }

  var result = keysShim(object);
  if (exports.isArray(object) && exports.indexOf(object, 'length') === -1) {
    result.push('length');
  }
  return result;
}

var keys = typeof Object.keys === 'function' ? Object.keys : keysShim;
var getOwnPropertyNames = typeof Object.getOwnPropertyNames === 'function' ?
  Object.getOwnPropertyNames : propertyShim;

if (new Error().hasOwnProperty('description')) {
  var ERROR_PROPERTY_FILTER = function (obj, array) {
    if (toString.call(obj) === '[object Error]') {
      array = exports.filter(array, function (name) {
        return name !== 'description' && name !== 'number' && name !== 'message';
      });
    }
    return array;
  };

  exports.keys = function (object) {
    return ERROR_PROPERTY_FILTER(object, keys(object));
  };
  exports.getOwnPropertyNames = function (object) {
    return ERROR_PROPERTY_FILTER(object, getOwnPropertyNames(object));
  };
} else {
  exports.keys = keys;
  exports.getOwnPropertyNames = getOwnPropertyNames;
}

// Object.getOwnPropertyDescriptor - supported in IE8 but only on dom elements
function valueObject(value, key) {
  return { value: value[key] };
}

if (typeof Object.getOwnPropertyDescriptor === 'function') {
  try {
    Object.getOwnPropertyDescriptor({'a': 1}, 'a');
    exports.getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  } catch (e) {
    // IE8 dom element issue - use a try catch and default to valueObject
    exports.getOwnPropertyDescriptor = function (value, key) {
      try {
        return Object.getOwnPropertyDescriptor(value, key);
      } catch (e) {
        return valueObject(value, key);
      }
    };
  }
} else {
  exports.getOwnPropertyDescriptor = valueObject;
}

},{}],31:[function(require,module,exports){
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

var shims = require('_shims');

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

  shims.forEach(array, function(val, idx) {
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
    var ret = value.inspect(recurseTimes);
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
  var keys = shims.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = shims.getOwnPropertyNames(value);
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

  shims.forEach(keys, function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = shims.getOwnPropertyDescriptor(value, key) || { value: value[key] };
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
    if (shims.indexOf(ctx.seen, desc.value) < 0) {
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
  var length = shims.reduce(output, function(prev, cur) {
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
  return shims.isArray(ar);
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
  return typeof arg === 'object' && arg;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) && objectToString(e) === '[object Error]';
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

function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.binarySlice === 'function'
  ;
}
exports.isBuffer = isBuffer;

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
exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = shims.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = shims.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

},{"_shims":30}]},{},[6])
;