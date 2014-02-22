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