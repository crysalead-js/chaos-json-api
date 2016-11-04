import co from 'co';
import { extend, merge } from 'extend-merge';

class Fixture {
  /**
   * Constructor.
   *
   * @param Object config Possible options are:
   *                      - `'connection'`  _Function_ : The connection instance.
   *                      - `'model'`       _Function_ : The model.
   *                      - `'meta'`        _Object_ : Some meta data.
   *                      - `'alters'`      _Object_ : The alters.
   */
  constructor(config) {
    var defaults = {
      connection: undefined,
      model: this._model,
      meta: {},
      alters: {}
    };

    config = extend({}, defaults, config);

    /**
     * The connection to the datasource.
     *
     * @var Function
     */
    this._connection = config.connection;

    /**
     * The meta definition.
     *
     * @var Object
     */
    this._meta = config.meta;

    /**
     * The alter definitions.
     *
     * @var array
     */
    this._alters = config.alters;

    /**
     * The model.
     *
     * @var string
     */
    this._model = config.model;

    /**
     * The schema definition.
     *
     * @var Object
     */
    this._schema = {};

    /**
     * The cached schema instance.
     *
     * @var Function
     */
    this._cache = undefined;

    this._model.connection(this.connection());
  }

  /**
   * Gets/sets the connection object to which this schema is bound.
   *
   * @param  Function connection The connection to set or nothing to get the current one.
   * @return Function            Returns a connection instance.
   */
  connection(connection) {
    if (arguments.length) {
      return this._connection = connection;
    }
    if (!this._connection) {
      throw new Error("Error, missing connection for this schema.");
    }
    return this._connection;
  }

  /**
   * Returns a dynamically created model based on the model class name passed as parameter.
   *
   * @return Function A model class name.
   */
  model() {
    return this._model;
  }

  /**
   * Gets the associated schema.
   *
   * @return Function The associated schema instance.
   */
  schema() {
    if (this._cache) {
      return this._cache;
    }

    this._cache = this.model().definition();
    this._alterFields(this._cache);

    return this._cache;
  }

  /**
   * Populates some records.
   *
   * @return Promise
   */
  populate(records) {
    return co(function*() {
      if(!Array.isArray(records)) {
        records = [records];
      }

      for (var record of records) {
        var data = this._alterRecord(record);
        var entity = this.model().create(data);
        yield entity.save();
      }
    }.bind(this));
  }

  /**
   * Formats fields according the alter configuration.
   *
   * @param  Object fields An object of fields
   * @return Object        Returns the modified fields.
   */
  _alterFields(schema) {
    for (var mode in this._alters) {
      var values = this._alters[mode];
      for (var key in values) {
        var value = values[key];
        switch(mode) {
          case 'add':
            schema.column(key, value);
            break;
          case 'change':
            if (!schema.has(key)) {
              throw new Error("Can't change the following unexisting field: `'" + key + "'`.");
            }
            var field = schema.field(key);
            if (value['to'] !== undefined) {
              schema.remove(key);
              var to = value.to;
              delete value.to;
              delete value.value;
              schema.column(to, extend({}, field, value));
            }
            break;
          case 'drop':
            schema.remove(key);
            break;
        }
      }
    }
  }

  /**
   * Formats values according the alter configuration.
   *
   * @param  Object record The record.
   * @return Object        Returns the modified record.
   */
  _alterRecord(record) {
    var result = {};
    for (var name in record) {
      var value = record[name];
      if (this._alters.change && this._alters.change[name] !== undefined) {
        var alter = this._alters.change[name];
        if (alter.value) {
          var fnct = alter.value;
          value = fnct(record[name]);
        } else {
          value = record[name];
        }
        if (alter.to !== undefined) {
          result[alter.to] = value;
        } else {
          result[name] = value;
        }
      } else {
        result[name] = value;
      }
    }
    return result;
  }

  create() {
    return this.schema().create();
  }

  drop() {
    return this.schema().drop();
  }
}

export default Fixture;
