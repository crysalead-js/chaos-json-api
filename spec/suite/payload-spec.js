var co = require('co');
var fs = require('fs');
var Payload = require('../../src').Payload;
var Sqlite = require('../adapter/sqlite');

var Fixtures = require('../fixture/fixtures');
var GalleryFixture = require('../fixture/schema/gallery-fixture');
var GalleryDetailFixture = require('../fixture/schema/gallery-detail-fixture');
var ImageFixture = require('../fixture/schema/image-fixture');
var ImageTagFixture = require('../fixture/schema/image-tag-fixture');
var TagFixture = require('../fixture/schema/tag-fixture');

describe("Payload", function() {

  beforeEach(function(done) {
    co(function*() {
      this.connection = new Sqlite({ database: ':memory:' });
      this.fixture = 'spec/fixture/payload/';
      this.fixtures = new Fixtures({
        connection: this.connection,
        fixtures: {
          gallery: GalleryFixture,
          gallery_detail: GalleryDetailFixture,
          image: ImageFixture,
          image_tag: ImageTagFixture,
          tag: TagFixture
        }
      });

      yield this.fixtures.populate('gallery', ['create']);
      yield this.fixtures.populate('gallery_detail', ['create']);
      yield this.fixtures.populate('image', ['create']);
      yield this.fixtures.populate('image_tag', ['create']);
      yield this.fixtures.populate('tag', ['create']);

      this.gallery = this.fixtures.get('gallery').model();
      this.galleryDetail = this.fixtures.get('gallery_detail').model();
      this.image = this.fixtures.get('image').model();
      this.image_tag = this.fixtures.get('image_tag').model();
      this.tag = this.fixtures.get('tag').model();

    }.bind(this)).then(function() {
      done();
    });
  });

  afterEach(function(done) {
    co(function*() {
      yield this.fixtures.drop();
      this.fixtures.reset();
    }.bind(this)).then(function() {
      done();
    });
  });

  describe(".set()", function() {

    it("sets an error with trying to add a non Chaos entity", function() {

      var payload = new Payload();
      payload.set({hello: 'world'});

      expect(payload.errors()).toEqual([{
        status: 500,
        code: 500,
        message: 'The JSON-API serializer only supports Chaos entities.'
      }]);

    });

    it("adds validation errors", function(done) {

      co(function*() {

        var validator = this.gallery.validator();
        validator.rule('name', 'not:empty');

        var gallery = this.gallery.create();
        yield gallery.validates();

        var payload = new Payload();
        payload.set(gallery);

        expect(payload.errors()).toEqual([{
          status: 422,
          code: 0,
          title: 'Validation Error',
          meta: [
            {
              name: [
                  'is required'
              ]
            }
          ]
        }]);
        done();
      }.bind(this));

    });

  });

  describe(".delete()", function() {

    it("sets a delete payload", function(done) {

      co(function*() {
        yield this.fixtures.populate('image');

        var payload = new Payload();
        var images = yield this.image.all();
        payload.delete(images);
        expect(payload.serialize()).toEqual({
          data: [
            { type: 'Image', id: 1 },
            { type: 'Image', id: 2 },
            { type: 'Image', id: 3 },
            { type: 'Image', id: 4 },
            { type: 'Image', id: 5 }
          ]
        });
        done();
      }.bind(this));

    });

  });

  describe(".export()", function() {

    it("exports payload as nested array", function() {

      var json = fs.readFileSync(this.fixture + 'collection.json').toString();

      var payload = Payload.parse(json);

      expect(payload.export()).toEqual([
        {
          id: '1',
          title: 'JSON API paints my bikeshed!',
          author: {
            id: '9',
            firstName: 'Dan',
            lastName: 'Gebhardt',
            twitter: 'dgeb'
          },
          comments: [{
            id: '5',
            body: 'First!'
          }, {
            id: '12',
            body: 'I like XML better'
          }]
        }, {
          id: '2',
          title: 'JSON API is awesome!',
          author: {
            id: '9',
            firstName: 'Dan',
            lastName: 'Gebhardt',
            twitter: 'dgeb'
          },
          comments: []
        }
      ]);

      expect(payload.meta()).toEqual({
        'count': 13
      });

    });

  });

  describe(".serialize()", function() {

    it("serializes an empty payload", function() {

      var payload = new Payload();

      expect(payload.serialize()).toEqual({
        data: []
      });

    });

    it("serializes unexisting entities", function() {

      var image = this.image.create({
        title: 'Amiga 1200'
      });
      image.get('tags').push({ name: 'Computer' });
      image.get('tags').push({ name: 'Science' });
      image.set('gallery', { name: 'Gallery 1' });

      var payload = new Payload();
      payload.set(image);
      expect(payload.data()).toEqual({
        type: 'Image',
        attributes: {
          title: 'Amiga 1200',
          gallery: {
            name: 'Gallery 1'
          },
          tags: [{
            name: 'Computer'
          }, {
            name: 'Science'
          }]
        }
      });

      expect(payload.included()).toEqual([]);

    });

    it("serializes existing entities", function(done) {

      co(function*() {
        yield this.fixtures.populate('gallery');
        yield this.fixtures.populate('image');
        yield this.fixtures.populate('image_tag');
        yield this.fixtures.populate('tag');

        var image = yield this.image.load(1, { embed: ['gallery', 'tags'] });

        var payload = new Payload();
        payload.set(image);

        expect(payload.isCollection()).toBe(false);

        expect(payload.data()).toEqual({
          type: 'Image',
          id: 1,
          attributes: {
            gallery_id: 1,
            name: 'amiga_1200.jpg',
            title: 'Amiga 1200'
          },
          relationships: {
            gallery: {
              data: {
                type: 'Gallery',
                id: 1
              }
            },
            tags: {
              data: [{
                type: 'Tag',
                id: 1
              }, {
                type: 'Tag',
                id: 3
              }]
            }
          }
        });

        expect(payload.included()).toEqual([
          {
            type: 'Gallery',
            id: 1,
            attributes: {
              name: 'Foo Gallery'
            }
          }, {
            type: 'ImageTag',
            id: 1,
            attributes: {
              image_id: 1,
              tag_id: 1
            }
          }, {
            type: 'ImageTag',
            id: 2,
            attributes: {
              image_id: 1,
              tag_id: 3
            }
          }, {
            type: 'Tag',
            id: 1,
            attributes: {
              name: 'High Tech'
            }
          }, {
            type: 'Tag',
            id: 3,
            attributes: {
              name: 'Computer'
            }
          }
        ]);
        done();
      }.bind(this));

    });

    it("serializes collections", function(done) {

      co(function*() {
        yield this.fixtures.populate('image');

        var images = yield this.image.find().where({ id: [1 , 2] }).all();
        images.meta({ count: 10 });

        var payload = new Payload();
        payload.set(images);

        expect(payload.isCollection()).toBe(true);

        expect(payload.data()).toEqual([
          {
            type: 'Image',
            id: 1,
            attributes: {
              gallery_id: 1,
              name: 'amiga_1200.jpg',
              title: 'Amiga 1200'
            }
          }, {
            type: 'Image',
            id: 2,
            attributes: {
              gallery_id: 1,
              name: 'srinivasa_ramanujan.jpg',
              title: 'Srinivasa Ramanujan'
            }
          }
        ]);

        expect(payload.included()).toEqual([]);

        expect(payload.meta()).toEqual({ count: 10 });

      }.bind(this)).then(function() {
        done();
      });

    });

    it("serializes parsed JSON-API payload", function() {

      var json = fs.readFileSync(this.fixture + 'collection.json').toString();
      var payload = Payload.parse(json);
      expect(payload.serialize()).toEqual(JSON.parse(json));

      var json = fs.readFileSync(this.fixture + 'item.json').toString();
      var payload = Payload.parse(json);
      expect(payload.serialize()).toEqual(JSON.parse(json));

    });

  });

  describe(".parse()", function() {

    it("parses JSON-API payload", function() {

      var json = fs.readFileSync(this.fixture + 'collection.json').toString();

      var payload = Payload.parse(json);

      expect(payload.jsonapi()).toEqual({
        version: '1.0'
      });

      expect(payload.meta()).toEqual({
        count: 13
      });

      expect(payload.links()).toEqual({
        self: 'http://example.com/articles',
        next: 'http://example.com/articles?page[offset]=2',
        last: 'http://example.com/articles?page[offset]=10'
      });

      expect(payload.included()).toEqual([{
        type: 'people',
        id: '9',
        attributes: {
          firstName: 'Dan',
          lastName: 'Gebhardt',
          twitter: 'dgeb'
        },
        links: {
          self: 'http:\/\/example.com\/people\/9'
        }
      }, {
        type: 'comments',
        id: '5',
        attributes: {
          body: 'First!'
        },
        relationships: {
          author: {
            data: {
              type: 'people',
              id: '2'
            }
          }
        },
        links: {
          self: 'http:\/\/example.com\/comments\/5'
        }
      }, {
        type: 'comments',
        id: '12',
        attributes: {
          body: 'I like XML better'
        },
        relationships: {
          author: {
            data: {
              type: 'people',
              id: '9'
            }
          }
        },
        links: {
          self: 'http:\/\/example.com\/comments\/12'
        }
      }]);

    });

    it("parses JSON-API errors payload", function() {

      var json = fs.readFileSync(this.fixture + 'errors.json').toString();
      var payload = Payload.parse(json);

      expect(payload.errors()).toEqual([{
        code: '123',
        source: {
          pointer: '\/data\/attributes\/firstName'
        },
        title: 'Value is too short',
        detail: 'First name must contain at least three characters.'
      }]);

    });

    it("parses decoded JSON-API payload", function() {

      var payload = Payload.parse({
        data: [{
          id: 1,
          attributes: { name: 'value' }
        }]
      });

      expect(payload.export()).toEqual([{
        id: 1,
        name: 'value'
      }]);

    });

  });

});