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