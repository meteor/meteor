import LocalCollection_ from './local_collection.js';
import Matcher from './matcher.js';
import Sorter from './sorter.js';
import { _setAllowStringWhere, _getAllowStringWhere } from './common.js';

LocalCollection = LocalCollection_;
Minimongo = {
    LocalCollection: LocalCollection_,
    Matcher,
    Sorter,
    _setAllowStringWhere,
    _getAllowStringWhere,
};
