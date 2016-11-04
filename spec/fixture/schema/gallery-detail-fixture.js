import co from 'co';
import Fixture from '../fixture';
import GalleryDetail from '../model/gallery-detail';

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

export default GalleryDetailFixture;
