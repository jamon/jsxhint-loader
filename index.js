/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra

	modified by Jamon Terrell to add jsx support, allow emitting of errors as a json file
*/
var jshint = require("jshint-jsx").JSXHINT;
var RcLoader = require("rcloader");
var stripJsonComments = require("strip-json-comments");
var fs = require("fs");
var util = require("util");
var buffer = {};

// setup RcLoader
var rcLoader = new RcLoader(".jshintrc", null, {
	loader: function(path) {
		return path;
	}
});

function loadRcConfig(callback){
	var sync = typeof callback !== "function";

	if(sync){
		var path = rcLoader.for(this.resourcePath);
		if(typeof path !== "string") {
			// no .jshintrc found
			return {};
		} else {
			this.addDependency(path);
			var file = fs.readFileSync(path, "utf8");
			return JSON.parse(stripJsonComments(file));
		}
	}
	else {
		rcLoader.for(this.resourcePath, function(err, path) {
			if(typeof path !== "string") {
				// no .jshintrc found
				return callback(null, {});
			}

			this.addDependency(path);
			fs.readFile(path, "utf8", function(err, file) {
				var options;

				if(!err) {
					try {
						options = JSON.parse(stripJsonComments(file));
					}
					catch(e) {
						err = e;
					}
				}
				callback(err, options);
			});
		}.bind(this));
	}
}

function jsHint(input, options) {
	//var source = input.split(/\r\n?|\n/g);
	var loaderOptions = this.options.jsxhintLoader ? this.options.jsxhintLoader : {};
	var jsxhintOptions = loaderOptions.jsxhint ? loaderOptions.jsxhint : {};
	var globals = loaderOptions.globals ? loaderOptions.globals : [];

	var result = jshint(input, jsxhintOptions, globals);
	var errors = jshint.errors;

	if(loaderOptions.emitFilename) {
		buffer[this.resourcePath] = result ? [] : jshint.errors;
		this._compilation.plugin("compile", function() {
			buffer = [];
		});
		this._compilation.plugin("seal", function() {
			this.emitFile(loaderOptions.emitFilename, JSON.stringify(buffer));
		}.bind(this));
	}

	if(!result) {
		if(loaderOptions.reporter) {
			loaderOptions.reporter.call(this, errors);
		} else {
			var hints = [];
			if(errors) errors.forEach(function(error) {
				if(!error) return;
				var message = "  " + error.reason + " @ line " + error.line + " char " + error.character + "\n    " + error.evidence;
				hints.push(message);
			}, this);
			var message = hints.join("\n\n");
			var emitter = loaderOptions.emitErrors ? this.emitError : this.emitWarning;
			if(emitter)
				emitter("jshint results in errors\n" + message);
			else
				throw new Error("Your module system doesn't support emitWarning. Update availible? \n" + message);
		}
	}
	if(loaderOptions.failOnHint && !result)
		throw new Error("Failing compile due to jshint errors.");
}

module.exports = function(input, map) {
//	this.cacheable && this.cacheable();
	var callback = this.async();

	if(!callback) {
		// load .jshintrc synchronously
		var config = loadRcConfig.call(this);
		jsHint.call(this, input, config);
		return input;
	}

	// load .jshintrc asynchronously
	loadRcConfig.call(this, function(err, config) {
		if(err) return callback(err);

		try {
			jsHint.call(this, input, config);
		}
		catch(e) {
			return callback(e);
		}
		callback(null, input, map);

	}.bind(this));
};
