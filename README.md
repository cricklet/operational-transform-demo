![](http://im2.ezgif.com/tmp/ezgif.com-06ee02d99c.gif)

This is an implementation & demo of the operational transform algorithm used for building collaborative systems. This implementation is mostly inspired by Daniel Spiewak's [description](http://www.codecommit.com/blog/java/understanding-and-applying-operational-transformation) of operational transform and Tim Baumann's [python implementation](https://github.com/Operational-Transformation/ot.py).

Originally, I implemented the seminal [Concurrency Control in Groupware Systems](https://www.lri.fr/~mbl/ENS/CSCW/2012/papers/Ellis-SIGMOD89.pdf) by Ellis & Gibbs from 1989. You can see that (unsuccessful) implementation in my [commit history](https://github.com/cricklet/blue.js/commit/749d94b6122dfb90130523bb14a1f734e7de54c4). Don't look too closely :)

The test coverage is reasonably complete. I still have to add tests for inferring operations from changed text (i.e. testing `SimpleTextInferrer`) & adjusting cursor locations based on operations (i.e. testing `SimpleCursorApplier`).

I found the use of FlowType invaluable for my sanity while working on this project.
