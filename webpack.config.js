const path = require('path');

module.exports = {
  entry: './src/server.mjs',
  target: 'node',
  mode: 'development',
  output: {
    filename: 'boitessrv.js',
    path: path.resolve(__dirname, 'dist'),
  },
};