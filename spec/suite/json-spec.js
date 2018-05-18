var Json = require('../../src/json');
var Source = require('chaos-orm').Source;

describe("Json", function() {

  beforeEach(function() {

    this.datasource = new Json();

  });

  describe(".convert()", function() {

    it("formats according default `'json'` handlers", function() {

      expect(this.datasource.convert('json', 'integer', '123')).toBe(123);
      expect(this.datasource.convert('json', 'float', '12.3')).toBe(12.3);
      var date = new Date('2014-11-21');
      expect(this.datasource.convert('json', 'date', date)).toEqual('2014-11-21');
      expect(this.datasource.convert('json', 'date', '2014-11-21')).toEqual('2014-11-21');
      var datetime = new Date(Date.UTC(2014, 10, 21, 10, 20, 45));
      expect(this.datasource.convert('json', 'datetime', datetime)).toEqual('2014-11-21 10:20:45');

      expect(this.datasource.convert('json', 'datetime', '2014-11-21 10:20:45')).toEqual('2014-11-21 10:20:45');
      expect(this.datasource.convert('json', 'datetime', 1416565245)).toEqual('2014-11-21 10:20:45');
      expect(this.datasource.convert('json', 'boolean', '1')).toBe(true);
      expect(this.datasource.convert('json', 'boolean', '0')).toBe(false);
      expect(this.datasource.convert('json', 'boolean', 1)).toBe(true);
      expect(this.datasource.convert('json', 'boolean', 0)).toBe(false);
      expect(this.datasource.convert('json', 'null', '')).toBe(null);
      expect(this.datasource.convert('json', 'string', 'abc')).toBe('abc');
      expect(this.datasource.convert('json', '_default_', 123)).toBe(123);
      expect(this.datasource.convert('json', '_undefined_', 123)).toBe(123);

    });

  });

});
