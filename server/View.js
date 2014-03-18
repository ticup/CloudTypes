module.exports = View;


function View(name, table, query) {
  this.name = name;
  this.table = table;
  this.query = query;
}

View.prototype.includes = function (entry) {
  var self =  this;
  var included = false;
  self.table.forEachState(function (key) {
    var row = self.table.getByKey(key);
    if (row.equals(entry) && self.query(row)) {
      included = true;
    }
  });
  return included;
};