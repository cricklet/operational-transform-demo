
export class IterableBase { // http://stackoverflow.com/questions/31942617/how-to-implement-symbol-iterator
  [Symbol.iterator]() {
    return this.iterator();
  }
}
