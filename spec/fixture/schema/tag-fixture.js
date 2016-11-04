import co from 'co';
import Fixture from '../fixture';
import Tag from '../model/tag';

class TagFixture extends Fixture {

  constructor(config) {
    config.model = Tag;
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

export default TagFixture;
