'use strict';

const Hapi = require('hapi');
const HapiOpenAPI = require('hapi-openapi');
const Path = require('path');
const Database = require('@internal/model').database;
const config = require('./config/config');
const Good = require('good');

const init = async function(db, logger = () => {}) {
    const server = new Hapi.Server({
        ...config.server,
        host: config.server.address
    });

    await server.register([{
        plugin: HapiOpenAPI,
        options: {
            // outputvalidation: true,
            api: Path.resolve('./config/swagger.json'),
            handlers: Path.resolve('./handlers')
        }
    }, {
        plugin: Good,
        options: {
            ops: {
                interval: 1000
            },
            reporters: {
                console: [{
                    module: 'good-squeeze',
                    name: 'Squeeze',
                    args: [{ log: '*', response: '*' }]
                }, {
                    module: 'good-console'
                }, 'stdout']
            }
        }
    }]);

    Object.assign(server.app, { db, logger });
    server.app.db = db;

    //add a health endpoint on /
    server.route({
        method: 'GET',
        path: '/',
        handler: async (req, h) => {
            if (!(await db.isConnected())) {
                return h.response({
                    statusCode: 500,
                    error: 'Internal Server Error',
                    message: 'Database not connected' }).code(500);
            }
            return h.response().code(200);
        }
    });

    server.ext('onRequest', function(request, h) {
        logger('NEW REQUEST');
        logger(request.method.toUpperCase(), request.path);
        logger('request path', request.path);
        logger('request method', request.method);
        logger('request body', request.body);
        logger('request headers', request.headers);
        return h.continue;
    });

    await server.start();

    return server;
};

if (require.main === module) {
    (async () => {
        const logger = (...args) => { console.log(`[${(new Date()).toISOString()}]`, ...args); };
        const db = new Database(config.database, { logger });
        await db.connect();
        init(db, logger).then((server) => {
            server.plugins.openapi.setHost(server.info.host + ':' + server.info.port);

            server.app.logger(`Server running on ${server.info.host}:${server.info.port}`);
            server.log(['info'], `Server running on ${server.info.host}:${server.info.port}`);
        });
    })();
} else {
    module.exports = { init };
}
