var co = require('co');
var Fixture = require('../fixture');
var GalleryDetail = require('../model/gallery-detail');

class GalleryDetailFixture extends Fixture {

  constructor(config) {
    config.model = GalleryDetail;
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
      { id: 1, description: 'Foo Gallery Description', gallery_id: 1 },
      { id: 2, description: 'Bar Gallery Description', gallery_id: 2 }
    ]);
  }
}

module.exports = GalleryDetailFixture;
