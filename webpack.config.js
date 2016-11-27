var webpack = require("webpack");

module.exports = {
    entry: "./js/entry.js",
    output: {
        filename: "./build/bundle.js"
    },
    module: {
        loaders: [
          {
            test: /\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader',
            query: {
              presets: ['es2015'],
              plugins: ['transform-runtime']
            }
          }
        ]
    },
    devtool: 'source-map',
    debug: true
};
