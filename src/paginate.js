var co = require('co');
var extend = require('extend-merge').extend;
var merge = require('extend-merge').merge;
var Schema = require('chaos-orm').Schema;
var Document = require('chaos-orm').Document;

/**
 * Paginate.
 */
class Paginate extends Document {

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
      throw new Error('Paginate requires a valid resource as first constructor parameter.')
    }

    config.query.limit = config.query.limit || Paginate.limit;
    config.query.page = Number.parseInt(config.query.page) || 1;

    this.set({
      query: config.query,
      isLoading: false,
      items: []
    });

    this.watch('query.page', () => {
      this.fetch();
    });

    this.watch('query.limit', () => {
      this.set('query.page', 1);
    });
  }

  /**
   * Returns the paginated resource.
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

Paginate.limit = 10;

Paginate.register();

module.exports = Paginate;
