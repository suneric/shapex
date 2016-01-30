var util = require('util');

function TaskManager(){
	TaskManager.prototype.tasks = [];
	TaskManager.prototype.Push = function(task){
		TaskManager.prototype.tasks.push(task);
		console.log(util.inspect(this.tasks));
	}
	TaskManager.prototype.Pop = function(){
		return TaskManager.prototype.tasks.splice(0,1);
	}
	TaskManager.prototype.Length = function() {
		return TaskManager.prototype.tasks.length;
	}
}

var taskManager = new TaskManager();

module.exports = taskManager;