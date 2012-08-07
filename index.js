exports.doc_md = function(config){

	var async = require('async')
	var lazy = require("lazy")
	var path = require('path')
	var fs = require('fs')
	var _ = require('underscore')	
	var mmd = require('multimarkdown')
	var express = require('express')
	var app = express();

	var settings = {
		toc_file: null,
		md_path: null,
		ext: '.md',
		title: 'Doc Md',
		default_page: 'index',
		theme: {
			template: 'default',
			static_path: express.static(path.join(__dirname, 'public')),
			view_path: path.join(__dirname, 'views'),
			css: '/css/style.css'
		}
	}

	_.extend(settings, config)

	var gen_toc = function(toc_file, func){
		fs.readFile(toc_file, function(err, data){
			if(err == null){
				toc = JSON.parse(data)
				meta = {}

				async.map(
					toc, 
					function(filename, callback){
						var file_path = path.join(
						settings.md_path, filename + settings.ext)
						meta[filename] = {
							title: filename, 
							subheaders: []
						}
						new lazy(fs.createReadStream(file_path))
							.lines
							.map(String)
							.forEach(function(line){
								if(line[0] == '#' && line[1] != '#'){
									meta[filename].title = line.replace(/^#\s*|\s*$/g, '')
								} else if(line[0] == '#' && line[1] == '#' && line[2] != '#'){
									meta[filename].subheaders.push({ 
										title: line.replace(/^##\s*|\s*$/g, ''),
										anchor: line.replace(/^##\s*|\s*$/g, '').replace(/ /g, '').toLowerCase()
									})
								}

							})
							.join(function(xs){
								callback(null, true)
							})
					}, 
					function(err, results){
						func(err, toc, meta)
					}
				);
			} else {
				res.send(404)
			}		
		})
	}
	
	gen_toc(settings.toc_file, function(err, toc, meta){
		console.log(meta['index']['subheaders'][0].anchor)
	})

	app.engine('html', require('ejs').renderFile)

	var theme = settings.theme

	app.use(theme.static_path)

	app.set('views', theme.view_path)
	app.set('view engine', 'html')

	app.get(/^\/([a-z\d]+[a-z\d\-]?[a-z\d]+)?$/, function(req, res){
		
		var from = req.params[0]
		var file_path = path.join(
			settings.md_path, settings.default_page + settings.ext)
		
		if(from){
			var file_path = path.join(settings.md_path, from + settings.ext)
		}

		fs.readFile(file_path, function(err, data){
			if(err == null){
				res.render(theme.template, {
					title: settings.title,
					css: theme.css,
					content: mmd.convert(data.toString())
				})
			} else {
				res.send(404)
			}		
		})
	})

	app.get('/*', function(req, res){
	    res.send(404)
	})


	return app
}