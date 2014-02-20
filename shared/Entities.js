module.exports = Entities;

function Entities() {
  this.entities = {};
}

Entities.fromJSON = function (json) {

};

Entities.prototype.toJSON = function () {
  var json = { };
  Object.keys(this.entities).forEach(function (key) { json[key] = this.entities[key]; });
  return json;
};