import co from 'co';
import { extend, merge } from "extend-merge";
import { Schema, Document } from 'chaos-orm';

/**
 * Paging.
 */
class Paging extends Document {

  /**
   * Constructor.
   *
   * @param Object config The config array
   */
  constructor(resource, config) {
    config = config || {};
    super(config);
    var defaults = {
      query: {}
    };
    config = extend({}, defaults, config);

    /**
     * Resource.
     *
     * @var Function
     */
    this._resource = resource;

    if (!this._resource) {
      throw new Error('Paging requires a valid resource as first constructor parameter.')
    }

    config.query.limit = config.query.limit || Paging.limit;
    config.query.page = Number.parseInt(config.query.page) || 1;

    this.set({
      query: config.query,
      isLoading: false,
      items: []
    });

    this.on('modified', (path) => {
      if (path.length !== 2) {
        return;
      }
      if (path[0] === 'query') {
        if (path[1] === 'page') {
          this.fetch();
        }
        if (path[1] === 'limit') {
          this.set('query.page', 1);
        }
      }
    });
  }

  /**
   * Returns the paging resource.
   *
   * @return Function
   */
  resource() {
    return this._resource;
  }

  /**
   * Gets sets the current query.
   *
   * @param  Object      query The query to set or none to get the setted one.
   * @return Object|self       The query on get or `this` on set.
   */
  query(query) {
    if (!arguments.length) {
      return this.get('query').data();
    }
    query.page = Number.parseInt(query.page) || 1;
    this.set('query', query);
    return this;
  }

  previousIndex() {
    var page = this.get('query.page');
    return page > 1 ? page - 1 : page;
  }

  nextIndex() {
    var lastIndex = this.lastIndex();
    var page = this.get('query.page');
    return page < lastIndex ? page + 1 : page;
  }

  firstIndex() {
    return 1;
  }

  lastIndex() {
    return this.get('lastIndex');
  }

  currentIndex() {
    return this.get('query.page');
  }

  page(page) {
    var lastIndex = this.lastIndex();
    if (page >= 1 && page <= lastIndex) {
      this.set('query.page', page);
    }
  }

  fetch(options) {
    return co(function*(){
      var query = this.resource().find(this.query());

      this.set('isLoading', true);
      var data = yield query.get(options);
      var meta = data.meta();

      this.set('count', meta.count);
      this.set('lastIndex', Math.ceil(meta.count / this.get('query.limit')));
      this.set('items', data);
      this.set('isLoading', false);

      return this;
    }.bind(this));
  }
}

Paging.limit = 10;

export default Paging;
