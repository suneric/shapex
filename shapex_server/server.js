require('./db/connect');
var express = require('express');
var bodyParser = require('body-parser');
var routes = require('./routes/index');
var api = require('./routes/api');

var app = express();

app.use(bodyParser.json());
app.use(express.static('public'));

app.use('/', routes);
app.use('/api/1.0', api);

app.use('*', function(req, res) {
    res.status(404).json({ message: 'Not Found' });
});

app.listen(8080, function() {
    console.log('Listening on port 8080');
});

exports.app = app;