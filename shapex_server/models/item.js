var mongoose = require('mongoose');

var ItemSchema = new mongoose.Schema({
    url: {type: String},
	file_type: {type: String},
	descriptor: {type: String},
	properties: {type: mongoose.Schema.Types.Mixed},
    thumbnail: {type: mongoose.Schema.Types.Mixed}
}, {collection: 'first'});

var Item = mongoose.model('Item', ItemSchema);

module.exports = Item;