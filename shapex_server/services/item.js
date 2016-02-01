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
	console.log('list all items contain '+ key);
    Item.find({name:{'$regex': key, '$options': 'i'}}, function(err, items) {
        if (err) {
            errback(err);
            return;
        }
		console.log('find: '+items.length);
        callback(items);
    });
};

exports.index = function(options, callback, errback) {
	console.log('index model to database.');
	Item.create(options, function(err,items){
		if (err) {
			errback(err);
			return;
		}
		console.log('index: '+items.length);
		callback(items);
	});
};