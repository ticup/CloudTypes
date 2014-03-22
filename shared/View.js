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