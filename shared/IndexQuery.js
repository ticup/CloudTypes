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
    if (self.index.exists(key) && (typeof self.sumFilter === 'undefined' || self.sumFilter(self.index.getByKey(key))))
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