var co = require('co');
var Fixture = require('../fixture');
var Gallery = require('../model/gallery');

class GalleryFixture extends Fixture {

  constructor(config) {
    config.reference = Gallery;
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
      { id: 1, name: 'Foo Gallery' },
      { id: 2, name: 'Bar Gallery' }
    ]);
  }
}

module.exports = GalleryFixture;
