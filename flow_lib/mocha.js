// type definitions for (some of) mocha. borrowed from: https://github.com/hammerlab/pileup.js/blob/master/lib/mocha.js

declare function describe(description: string, spec: () => void): void;
declare function it(expectation: string, assertion: (done: () => void) => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function before(fn: () => void): void;
declare function after(fn: () => void): void;
