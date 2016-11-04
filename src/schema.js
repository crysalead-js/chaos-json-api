import co from 'co';
import { extend, merge } from 'extend-merge';
import { Schema as BaseSchema, Collection, Relationship, BelongsTo, HasOne, HasMany, HasManyThrough } from 'chaos-orm';
import Query from './query';
import Payload from './payload';

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
   * Returns a query to retrieve data from the connected data source.
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
   * Creates the schema.
   *
   * @param  Object  options An object of options.
   * @return Boolean
   */
  create(options) {
    throw new Error("Creating schemas are not supported by JSON API.");
  }

  /**
   * Drops the schema
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
        yield this.connection().post('/' + this.source(), payload.serialize());
      } catch (response) {
        var body = JSON.parse(response.body || null);
        var errors = body.errors || [];
        for (var index in errors) {
          if (errors.hasOwnProperty(index)) {
            console.log(inserts[index]);
            console.log(errors[index]);
          }
        }
        throw response;
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
        yield this.connection().patch('/' + this.source(), payload.serialize());
      } catch (response) {
        throw response;
      }
    }.bind(this));
  }

  /**
   * Deletes a record or document.
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
   * Returns the last insert id from the database.
   *
   * @return mixed Returns the last insert id.
   */
  lastInsertId() {
    var key = this.key();
    var data = this.connection().lastInsert();
    return data ? data[key] : undefined;
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

export default Schema;
