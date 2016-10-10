declare module "jQuery" {
  declare function $(obj: any): any;
}

var $ = require('./js/lib/jquery').$;
