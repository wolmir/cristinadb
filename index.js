const { spawn } = require('child_process');

const config = require('./config');

let central = spawn('node center.js', []);

let websocketd = spawn('./websocketd/websocketd', ['--port=8080', '--staticdir=./static', './butler.sh']);

let services = config.services.map((service) => {
    return {
        name: service.name,
        proc: spawn(`./services/${service.name}`, service.args || [])
    };
});

wrapAround('center', central);
wrapAround('websocketd', websocketd);

services.forEach((service) => {
    wrapAround(service.name, service.proc);
});

function wrapAround(name, proc) {
    proc.stdout.on('data', (txt) => {
        console.log(`${name} >> ${txt.toString('utf8').trim()}`);
    });

    proc.stderr.on('data', (error) => {
        console.error(`${name} >> ${error.toString('utf8').trim()}`);
    });
}