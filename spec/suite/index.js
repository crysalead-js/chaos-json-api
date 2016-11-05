Promise = require('bluebird');

var Model = require('chaos-orm').Model;
var Schema = require('chaos-database').Schema;

Model.definition(Schema);

require('./payload-spec');
