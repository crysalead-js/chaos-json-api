import camelize from 'camel-case';
import { extend, merge } from "extend-merge";
import { Model, Collection, Through, Source } from 'chaos-orm';

/**
 * JSON-API payload.
 */
class Payload {

  /**
   * Constructor.
   *
   * @param Object config The config array
   */
  constructor(config) {
    /**
     * Default entity's primary key name.
     *
     * @var String
     */
    this._key = 'id';

    /**
     * Entity's primary key name per type.
     * The `_key` value will be used for undefined type.
     *
     * example: `['post' => 'uid', 'comments' => '_id']`
     *
     * @var Array
     */
    this._keys = [];

    /**
     * Keys cache
     *
     * @var Object
     */
    this._indexed = {};

    /**
     * @see http://jsonapi.org/format/
     *
     * @var Object
     */
    this._jsonapi = {};

    /**
     * @see http://jsonapi.org/format/
     *
     * @var Object
     */
    this._meta = {};

    /**
     * @see http://jsonapi.org/format/
     *
     * @var Object
     */
    this._links = {};

    /**
     * @see http://jsonapi.org/format/
     *
     * @var Array
     */
    this._dataCache = [];

    /**
     * @see http://jsonapi.org/format/
     *
     * @var Array
     */
    this._errors = [];

    /**
     * Store validation errors
     *
     * @var Array
     */
    this._validationErrors = [];

    /**
     * @see http://jsonapi.org/format/
     *
     * @var Array
     */
    this._included = [];

    /**
     * Indexes included data using type & id.
     *
     * @var Object
     */
    this._storeCache = {};

    /**
     * Exported JSON-API items into a nested form array.
     *
     * @see JsonApi::export()
     *
     * @var Array
     */
    this._relationships = [];

    /**
     * Link generator handler.
     *
     * @var Callable
     */
    this._link = null;

    /**
     * Data exporter handler.
     */
    this._exporter = null;

    var defaults = {
      key: 'id',
      keys: {},
      data: {},
      link: null,
      exporter: function(entity) {
        return entity.to('array', { embed: false });
      }
    };

    config = extend({}, defaults, config);

    config.data = extend({}, {
      jsonapi: {},
      meta: {},
      links: {},
      data: [],
      errors: [],
      included: []
    }, config.data);


    this._key = config.key;
    this._keys = config.keys;
    this._link = config.link;
    this._exporter = config.exporter;

    this.jsonapi(config.data.jsonapi);
    this.meta(config.data.meta);
    this.links(config.data.links);
    this.data(config.data.data);
    this.errors(config.data.errors);

    for (var include of config.data.included) {
      this._store(include);
    }
  }

  /**
   * Indexes an item according its type & id into `_store`.
   *
   * @param Object data The item data to store.
   */
  _store(data) {
    if (data.id === undefined) {
        return;
    }
    var id = data.id;
    var type = data.type;
    var key = this._keys[type] ? this._keys[type] : this._key;
    if (!this._storeCache[type]) {
      this._storeCache[type] = {};
    }
    this._storeCache[type][id] = extend({}, data.attributes, { [key]: id });
    if (data.relationships) {
      if (!this._relationships[type]) {
        this._relationships[type] = {};
      }
      this._relationships[type][id] = data.relationships;
    }
    this._included.push(data);
  }

  /**
   * Checks whether the payload is a collection of data or not.
   *
   * @return boolean
   */
  isCollection() {
    return this._dataCache.length !== 1;
  }

  /**
   * Sets a resource as the payload.
   *
   * @param  mixed resource The Chaos entity/collection to set as payload.
   * @return self
   */
  set(resource) {
    this._validationErrors = [];
    if (resource instanceof Collection) {
      this.meta(resource.meta());
      for (var entity of resource) {
        this.push(entity);
      }
      return this;
    }
    this.push(resource);
    return this;
  }

  /**
   * Adds an entity in the payload.
   *
   * @param  Object  entity The Chaos entity to push in the payload.
   * @return self
   */
  push(entity) {
    var data = this._push(entity);
    if (data === undefined) {
      return this;
    }
    this._dataCache.push(data);
    this._storeValidationError(entity);

    if (entity.exists()) {
      this._indexed[entity.id()] =this._dataCache.length - 1;
    }
    return this;
  }

  /**
   * Helper for `JsonApi::push()`.
   *
   * @param  Object  entity       The Chaos entity to push in the payload.
   * @param  Boolean relationship Indicates whether the entity is some related data or not.
   * @return Object               The pushed data
   */
  _push(entity, related = false) {
    if (!(entity instanceof Model)) {
      this.errors([{
        status: 500,
        code: 500,
        message: "The JSON-API serializer only supports Chaos entities."
      }]);
      return;
    }
    var definition = entity.model().definition();
    var data = this._data(entity);
    var link = this._link;
    if (this._link && entity.exists()) {
      data.links.self = link(camelize(data.type), { id: entity.id() }, { absolute: true });
    }

    if (related) {
      this._store(extend({}, data));
      delete data.attributes;
      delete data.links;
    } else {
      var relations = definition.relations();
      if (relations.length) {
        this._populateRelationships(entity, relations, data);
      }
    }

    return data;
  }

  /**
   * Store validation errors.
   *
   * @param object entity The Chaos entity.
   */
  _storeValidationError(entity) {
    var errors = entity.errors();
    if (!Object.keys(errors).length) {
      this._validationErrors.push(null);
      return;
    }
    this._validationErrors.push(errors);
  }

  /**
   * Helper for `JsonApi::push()`. Populates data's relationships
   *
   * @param  Object  entity    The Chaos entity.
   * @param  Array   relations The Chaos relations to process.
   * @param  Object  data      The data array to be populated.
   */
  _populateRelationships(entity, relations, data) {
      var through = [];

      for (var name of relations) {
        this._populateRelationship(entity, name, data, through);
      }
      if (data.relationships) {
        for (let key in data.relationships) {
          if (data.relationships[key] == null) {
            delete data.relationships[key];
          }
        }
        for (let rel of through) {
          delete data.relationships[rel.through()];
        }
      }
      if (data.attributes) {
        for (let key in data.attributes) {
          if (data.attributes[key] == null) {
            delete data.attributes[key];
          }
        }
        for (let rel of through) {
          delete data.attributes[rel.through()];
        }
      }
  }

  /**
   * Helper for `JsonApi::push()`. Populates one relationship data.
   *
   * @param  Object  entity  The Chaos entity.
   * @param  Object  name    The name of the relationship to process.
   * @param  Object  data    The data array to be populated.
   * @param  Array   through The through array to be populated with pivot tables.
   */
  _populateRelationship(entity, name, data, through) {
      if (!entity.has(name)) {
        return;
      }
      var child = entity.get(name);
      var link = this._link;
      if (link) {
        if (!data.relationships) {
          data.relationships = {};
        }
        if (!data.relationships[name]) {
          data.relationships[name] = {};
        }
        if (!data.relationships[name].links) {
          data.relationships[name].links = {};
        }
        data.relationships[name].links.related = this._relatedLink(entity.model().definition().relation(name).counterpart().name(), entity.id(), child);
      }
      if (child instanceof Model) {
        if (child.exists()) {
          if (!data.relationships) {
            data.relationships = {};
          }
          if (!data.relationships[name]) {
            data.relationships[name] = {};
          }
          data.relationships[name].data = this._push(child, true);
        } else {
          if (!data.attributes) {
            data.attributes = {};
          }
          data.attributes[name] = child.to('array', { embed: false });
        }
      } else {
          if (child instanceof Through) {
            through.push(entity.model().definition().relation(name));
          }
          for (var item of child) {
            if (item.exists()) {
              if (!data.relationships) {
                data.relationships = {};
              }
              if (!data.relationships[name]) {
                data.relationships[name] = { data: [] };
              }
              data.relationships[name].data.push(this._push(item, true));
            } else {
              if (!data.attributes) {
                data.attributes = {};
              }
              if (!data.attributes[name]) {
                data.attributes[name] = [];
              }
              data.attributes[name].push(item.to('array', { embed: false }));
            }
          }
      }
  }

  /**
   * Creates a related link.
   *
   * @param  String relation The relation name.
   * @param  String id       The relation id.
   * @return String resource The resource name.
   */
  _relatedLink(relation, id, resource) {
    var link = this._link;
    return link(this._name(resource), {
      relation: relation,
      rid: id
    }, { absolute: true });
  }

  /**
   * Extracts the resource name from an instance.
   *
   * @param Object instance The collection/entity instance.
   * @param String           The Resource name
   */
  _name(instance) {
    return instance.model().name;
  }

  /**
   * Returns entity's data using the JSON-API format.
   *
   * @param  Object  entity     The Chaos entity.
   * @param  Boolean attributes Extract entities attributes or not.
   * @return Object             The JSON-API formatted data.
   */
  _data(entity, attributes = true) {
    var definition = entity.model().definition();
    var key = definition.key();

    var result = { type: definition.source() };

    if (entity.exists()) {
      result.id = entity.id();
    }

    if (!attributes) {
      return result;
    }

    var attrs = {};
    var exporter = this._exporter;
    var data = exporter(entity);
    for (var name in data) {
      attrs[name] = data[name];
    }
    delete attrs[key];

    result.attributes = attrs;

    return result;
  }

  /**
   * Sets a resource to delete as payload.
   *
   * @param  mixed resource The Chaos entity/collection to set as delete payload.
   * @return self
   */
  delete(resource) {
    if (resource instanceof Collection) {
      this.meta(resource.meta());
      for (var entity of resource) {
        this._dataCache.push(this._data(entity, false));
      }
      return this;
    }
    this._dataCache.push(this._data(resource, false));
    return this;
  }

  /**
   * Returns all IDs from the payload.
   *
   * @return array
   */
  keys() {
    return Object.keys(this._indexed);
  }

  /**
   * Exports a JSON-API item data into a nested from array.
   */
  export(id) {
    var collection;
    if (id === undefined) {
      collection = this.data();
      collection = this._dataCache.length === 1 ? [collection] : collection;
    } else {
      if (this._indexed[id] === undefined) {
        throw new Error("Unexisting data entry for id `" + id + "` in the JSON-API payload.");
      }
      collection = [this._dataCache[this._indexed[id]]];
    }

    var values = [];
    for (var data of collection) {
      var type = data.type;
      var key = this._keys[type] ? this._keys[type] : this._key;
      var result, indexes;

      if (data.id) {
        result = { [key]: data.id };
        indexes = { [data.type]: {  [data.id]: true } };
      } else {
        result = {};
        indexes = {};
      }

      result = extend({}, data.attributes, result);

      if (data.relationships) {
        for (var key in data.relationships) {
          result[key] = this._relationship(data.relationships[key].data, indexes);
        }
      }
      values.push(result);
    }
    return values;
  }

  /**
   * Helper for `JsonApi::export()`.
   */
  _relationship(collection, indexes) {
    var isCollection = Array.isArray(collection);
    var collection = isCollection ? collection : [collection];
    var values = [];

    for (var data of collection) {
      if (indexes[data.type] && indexes[data.type][data.id]) {
        continue;
      }
      if (!indexes[data.type]) {
        indexes[data.type] = {};
      }
      indexes[data.type][data.id] = true;
      if (!this._storeCache[data.type] || !this._storeCache[data.type][data.id]) {
        continue;
      }
      var result = this._storeCache[data.type][data.id];
      if (this._relationships[data.type] && this._relationships[data.type][data.id]) {
        for (var key in this._relationships[data.type][data.id]) {
          var item = this._relationship(this._relationships[data.type][data.id][key].data, indexes);
          if (item) {
            result[key] = item;
          }
        }
      }
      values.push(result);
    }
    return isCollection ? values : values[0];
  }

  /**
   * Gets/sets the `'jsonapi'` property.
   *
   * @return mixed
   */
  jsonapi(jsonapi) {
    if (!arguments.length) {
      return this._jsonapi;
    }
    this._jsonapi = extend({}, jsonapi);
    return this;
  }

  /**
   * Gets/sets the `'meta'` property.
   *
   * @return mixed
   */
  meta(meta) {
    if (!arguments.length) {
      return this._meta;
    }
    this._meta = extend({}, meta);
    return this;
  }

  /**
   * Gets/sets the `'links'` property.
   *
   * @return mixed
   */
  links(links) {
    if (!arguments.length) {
      return this._links;
    }
    this._links = extend({}, links);
    return this;
  }

  /**
   * Gets/sets the `'data'` property.
   *
   * @return mixed
   */
  data(data) {
    if (!arguments.length) {
      return this._dataCache.length === 1 ? this._dataCache[0] : this._dataCache;
    }
    if (!Array.isArray(data)) {
      data = [data];
    }
    this._dataCache = data;
    var key = 0;
    for (var value of data) {
      if (value.id) {
        this._indexed[value.id] = key;
      }
      key++;
    }
    return this;
  }

  /**
   * Gets/sets the `'errors'` property.
   *
   * @return mixed
   */
  errors(errors) {
    if (!arguments.length) {
      var errors = this._errors.slice();
      var validationErrors = this._validationErrors.filter(function(e){ return !!e; });
      if (validationErrors.length) {
        errors.push({
          status: 422,
          code: 0,
          title: 'Validation Error',
          meta: this._validationErrors.slice()
        });
      }
      return errors;
    }
    this._errors = errors.slice();
    return this;
  }

  /**
   * Gets/sets the `'included'` property.
   *
   * @return array
   */
  included(included) {
    if (!arguments.length) {
      return this._included;
    }
    this._included = extend({}, included);
    return this;
  }

  /**
   * Serializes the payload.
   *
   * @return string The payload string.
   */
  serialize() {
    var payload = {
      jsonapi: this.jsonapi(),
      meta: this.meta(),
      links: this.links(),
    };
    var payload = {};
    var jsonapi = this.jsonapi();
    var meta = this.meta();
    var links = this.links();

    if (Object.keys(jsonapi).length) {
      payload.jsonapi = jsonapi;
    }
    if (Object.keys(meta).length) {
      payload.meta = meta;
    }
    if (Object.keys(links).length) {
      payload.links = links;
    }

    var errors = this.errors();
    if (errors.length) {
      payload.errors = this.errors();
    } else {
      payload.data = this.data();
      if (this.included().length) {
        payload.included = this.included();
      }
    }

    for (var key in payload) {
      var value = payload[key];
      if (value !== null && typeof value === 'object' && value.constructor === Object) {
        if (Object.keys(value).length === 0) {
          delete payload[key];
        }
      }
    }
    return payload;
  }

  /**
   * Reset the payload.
   */
  reset() {
    this._indexed = {};
    this._jsonapi = {};
    this._meta = {};
    this._links = {};
    this._dataCache = [];
    this._errors = [];
    this._included = [];
    this._storeCache = {};
    this._relationships = [];
  }

  /**
   * Parses a JSON-API payload string.
   *
   * @return object The payload object.
   */
  static parse(payload, key, keys) {
    var data;
    if (!payload) {
      data = {};
    } else if (typeof payload === 'string') {
      data = JSON.parse(payload);
    } else {
      data = payload;
    }
    return new this({
      data: data,
      key: key || 'id',
      keys: keys || {}
    });
  }
}

export default Payload;
