var co = require('co');
var extend = require('extend-merge').extend;
var merge = require('extend-merge').merge;
var BaseSchema = require('chaos-orm').Schema;
var Collection = require('chaos-orm').Collection;
var Relationship = require('chaos-orm').Relationship;
var BelongsTo = require('chaos-orm').BelongsTo;
var HasOne = require('chaos-orm').HasOne;
var HasMany = require('chaos-orm').HasMany;
var HasManyThrough = require('chaos-orm').HasManyThrough;
var Query = require('./query');
var Payload = require('./payload');

function arrayDiff(a, b) {
  var len = a.length;
  var arr = [];

  for (var i = 0; i < len; i++) {
    if (b.indexOf(a[i]) === -1) {
      arr.push(a[i]);
    }
  }
  return arr;
}

function path() {
  var result = '';
  for(var i = 0, length = arguments.length; i < length; i++) {
    if (result.substr(-1) === '/' && arguments[i][0] === '/') {
      result = result.substr(0, result.length - 1);
    }
    result += arguments[i];
  }
  return result;
}

class Schema extends BaseSchema {

    /**
   * Configures the meta for use.
   *
   * @param Object config Possible options are:
   *                      - `'connection'`  _Function_ : The connection instance (defaults to `undefined`).
   */
  constructor(config) {
    var defaults = {
      connection: undefined,
    };

    config = merge({}, defaults, config);
    super(config);

    /**
     * The connection instance.
     *
     * @var Object
     */
    this._connection = undefined;

    if (config.connection) {
      this.connection(config.connection);
    }
  }

  /**
   * Return a query to retrieve data from the connected data source.
   *
   * @param  Object options Query options.
   * @return Object         An instance of `Query`.
   */
  query(options) {
    var defaults = {
      connection: this.connection(),
      model:      this.reference(),
      path:       '/' + this.source()
    };
    options = extend({}, defaults, options);

    var query = this.constructor.classes().query;

    if (!options.model) {
      throw new Error("Missing model for this schema, can't create a query.");
    }
    return new query(options);
  }

  /**
   * Gets/sets the connection object to which this class is bound.
   *
   * @param  Object connection The connection instance to set or `null` to get the current one.
   * @return mixed             Returns the connection instance on get or `this` on set.
   */
  connection(connection) {
    if (arguments.length) {
      this._connection = connection;
      merge(this._formatters, this._connection.formatters());
      return this;
    }
    if (!this._connection) {
      throw new Error("Error, missing connection for this schema.");
    }
    return this._connection;
  }

  /**
   * Create the schema.
   *
   * @param  Object  options An object of options.
   * @return Boolean
   */
  create(options) {
    throw new Error("Creating schemas are not supported by JSON API.");
  }

  /**
   * Drop the schema
   *
   * @param  array   options An array of options.
   * @return boolean
   * @throws DatabaseException If no connection is defined or the schema name is missing.
   */
  drop(options) {
    throw new Error("Dropping schemas are not supported by JSON API.");
  }

  /**
   * Save data related to relations.
   *
   * @param  Object  entity  The entity instance.
   * @param  Array   types   Type of relations to save.
   * @param  Object  options Options array.
   * @return Promise         Returns a promise.
   */
  saveRelation(instance, types, options) {
    return co(function*() {
      return true;
    }.bind(this));
  }

  /**
   * Bulk inserts
   *
   * @param  Array    inserts An array of entities to insert.
   * @param  Function filter  The filter handler for which extract entities values for the insertion.
   * @return Promise          Returns `true` if insert operations succeeded, `false` otherwise.
   */
  bulkInsert(inserts, filter) {
    return co(function*() {
      if (!inserts || !inserts.length) {
        return true;
      }
      var payload = new Payload();
      payload.set(new Collection({ data: inserts }));
      try {
        var json = yield this.connection().post('/' + this.source(), payload.serialize());
        this._amendCollection(inserts, Payload.parse(extend({ data:[] }, json)).export(), { exists: true });
      } catch (response) {
        this._manageErrors(inserts, response);
      }
    }.bind(this));
  }

  /**
   * Bulk updates
   *
   * @param  Array    updates An array of entities to update.
   * @param  Function filter  The filter handler for which extract entities values to update.
   * @return Promise          Returns `true` if update operations succeeded, `false` otherwise.
   */
  bulkUpdate(updates, filter) {
    return co(function*() {
      if (!updates || !updates.length) {
        return true;
      }
      var payload = new Payload();
      payload.set(new Collection({ data: updates }));
      try {
        var json = yield this.connection().patch('/' + this.source(), payload.serialize());
        this._amendCollection(updates, Payload.parse(extend({ data:[] }, json)).export(), { exists: true });
      } catch (response) {
        this._manageErrors(updates, response);
      }
    }.bind(this));
  }

  /**
   * Sync data from the response payload.
   *
   * @param Array  collection The sent collection
   * @param Object response   The JSON-API response payload
   * @param Object options    Some additionnal amend options
   */
  _amendCollection(collection, data, options) {
    options = options || {};
    if (collection.length !== data.length) {
      throw new Error('Error, received data must have the same length as sent data.');
    }
    for (var i = 0, len = data.length; i < len; i++) {
      var entity = collection[i];
      entity.amend(data[i], options);
    }
  }

  /**
   * Manage errors as well as validation errors.
   *
   * @param Array  collection The sent collection
   * @param Object response   The JSON-API error response payload
   */
  _manageErrors(collection, response) {
    var exception = new Error();
    exception.data = response.data;

    if (response.data && response.data.errors) {
      var errors = response.data.errors;
      for (var error of errors) {
        if (error.code !== 422) {
          exception.message = error.title;
          break;
        }
        exception.message = 'Error, please check invalid input.';

        var data = error.data;
        if (collection.length !== data.length) {
          exception.message = 'Error, received errors must have the same length as sent data.';
          break;
        }
        for (var i = 0, len = data.length; i < len; i++) {
          collection[i].invalidate(data[i]);
        }
      }
    } else {
      exception.message = 'An unknown error has occurred.';
    }

    throw exception;
  }

  /**
   * Delete a record or document.
   *
   * @param  mixed    conditions The conditions with key/value pairs representing the ID of the records or
   *                             documents to be deleted.
   * @return Promise             Returns a promise.
   */
  delete(instance) {
    return co(function*() {
      var payload = new Payload();
      if ((Array.isArray(instance) || instance instanceof Collection) && !instance.length) {
        return;
      }
      payload.delete(instance);
      try {
        yield this.connection().delete('/' + this.source(), payload.serialize());
      } catch (response) {
        if (response.data && response.data.errors) {
          var errors = response.data.errors;
          for (var error of errors) {
            throw new Error(error.title);
          }
        }
        throw new Error('Unexpected error');
      }
    }.bind(this));
  }

  /**
   * Return the last insert id from the database.
   *
   * @return mixed Returns the last insert id.
   */
  lastInsertId() {
    var key = this.key();
    var data = this.connection().lastInsert();
    return data ? data[key] : undefined;
  }

  /**
   * Return the last request.
   *
   * @return Object Returns the last request.
   */
  lastRequest() {
    return this.connection().lastRequest();
  }

  /**
   * Return the last response.
   *
   * @return Object Returns the last response.
   */
  lastResponse() {
    return this.connection().lastResponse();
  }
}

/**
 * Class dependencies.
 *
 * @var array
 */
Schema._classes = {
  relationship: Relationship,
  belongsTo: BelongsTo,
  hasOne: HasOne,
  hasMany: HasMany,
  hasManyThrough: HasManyThrough,
  query: Query
};

module.exports = Schema;
