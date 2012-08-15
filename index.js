var server = function(config){

	var path = require('path')
	var _ = require('underscore')	
	var express = require('express')
	var auth = require('connect-auth')

	var app = express();

	var settings = {
		doc_md: {},
		env: 'development',
		static_path: null,
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

	app.use(express.cookieParser(settings.auth.cookie_secret))
   		.use(express.session())
   		.use(express.bodyParser())		
		.use(auth({strategies: [settings.auth.strategy]}))
		.use(auth_middleware(settings.auth.name))

	if(settings.auth.acl){
		app.use(settings.auth.acl)
	}

	if(settings.static_path){
		app.use(express.static(settings.static_path))
	}

	app.use(express.static(path.join(__dirname, 'public')))

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

	var parse_toc = function(toc_file, doc_meta, func){
		var trim_regex = /^\s*|\s*$/g
		fs.readFile(toc_file, function(err, data){
			if(err == null){
				var toc = JSON.parse(data)
				async.map(
					toc, 
					function(filename, callback){
						var dir_path = path.join(settings.doc_path, filename)
						fs.lstat(dir_path, function(err, stats){
							if(!err && stats.isDirectory()){
								var sub_toc = path.join(dir_path, settings.toc_filename)
								parse_toc(sub_toc, doc_meta, callback)
							} else {
								var dir_name = toc_file.replace(settings.doc_path, '')
									.replace(settings.toc_filename, '').replace(/^\/*|\/*$/g, '')
								var file_path = toc_file.replace(settings.toc_filename, filename + settings.ext)

								var url_path = filename
								if(dir_name != ''){
									url_path = dir_name + "/" + filename
								}

								var page_meta = {
									name: filename,
									parent: dir_name,
									url_path: url_path,
									title: filename, 
									subheads: []
								}

								new lazy(fs.createReadStream(file_path))
									.lines
									.map(String)
									.forEach(function(line){
										if(line[0] == '#' && line[1] != '#'){
											page_meta.title = line.substring(1).replace(trim_regex, '')
										} else if(line[0] == '#' && line[1] == '#' && line[2] != '#'){
											var subhead = line.substring(2).replace(trim_regex, '')
											page_meta.subheads.push({ 
												title:subhead,
												anchor: subhead.replace(/ /g, '').toLowerCase()
											})
										}

									})
									.join(function(xs){
										callback(null, page_meta)
									})
							}
						});
					}, 
					function(err, results){
						for(var i = 0; i < results.length; i++){
							if(!_.isArray(results[i]))
								doc_meta.push(results[i])
						}
						func(err, results)
					}
				)
			} else {
				console.log(err);
				func("Invalid toc file.")
			}		
		})
	}	

	var build_toc = function(toc_meta, func){

		async.map(
			toc_meta, 
			function(section, callback){

				var toc_str = ''

				if(!_.isArray(section)){
					section = [section]
				} else {
					toc_str = "## " + section[0].parent.toLowerCase().replace("-", " ") + "\n\n"
				}

				var count_pages = section.length		
				for(var i = 0; i < count_pages; i++){
					var page =  section[i]
					var subheads = page['subheads']
					
					toc_str += '- [' + page.title + "] (" + settings.base_url + "/" + page.url_path + ")\n"
					
					var count_subheads = subheads.length
					for(var g = 0; g < count_subheads; g++){
						toc_str += '    - [' + 
							subheads[g].title + "] (" + 
							settings.base_url + "/" + page.url_path + "#" + 
							subheads[g].anchor + ")\n"
					}
				}
				toc_str += "\n"
				callback(null, toc_str)
			},
			function(err, results){
				var menu = ''
				var count = results.length
				for(var i = 0; i < count; i++){
					menu += results[i]
				}
				func(menu)
			}
		);
	}

	if(settings.auto_generate_toc == false){
		var toc_file_path = path.join(settings.doc_path, settings.toc_filename)
		parse_toc(toc_file_path, [], function(err, results){
			if(err == null){
				build_toc(results, function(menu){
					settings.toc_str = menu
				})
			}
		})		
	}

	return function(req, res, next){
		var base_url = settings.base_url.replace('/', '\/')
		var url_regex =  new RegExp("^" + base_url + "\/([a-z\d]+[\/a-z\d\-]*[a-z\d]+)?$")
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
					parse_toc(toc_file_path, [], function(err, results){
						if(err == null){
							build_toc(results, function(menu){
								res.render(settings.theme.template, {
									title: settings.title,
									css: settings.theme.css,
									content: mmd.convert(data.toString()),
									toc: mmd.convert(menu)
								})
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