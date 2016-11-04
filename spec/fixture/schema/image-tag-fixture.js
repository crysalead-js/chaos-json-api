import co from 'co';
import Fixture from '../fixture';
import ImageTag from '../model/image-tag';

class ImageTagFixture extends Fixture {

  constructor(config) {
    config.model = ImageTag;
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
      { id: 1, image_id: 1, tag_id: 1 },
      { id: 2, image_id: 1, tag_id: 3 },
      { id: 3, image_id: 2, tag_id: 5 },
      { id: 4, image_id: 3, tag_id: 6 },
      { id: 5, image_id: 4, tag_id: 6 },
      { id: 6, image_id: 4, tag_id: 3 },
      { id: 7, image_id: 4, tag_id: 1 }
    ]);
  }
}

export default ImageTagFixture;
