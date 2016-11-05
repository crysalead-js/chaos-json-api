var co = require('co');
var extend = require('extend-merge').extend;
var merge = require('extend-merge').merge;
var Source = require('chaos-orm').Source;
var dateformat = require('date-format');
var trim = require('trim-character');
var Schema = require('./schema');

function queryStringify(obj, prefix) {
  var str = [];
  for(var p in obj) {
    if (obj.hasOwnProperty(p)) {
      var k = prefix ? prefix + "[" + p + "]" : p, v = obj[p];
      str.push(typeof v == "object" ?
        queryStringify(v, k) :
        encodeURIComponent(k) + "=" + encodeURIComponent(v));
    }
  }
  return str.join("&");
}

/**
 * An adapter base class for SQL based driver
 */
class JsonApi extends Source {
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
      headers:  {}
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
     * Stores configuration information for object instances at time of construction.
     *
     * @var Object
     */
    this._config = extend({}, config);
    delete this._config.classes;
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
   * Returns default casting handlers.
   *
   * @return Object
   */
  _handlers() {
    return {
      cast: {
        'string': function(value, options) {
          return String(value);
        },
        'integer': function(value, options) {
          return Number.parseInt(value);
        },
        'float': function(value, options) {
          return Number.parseFloat(value);
        },
        'decimal': function(value, options) {
          var defaults = { precision: 2 };
          options = extend({}, defaults, options);
          return Number(value).toFixed(options.precision);
        },
        'date':function(value, options) {
          return new Date(value);
        },
        'datetime': function(value, options) {
          return new Date(value);
        },
        'boolean': function(value, options) {
          return !!value;
        },
        'null': function(value, options) {
          return null;
        }
      },
      datasource: {
        'string': function string(value, options) {
          return value instanceof Date ? value.toISOString().substring(0, 19).replace('T', ' ') : String(value);
        }
      }
    };
  }

  /**
   * Formats a value according to its definition.
   *
   * @param  String mode  The format mode (i.e. `'cast'` or `'datasource'`).
   * @param  String type  The type name.
   * @param  mixed  value The value to format.
   * @return mixed        The formated value.
   */
  format(mode, type, value, options) {
    return super.format(mode, type, value, options);
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
   * @return Promise
   */
  send(method, path, data) {
    return new Promise(function(resolve, reject) {
      var headers = extend({}, this._config.headers, {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
      });

      var body = null;

      if (/GET/i.test(method)) {
        var qs = queryStringify(data);
        path += qs ? '?' + qs : '';
      } else {
        body = JSON.stringify(data);
      }

      var xhr = new XMLHttpRequest();
      xhr.open(method, trim.right(this._config.basePath, '/') + '/' + trim.left(path, '/'), true);
      for (var name in headers) {
        xhr.setRequestHeader(name, headers[name]);
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            var response = xhr.responseText ? JSON.parse(xhr.responseText) : '';
            if (/POST/i.test(method)) {
              if (response && response.data && !Array.isArray(response.data)) {
                this._lastInsert = response.data;
              }
            }
            resolve(response);
          } else {
            reject({ status: xhr.status, statusText: xhr.statusText, body: xhr.responseText });
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
   * @return Promise
   */
  get(path, data) {
    return this.send('GET', path, data);
  }

  /**
   * Send POST request.
   *
   * @param  String path    The path.
   * @param  Object data    The parameters for the request. For GET/DELETE this is the query string
   *                        for POST/PUT this is the body
   * @return Promise
   */
  post(path, data) {
    return this.send('POST', path, data);
  }

  /**
   * Send PATCH request.
   *
   * @param  String path    The path.
   * @param  Object data    The parameters for the request. For GET/DELETE this is the query string
   *                        for POST/PUT this is the body
   * @return Promise
   */
  patch(path, data) {
    return this.send('PATCH', path, data);
  }

  /**
   * Send DELETE request.
   *
   * @param  String path    The path.
   * @param  Object data    The parameters for the request. For GET/DELETE this is the query string
   *                        for POST/PUT this is the body
   * @return Promise
   */
  delete(path, data) {
    return this.send('DELETE', path, data);
  }

  /**
   * Returns the last inserted record from the database.
   *
   * @return mixed The last inserted record.
   */
  lastInsert() {
    return this._lastInsert;
  }
}

/**
 * Class dependencies.
 *
 * @var array
 */
JsonApi._classes = {
  schema: Schema
};

module.exports = JsonApi;
