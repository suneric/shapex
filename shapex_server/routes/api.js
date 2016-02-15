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
var readline = require('readline');

var uuid = require('node-uuid');

router.get('/', function(req, res, next) {
	res.status(200).json('success');
});

/*
search all the items in data base with key words in name. 
*/
router.get('/search/:key', function(req, res, next) {
	var key = req.params.key;
	console.log("result of search: "+key);
	Item.search(key, function(items) {
		console.log('search return: ' + items);
        res.status(200).json(items);
    }, function(err) {
		console.log('err search.');
        res.status(400).json(err);
    });
});

/*
for worker get task one by one.
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
router.get('/download/:filename', function(req, res, next){
	console.log('download get request:');
	var name = req.params.filename;
	var file = "upload/"+name;
	console.log('download source file '+ file);
	res.setHeader('Content-disposition', 'attachment; filename=' + name);
	var fileStream = fs.createReadStream(file);
	fileStream.pipe(res);
});

/*
for front-end upload a file
create a worker task for uploaded file with work type as 'upload'
{
	type: 'upload',
	_id: ,
	name:,
	path:,
} 
*/
router.post('/upload', function(req, res, next) {
	console.log('upload post request:');
	var form = new formidable.IncomingForm();
    form.uploadDir = "./upload";  
    form.keepExtensions = true;
    form.multiples = false;
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
			//var fileName = uploadFile.name;
			//fileName.replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>\{\}\[\]\\\/]/gi, '');
			//console.log(uploadFile.name+ ' is replaced to ' +fileName);
			
			// create a task with a uniuqe id.
			var id = uuid.v4();
			var task = { type: 'upload', _id: id, name: uploadFile.name, path: uploadFile.path };
			taskmanager.Push(task);
			console.log('create a task for '+ id);
		
			// add the model to model manager
			var model = {'status' : 'unavailable', 'name': '', 'downloadurl':''}
			modelmanager.models[id] = model;
			console.log('append ' + id + ' to modelmanager: ' + model);
		
			res.status(200).json(id);
		}
    });
});

/*
for worker post status
*/
router.post('/work_status', function(req, res, next) {
	console.log('work_status post request:');
	var queryParams = url.parse(req.url, true).query;
	console.log(util.inspect(queryParams));
	
	var modelId = queryParams.id;
	var modelName = queryParams.name;
	var downloadUrl = queryParams.downloadurl;
	if (queryParams.status != undefined) {
		console.log('work status of '+modelId+ ' is '+ queryParams.status);
		if( modelmanager.models[modelId]){
			modelmanager.models[modelId].status = queryParams.status;
			modelmanager.models[modelId].name = modelName;
			modelmanager.models[modelId].downloadurl = downloadUrl;
			console.log('update '+ modelId + ' status is done.');
			res.status(200).send(modelmanager.models[modelId]);
		} else{
			console.log('update '+ modelId + ' is failed.');
			res.status(404).send('model is not found');
		}	
	}
});

// for front-end check worker status 
// succeed, fail, inprogress, unavailable, compare
router.get('/worker_status/:id', function (req, res, next) {
    console.log('worker_status get request:');
	var modelId = req.params.id;
	console.log('worker status for id: '+modelId);
	if (modelmanager.models[modelId]) {
		var workstatus = modelmanager.models[modelId].status;
		var name = modelmanager.models[modelId].name;
		var downloadurl = modelmanager.models[modelId].downloadurl;
		console.log(modelId+ ' is '+workstatus);
		res.status(200).send({'status' : workstatus, 'downloadurl' : downloadurl, 'name' : name});
	}
	else{
		console.log(modelId+ ' is unavailable.');
		res.status(200).send({'status' : 'unavailable', 'downloadurl' : '', 'name' : ''});
	}
});

/*
for front-end index a file
create a worker task for uploaded file with work type as 'index'
{
	type: 'index',
	_id: ,
	name:,
	path:,
} 
*/
router.post('/index', function(req, res, next) {
	console.log('index post request:');
	var form = new formidable.IncomingForm();
    form.uploadDir = "./upload";  
    form.keepExtensions = true;
    form.multiples = false;
    form.parse(req, function(err, fields, files) {
    	var uploadFile = files.file;
		console.log(util.inspect(fields) + util.inspect(files));
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
			var task = { type: 'index', _id: id, name: uploadFile.name, path: uploadFile.path };
			taskmanager.Push(task);
			console.log('create a index task for '+ id);
			res.status(200).json(id);
		}
    });
});

router.post('/index_status', function(req, res, next) {
	console.log('index_status post request:');
	var queryParams = url.parse(req.url, true).query;
	var modelId = queryParams.id;
	var modelName = queryParams.name;
	var modelExt = queryParams.ext;
	var downloadUrl = queryParams.downloadurl;
	console.log('index status of '+modelId+ ' is '+ queryParams.status);
	if (queryParams.status === 'succeed') {
		// save the information to mongodb
		var options = {
			_id : modelId,
			name :  modelName,
			format : modelExt.substr(1, modelExt.length),
			url : downloadUrl
		};
		
		Item.index(options, function(items){
			console.log(items + ' is indexed');
		});
	}
});

/*
for front-end compare a file
create a worker task for uploaded file with work type as 'compare'
{
	type: 'compare',
	_id: ,
	name:,
	items:,
}
*/
router.post('/compare', function(req, res, next){
	console.log('compare post request.');
	var queryParams = url.parse(req.url, true).query;
	var modelId = queryParams.id;
	var modelName = queryParams.name;
	// find all item in the database
	// and make a compare task
	Item.list(function(data) {
		console.log('create a compare task for '+ modelId);
		var task = {type: 'compare', _id: modelId, name: modelName, items: data};
		taskmanager.Push(task);
        res.status(200).json(modelId);
    }, function(err) {
		console.log('err search.');
        res.status(404).json(err);
    });
});

/*
for worker to post compare status
*/
router.post('/compare_status', function(req, res, next) {
	console.log('compare_status post request:');
	var queryParams = url.parse(req.url, true).query;
	console.log(util.inspect(queryParams));
	
	var modelId = queryParams.id;
	var compareStatus = queryParams.status;
	if( modelmanager.models[modelId]){
		modelmanager.models[modelId].status = compareStatus;
		console.log('update '+ modelId + ' comapre status is done.');
		console.log(util.inspect(modelmanager.models[modelId]));
		res.status(200).send(modelmanager.models[modelId]);
	} else {
		console.log('update '+ modelId + ' compare status is failed.');
		res.status(404).send('model is not found');
	}	
});

/*
for front end to query compare status
*/
router.get('/compare_status/:id', function(req, res, next) {
	console.log('compare_status get request:');
	var modelId = req.params.id;
	var model = modelmanager.models[modelId];
	if(model && model.status === 'compare') {
		var modelName = model.name;
		var workStatus = model.status;
		var downloadUrl = model.downloadurl;
		var type = 'compare';
		var compareUrl = downloadUrl+'/signature?id='+modelId+'&name='+modelName+'&type='+type+'&ext=.compare';
		console.log('download compare file from '+ compareUrl);
		
		var compareFolder = path.join(__dirname, '../compare');
		var compareName = modelId+'.txt';
		var compareFile = path.join(compareFolder, compareName);
		console.log('download compare file to '+compareFile);
			
		var downloadCompare = fs.createWriteStream(compareFile);
		request.get(compareUrl).pipe(downloadCompare);
		downloadCompare.on('finish', function () {
			if (fs.existsSync(compareFile)) {
				var compareList = [];
				// read compare result from the file
				var rl = readline.createInterface({
					input: fs.createReadStream(compareFile),
					output: process.stdout,
					terminal: false
				});

				rl.on('line', function(line) {
					console.log('read line '+line);
					// parse line : {value: xxx, file: xxx.txt}
					var valueIndex = line.indexOf('value:')+6;
					var fileIndex = line.indexOf('file:')+5;
					var similarity = line.substr(valueIndex, line.indexOf(',')-valueIndex);
					var fileName = line.substr(fileIndex, line.length-fileIndex-1);
					console.log(fileName + ' value is ' + similarity);
					
					// parse id , name 
					var fileDir = path.dirname(fileName);
					var baseName = path.basename(fileName, '.txt');
					var dirNames = fileDir.split(path.sep);
					var modelId = dirNames[dirNames.length-1];
					console.log('Id: '+modelId +' Name: '+ baseName +' similarity is '+ similarity);
					
					var itemData = {
						_id : modelId,
						name : baseName,
						format : '',
						url : downloadUrl
					}					
					
					compareList.push(itemData);
				}).on('close', function() {
					// return data
					compareList.reverse();
					console.log('finsh reading compare result file.');
					res.status(200).send({'status' : workStatus, data : compareList});
				});
			} else {
				console.log('fail to download compare result file.');
				res.status(200).send({'status' : 'unavailable', data : []});
			}
		});
	} else {
		console.log('compare file is not available.');
		res.status(200).send({'status' : 'unavailable', data : []});
	}
});



/*
Preview request
/Preview?id=xxx&type=xxx&name=xxx&url=xxx&name
type : upload, index
*/
router.get('/preview', function(req, res, next) {
	console.log('preview get request:');
	var parsedUrl = url.parse(req.url, true); 
	var modelId = parsedUrl.query.id;
	var type = parsedUrl.query.type;
	var name = parsedUrl.query.name;
	var downloadUrl = parsedUrl.query.downloadurl;

	var thumbnailpath = '/images/'+modelId+'.png';
	
	var previewFolder = './public/images';
	var previewFile = path.join(previewFolder, modelId+'.png');
	if (fs.existsSync(previewFile)){
		res.status(200).send({'url': thumbnailpath});
	} else {
		// download load thumbnail from worker
		var thumbnailUrl = downloadUrl+'/signature?id='+modelId+'&name='+name+'&type='+type+'&ext=.png';
		console.log('download thumbnail from '+ thumbnailUrl);
		var downloadThumbnail = fs.createWriteStream(previewFile);
		request.get(thumbnailUrl).pipe(downloadThumbnail);
		downloadThumbnail.on('finish', function () {
			if (fs.existsSync(previewFile)) {
				console.log('downloaded thumbnail to '+previewFile);
				res.status(200).send({'url': thumbnailpath});
			}
			else {
				console.log('fail to preview.');
				res.status(304).send('fail to preview.');
			}
		});
	}
});

module.exports = router;