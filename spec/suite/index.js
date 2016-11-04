Promise = require('bluebird');

import 'babel-polyfill';
import { Model } from 'chaos-orm';
import { Schema } from 'chaos-database';

Model.definition(Schema);

require('./payload-spec');
