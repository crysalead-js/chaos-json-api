var co = require('co');
var Fixture = require('../fixture');
var Image = require('../model/image');

class ImageFixture extends Fixture {

  constructor(config) {
    config.model = Image;
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
      { id: 1, gallery_id: 1, name: 'amiga_1200.jpg', title: 'Amiga 1200' },
      { id: 2, gallery_id: 1, name: 'srinivasa_ramanujan.jpg', title: 'Srinivasa Ramanujan' },
      { id: 3, gallery_id: 1, name: 'las_vegas.jpg', title: 'Las Vegas' },
      { id: 4, gallery_id: 2, name: 'silicon_valley.jpg', title: 'Silicon Valley' },
      { id: 5, gallery_id: 2, name: 'unknown.gif', title: 'Unknown' }
    ]);
  }
}

module.exports = ImageFixture;
