// https://github.com/yuanchuan/find/blob/master/index.js

/**
 * Simple asynchronous tool for saving my life.
 */

/**
 * A wrapper function create a `Chain` instance at the same
 * time initializes the `queue` with a serial of arguments.
 */
module.exports = function() {
  var s = new Chain();
  return s.__init.apply(s, arguments);
}


/**
 * Chain constructor.
 * @api pivate
 */
function Chain() {
  this.queue = [];
  this.onend = function(err) {};
  this.pass = true;
}


/**
 * Trying to Initialize the `queue` with a serial of arguments.
 *
 * @api private
 */
Chain.prototype.__init = function() {
  this.queue = [].slice.call(arguments);
  return this;
}


/**
 * Add a `job` or an array of `jobs` into the Chain.
 * A `job` is defined by a function.
 *
 * @param {Function|Array} a function or an array of functions
 * @return {Chain}
 * @api public
 */
Chain.prototype.add = function() {
  var jobs = [].slice.call(arguments);
  jobs.forEach(
    (function(job) {
      this.queue.push.apply(
        this.queue, Array.isArray(job) ? job : [job]
      );
    }).bind(this)
  );
  return this;
}


/**
 * The iterator of the Chain. When it reaches end then call
 * call the callback function.
 *
 * @return {Chain}
 * @api public
 */
Chain.prototype.next = function() {
  if (!this.pass) return this;
  if (this.queue.length) {
    this.queue.shift().call();
  } else {
    this.onend();
  }
  return this;
}


/**
 * Terminate the chain.
 *
 * @return {Chain}
 * @api public
 */
Chain.prototype.stop = function() {
  this.pass = false;
  this.onend.apply(this, arguments);
  return this;
}


/**
 * Start iterating through the Chain and ends with the
 * given callback.
 *
 * @param {Function} end callback
 * @return {Chain}
 * @api public
 */
Chain.prototype.traverse = function(fn) {
  fn && fn.call && fn.apply && (this.onend = fn);
  this.next();
  return this;
}