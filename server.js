var sys = require('util'),
    qs = require('querystring'),
    http = require('http'),
    express = require('express');

// Use the Google Closure Compiler Service to compress Javascript
// code.
//
// + code - String of javascript to compress
// + next - Function callback that accepts.
//
// This method will POST the `code` to the compiler service.  If an
// error occurs, `next()` will be called with an `Error` object as the
// first argument.  Otherwise, the `next()` will be called with `null`
// as the first argument and a String of compressed javascript as the
// second argument.
//
//     compile('... javascript ...', function(err, result) {
//       if (err) throw err;
//
//       ... do something with result ...
//     });
//
// Returns nothing.
function compile(url, next) {
    try {
        var http = require('http'),
            host = 'closure-compiler.appspot.com',
            body = qs.stringify({
                code_url: url,
                compilation_level: "SIMPLE_OPTIMIZATIONS",
                output_format: "json",
                output_info: "compiled_code"
            }),
            client = http.createClient(80, host).on('error', next),
            req = client.request('POST', '/compile', {
                'Host': host,
                'Content-Length': body.length,
                'Content-Type': 'application/x-www-form-urlencoded'
            });

        req.on('error', next).end(body);

        req.on('response', function(res) {
            if (res.statusCode != 200) next(new Error('Unexpected HTTP response: ' + res.statusCode));
            else capture(res, 'utf-8', parseResponse);
        });

        function parseResponse(err, data) {
            err ? next(err) : loadJSON(data, function(err, obj) {
                var error;
                if (err) next(err);
                else if ((error = obj.errors || obj.serverErrors || obj.warnings)) next(new Error('Failed to compile: ' + sys.inspect(error)));
                else next(null, obj.compiledCode);
            });
        }
    } catch (err) {
        next(err);
    }
}

// Convert a Stream to a String.
//
// + input    - Stream object
// + encoding - String input encoding
// + next     - Function error/success callback
//
// Returns nothing.
function capture(input, encoding, next) {
    var buffer = '';

    input.on('data', function(chunk) {
        buffer += chunk.toString(encoding);
    });

    input.on('end', function() {
        next(null, buffer);
    });

    input.on('error', next);
}

// Convert JSON.load() to callback-style.
//
// + data - String value to load
// + next - Function error/success callback
//
// Returns nothing.
function loadJSON(data, next) {
    var err, obj;
    try {
        obj = JSON.parse(data);
    } catch (x) {
        err = x;
    }
    next(err, obj);
}

var codeCache = {};

function refreshCache() {
    codeCache = {};
}
setInterval(refreshCache, 3600000);

var callback = function(err, payload) {
    if (!err) {
        console.log(payload); // payload is the JSON blob that github POSTs to the server
        refreshCache();
    } else {
        console.log(err);
    }
}

var gitservers = {
    'mySite-js': 'https://github.com/mySite/mySite-js'
};

var app = express.createServer();
app.use(express.bodyParser());
app.post('/:id', function(req, res) {
    if ((Object.keys(gitservers).indexOf(req.params.id) === -1) || (req.headers['x-github-event'] !== 'push')) {
        callback(new Error('Posted data does not appear to be a github event'));
        res.end();
    } else {
        var payload;
        if (typeof req.body.payload === 'object') {
            payload = req.body.payload;
        } else {
            payload = JSON.parse(req.body.payload);
        }
        if (payload.repository.url === gitservers[req.params.id]) {
            callback(null, payload);
        } else {
            callback(new Error('Posted URL does not match configuration'));
        }
        res.end();
    }
});

app.get('/*.js',function(request, response) {
    if (request.params.id == "?clear") {
        refreshCache();
        return;
    }
    var url = "http://js-raw.abhishekmunie.com/" + request.params[0] + ".js";
    console.log("url: "+url);
    if (codeCache[url]) {
        response.header('Content-Type', 'application/javascript');
        response.send(codeCache[url], {'Content-Type': 'application/javascript'}, 200);
    } else compile(url, function(err, code) {
        console.log(code);
        if (err) {
            console.log(err);
        }
        response.send(code, {'Content-Type': 'application/javascript'}, 200);
        codeCache[url] = code;
    });
});
app.listen(process.env.C9_PORT || process.env.PORT || process.env.VCAP_APP_PORT || process.env.VMC_APP_PORT || 1337 || 8001);