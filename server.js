const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    let filePath = '';

    switch (req.url) {
        case '/':
            filePath = '../index.html';
            break;
        case '/signup':
            filePath = '../signup.html';
            break;
        case '/login':
            filePath = '../login.html';
            break;
        case '/volunteer':
            filePath = '../volunteer.html';
            break;
        case '/campaigner':
            filePath = '../campaigner.html';
            break;
        case '/admin':
            filePath = '../admin.html';
            break;
        default:
            filePath = '../404.html';
            break;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        }
    });
});

server.listen(8000, () => {
    console.log(`Server is running on http://localhost:8000`);
});
