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