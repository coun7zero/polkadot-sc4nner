const express = require('express')
const serveIndex = require('serve-index')
const auth = require('http-auth')
const authConnect = require("http-auth-connect");
const morgan = require('morgan');

const USERNAME = 'polkadot-sc4nner';
const PASSWORD = 'polkadot1234sc4nner';

const basic = auth.basic({
  realm: 'polkadot-sc4nner'
}, function (username, password, callback) {
  const requestAuthenticated = username === USERNAME && password === PASSWORD
  callback(requestAuthenticated) 
});

basic.on("success", result => {
  console.log(`User authenticated: ${result.user}`);
});
basic.on("fail", result => {
  console.log(`User authentication failed: ${result.user}`);
});
basic.on("error", error => {
  console.log(`Authentication error: ${error.code + " - " + error.message}`);
});

const app = express()
const authMiddleware = authConnect(basic)

app.use(morgan('combined'));
app.use('/', [authMiddleware], express.static('build'), serveIndex('build', {
  'icons': true
}))

app.listen(1337, () => {
  console.log("Server running at http://127.0.0.1:1337/");
})