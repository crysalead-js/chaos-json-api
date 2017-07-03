var co = require('co');
var Emitter = require('component-emitter');
var extend = require('extend-merge').extend;
var merge = require('extend-merge').merge;
var Source = require('chaos-orm').Source;
var dateformat = require('dateformat');
var trim = require('trim-character');
var Schema = require('./schema');

function queryStringify(obj, prefix) {
  var str = [];
  for(var p in obj) {
    if (obj.hasOwnProperty(p)) {
      var k = prefix ? prefix + "[" + p + "]" : p, v = obj[p];
      str.push(typeof v === 'object' && v ?
        queryStringify(v, k) :
        encodeURIComponent(k) + "=" + encodeURIComponent(v));
    }
  }
  return str.join("&");
}

/**
 * An adapter base class for SQL based driver
 */
class Json extends Source {
  /**
   * Gets/sets class dependencies.
   *
   * @param  Object classes The classes dependencies to set or none to get them.
   * @return Object         The classes dependencies.
   */
  static classes(classes) {
    if (arguments.length) {
      this._classes = extend({}, this._classes, classes);
    }
    return this._classes;
  }

  /**
   * Creates the database object and set default values for it.
   *
   * Options defined:
   *  - `'scheme'`     _String_   : The full dsn connection url. Defaults to `null`.
   *  - `'host'`       _String_   : Name/address of server to connect to. Defaults to 'localhost'.
   *  - `'port'`       _Interger_ : Name of the database to use. Defaults to `null`.
   *  - `'username'`   _String_   : Username to use when connecting to server. Defaults to 'root'.
   *  - `'password'`   _String_   : Password to use when connecting to server. Defaults to `''`.
   *  - `'headers'`    _Object_   : HTTP headers.
   *
   * @param Object config Configuration options.
   */
  constructor(config) {
    super(config);

    var defaults = {
      classes:  {},
      scheme:   'http',
      host:     'localhost',
      basePath: '/',
      port:     undefined,
      username: undefined,
      password: undefined,
      headers:  {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };
    config = extend({}, defaults, config);

    /**
     * Default entity and set classes used by subclasses of `Source`.
     *
     * @var Object
     */
    this._classes = extend({}, this.constructor._classes, config.classes);

    /**
     * The last inserted record.
     *
     * @var mixed
     */
    this._lastInsert = undefined;

    /**
     * The last request.
     *
     * @var Object
     */
    this._lastRequest = undefined;

    /**
     * The last response.
     *
     * @var Object
     */
    this._lastResponse = undefined;

    /**
     * Stores configuration information for object instances at time of construction.
     *
     * @var Object
     */
    this._config = extend({}, config);
    delete this._config.classes;

    var handlers = this._handlers;

    this.formatter('array', 'id',     handlers.array['integer']);
    this.formatter('array', 'serial', handlers.array['integer']);
    this.formatter('cast', 'id',      handlers.cast['integer']);
    this.formatter('cast', 'serial',  handlers.cast['integer']);

    this.formatter('json', 'object',   handlers.json['object']);
    this.formatter('json', 'string',   handlers.json['string']);
    this.formatter('json', 'integer',  handlers.json['integer']);
    this.formatter('json', 'float',    handlers.json['float']);
    this.formatter('json', 'date',     handlers.json['date']);
    this.formatter('json', 'datetime', handlers.json['datetime']);
    this.formatter('json', 'boolean',  handlers.json['boolean']);
    this.formatter('json', 'null',     handlers.json['null']);
  }

  /**
   * Gets/sets instance dependencies.
   *
   * @param  Object classes The classes dependencies to set or nothing to get the defined ones.
   * @return Object         The classes dependencies.
   */
  classes(classes) {
    if (arguments.length) {
      this._classes = extend({}, this._classes, classes);
    }
    return this._classes;
  }

  /**
   * Return the source configuration.
   *
   * @return Object.
   */
  config() {
    return this._config;
  }

  /**
   * Set Bearer token
   */
  bearer(token, unauthorizedHandler) {
    this._unauthorizedHandler = unauthorizedHandler;
    this._config.headers.Authorization = 'Bearer ' + token;
  }

  /**
   * Clear auth
   */
  clearAuth() {
    this._unauthorizedHandler = undefined;
    delete this._config.headers.Authorization;
  }

  /**
   * Returns default casting handlers.
   *
   * @return Object
   */
  _handlers() {
    return merge({}, super._handlers(), {
      json: {
        'object': function(value, options) {
          return value.to('json', options);
        },
        'string': function string(value, options) {
          return String(value);
        },
        'integer': function(value, options) {
          return Number.parseInt(value);
        },
        'float': function(value, options) {
          return Number.parseFloat(value);
        },
        'date': function(value, options) {
          options = options || {};
          options.format = options.format ? options.format : 'yyyy-mm-dd';
          return this.convert('array', 'datetime', value, options);
        }.bind(this),
        'datetime': function(value, options) {
          options = options || {};
          options.format = options.format ? options.format : 'yyyy-mm-dd HH:MM:ss';
          if (!(value instanceof Date)) {
            value = new Date(value);
          }
          return dateformat(value, options.format);
        },
        'boolean': function(value, options) {
          return !!value;
        },
        'null': function(value, options) {
          return null;
        }
      }
    });
  }

  /**
   * Send request and return response data. Will open the connection if
   * needed and always close it after sending the request.
   *
   * Will automatically authenticate when receiving a `401` HTTP status code
   * then continue retrying sending initial request.
   *
   * @param  String method  The HTTP action.
   * @param  String path    The path.
   * @param  Object data    The parameters for the request. For GET/DELETE this is the query string
   *                        for POST/PUT this is the body
   * @param  Object options Some custom options
   * @return Promise
   */
  send(method, path, data, options) {
    return co(function*() {
      options = options || {};

      if (!options.ignoreAuth && this._pushback) {
        yield this._pushback;
      }

      var body = '';
      var headers = extend({}, this._config.headers, options.headers);

      if (/GET/i.test(method)) {
        var qs = queryStringify(data);
        path += qs ? '?' + qs : '';
      } else if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        body = queryStringify(data);
      } else {
        body = JSON.stringify(data);
      }

      var url =trim.right(this._config.basePath, '/') + '/' + trim.left(path, '/');

      var response;

      try {
        response = yield this._send(method, url, body, headers);
      } catch (exception) {
        if (options.ignoreAuth || !this._unauthorizedHandler || exception.response.status !== 401) {
          throw exception;
        }

        var promiseResolve, promiseReject;
        this._pushback = new Promise(function(resolve, reject){
          promiseResolve = resolve;
          promiseReject = reject;
        });

        if (yield this._unauthorizedHandler()) {
          promiseResolve();
          this._pushback = undefined;
          headers = extend({}, this._config.headers, options.headers);
          response = yield this._send(method, url, body, headers);
        } else {
          promiseResolve();
          this._pushback = undefined;
          throw exception;
        }
      }

      this._lastRequest = { url: url, headers: headers, data: data, body: body };
      return response;
    }.bind(this));
  }

  /**
   * Send request.
   *
   * @param  String method  The HTTP action.
   * @param  String path    The path.
   * @param  String body    The body.
   * @param  Object headers HTTPheaders
   * @return Promise
   */
  _send(method, url, body, headers) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      for (var name in headers) {
        xhr.setRequestHeader(name, headers[name]);
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {

          var data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          this._lastResponse = { status: xhr.status, statusText: xhr.statusText, data: data, body: xhr.responseText };

          if (xhr.status >= 200 && xhr.status < 300) {
            if (/POST/i.test(method)) {
              if (data.data && !Array.isArray(data.data)) {
                this._lastInsert = data.data;
              }
            }
            resolve(data);
          } else {
            var exception = new Error();
            exception.response = this._lastResponse;
            if (data.error) {
              exception.message = data.error.title ? data.error.title : data.message || data.error;
              exception.data = data.error.data || {};
            }
            reject(exception);
          }
        }
      };
      xhr.withCredentials = true;
      xhr.send(body);
    }.bind(this));
  }

  /**
   * Send GET request.
   *
   * @param  String path    The path.
   * @param  Object data    The parameters for the request. For GET/DELETE this is the query string
   *                        for POST/PUT this is the body
   * @param  Object options Some custom options
   * @return Promise
   */
  get(path, data, options) {
    return this.send('GET', path, data, options);
  }

  /**
   * Send POST request.
   *
   * @param  String path    The path.
   * @param  Object data    The parameters for the request. For GET/DELETE this is the query string
   *                        for POST/PUT this is the body
   * @param  Object options Some custom options
   * @return Promise
   */
  post(path, data, options) {
    return this.send('POST', path, data, options);
  }

  /**
   * Send PATCH request.
   *
   * @param  String path    The path.
   * @param  Object data    The parameters for the request. For GET/DELETE this is the query string
   *                        for POST/PUT this is the body
   * @param  Object options Some custom options
   * @return Promise
   */
  patch(path, data, options) {
    return this.send('PATCH', path, data, options);
  }

  /**
   * Send DELETE request.
   *
   * @param  String path    The path.
   * @param  Object data    The parameters for the request. For GET/DELETE this is the query string
   *                        for POST/PUT this is the body
   * @param  Object options Some custom options
   * @return Promise
   */
  delete(path, data, options) {
    return this.send('DELETE', path, data, options);
  }

  /**
   * Return the last inserted record from the database.
   *
   * @return mixed The last inserted record.
   */
  lastInsert() {
    return this._lastInsert;
  }

  /**
   * Return the last request.
   *
   * @return Object The last request.
   */
  lastRequest() {
    return this._lastRequest;
  }

  /**
   * Return the last response.
   *
   * @return Object The last response.
   */
  lastResponse() {
    return this._lastResponse;
  }
}

/**
 * Class dependencies.
 *
 * @var array
 */
Json._classes = {
  schema: Schema
};

Emitter(Json.prototype);

module.exports = Json;
