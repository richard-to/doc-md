var server = function(config){

	var path = require('path')
	var _ = require('underscore')	
	var express = require('express')
	var auth = require('connect-auth')

	var app = express();

	var settings = {
		doc_md: {},
		env: 'development',
		static_path: path.join(__dirname, 'public'),
		view_path: path.join(__dirname, 'views'),
		auth: {
			name: 'anonymous',
			strategy: auth.Anonymous(),
			cookie_secret: 'secret',
			acl: null
		},
	}
	_.extend(settings, config)

	app.engine('html', require('ejs').renderFile)
	app.set('views', settings.view_path)
	app.set('view engine', 'html')
	app.set('env', settings.env)

	if('production' == app.get('env')) {
  		settings.doc_md.auto_generate_toc = false;
	}

	app.use(express.static(settings.static_path))
		.use(express.cookieParser(settings.auth.cookie_secret))
   		.use(express.session())
   		.use(express.bodyParser())		
		.use(auth({strategies: [settings.auth.strategy]}))
		.use(auth_middleware(settings.auth.name))

	if(settings.auth.acl){
		app.use(settings.auth.acl)
	}
	app.use(doc_md(settings.doc_md))

	app.get('/*', function(req, res){
	    res.send(404)
	})

	return app
}

var auth_middleware = function(auth_name) {
	return function(req, res, next) {
		req.authenticate([auth_name], function(err, authenticated) {
    		if(err) {
	        	console.log(err)
	        	res.end()
	      	}
	      	else {
	        	if(authenticated === undefined) {
	          	}
	          	else {
	            	next()
	          	}
	      	}
    	});
  	}
};


var doc_md = function(config){
	
	var async = require('async')
	var lazy = require("lazy")
	var path = require('path')
	var fs = require('fs')
	var _ = require('underscore')	
	var mmd = require('multimarkdown')

	var settings = {
		doc_path: null,
		toc_filename: 'toc.json',
		auto_generate_toc: true,
		ext: '.md',
		title: 'Doc-Md',
		default_page: 'index',
		base_url: '',
		theme: {
			template: 'doc-md',
			css: '/css/doc-md.css'
		}
	}
	_.extend(settings, config)

	var parse_toc = function(toc_file, func){
		var trim_regex = /^\s*|\s*$/g

		fs.readFile(toc_file, function(err, data){
			if(err == null){
				toc = JSON.parse(data)
				meta = {}

				async.map(
					toc, 
					function(filename, callback){
						var file_path = path.join(
						settings.doc_path, filename + settings.ext)
						meta[filename] = {
							title: filename, 
							subheads: []
						}
						new lazy(fs.createReadStream(file_path))
							.lines
							.map(String)
							.forEach(function(line){
								if(line[0] == '#' && line[1] != '#'){
									meta[filename].title = line.substring(1).replace(trim_regex, '')
								} else if(line[0] == '#' && line[1] == '#' && line[2] != '#'){
									var subhead = line.substring(2).replace(trim_regex, '')
									meta[filename].subheads.push({ 
										title:subhead,
										anchor: subhead.replace(/ /g, '').toLowerCase()
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
				)
			} else {
				console.log(err);
				func("Invalid toc file.")
			}		
		})
	}	

	var build_toc = function(toc, meta){
		var toc_str = ''

		var count_pages = toc.length		
		for(var i = 0; i < count_pages; i++){
			var page =  meta[toc[i]]
			var subheads = page['subheads']
			
			toc_str += '- [' + page.title + "] (" + settings.base_url + "/" + toc[i] + ")\n"
			
			var count_subheads = subheads.length
			for(var g = 0; g < count_subheads; g++){
				toc_str += '    - [' + 
					subheads[g].title + "] (" + 
					settings.base_url + "/" + toc[i] + "#" + 
					subheads[g].anchor + ")\n"
			}
		}
		return toc_str
	}

	if(settings.auto_generate_toc == false){
		var toc_file_path = path.join(settings.doc_path, settings.toc_filename)
		parse_toc(toc_file_path, function(err, toc, meta){
			if(err == null){
				settings.toc_str = build_toc(toc, meta)
			}
		})		
	}

	return function(req, res, next){
		var base_url = settings.base_url.replace('/', '\/')
		var url_regex =  new RegExp("^" + base_url + "\/([a-z\d]+[a-z\d\-]?[a-z\d]+)?$")

		url_match = req.path.match(url_regex)

		if(url_match == null){
			next()		
			return
		}

		var from = 	url_match[1]
		if(from == undefined) {
			from = settings.default_page
		}

		var file_path = path.join(settings.doc_path, from + settings.ext)
		var toc_file_path = path.join(settings.doc_path, settings.toc_filename)

		fs.readFile(file_path, function(err, data){
			if(err == null){
				if(settings.auto_generate_toc == false){
					res.render(settings.theme.template, {
						title: settings.title,
						css: settings.theme.css,
						content: mmd.convert(data.toString()),
						toc: mmd.convert(settings.toc_str)
					})
				} else {
					parse_toc(toc_file_path, function(err, toc, meta){
						if(err == null){
							var toc_str = build_toc(toc, meta)
							res.render(settings.theme.template, {
								title: settings.title,
								css: settings.theme.css,
								content: mmd.convert(data.toString()),
								toc: mmd.convert(toc_str)
							})
						} else {
							console.log(err)
							res.send(500)	
						}
					})
				}
			} else {
				console.log(err)
				next()
			}
		})
	}
}

exports.server = server
exports.doc_md = doc_md