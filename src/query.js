import co from 'co';
import { extend, merge } from 'extend-merge';
import { Collector } from 'chaos-orm';
import Payload from './payload';

/**
 * The Query wrapper.
 */
class Query {

  /**
   * Gets/sets classes dependencies.
   *
   * @param  Object classes The classes dependencies to set or none to get it.
   * @return mixed          The classes dependencies.
   */
  static classes(classes) {
    if (arguments.length) {
      this._classes = extend({}, this._classes, classes);
    }
    return this._classes;
  }

  /**
   * Creates a new record object with default values.
   *
   * @param array config Possible options are:
   *                      - `'type'`       _string_ : The type of query.
   *                      - `'connection'` _object_ : The connection instance.
   *                      - `'model'`      _string_ : The model class.
   */
  constructor(config) {
    var defaults = {
      model: undefined,
      schema: undefined,
      path:       '/',
      query:      {}
    };
    config = extend({}, defaults, config);

    if (config.model) {
      this._model = config.model;
      this._schema = this._model.definition();
    } else {
      this._schema = config.schema;
    }

    /**
     * The resource path.
     *
     * @var String
     */
    this._path = config.path;

    /**
     * The fields to filter on.
     *
     * @var Array
     */
    this._fields = [];

    /**
     * The filter conditions.
     *
     * @var Array
     */
    this._conditions = [];

    /**
     * The order buy Map.
     *
     * @var Array
     */
    this._order = new Map();

    /**
     * The relations to include.
     *
     * @var Array
     */
    this._embed = [];

    /**
     * Some conditions over some relations.
     *
     * @var Array
     */
    this._has = [];

    /**
     * Pagination.
     *
     * @var Array
     */
    this._page = [];

    for (var key in config.query) {
      this[key](config.query[key]);
    }
  }

  /**
   * Gets the schema.
   *
   * @return Function Returns the schema.
   */
  schema() {
    if (!this._schema) {
      throw new Error("Error, missing schema for this query.");
    }
    return this._schema;
  }

  /**
   * Gets model.
   *
   * @return Function Returns the mode.
   */
  model() {
    return this._model;
  }

  /**
   * Gets path.
   *
   * @return The path of the resource.
   */
  path() {
    var key = this.schema().key();
    var suffix = '';
    for(var conditions of this._conditions) {
      if (conditions[key] != undefined) {
        suffix = '/' + conditions[key];
      }
    }
    return this._path + suffix;
  }

  queryString() {
    var data = {};
    if (this._page.limit) {
      if (this._page.page) {
        data.page = {
          offset: (this._page.page - 1) * this._page.limit
        };
      } else {
        data.page = {
          offset: this._page.offset || 0
        };
      }
      data.page.limit = this._page.limit;
    }
    return data;
  }

  /**
   * Executes the query and returns the result.
   *
   * @param  Object  Options The fetching options.
   * @return Promise         A Promise.
   */
  get(options) {
    return co(function*(){
      var defaults = {
        collector: undefined,
        return:    'entity'
      };
      options = extend({}, defaults, options);

      var classname = this.constructor.classes().collector;
      var collector = options.collector = options.collector ? options.collector : new classname();

      var collection;
      var ret = options['return'];

      var schema = this.schema();
      var json = yield schema.connection().get(this.path(), this.queryString());
      var payload = Payload.parse(json);
      var data = payload.export();

      switch (ret) {
        case 'entity':
          var source = schema.source();
          var key = schema.key();

          var model = this.model();
          if (!model) {
            throw new Error("Missing model for this query, set `'return'` to `'object'` to get row data.");
          }

          collection = model.create(data, {
            meta: payload.meta(),
            collector: collector,
            type: 'set',
            exists: true
          });

          break;
        case 'array':
        case 'object':
          collection = [];
          for (var record of data) {
            var entity = extend({}, record.attributes);
            if (record['id']) {
              entity[key] = record['id'];
            }
            collection.push(entity);
          }
          break;
        default:
          throw new Error("Invalid `'" + options['return'] + "'` mode as `'return'` value");
          break;
      }
      return collection;
    }.bind(this));
  }

  /**
   * Alias for `get()`
   *
   * @return object An iterator instance.
   */
  all(options) {
    return this.get(options);
  }

  /**
   * Executes the query and returns the first result only.
   *
   * @return object An entity instance.
   */
  first(options) {
    return co(function*() {
      var result = yield this.get(options);
      return Array.isArray(result) ? result[0] : result.get(0);
    }.bind(this));
  }

  /**
   * Executes the query and returns the count number.
   *
   * @return integer The number of rows in result.
   */
  count() {
    return co(function*() {
      throw new Error("Unsupported count operation for this adapter.");
    });
  }

  /**
   * Adds some fields to the query
   *
   * @param  mixed    fields The fields.
   * @return Function        Returns `this`.
   */
  fields(fields) {
    if (!arguments.length) {
      return this._fields;
    }
    fields = Array.isArray(fields) && arguments.length === 1 ? fields : Array.prototype.slice.call(arguments);
    if (fields.length) {
      this._fields = this._fields.concat(fields);
    }
    return this;
  }

  /**
   * Adds some where conditions to the query
   *
   * @param  mixed    conditions The conditions for this query.
   * @return Function            Returns `this`.
   */
  where(conditions) {
    if (!arguments.length) {
      return this._conditions;
    }
    this._conditions.push(conditions);
    return this;
  }

  /**
   * Alias for `where()`.
   *
   * @param  mixed    conditions The conditions for this query.
   * @return Function            Returns `this`.
   */
  conditions(conditions) {
    return this.where(conditions);
  }

  /**
   * Adds some order by fields to the query
   *
   * @param  mixed    fields The fields.
   * @return Function        Returns `this`.
   */
  order(fields) {
    if (!fields) {
      return this;
    }
    var fields = Array.isArray(fields) && arguments.length === 1 ? fields : Array.prototype.slice.call(arguments);
    var map = this._parseOrder(fields);
    map.forEach(function(dir, column) {
      this._order.set(column, dir);
    }.bind(this));
    return this;
  }

  /**
   * Order formatter helper method
   *
   * @param  Array  fields The fields.
   * @return Map           The fields map.
   */
  _parseOrder(fields) {
    var direction = 'ASC';

    var result = new Map();
    var len = fields.length;

    for (var i = 0; i < len; i++) {
      var value = fields[i];
      if (value && value.constructor === Object) {
        var key = Object.keys(value)[0];
        result.set(key, value[key]);
        continue;
      }
      var matches = value.match(/^(.*?)\s+((?:a|de)sc)/i);
      var dir;
      if (matches) {
        value = matches[1];
        dir = matches[2];
      } else {
        dir = direction;
      }
      result.set(value, dir);
    }
    return result;
  }

  /**
   * Sets page number.
   *
   * @param  integer page The page number
   * @return self
   */
  page(page)
  {
    this._page.page = page;
    return this;
  }

  /**
   * Sets offset value.
   *
   * @param  integer offset The offset value.
   * @return self
   */
  offset(offset)
  {
    this._page.offset = offset;
    return this;
  }

  /**
   * Sets limit value.
   *
   * @param  integer limit The number of results to limit or `0` for limit at all.
   * @return self
   */
  limit(limit)
  {
    this._page.limit = Number.parseInt(limit);
    return this;
  }

  /**
   * Sets the relations to retrieve.
   *
   * @param  array  embed The relations to load with the query.
   * @return object        Returns `this`.
   */
  embed(embed, conditions) {
    if (!arguments.length) {
      return this._embed;
    }
    if (typeof embed === "string" && arguments.length === 2) {
      var mix = {};
      mix[embed] = conditions || [];
      embed = [mix];
    } else {
      embed = Array.isArray(embed) ? embed : [embed];
    }
    this._embed = this._embed.concat(embed);
    return this;
  }

  /**
   * Sets the conditionnal dependency over some relations.
   *
   * @param array The conditionnal dependency.
   */
  has(has, conditions) {
    if (!arguments.length) {
      return this._has;
    }
    if (typeof has === "string" && arguments.length === 2) {
      var mix = {};
      mix[has] = conditions || [];
      has = [mix];
    }
    this._has = this._has.concat(has)
    return this;
  }

}

/**
 * Class dependencies.
 *
 * @var array
 */
Query._classes = {
  collector: Collector
};

export default Query;
