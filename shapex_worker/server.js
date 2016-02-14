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
var storageFolder = path.join(currentdir, nconf.get('storage'));
var amr = path.join(currentdir, nconf.get('executable'));

var build = nconf.get('build');
var serverConf = nconf.get(build);
var shapexServer = serverConf.shapex;
var workerServer = serverConf.workerServer;
var workerServerHostName = url.parse(workerServer).hostname;
var workerServerPort = url.parse(workerServer).port;

console.log('worker http server: ' + workerServerHostName + ' port: ' + workerServerPort);

var isTaskRunning = false;
var pollInterval = nconf.get('interval');

// run
setTimeout(function() { pollTaskFromShapeXServer();}, 1); 

/*
task

*/
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
			//console.log('tasks queried:'+util.inspect(body));
			var tasks = JSON.parse(body);
			if (tasks.length > 0) {
				if (tasks.length > 1) {
					console.log('more than one task is not allowed');
				}
				
				var task = tasks[0];
				console.log('task is '+ util.inspect(task));
				
				if (task.type === 'compare')
				{
					compareModel(task);
				}
				else if (task.type === 'index')
				{
					indexModel(task);
				} 
				else if (task.type === 'upload')
				{
					createModel(task);
				}
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
create signature for uploaded file
work status contains id, status, downloadurl, name and ext
*/
var createModel = function(task) {
	var modelId = task._id;
	var modelName = task.name;
	var modelPath = task.path;
	var workType = task.type;
	console.log('create signature for model id: '+modelId+' name: '+ modelName);
	
	// create a work folder
	var modelFolder = path.join(workFolder, modelId);
	if(!fs.existsSync(modelFolder)) {
		fs.mkdirSync(modelFolder);
	}

	// download source file from server to worker
	var pollurl = shapexServer + '/api/1.0/download/' + path.basename(modelPath);
	console.log('download file from ' + pollurl);
	var sourceFile = path.join(modelFolder, path.basename(modelName));
	var downloadedFile = fs.createWriteStream(sourceFile);	
	request.get(pollurl).pipe(downloadedFile);
	downloadedFile.on('finish', function () {
		// create signature
		var ok = createSignature(sourceFile, modelFolder);
		
		var status = 'fail';
		var downloadurl = '';
		var extName = path.extname(modelName);
		var baseName = path.basename(modelName, extName); 
		
		if (ok === 0) 
		{
			status = 'succeed';
			downloadurl = workerServer;
		}
		
		// post status to server
		var workStatus = shapexServer+'/api/1.0/work_status';
		workStatus += '?status='+status+'&id='+modelId+'&name='+baseName+'&downloadurl='+downloadurl;
		console.log('post work result to shapex server: ' + workStatus);
		request.post(workStatus, function (res) {
			console.log(util.inspect(res));
		});
	});
}

/*
create signature and upload to storage
*/
var indexModel = function(task) {
	var modelId = task._id;
	var modelName = task.name;
	var modelPath = task.path;
	var workType = task.type;
	console.log('index signature for model id: '+modelId+' name: '+ modelName);
	
	// create index folder
	var modelFolder = path.join(storageFolder, modelId);
	if(!fs.existsSync(modelFolder)) {
		fs.mkdirSync(modelFolder);
	}

	// download source file from server to worker
	var pollurl = shapexServer + '/api/1.0/download/' + path.basename(modelPath);
	console.log('download file from ' + pollurl);
	var sourceFile = path.join(modelFolder, path.basename(modelName));
	var downloadedFile = fs.createWriteStream(sourceFile);	
	request.get(pollurl).pipe(downloadedFile);
	downloadedFile.on('finish', function () {
		// create signature
		var ok = createSignature(sourceFile, modelFolder);
		
		var status = 'fail';
		var downloadurl = '';
		var extName = path.extname(modelName);
		var baseName = path.basename(modelName, extName); 
		
		if (ok === 0) 
		{
			status = 'succeed';
			downloadurl = workerServer;
		}
		
		// post status to server
		var indexStatus = shapexServer + '/api/1.0/index_status'
		indexStatus += '?status='+status+'&id='+modelId+'&name='+baseName+'&ext='+extName+'&downloadurl='+downloadurl;
		console.log('post index result to shapex server: ' + indexStatus);
		request.post(indexStatus, function (res) {
			console.log(util.inspect(res));
		});
	});
}

/*
Compare model with 
.compare file for shape search result
*/
var compareModel = function(task) {
	var modelId = task._id;
	var modelName = task.name;
	var items = task.items;
	var workType = task.type;
	
	var modelFolder = path.join(workFolder, modelId);
	var descriptorName = modelName+'.txt';
	var descriptorFile = path.join(modelFolder, descriptorName);
	if (!fs.existsSync(descriptorFile)) {
		return;
	}

	// make a compare list file 
	var desPaths;
	for (var i = 0; i < items.length; ++i) {
		var compareId = items[i]._id;
		var compareName = items[i].name;
		var compareFolder = path.join(storageFolder, compareId);
		var compareDesName = compareName+'.txt';
		var compareDesFile = path.join(compareFolder, compareDesName);
		
		if (fs.existsSync(compareDesFile))
		{
			if (desPaths === undefined)
				desPaths = compareDesFile + '\n';
			else 
				desPaths += compareDesFile +'\n';
		}					
	}	
	
	if (desPaths != undefined) {
		// create list file in the model 
		var compareListFile = path.join(modelFolder,'compare.txt');
		fs.writeFile(compareListFile, desPaths, function(){
			console.log('create compare list file '+ compareListFile);
			var resultFileName = modelName+'.compare';
			var resultFile = path.join(modelFolder, resultFileName);
			console.log('run cmd for compare ' + descriptorFile + ' to ' + compareListFile);
			var generator = spawnSync(amr, ['cl', descriptorFile, compareListFile, resultFile], { cwd: modelFolder, encoding: 'utf8' }, function (err, stdout, stderr){
				console.log('fail to compare for '+descriptorFile);
			});
			
			if (fs.existsSync(resultFile)) {
				console.log('shape search result is ready.');
				// post status to server
				var compareStatus = shapexServer + '/api/1.0/compare_status'
				compareStatus += '?status=compare'+'&id='+modelId;
				console.log('post compare result to shapex server: ' + compareStatus);
				request.post(compareStatus, function (res) {
					console.log(util.inspect(res));
				});
			} else {
				console.log('failed to compare the shape descriptor.');
			}
		});							
	}
}

/*
input source 3D CAD part file, 
output signature files:
- descriptor file (filename.txt)
- view file (filename.json)
- properties file (filename.props)
- thumbnail file (filename.png)
*/
var createSignature = function (filePath, folder) {
	console.log('running amr with cwd: ' + amr + ' @ ' + filePath);
	var generator = spawnSync(amr, [filePath], { cwd: folder, encoding: 'utf8' }, function (err, stdout, stderr){
		console.log('fail to create signature for ' + filePath);
	});
	
	// validate generated files
	var fileExt = path.extname(filePath)
	var fileName = path.basename(filePath, fileExt);
	console.log('validate signature files for '+ fileName);
	
	var descriptorName = fileName+'.txt';
	var thumnailName = fileName+'.png';
	var propsName = fileName+'.props';
	var viewName = fileName+'.json';
			
	var descriptor = path.join(folder, descriptorName);
	var thumbnail = path.join(folder, thumnailName);
	var props = path.join(folder, propsName);
	var view = path.join(folder, viewName);
	
	if (fs.existsSync(descriptor) 
		&& fs.existsSync(thumbnail) 
		&& fs.existsSync(props) 
		&& fs.existsSync(view)) 
	{
		console.log('signature files '+ fileName+ ' are created.');
		return 0;
	} 
	else 
	{
		console.log('signature files '+ fileName+ ' are not created.');
		return 1;
	}
}

/*
http://127.0.0.1:1337/signature?id=xxx&name=xxx&ext=xxx
ext includes:
1. source file ext
2. .png for thumbnail
3. .txt for descriptor
4. .props for properties
5. .json for view
6. .compare for descriptor compare file
*/
http.createServer(function (req, res) {
	console.log('request url is: ' + req.url);
	var parsedUrl = url.parse(req.url, true); 
	if (parsedUrl.pathname != '/signature') {
		res.status(404).send('invalid request');
		return;
	}
	
	if (req.method === 'GET'){
		var fileName = parsedUrl.query.name;
		var extName = parsedUrl.query.ext;
		var modelId = parsedUrl.query.id;
		var type = parsedUrl.query.type;
		
		var modelFolder;
		if (type === 'index') {
			modelFolder = path.join(storageFolder, modelId);
		} else {
			modelFolder = path.join(workFolder, modelId);
		}
		
		var file = modelFolder+'/'+fileName+extName;
		console.log('download '+file+ ' from worker.');
		res.setHeader('Content-disposition', 'attachment; filename=' + fileName);
		var fileStream = fs.createReadStream(file);
		fileStream.pipe(res);
	}		
		
}).listen(workerServerPort,workerServerHostName);
console.log('Worker HTTP Server running at ' + workerServer);