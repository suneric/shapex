// models maintain an id to model status info map
// transaltion worker server will post a modelstatusupdate to webserver
// to update the status from pending to ok or fail

function ModelManager() {
	ModelManager.prototype.models = {};
}

var modelManager = new ModelManager();

module.exports = modelManager;