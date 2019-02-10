const path = require('path')

module.exports = {
  target: 'node',
  externals: [require('webpack-node-externals')()],
  entry: {
    bundle: path.join(__dirname, './index.js'),
  },
  output: {
    filename: 'bundle.js',
    path: path.join(__dirname, 'dist'),
    libraryTarget: 'this'
  },
  mode: 'production',
  // devtool: 'cheap-module-source-map',
  watchOptions: {
    ignored: /node_modules|dist|\.js/g,
  },
  resolve: {
    extensions: ['.js', '.json'],
    plugins: []
  },
  module: {
    rules: [
      {
        test: /\.js?$/,
        exclude: /node_modules/
      },
      {
        test: /\.(sql|txt)?$/,
        use: [
          {
            loader: 'raw-loader',
            options: {}
          }
        ]
      }
    ]
  }
}
