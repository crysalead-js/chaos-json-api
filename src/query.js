var co = require('co');
var extend = require('extend-merge').extend;
var merge = require('extend-merge').merge;
var Payload = require('./payload');

function isEmpty(value) {
  if (!value) {
    return true;
  }
  for (var i in value) {
    return false;
  }
  return true;
}

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
      path: '/',
      query: {},
      action: undefined
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
     * The conditions.
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
    this._page = {};

    /**
     * Pagination.
     *
     * @var Array
     */
    this._action = config.action;

    for (var key in config.query) {
      if (typeof this[key] !== 'function') {
        throw new Error("Invalid option `'" + key + "'` as query options.");
      }
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
  path(all) {
    var suffix = '';
    if (!all) {
      var key = this.schema().key();
      for (var conditions of this._conditions) {
        if (conditions[key] != undefined) {
          suffix = '/' + conditions[key];
        }
      }
    }
    return this._path + suffix + (this._action ? '/:' + this._action : '');
  }

  toArray(all, options = {}) {
    var data = { };
    var query = { conditions: [] };

    var key = this.schema().key();

    for (var conditions of this._conditions) {
      for (var field in conditions) {
        if (!all && field === key) {
          continue;
        }
      }
      query.conditions.push(conditions);
    }

    if (Object.keys(query.conditions).length === 0) {
      delete query.conditions;
    }

    if (this._has.length) {
      query.has = this._has;
    }

    if (this._embed.length) {
      query.embed = this._embed;
    }

    if (this._order.size) {
      query.order = [];
    }

    this._order.forEach(function (dir, key) {
      query.order.push({ [key]: dir });
    });

    if (this._page.limit) {
      if (this._page.page) {
        query.offset = (this._page.page - 1) * this._page.limit;
      } else {
        query.offset = this._page.offset || 0;
      }
      query.limit = this._page.limit;
    }

    if (options.return && options.return === 'array') {
      data.return = 'array';
    }
    if (Object.keys(query).length !== 0) {
      data.query = query;
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
        return: 'entity',
        all: true
      };
      options = extend({}, defaults, options);

      var collection;
      var ret = options['return'];

      var schema = this.schema();

      data =  extend({}, this.toArray(options.all, options), options.requestBody || {});

      var json = yield schema.connection().fetch(this.path(options.all), options.queryString || {}, isEmpty(data) ? null : data, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      var payload = Payload.parse(json);
      var data = payload.export();

      switch (ret) {
        case 'entity':
          var model = this.model();
          if (!model) {
            throw new Error("Missing model for this query, set `'return'` to `'array'` to get row data.");
          }

          collection = model.create(data, {
            meta: payload.meta(),
            type: 'set',
            exists: 'all'
          });

          break;
        case 'array':
        case 'object':
          var key = schema.key();
          collection = [];
          for (var record of data) {
            var entity = extend({}, record);
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
      var defaults = {
        all: false
      };
      options = extend({}, defaults, options);
      var result = yield this.get(options);
      return Array.isArray(result) ? result[0] || null : (result.has(0) ? result.get(0) : null);
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
    conditions = Array.isArray(conditions) ? conditions : (isEmpty(conditions) ? [] : [conditions]);
    for (var cond of conditions) {
      this._conditions.push(cond);
    }
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
        result.set(key, value[key].toUpperCase());
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
      result.set(value, dir.toUpperCase());
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

module.exports = Query;
