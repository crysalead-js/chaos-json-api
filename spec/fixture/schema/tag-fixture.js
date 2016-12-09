var co = require('co');
var Fixture = require('../fixture');
var Tag = require('../model/tag');

class TagFixture extends Fixture {

  constructor(config) {
    config.reference = Tag;
    super(config);
  }

  all() {
    return co(function*() {
      yield this.create();
      yield this.records();
    }.bind(this));
  }

  records() {
    return this.populate([
      { id: 1, name: 'High Tech' },
      { id: 2, name: 'Sport' },
      { id: 3, name: 'Computer' },
      { id: 4, name: 'Art' },
      { id: 5, name: 'Science' },
      { id: 6, name: 'City' }
    ]);
  }
}

module.exports = TagFixture;
