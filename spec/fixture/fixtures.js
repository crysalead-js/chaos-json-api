var co = require('co');
var extend = require('extend-merge').extend;
var merge = require('extend-merge').merge;
var Model = require('chaos-orm').Model;
var Schema = require('../../src/schema');

class Fixtures {
  /**
   * Constructor.
   *
   * @param Object config Possible options are:
   *                      - `'classes'`     _Object_   : The class dependencies.
   *                      - `'connection'`  _Function_ : The connection instance.
   *                      - `'fixtures'`    _Object_   : The fixtures.
   */
  constructor(config) {
    var defaults = {
      classes: this.constructor._classes,
      connection: undefined,
      fixtures: {}
    };

    config = merge({}, defaults, config);

    /**
     * Class dependencies.
     *
     * @var array
     */
    this._classes = config.classes;

    /**
     * The connection to the datasource.
     *
     * @var Function
     */
    this._connection = config.connection;

    /**
     * The fixtures data.
     *
     * @var Object
     */
    this._fixtures = config.fixtures;

    /**
     * The created instances.
     *
     * @var Object
     */
    this._instances = {};
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
   * Returns a fixture instance.
   *
   * @return String   name The name of the fixture to get.
   * @return Function      The fixture instance.
   */
  get(name) {
    if (this._instances[name] !== undefined) {
      return this._instances[name];
    }
    if (this._fixtures[name] === undefined) {
      throw new Error("Error, the fixture `'{name}'` hasn't been defined.");
    }
    var fixture = this._fixtures[name];

    return this._instances[name] = new fixture({
      connection: this.connection(),
      alters: this._alters
    });
  }

  /**
   * Gets alter definitions or sets a new one.
   *
   * @param  String mode The type of alteration.
   * @param  String key  The field name to alter.
   * @return             The alter definitions or `null` in set mode.
   */
  alter(mode, key, value) {
    if (!arguments.length) {
      return this._alters;
    }
    if (key && value) {
      if (this._alters[mode] === undefined) {
        this._alters[mode] = {};
      }
      this._alters[mode][key] = value;
    }
  }

  /**
   * Populates some fixtures.
   *
   * @return string name    The name of the fixture to populate in the datasource.
   * @return array  methods An array of method to run (default: `['all']`).
   */
  populate(name, methods) {
    return co(function*() {
      var fixture = this.get(name);

      if (!methods) {
        methods = ['all'];
      }

      methods = Array.isArray(methods) ? methods : [methods];

      for (var method of methods) {
        yield fixture[method]();
      }
    }.bind(this));
  }

  /**
   * Truncates all populated fixtures.
   */
  truncate() {
    return co(function*() {
      for (var key in this._instances) {
        var instance = this._instances[key];
        var reference = instance.reference();
        yield reference.remove();
      }
    }.bind(this));
  }

  /**
   * Drops all populated fixtures.
   */
  drop() {
    return co(function*() {
      for (var key in this._instances) {
        var instance = this._instances[key];
        yield instance.drop();
      }
    }.bind(this));
  }

  /**
   * Resets all models.
   */
  reset() {
    for (var key in this._instances) {
      var instance = this._instances[key];
      var reference = instance.reference();
      reference.reset();
    }
    this._instances = {};
  }
}

Fixtures._classes = {
  schema: Schema,
  reference: Model
}

module.exports = Fixtures;
