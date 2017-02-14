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
  entry: './js/demo/demo-textarea.js',
  output: {
    filename: 'build/demo-textarea.js'
  }
};

const codemirrorDemo = {
  entry: './js/demo/demo-codemirror.js',
  output: {
    filename: 'build/demo-codemirror.js'
  }
};

const clientDemo = {
  entry: './js/demo/demo-client.js',
  output: {
    filename: 'build/demo-client.js'
  }
};

module.exports = [
  Object.assign({} , common, multiDemo),
  Object.assign({} , common, codemirrorDemo),
  Object.assign({} , common, clientDemo),
];
