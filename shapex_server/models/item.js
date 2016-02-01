var mongoose = require('mongoose');

var ItemSchema = new mongoose.Schema({
    _id: {type: String},
	name: {type: String},
	format: {type: String},
	url : {type: String},
}, {collection: 'first'});

var Item = mongoose.model('Item', ItemSchema);

module.exports = Item;