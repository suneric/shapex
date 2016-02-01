var request = require('request');
var path = require('path');
var fs = require('fs');
var FormData = require('form-data');

var shapex_server = 'http://localhost:8080';
var failure = [];

var index_folder = process.argv[2];
var finder = require('findit')(index_folder);
finder.on('file', function(file, stat) {
	console.log('index file: ' + file);
	index(file);
});

var index = function(file) {
	var indexurl = shapex_server+'/api/1.0/index';
	console.log(indexurl);
	
	var form = new FormData();
	form.append('file', fs.createReadStream(file));
	form.submit(indexurl, function(err, res){
		console.log(res);
	});
	
	/*
	var req = request.post(indexurl, function(err, res, body){
		if (err) {
			console.log('Error!');
			failure.push(file);
		} 
			
		console.log('server respond: ' + body);
	});
	*/
	
};