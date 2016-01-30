/*
shapex worker
pull the task from shapex server and execute the tasks
*/
var http = require('http');
var nconf = require('nconf');
var request = require('request');
var util = require('util');
var url = require('url');
var path = require('path');
var fs = require('fs');
var spawnSync = require('child_process').spawnSync;

nconf.argv().env().file({file: __dirname + '/config.json'});

var build = nconf.get('build');
var serverConf = nconf.get(build);
var shapexServer = serverConf.shapex;
var workFolder = nconf.get('work_folder');
var indexFolder = nconf.get('index_folder');
var amr = nconf.get('executable');

var workerServer = serverConf.workerServer;
var workerServerHostName = url.parse(workerServer).hostname;
var workerServerPort = url.parse(workerServer).port;
console.log('worker http server: ' + workerServerHostName + ' port: ' + workerServerPort);

var isTaskRunning = false;
var pollInterval = nconf.get('interval');


/* 
ModelManager maintain the model id to signature files
*/
function ModelManager() {
	ModelManager.prototype.models = {};
}
var modelManager = new ModelManager();

// https://nodejs.org/api/all.html#all_settimeout_cb_ms
setTimeout(function() { pollTaskFromShapeXServer(false);}, 1); 

var pollTaskFromShapeXServer = function(index) {
	console.log('running pollTaskFromShapeXServer');
	if(isTaskRunning){
		setTimeout(function(){pollTaskFromShapeXServer(index);}, pollInterval);
		console.log('task running, polling every'+pollInterval+'ms');
		return;
	}

	index = !index;
	var pollurl = shapexServer;
	if (index === true) {
		pollurl += '/api/1.0/indextasks';
		console.log("trying to get an active indextask from shapexServer: " + pollurl);
	}
	else {
		pollurl += '/api/1.0/tasks';
		console.log("trying to get an active task from shapexServer: " + pollurl);
	}
	
	request(pollurl, function (error, response, body) {
	 	if (!error && response.statusCode == 200) {
			isTaskRunning = true;
			console.log('tasks queried:'+util.inspect(body));
			var tasks = JSON.parse(body);
			if (tasks.length > 0) {
				console.log('launching new signature creation task');
				if (tasks.length > 1) {
					console.log('more than one task is not allowed');
				}
				console.log('the task object is' + util.inspect(tasks[0]));
				
				var modelId = tasks[0]._id;
				var modelName = tasks[0].sourcename;
				var modelPath = tasks[0].sourcepath;
				
				// make model id folder and download model
				var modelFolder;
				if (index === true) {
					modelFolder = path.join(indexFolder, modelId);
				} else {
					modelFolder = path.join(workFolder, modelId); 
				}
					
				if(!fs.existsSync(modelFolder)) {
					fs.mkdirSync(modelFolder);
				}
			
				// download model and create signature
				var downloadDir = path.join(modelFolder, path.basename(modelName));
				var downloadedModel = fs.createWriteStream(downloadDir);	
				var pollurl = shapexServer + '/api/1.0/download/' + path.basename(modelPath);
				console.log('download file from' + pollurl);
				request.get(pollurl).pipe(downloadedModel);
				downloadedModel.on('finish', function () {
					console.log('running amr with cwd: ' + modelFolder);
					var filePath = downloadDir;
					console.log(amr, filePath);
					var generator = spawnSync(amr, [filePath], { cwd: modelFolder, encoding: 'utf8' }, function (err, stdout, stderr){
						console.log('fail to create signature for '+filePath);
					});
					
					// check generate files
					var filename = path.parse(filePath).name;
					var descriptorfilename = filename+'.txt';
					var thumnailfilename = filename+'.png';
					var propsfilename = filename+'.props';
					var viewfilename = filename+'.json';
					var descriptor = path.join(modelFolder, descriptorfilename);
					var thumbnail = path.join(modelFolder, thumnailfilename);
					var props = path.join(modelFolder, propsfilename);
					var view = path.join(modelFolder, viewfilename);
					
					// update model manager
			        var status = 'fail';
			        var downloadurl = '';
			        if (fs.existsSync(descriptor) 
						&& fs.existsSync(thumbnail) 
					    && fs.existsSync(props) 
						&& fs.existsSync(view)) 
					{
						status = 'succeed';
						downloadurl = workerServer+ 'signature';
			            modelManager[modelId] = { 'descriptor' : descriptor, 'thumbnail' : thumbnail, 'properties' : props, 'view' : view };
			        }
					
					var postStatus = shapexServer;
					if (index === true) {
						postStatus += '/api/1.0/worker_status?id='+ modelId + '&indexstatus=' + status + '&downloadurl=' + downloadurl;
					} else {
						postStatus += '/api/1.0/worker_status?id='+ modelId + '&status=' + status + '&downloadurl=' + downloadurl;
					}
			        console.log('post result to shapex server: ' + postStatus);
			        request.post(postStatus, function (res) {
			            console.log(util.inspect(res));
			        });
				});
			}
	    
			isTaskRunning = false;
		}
	 	else {
	 	    console.log('try to get an active task from webserver failed, error info:' + error);
	 	}
	});
	setTimeout(function(){pollTaskFromShapeXServer(index);}, pollInterval);
}

/*
Server for 
*/
http.createServer(function (req, res) {
	console.log('request url is: ' + req.url);
	// http://nodejs.cn/api/url.html#url_url_parse_urlstr_parsequerystring_slashesdenotehost
	var parsedUrl = url.parse(req.url, true); 
	if (parsedUrl.pathname != '/signature') {
		res.status(404).send('invalid request');
		return;
	}
	
	if (parsedUrl.query.thumbnail != undefined)
	{
		if (req.method === 'GET'){
			var modelId = parsedUrl.query.thumbnail;
			console.log('the thumbnail to query is: ' + modelId);
			if(modelManager[modelId]) {
				var file = modelManager[modelId].thumbnail;
				var filename = path.basename(file);
				console.log('download thumbnail of '+filename);
				res.setHeader('Content-disposition', 'attachment; filename=' + filename);
				var fileStream = fs.createReadStream(file);
				fileStream.pipe(res);
			}
		}		
	} else if (parsedUrl.query.descriptor != undefined) {
		if (req.method === 'GET'){
			var modelId = parsedUrl.query.descriptor;
			console.log('the descriptor to query is: ' + modelId);
			if(modelManager[modelId]) {
				var file = modelManager[modelId].descriptor;
				var filename = path.basename(file);
				console.log('download descriptor of '+filename);
				res.setHeader('Content-disposition', 'attachment; filename=' + filename);
				var fileStream = fs.createReadStream(file);
				fileStream.pipe(res);
			}
		}
	} else if (parsedUrl.query.properties != undefined) {
			if (req.method === 'GET'){
				var modelId = parsedUrl.query.properties;
				console.log('the properties to query is: ' + modelId);
				if(modelManager[modelId]) {
					var file = modelManager[modelId].properties;
					var filename = path.basename(file);
					console.log('download properties of '+filename);
					res.setHeader('Content-disposition', 'attachment; filename=' + filename);
					var fileStream = fs.createReadStream(file);
					fileStream.pipe(res);
				}
			}
	} else if (parsedUrl.query.view != undefined) {
		if (req.method === 'GET'){
			console.log('the view to query is: ' + modelId);
			if(modelManager[modelId]) {
				var file = modelManager[modelId].view;
				var filename = path.basename(file);
				console.log('download view of '+filename);
				res.setHeader('Content-disposition', 'attachment; filename=' + filename);
				var fileStream = fs.createReadStream(file);
				fileStream.pipe(res);
			}
		}
	} else {
		res.status(404).send('invalid request.');
	}
		
}).listen(workerServerPort,workerServerHostName);
console.log('Worker HTTP Server running at ' + workerServer);