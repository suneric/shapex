/*
file copy 
*/
var path = require('path');
var fs = require('fs');
var spawnSync = require('child_process').spawnSync;

// set the paths
var inputdir = "C:\\AProject\\AMR\\data\\ATF";
var outputdir = "C:\\AProject\\AMR\\data\\Test\\Index";
var amr = "C:\\AProject\\AMR\\product\\source\\lib\\Release_x64\\amr.exe";

var finder = require('findit')(inputdir);
finder.on('file', function(file, stat) {
  console.log('File: ' + file);
  var generator = spawnSync(amr, ['f', file, outputdir]);
});


