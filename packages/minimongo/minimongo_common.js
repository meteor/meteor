import LocalCollection_ from './local_collection.js';
import Matcher from './matcher.js';
import Sorter from './sorter.js';

LocalCollection = LocalCollection_;
Minimongo = {
    LocalCollection: LocalCollection_,
    Matcher,
    Sorter
};
