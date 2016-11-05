var Model = require('chaos-orm').Model;
var Image = require('./image');
var Tag = require('./tag');

class ImageTag extends Model {
  static _define(schema) {
    schema.column('id', { type: 'serial' });
    schema.column('image_id', { type: 'integer' });
    schema.column('tag_id', { type: 'integer' });

    schema.belongsTo('image', 'Image', { keys: { image_id: 'id' } });
    schema.belongsTo('tag', 'Tag', { keys: { tag_id: 'id' } });
  }
}

ImageTag.register();

module.exports = ImageTag;
