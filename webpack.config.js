var webpack = require("webpack");

const common = {
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader'
      }
    ]
  },
  devtool: 'source-map',
  debug: true
};

const multiDemo = {
  entry: './js/entry/demo-textarea.js',
  output: {
    filename: 'build/demo-textarea.js'
  }
};

const codemirrorDemo = {
  entry: './js/entry/demo-codemirror.js',
  output: {
    filename: 'build/demo-codemirror.js'
  }
};

module.exports = [
  Object.assign({} , common, multiDemo),
  Object.assign({} , common, codemirrorDemo),
];
