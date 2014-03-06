var View = require('./View');

module.exports = Views;

function Views(state) {
  this.state = state;
  this.views = {};
}

Views.prototype.create = function (name, group, table, query) {
  if (typeof group === 'string') {
    group = this.state.get('SysGroup').getByProperties({name: group});
  }
  if (typeof table === 'string') {
    table = this.state.get(table);
  }
  this.views[name] = new View(group, table, query);
  return this;
};