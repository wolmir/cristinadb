const { spawn } = require('child_process');

const net = require('net');

const config = require('./config');

let clients = [];

const cdb = spawn('node', ['cristinadb']);

const server = net.createServer((socket) => {
    socket.on('data', (data) => {
        cdb.stdin.write(data);
    });

    socket.on('error', (error) => {
        console.error(error);
    });

    socket.on('close', () => {
        clients = clients.filter(c => c !== socket);
    });

    clients.push(socket);
});

cdb.stdout.on('data', (data) => {
    clients.forEach(socket => socket.write(data));
});

server.listen({
    host: 'localhost',
    port: config.tcpPort
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log('Address in use, retrying...');
        setTimeout(() => {
            server.close();
            server.listen(config.tcpPort, 'localhost');
        }, 1000);
    } else {
        console.error(e);
        server.close();
    }
});