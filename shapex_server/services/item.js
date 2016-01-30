var Item = require('../models/item');

exports.list = function(callback, errback) {
    Item.find(function(err, items) {
        if (err) {
			console.log('item-list: failed');
            errback(err);
            return;
        }
        callback(items);
    });
};

exports.search = function(key, callback, errback) {
	console.log("list all items contain "+ key);
    Item.find({format:key}, function(err, items) {
        if (err) {
            errback(err);
            return;
        }
		console.log("find: "+items.length);
        callback(items);
    });
};