var co = require('co');
var Json = require('../../src').Json;
var Query = require('../../src').Query;
var Schema = require('../../src').Schema;

describe("Query", function() {

  beforeEach(function(done) {
    co(function*() {

      var connection = new Json();
      var schema = new Schema({ connection: connection });
      this.query = new Query({ schema: schema });

    }.bind(this)).then(function() {
      done();
    });
  });

  describe(".all()", function() {

    it("finds all records", function(done) {

      co(function*() {
        spyOn(this.query.schema().connection(), 'fetch').and.returnValue({ data: [
          { id: 1, attributes: { name: 'Foo Gallery' } },
          { id: 2,  attributes: { name: 'Bar Gallery' } }
        ]});

        var result = yield this.query.all({ 'return': 'array' });
        expect(result).toEqual([
          { id: 1, name: 'Foo Gallery' },
          { id: 2, name: 'Bar Gallery' }
        ]);

      }.bind(this)).catch(function(e){
        console.error(e);
      }).then(function(result) {
        done();
      });

    });

  });

  describe(".first()", function() {

    it("finds the first record", function(done) {

      co(function*() {
        spyOn(this.query.schema().connection(), 'fetch').and.returnValue({ data: [
          { id: 1, attributes: { name: 'Foo Gallery' } },
          { id: 2,  attributes: { name: 'Bar Gallery' } }
        ]});

        var result = yield this.query.first({ 'return': 'array' });
        expect(result).toEqual({ id: 1, name: 'Foo Gallery' });

      }.bind(this)).catch(function(e){
        console.error(e);
      }).then(function(result) {
        done();
      });

    });

    it("returs null when there's no records", function(done) {

      co(function*() {
        spyOn(this.query.schema().connection(), 'fetch').and.returnValue([]);

        var result = yield this.query.first({ 'return': 'array' });
        expect(result).toEqual(null);
      }.bind(this)).catch(function(e){
        console.error(e);
      }).then(function(result) {
        done();
      });

    });

  });

});