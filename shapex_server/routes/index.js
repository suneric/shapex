var express = require('express');
var router = express.Router();

/* GET home page.*/
router.get('/', function(req, res, next) {
	res.send('response to get request form main page: shapex');
});

module.exports = router;
