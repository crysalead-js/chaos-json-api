import co from 'co';
import Fixture from '../fixture';
import Gallery from '../model/gallery';

class GalleryFixture extends Fixture {

  constructor(config) {
    config.model = Gallery;
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

export default GalleryFixture;
