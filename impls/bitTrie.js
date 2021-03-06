var nodeSize = 32;
var nodeBits = 5;
var nodeBitmask = 31;

function PersistentVector() {
  var len = arguments.length;
  var nodes = [];
  var lowerNodes;
  var node;
  var i;
  var depth = 1;

  for (i = 0; i < len; i += nodeSize) {
    node = [].slice.call(arguments, i, i + nodeSize);
    nodes.push(node);
  }

  while(nodes.length > 1) {
    lowerNodes = nodes;
    nodes = [];
    for (i = 0; i < lowerNodes.length; i += nodeSize) {
      node = lowerNodes.slice(i, i + nodeSize);
      nodes.push(node);
    }
    depth++;
  }

  this._contents = nodes[0];
  this.length = len;
  if (!this._contents) {
    this._maxShift = 0;
  } else {
    this._maxShift = nodeBits * (depth - 1);
  }
}

function cloneVec(vec) {
  var newVec = new PersistentVector();
  newVec._contents = vec._contents;
  newVec.length = vec.length;
  newVec._maxShift = vec._maxShift;
  return newVec;
}

PersistentVector.prototype.get = function PersistentVector__get(index) {
  if (index >= 0 && index < this.length) {
    var shift = this._maxShift;
    var node = this._contents;
    while (shift > 0) {
      node = node[(index >> shift) & nodeBitmask];
      shift -= nodeBits;
    }
    return node[index & nodeBitmask];
  }
}

function internalSet(vec, index, val) {
  var newVec = cloneVec(vec);
  var node = newVec._contents = vec._contents.slice();
  var shift = vec._maxShift;
  while (shift > 0) {
    var childIndex = (index >> shift) & nodeBitmask;
    if (node[childIndex]) {
      node[childIndex] = node[childIndex].slice();
    } else {
      // Need to create new node. Can happen when inserting element.
      node[childIndex] = new Array(nodeSize);
    }
    node = node[childIndex];
    shift -= nodeBits;
  }
  node[index & nodeBitmask] = val;
  return newVec;
}

PersistentVector.prototype.set = function PersistentVector__set(index, val) {
  if (index >= this.length || index < 0) {
    throw new Error('setting past end of vector is not implemented');
  }
  return internalSet(this, index, val);
};

PersistentVector.prototype.push = function PersistentVector__push(val) {
  if ((this.length & nodeBitmask) > 0) {
    // There's already room for the new element, so this is just a
    // simple set.
    var newVec = internalSet(this, this.length, val);
    newVec.length++;
    return newVec;
  } else if (this.length === 0) {
    // Empty vector? Just create a new one with the pushed value.
    return new PersistentVector(val);
  } else if (this.length < ((nodeBitmask + 1) << this._maxShift)) {
    // The root is ok, but we'll need to create some new nodes.
    // Actually, the implementation is the same as before - see the
    // case where level[subLevelIndex] is undefined in internalSet.
    // However, maybe that code should live here, not there, I dunno.
    var newVec = internalSet(this, this.length, val);
    newVec.length++;
    return newVec;
  } else {
    // We'll need a new root node.
    var newVec = cloneVec(this);
    newVec.length++;
    newVec._maxShift += nodeBits;
    var node = [];
    newVec._contents = [this._contents, node];
    var depth = newVec._maxShift / nodeBits;
    for (var i = 1; i < depth; i++) { // XXX I don't understand why this is
                                      // 1 and not 2 (as it was in vectorTrie)
      var newNode = [];
      node.push(newNode);
      node = newNode;
    }
    node[0] = val;
    return newVec;
  }
};

function popTree (tree, length) {
  // This only works when leaf node only has one element to be removed.
  // This also only works when depth is greater or equal to 2. If depth is 1,
  // we handle it in the pop method.
  var depth = Math.ceil(Math.log(length)/Math.log(32));
  var cloned = tree.slice();
  if (depth == 2) {
    // Base case
    var index = (length - 1) / Math.pow(32, depth-1);
    cloned[index] = null;
    return cloned;
  }
  var capacitySubtree = Math.pow(32, depth-1);
  var index = Math.floor((length-1)/capacitySubtree);
  var subtree = cloned[index];
  var subtreeLength = length - (index * capacitySubtree);
  cloned[index] = popTree(subtree, subtreeLength);
  return cloned;
}

PersistentVector.prototype.pop = function PersistentVector__pop() {
  // FIXME: don't use slice for this
  var clone;
  if (this.length == 0) {
    return this;
  }
  
  var quotient = Math.log(this.length-1)/Math.log(32);
  if (quotient == Math.floor(quotient)) {
    // This is the case of when we need to decrease the depth of the tree.
    clone = cloneVec(this);
    clone._contents = clone._contents[0];
    clone.length -= 1;
    clone._maxShift -= 5;
    return clone;
  }

  if (this.length % 32 != 1) {
    // This case is when we need to just remove an element in the leaf node 
    // withouth remove the leaf. We are only setting the last element to null
    // so it gets garbage collected!
    clone = internalSet(this, this.length-1, null);
    clone.length -= 1;
    return clone;
  }

  // Only one case left! That is where we need to remove a leaf node from the 
  // tree.
  clone = cloneVec(this);
  clone._contents = popTree(clone._contents, clone.length);
  clone.length -= 1;
  return clone;
};

PersistentVector.prototype.slice = function PersistentVector__slice(begin, end) {
  // FIXME
  // This is gonna be hard to do right, involving an offset.
  // Just to make the tests pass, here is a cheating and bogus implementation
  // that does a bad thing.
  var newVec = new PersistentVector();
  if (end === undefined || typeof end !== 'number' || end > this.length) {
    end = this.length;
  }
  if (begin === undefined || typeof begin !== 'number' || begin < 0) {
    begin = 0;
  }
  for (var i = begin; i < end; i++) {
    newVec = newVec.push(this.get(i));
  }
  return newVec;
};

PersistentVector.prototype.equals = function PersistentVector__equals(other) {
  // FIXME: way slower than necessary
  // in particular, you can compare subtrees in the case that they are the
  // same object & save time... make vec.equals(vec) super fast,
  // or vec.push(2).equals(vec.push(2)) really fast as well
  var val;
  if (this.length !== other.length) return false;
  for (var i = 0; i < this.length; i++) {
    val = this.get(i);
    if (val instanceof PersistentVector) {
      if (!val.equals(other.get(i))) {
        return false;
      }
    } else {
      if (val !== other.get(i)) {
        return false;
      }
    }
  }
  return true;
};

PersistentVector.prototype.toArray = function PersistentVector__toArray() {
  // FIXME: way slower than necessary
  var out = [];
  for (var i = 0; i < this.length; i++) {
    out.push(this.get(i));
  }
  return out;
};

module.exports = PersistentVector;
