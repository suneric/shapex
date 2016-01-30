var express = require('express');
var Item = require('../services/item');
var router = express.Router();
var util = require('util');
var url = require('url');
var path = require('path');
var fs = require('fs');
var formidable = require('formidable')
var taskmanager = require('../models/taskmanager');
var modelmanager = require('../models/modelmanager');
var request = require('request');

var uuid = require('node-uuid');

router.get('/', function(req, res, next) {
	res.status(200).json('success');
});

router.get('/search/:key', function(req, res, next) {
	var key = req.params.key;
	console.log("result of search: "+key);
	Item.search(key, function(items) {
        res.status(200).json(items);
    }, function(err) {
        res.status(400).json(err);
    });
});

/*
for worker get task
*/
router.get('/tasks', function(req, res, next) {
	console.log("tasks get request:");
	var task = taskmanager.Pop();
	console.log(util.inspect(task));
	res.status(200).json(task);
});

/*
for worker download source file
*/
router.get('/download/:id', function(req, res, next){
	console.log('download get request:');
	var filename = req.params.id;
	var file = "upload/"+filename;
	console.log('download source file '+ file);
	res.setHeader('Content-disposition', 'attachment; filename=' + filename);
	var fileStream = fs.createReadStream(file);
	fileStream.pipe(res);
});

/*
for front-end upload a file
*/
router.post('/upload', function(req, res, next) {
	console.log('upload post request:');
	var form = new formidable.IncomingForm();
    form.uploadDir = "./upload";  
    form.keepExtensions = true;
    form.multiples = false; // we are not ready on multiple support
    form.parse(req, function(err, fields, files) {
    	var uploadFile = files.file;
		if (uploadFile === undefined){
			console.log('upload failed.');
			res.send(err);
			return;
		} else {
			if (uploadFile.name === undefined) {
				console.log("upload failed.");
				res.send(err);
				return;
			}
		
			console.log("upload success: "+uploadFile.path); 
			
			// create a task with a uniuqe id.
			var id = uuid.v4();
			var task = { _id: id, sourcename: uploadFile.name, sourcepath: uploadFile.path };
			taskmanager.Push(task);
			console.log('create a task for '+ id);
		
			// add the model to model manager
			var model = {'status' : 'unavailable', 'downloadurl':''}
			modelmanager.models[id] = model;
			console.log('append ' + id + ' to modelmanager: ' + model);
		
			res.status(200).json(id);
		}
    });
});

/*
for worker post status
*/
router.post('/worker_status', function(req, res, next) {
	console.log('worker_status post request:');
	var queryParams = url.parse(req.url, true).query;
	var modelId = queryParams.id;
	var workstatus = queryParams.status;
	var downloadurl = queryParams.downloadurl;
	console.log(util.inspect(queryParams));
	
	if( modelmanager.models[modelId]){
		modelmanager.models[modelId].status = workstatus;
		modelmanager.models[modelId].downloadurl = downloadurl;
		console.log('update '+ modelId + ' status is done.');
		res.status(200).send(modelmanager.models[modelId]);
	}
	else{
		console.log('update '+ modelId + ' is failed.');
		res.status(404).send('model is not found');
	}
});

// for front-end check worker status 
// succeed, fail, inprogress, unavailable
router.get('/worker_status/:id', function (req, res, next) {
    console.log('worker_status get request:');
	var modelId = req.params.id;
	console.log('worker status for id: '+modelId);
	if (modelmanager.models[modelId]) {
		var workstatus = modelmanager.models[modelId].status;
		var downloadurl = modelmanager.models[modelId].downloadurl;
		if (workstatus === 'succeed' && downloadurl !== '') {
			console.log(modelId+ ' is succeed.');
			res.status(200).send('succeed');
		}
		else 
		{
			if (workstatus === 'fail'){
				console.log(modelId+ ' is failed.');
				res.status(200).send('fail');
			} else {
				console.log(modelId+ ' is inprogress.');
				res.status(200).send('inprogress');
			}
		}
	}
	else{
		console.log(modelId+ ' is unavailable.');
		res.status(200).send('unavailable');
	}
});

router.get('/preview/:id', function(req, res, next) {
	console.log('preview get request:');
	console.log(req.params);
	var modelId = req.params.id;
	console.log('preview for id: '+modelId);
	if (modelmanager.models[modelId]) {
		var previewFolder = './public/images';
		var previewdir = path.join(previewFolder, modelId+'.png');
		var thumbnailurl = modelmanager.models[modelId].downloadurl;
		thumbnailurl+='?thumbnail='+modelId;
		console.log('download thumbnail from '+ thumbnailurl);
		
		// download load thumbnail from worker
		var downloadThumbnail = fs.createWriteStream(previewdir);
		request.get(thumbnailurl).pipe(downloadThumbnail);
		downloadThumbnail.on('finish', function () {
			if (fs.existsSync(previewdir)) {
				console.log('downloaded thumbnail to '+previewdir);
				var thumbnailpath = '/images/'+modelId+'.png';
				res.status(200).send({'url': thumbnailpath});
			}
			else {
				res.status(304).send('fail to preview.');
			}
		});
	}
	else {
		res.status(404).send('preview not found.');
	}
});

module.exports = router;