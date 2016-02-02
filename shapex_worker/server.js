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

var currentdir = __dirname;
var workFolder = path.join(currentdir, nconf.get('work_folder'));
var indexFolder = path.join(currentdir, nconf.get('index_folder'));

var build = nconf.get('build');
var serverConf = nconf.get(build);
var shapexServer = serverConf.shapex;
var amr = nconf.get('executable');

var workerServer = serverConf.workerServer;
var workerServerHostName = url.parse(workerServer).hostname;
var workerServerPort = url.parse(workerServer).port;

console.log('worker http server: ' + workerServerHostName + ' port: ' + workerServerPort);

var isTaskRunning = false;
var pollInterval = nconf.get('interval');

/* 
get file extension
*/
function FileFormat(ext) {
	return ext.substr(1, ext.length);
}

function ModelFolder(modelId, workType) {
	if (workType === 'index') {
		return path.join(indexFolder, modelId);
	} else {
		return path.join(workFolder, modelId);
	}
}

setTimeout(function() { pollTaskFromShapeXServer();}, 1); 

var pollTaskFromShapeXServer = function() {
	console.log('running pollTaskFromShapeXServer');
	if(isTaskRunning){
		setTimeout(function(){pollTaskFromShapeXServer();}, pollInterval);
		console.log('task running, polling every'+pollInterval+'ms');
		return;
	}

	var pollurl = shapexServer + '/api/1.0/tasks';
	console.log("trying to get an active task from shapexServer: " + pollurl);
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
				var workType = tasks[0].worktype;
				
				// make model id folder and download model
				var modelFolder = ModelFolder(modelId, workType);
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
					var filePath = downloadDir;
					console.log('running amr with cwd: ' + filePath);
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
			        }
					
					var postStatus = shapexServer;
					if (workType === 'index') {
						postStatus += '/api/1.0/index_status?id='+modelId+'&status='+status+'&downloadurl='+downloadurl+'&name='+filename+'&format='+FileFormat(path.extname(filePath));
					} else {
						postStatus += '/api/1.0/worker_status?id='+modelId+'&status='+status+'&downloadurl='+downloadurl+'&name='+filename;
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
	setTimeout(function(){pollTaskFromShapeXServer();}, pollInterval);
}

/*
Server for query thumbnail, descriptor, props and view
workserver + /signature?thumbnail=&name=&downloadurl=&type=
workserver + /signature?descriptor=&name=&downloadurl=&type=
workserver + /signature?properties=&name=&downloadurl=&type=
workserver + /signature?view=&name=&downloadurl=&type=
*/
http.createServer(function (req, res) {
	console.log('request url is: ' + req.url);
	var parsedUrl = url.parse(req.url, true); 
	if (parsedUrl.pathname != '/signature') {
		res.status(404).send('invalid request');
		return;
	}
	
	var filename = parsedUrl.query.name;
	var type = parsedUrl.query.type;
	if (parsedUrl.query.thumbnail != undefined)
	{
		if (req.method === 'GET'){
			var modelId = parsedUrl.query.thumbnail;
			var modelFolder = ModelFolder(modelId, type);
			var file = modelFolder+'/'+filename+'.png';
			console.log('download thumbnail '+file);
			res.setHeader('Content-disposition', 'attachment; filename=' + filename);
			var fileStream = fs.createReadStream(file);
			fileStream.pipe(res);
		}		
	} else if (parsedUrl.query.descriptor != undefined) {
		if (req.method === 'GET'){
			var modelId = parsedUrl.query.descriptor;
			var modelFolder = ModelFolder(modelId, type);
			var file = modelFolder+'/'+filename+'.txt';
			console.log('download descriptor '+file);
			res.setHeader('Content-disposition', 'attachment; filename=' + filename);
			var fileStream = fs.createReadStream(file);
			fileStream.pipe(res);
		}
	} else if (parsedUrl.query.properties != undefined) {
		if (req.method === 'GET'){
			var modelId = parsedUrl.query.properties;
			var modelFolder = ModelFolder(modelId, type);
			var file = modelFolder+'/'+filename+'.props';
			console.log('download properties '+file);
			res.setHeader('Content-disposition', 'attachment; filename=' + filename);
			var fileStream = fs.createReadStream(file);
			fileStream.pipe(res);
		}
	} else if (parsedUrl.query.view != undefined) {
		if (req.method === 'GET'){
			var modelId = parsedUrl.query.view;
			var modelFolder = ModelFolder(modelId, type);
			var file = modelFolder+'/'+filename+'.json';
			console.log('download view '+file);
			res.setHeader('Content-disposition', 'attachment; filename=' + filename);
			var fileStream = fs.createReadStream(file);
			fileStream.pipe(res);
		}
	} else {
		res.status(404).send('invalid request.');
	}
		
}).listen(workerServerPort,workerServerHostName);
console.log('Worker HTTP Server running at ' + workerServer);