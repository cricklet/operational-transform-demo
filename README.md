*Note: this project no longer builds from scratch due to the dependencies being so old*

![](http://cricklet.github.io/images/blue.gif)

This is an implementation/demo of collaborative text editing via operational transforms. It's mostly inspired by Daniel Spiewak's [description](http://www.codecommit.com/blog/java/understanding-and-applying-operational-transformation) of operational transform.

This implementation includes transformation/composition of operations, generation of operations based on text changes, and application of operations to text. In addition, it includes all the logic necessary for handling communication and conflict resolution between multiple clients over a high-latency network. [Here's a more detailed write-up](http://cricklet.github.io/sites/blue/index.html).