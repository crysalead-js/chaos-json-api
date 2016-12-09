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
   * Return a query to retrieve data from the connected data source.
   *
   * @param  Object options Query options.
   * @return Object         An instance of `Query`.
   */
  query(options) {
    var defaults = {
      connection: this.connection(),
      model:      this.model(),
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
  persist(instance, types, options) {
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
      payload.set(new Collection({data: inserts}));
      try {
        this._sync(inserts, yield this.connection().post('/' + this.source(), payload.serialize()), {exists: true});
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
      payload.set(new Collection({data: updates}));
      try {
        this._sync(updates, yield this.connection().patch('/' + this.source(), payload.serialize()));
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
   * @param Object options    Some additionnal sync options
   */
  _sync(collection, response, options) {
    options = options || {};
    var result = Payload.parse(extend({data:[]}, response)).export();
    if (collection.length !== result.length) {
      throw new Error('Error, received data must have the same length as sent data.');
    }
    for (var i = 0, len = result.length; i < len; i++) {
      collection[i].sync(null, result[i], options);
    }
  }

  /**
   * Manage errors as well as validation errors.
   *
   * @param Array  collection The sent collection
   * @param Object response   The JSON-API error response payload
   */
  _manageErrors(collection, response) {
    if (!response || !response.data || !response.data.errors) {
      return;
    }
    var errors = response.data.errors;
    for (var error of errors) {
      if (error.code !== 0) {
        throw new Error(error.title);
      }
      var meta = error.meta;
      if (collection.length !== meta.length) {
        throw new Error('Error, received errors must have the same length as sent data.');
      }
      for (var i = 0, len = meta.length; i < len; i++) {
        collection[i].invalidate(meta[i]);
      }
    }
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
      payload.delete(instance);
      try {
        yield this.connection().delete('/' + this.source(), payload.serialize());
        return true;
      } catch (response) {
        return false;
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
