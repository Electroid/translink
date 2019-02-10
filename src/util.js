global.dev = function() {
    return !process.env.GOOGLE
}

global.production = function() {
    return !dev();
}

global.env = function(name) {
    if(production()) {
       return process.env[name] 
    } else {
    	// HACK(ashcon): avoid bundling secret by making expression dynamic
    	return require(name.replace(/.*/, '../secret.json'))[name]
    }
}
