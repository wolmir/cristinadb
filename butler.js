const net = require('net');

function main() {
    process.stdin.setEncoding('utf8');

    let id = (new Array(12)).fill(0).map(() => randomAlg()).join('');

    const socket = net.createConnection({
        host: 'localhost',
        port: 1234
    }, () => {
        socket.on('data', (data) => {
            console.log(data.toString('utf8'));
        });

        socket.on('end', () => {
            console.log('Client ended');
        });

        process.stdin.on('data', (data) => {
            socket.write(data);
        });
    });
}

function randomAlg() {
    return Math.floor(Math.random() * 10);
}

main();