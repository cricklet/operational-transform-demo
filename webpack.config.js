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
  entry: './js/entry/textarea-demo.js',
  output: {
    filename: 'build/textarea-demo.js'
  }
};

const codemirrorDemo = {
  entry: './js/entry/codemirror-demo.js',
  output: {
    filename: 'build/codemirror-demo.js'
  }
};

module.exports = [
  Object.assign({} , common, multiDemo),
  Object.assign({} , common, codemirrorDemo),
];
