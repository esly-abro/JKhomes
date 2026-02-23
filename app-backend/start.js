// Quick launcher — ensures CWD is app-backend so dotenv loads .env
process.chdir(__dirname);
require('./src/server.js');
