SQRT Skip List
===

Not to be confused with [Skip list](http://en.wikipedia.org/wiki/Skip_list) -
randomized data structure with O(n) space and O(log n) time asymptote in average
case and O(n log n) space and O(n) time asymptote in the worst case for insert,
search and delete (no random access). (Actually, random access can be achieved
in O(log n) time asymptote in a slightly modified version but this is not it
anyways.)

Since I don't remember the exact name of this data structure, and it uses [SQRT
decomposition](http://www.quora.com/Competitive-Programming/How-does-the-technique-that-divides-N-elements-into-sqrt-N-buckets-sqrt-N-decomposition-work)
optimization, I called it "SQRT Skip list". It is similar to the original Skip
list only by the property it is a list and sometimes something is skipped.

Concepts
---

The idea of SQRT decomposition is to divide the items into B blocks, where B is
close to SQRT(N) (N is the number of items). Having a pointer to the beginning
of each of B blocks is helpful and allows us to insert, delete, random access
items in O(B) time complexity with O(B) memory overhead. No search by the
indexed value (different from Skip list) unless the list is sorted by the index
value - then the search will take O(B) time as well.

The asymptote is O(B) as N = B * B: we have B blocks, each containing B items.
Whenever we want to access an item on position I, we would jump to its block
(I / B) and then iterate to the item in O(B) steps.

Adjustments of B block pointers takes O(B) steps as we would move each
pointer forward or backward in O(1) steps.


Rebalancing
---

Well, the size is always changing whenever you insert a new item, or remove
something. Over time the chosen B (block size) becomes outdated and not that
optimal. There why there should be rebalancing based on a new B size.

The current idea is to choose a new B every time the number of blocks is either
twice as much or twice as little as the ideal number of blocks (N/B).

If my math is correct (which I need to check :), the amortized asymptote of
every operation remains O(B).


