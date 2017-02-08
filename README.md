# blue-ot.js

![](http://cricklet.github.io/images/blue.gif)

This is an implementation/demo of collaborative text editing via operational transforms. It's mostly inspired by Daniel Spiewak's [description](http://www.codecommit.com/blog/java/understanding-and-applying-operational-transformation) of operational transform.

Originally, I implemented the seminal (though, unfortunately incorrect) [Concurrency Control in Groupware Systems](https://www.lri.fr/~mbl/ENS/CSCW/2012/papers/Ellis-SIGMOD89.pdf) by Ellis & Gibbs from 1989. You can see that (unsuccessful) implementation in my [commit history](https://github.com/cricklet/blue.js/commit/749d94b6122dfb90130523bb14a1f734e7de54c4).

This implementation includes transformation/composition of operations, generation of operations based on text changes, and application of operations to text. In addition, it includes all the logic necessary for handling communication and conflict resolution between multiple clients over an out-of-order high-latency network.

The test coverage is reasonably complete. I still have to add tests for inferring operations from changed text (i.e. testing `SimpleTextInferrer`) & adjusting cursor locations based on operations (i.e. testing `SimpleCursorApplier`).

I found the use of FlowType invaluable for my sanity while working on this project.

```
Copyright (c) 2017, Kenrick Rilee

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
