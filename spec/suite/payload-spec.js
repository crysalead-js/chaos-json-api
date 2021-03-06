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

      this.payload = new Payload();

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

      this.payload.set({ hello: 'world' });

      expect(this.payload.errors()).toEqual([{
        status: '500',
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

        this.payload.set(gallery, { embed: true });

        expect(this.payload.errors()).toEqual([{
          status: '422',
          code: 422,
          title: 'Validation Error',
          data: [
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

        var images = yield this.image.all();
        this.payload.delete(images);
        expect(this.payload.serialize()).toEqual({
          data: [
            { type: 'Image', id: 1, exists: true },
            { type: 'Image', id: 2, exists: true },
            { type: 'Image', id: 3, exists: true },
            { type: 'Image', id: 4, exists: true },
            { type: 'Image', id: 5, exists: true }
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
            "author": {
              "firstName": "Dan",
              "id": "9",
              "lastName": "Gebhardt",
              "twitter": "dgeb"
            },
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

    it("export unexisting & existing entities", function() {

      var image = this.image.create({
        title: 'Amiga 1200'
      });

      image.get('tags').push(this.tag.create({ id: 1, name: 'Computer' }, { exists: true }));
      image.get('tags').push(this.tag.create({ id:2, name: 'Science' }, { exists: true }));
      image.set('gallery', { name: 'Gallery 1' });

      this.payload.set(image, { embed: true });

      var item = this.payload.export(undefined, this.image)[0];

      expect(item.data()).toEqual({
        gallery_id: null,
        title: 'Amiga 1200',
        gallery: {
          name: 'Gallery 1'
        },
        images_tags: [
          {
            tag_id: 1,
            tag: {
              id: 1,
              name: 'Computer'
            }
          },
          {
            tag_id: 2,
            tag: {
              id: 2,
              name: 'Science'
            }
          }
        ],
        tags: [
          {
            id: 1,
            name: 'Computer'
          },
          {
            id: 2,
            name: 'Science'
          }
        ]
      });

      expect(item.exists()).toBe(false);
      expect(item.get('gallery').exists()).toBe(false);
      expect(item.get('images_tags').get(0).exists()).toBe(false);
      expect(item.get('images_tags').get(1).exists()).toBe(false);
      expect(item.get('tags').get(0).exists()).toBe(true);
      expect(item.get('tags').get(1).exists()).toBe(true);

    });

  });

  describe(".serialize()", function() {

    it("serializes an empty payload", function() {

      expect(this.payload.serialize()).toEqual({
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

      this.payload.set(image, { embed: true });
      expect(this.payload.data()).toEqual({
        type: 'Image',
        exists: false,
        attributes: {
          title: 'Amiga 1200',
          gallery_id: null
        },
        relationships: {
          gallery: {
            data: {
              type: 'Gallery',
              exists: false,
              attributes: {
                name: 'Gallery 1'
              }
            }
          },
          images_tags: {
            data: [
              {
                type: 'ImageTag',
                exists: false,
                attributes: {
                  tag_id: null
                },
                relationships: {
                  tag: {
                    data: {
                      type: 'Tag',
                      exists: false,
                      attributes: {
                        name: 'Computer'
                      }
                    }
                  }
                }
              },
              {
                type: 'ImageTag',
                exists: false,
                attributes: {
                  tag_id: null
                },
                relationships: {
                  tag: {
                    data: {
                      type: 'Tag',
                      exists: false,
                      attributes: {
                        name: 'Science'
                      }
                    }
                  }
                }
              }
            ]
          }
        }
      });

      expect(this.payload.included()).toEqual([]);

      expect(this.payload.embedded()).toEqual(['gallery', 'images_tags.tag']);

    });

    it("serializes unexisting & existing entities", function() {

      var image = this.image.create({
        title: 'Amiga 1200'
      });

      image.get('tags').push(this.tag.create({ id: 1, name: 'Computer' }, { exists: true }));
      image.get('tags').push(this.tag.create({ id:2, name: 'Science' }, { exists: true }));
      image.set('gallery', { name: 'Gallery 1' });

      this.payload.set(image, { embed: true });

      expect(this.payload.data()).toEqual({
        type: 'Image',
        exists: false,
        attributes: {
          title: 'Amiga 1200',
          gallery_id: null
        },
        relationships: {
          gallery: {
            data: {
              type: 'Gallery',
              exists: false,
              attributes: {
                name: 'Gallery 1'
              }
            }
          },
          images_tags: {
            data: [
              {
                type: 'ImageTag',
                exists: false,
                attributes: {
                  tag_id: 1
                },
                relationships: {
                  tag: {
                    data: {
                      type: 'Tag',
                      id: 1,
                      exists: true
                    }
                  }
                }
              },
              {
                type: 'ImageTag',
                exists: false,
                attributes: {
                  tag_id: 2
                },
                relationships: {
                  tag: {
                    data: {
                      type: 'Tag',
                      id: 2,
                      exists: true
                    }
                  }
                }
              }
            ]
          }
        }
      });

      expect(this.payload.included()).toEqual([
        {
          type: 'Tag',
          id: 1,
          exists: true,
          attributes: {
            name: 'Computer'
          }
        },
        {
          type: 'Tag',
          id: 2,
          exists: true,
          attributes: {
            name: 'Science'
          }
        }
      ]);

      expect(this.payload.embedded()).toEqual(['gallery', 'images_tags.tag']);

    });

    it("serializes existing entities", function(done) {

      co(function*() {
        yield this.fixtures.populate('gallery');
        yield this.fixtures.populate('image');
        yield this.fixtures.populate('image_tag');
        yield this.fixtures.populate('tag');

        var image = yield this.image.load(1, { embed: ['gallery', 'tags'] });

        this.payload.set(image, { embed: true });

        expect(this.payload.isCollection()).toBe(false);

        expect(this.payload.data()).toEqual({
          type: 'Image',
          id: 1,
          exists: true,
          attributes: {
            gallery_id: 1,
            name: 'amiga_1200.jpg',
            title: 'Amiga 1200'
          },
          relationships: {
            gallery: {
              data: {
                type: 'Gallery',
                id: 1,
                exists: true
              }
            },
            images_tags: {
              data: [{
                type: 'ImageTag',
                id: 1,
                exists: true
              }, {
                type: 'ImageTag',
                id: 2,
                exists: true
              }]
            }
          }
        });

        expect(this.payload.included()).toEqual([
          {
            type: 'Gallery',
            id: 1,
            exists: true,
            attributes: {
              name: 'Foo Gallery'
            }
          }, {
            type: 'Tag',
            id: 1,
            exists: true,
            attributes: {
              name: 'High Tech'
            }
          }, {
            type: 'ImageTag',
            id: 1,
            exists: true,
            attributes: {
              image_id: 1,
              tag_id: 1
            },
            relationships: {
              tag: {
                data: {
                  type: 'Tag',
                  id: 1,
                  exists: true
                }
              }
            }
          }, {
            type: 'Tag',
            id: 3,
            exists: true,
            attributes: {
              name: 'Computer'
            }
          }, {
            type: 'ImageTag',
            id: 2,
            exists: true,
            attributes: {
              image_id: 1,
              tag_id: 3
            },
            relationships: {
              tag: {
                data: {
                  type: 'Tag',
                  id: 3,
                  exists: true
                }
              }
            }
          }
        ]);

        expect(this.payload.embedded()).toEqual(['gallery', 'images_tags.tag']);

        done();
      }.bind(this));

    });

    it("doesn't duplicate included data", function(done) {
      co(function*() {
        yield this.fixtures.populate('gallery');
        yield this.fixtures.populate('image');
        yield this.fixtures.populate('image_tag');
        yield this.fixtures.populate('tag');

        var image1 = yield this.image.load(1, { embed: ['gallery', 'tags'] });
        var image4 = yield this.image.load(4, { embed: ['gallery', 'tags'] });

        this.payload.set(this.image.create([image1, image4], {type: 'set'}), { embed: true });

        expect(this.payload.isCollection()).toBe(true);

        expect(this.payload.data()).toEqual([
          {
            type: 'Image',
            id: 1,
            exists: true,
            attributes: {
              gallery_id: 1,
              name: 'amiga_1200.jpg',
              title: 'Amiga 1200'
            },
            relationships: {
              gallery: {
                data: {
                  type: 'Gallery',
                  id: 1,
                  exists: true
                }
              },
              images_tags: {
                data: [{
                  type: 'ImageTag',
                  id: 1,
                  exists: true
                }, {
                  type: 'ImageTag',
                  id: 2,
                  exists: true
                }]
              }
            }
          }, {
            type: 'Image',
            id: 4,
            exists: true,
            attributes: {
              gallery_id: 2,
              name: 'silicon_valley.jpg',
              title: 'Silicon Valley'
            },
            relationships: {
              gallery: {
                data: {
                  type: 'Gallery',
                  id: 2,
                  exists: true
                }
              },
              images_tags: {
                data: [{
                  type: 'ImageTag',
                  id: 5,
                  exists: true
                }, {
                  type: 'ImageTag',
                  id: 6,
                  exists: true
                }, {
                  type: 'ImageTag',
                  id: 7,
                  exists: true
                }]
              }
            }
          }
        ]);

        expect(this.payload.included()).toEqual([
          {
            type: 'Gallery',
            id: 1,
            exists: true,
            attributes: {
              name: 'Foo Gallery'
            }
          }, {
            type: 'Tag',
            id: 1,
            exists: true,
            attributes: {
              name: 'High Tech'
            }
          }, {
            type: 'ImageTag',
            id: 1,
            exists: true,
            attributes: {
              image_id: 1,
              tag_id: 1
            },
            relationships: {
              tag: {
                data: {
                  type: 'Tag',
                  id: 1,
                  exists: true
                }
              }
            }
          }, {
            type: 'Tag',
            id: 3,
            exists: true,
            attributes: {
              name: 'Computer'
            }
          }, {
            type: 'ImageTag',
            id: 2,
            exists: true,
            attributes: {
              image_id: 1,
              tag_id: 3
            },
            relationships: {
              tag: {
                data: {
                  type: 'Tag',
                  id: 3,
                  exists: true
                }
              }
            }
          }, {
            type: 'Gallery',
            id: 2,
            exists: true,
            attributes: {
              name: 'Bar Gallery'
            }
          }, {
            type: 'Tag',
            id: 6,
            exists: true,
            attributes: {
              name: 'City'
            }
          }, {
            type: 'ImageTag',
            id: 5,
            exists: true,
            attributes: {
              image_id: 4,
              tag_id: 6
            },
            relationships: {
              tag: {
                data: {
                  type: 'Tag',
                  id: 6,
                  exists: true
                }
              }
            }
          }, {
            type: 'ImageTag',
            id: 6,
            exists: true,
            attributes: {
              image_id: 4,
              tag_id: 3
            },
            relationships: {
              tag: {
                data: {
                  type: 'Tag',
                  id: 3,
                  exists: true
                }
              }
            }
          }, {
            type: 'ImageTag',
            id: 7,
            exists: true,
            attributes: {
              image_id: 4,
              tag_id: 1
            },
            relationships: {
              tag: {
                data: {
                  type: 'Tag',
                  id: 1,
                  exists: true
                }
              }
            }
          }

        ]);

        done();
      }.bind(this));
    });

    it("doesn't embed any data by default", function(done) {

      co(function*() {
        yield this.fixtures.populate('gallery');
        yield this.fixtures.populate('image');
        yield this.fixtures.populate('image_tag');
        yield this.fixtures.populate('tag');

        var image = yield this.image.load(1, { embed: ['gallery', 'tags'] });

        this.payload.set(image);

        expect(this.payload.isCollection()).toBe(false);

        expect(this.payload.data()).toEqual({
          type: 'Image',
          id: 1,
          exists: true,
          attributes: {
            gallery_id: 1,
            name: 'amiga_1200.jpg',
            title: 'Amiga 1200'
          }
        });

        expect(this.payload.included()).toEqual([]);
        done();
      }.bind(this));

    });

    it("serializes collections", function(done) {

      co(function*() {
        yield this.fixtures.populate('image');

        var images = yield this.image.find().where({ id: [1 , 2] }).all();
        images.meta({ count: 10 });

        this.payload.set(images, { embed: true });

        expect(this.payload.isCollection()).toBe(true);

        expect(this.payload.data()).toEqual([
          {
            type: 'Image',
            id: 1,
            exists: true,
            attributes: {
              gallery_id: 1,
              name: 'amiga_1200.jpg',
              title: 'Amiga 1200'
            }
          }, {
            type: 'Image',
            id: 2,
            exists: true,
            attributes: {
              gallery_id: 1,
              name: 'srinivasa_ramanujan.jpg',
              title: 'Srinivasa Ramanujan'
            }
          }
        ]);

        expect(this.payload.included()).toEqual([]);

        expect(this.payload.meta()).toEqual({ count: 10 });

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

    it("doesn't filters out `null` values", function() {

      var image = this.image.create({
        id: 1,
        gallery_id: 0,
        name: null,
        title: ''
      }, { exists: true });

      this.payload.set(image, { embed: true });

      expect(this.payload.data()).toEqual({
        type: 'Image',
        id: 1,
        exists: true,
        attributes: {
          gallery_id: 0,
          name: null,
          title: ''
        }
      });

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

      expect(payload.included()).toEqual([
        {
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
        }
      ]);

      expect(payload.embedded()).toEqual(['author', 'comments.author']);

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