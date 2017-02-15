/* @flow */

"use strict"

import { expect } from 'chai'
import { spy } from 'sinon'
import { assert } from 'chai'

import {
  Greater,
  Equal,
  Less,
  range,
  specificRange,
  reverseRange,
  reverseSpecificRange,
  calculatePrefixLength,
  calculatePostfixLength,
  maxOfIterable,
  allKeys,
  repeat,
  concat,
  characters,
  substring,
  removeTail,
  reverse,
  reverseString,
  rearray,
  findIndex,
  findLastIndex,
  pop,
  maybePush,
  flatten,
  filterInPlace,
  skipNulls,
  filter,
  reiterable
} from './utils'

import { Notify, NotifyAfter, NotifyOnce } from './utils.js'

import type { Comparison, Tree } from './utils.js'

describe('skipNulls', () => {
  it ('works', () => {
    let vs = skipNulls(reiterable([1,2,null,3,4,undefined,5]))
    assert.deepEqual(
      rearray(vs),
      [1,2,3,4,5])
  })
})
describe('iterators', () => {
  it ('range() works', () => {
    assert.deepEqual(
      rearray(range(6)),
      [0,1,2,3,4,5])
  })
  it ('reverseRange() works', () => {
    assert.deepEqual(
      rearray(reverseRange(6)),
      [5,4,3,2,1,0])
  })

  it ('specificRange() works', () => {
    assert.deepEqual(
      rearray(specificRange(2, 9, 2)),
      [2,4,6,8])
  })
  it ('reverseSpecificRange() matches specificRange()', () => {
    assert.deepEqual(
      rearray(reverseSpecificRange(2, 9, 2)),
      rearray(specificRange(2, 9, 2)).reverse())
    assert.deepEqual(
      rearray(reverseSpecificRange(2, 10, 2)),
      rearray(specificRange(2, 10, 2)).reverse())
    assert.deepEqual(
      rearray(reverseSpecificRange(2, 10, 3)),
      rearray(specificRange(2, 10, 3)).reverse())
  })
})

describe('repeat', () => {
  it ('counts', () => {
    let counter = (i) => { return i }

    assert.deepEqual(
      rearray(repeat(10, counter)),
      [0,1,2,3,4,5,6,7,8,9])
  })
})

describe('filterInPlace', () => {
  it ('works', () => {
    let vs = [0,1,2,3,4,5,6]

    filterInPlace(vs, v => v < 4)
    assert.deepEqual(vs, [0,1,2,3])
  })
})

describe('pop', () => {
  it ('works', () => {
    let check = x => { return x.a != null && x.a === true }

    assert.deepEqual(
      pop([{'a': false}, {'b': true}, {'a': true}], check),
      {'a': true})

    assert.deepEqual(
      pop([{'a': true}, {'b': true}, {'a': false}], check),
      {'a': true})

    assert.deepEqual(
      pop([{'a': false}, {'b': true}, {'a': false}], check),
      undefined)
  })
})

describe('flatten', () => {
  it ('works', () => {
    let x: Tree<number> = [1,2,[3,[4]],5,[6],[7,8]]
    assert.deepEqual(
      flatten(x),
      [1,2,3,4,5,6,7,8])
  })
})
describe('maybePush', () => {
  it ('works', () => {
    assert.deepEqual(
      maybePush([1,2,3], undefined)
      [1,2,3])
    assert.deepEqual(
      maybePush([1,2,3], 4)
      [1,2,3,4])
  })
})

describe('concat', () => {
  it ('works', () => {
    assert.deepEqual(
      concat([1,2,3], [4,5,6]),
      [1,2,3,4,5,6])
    assert.deepEqual(
      concat([1,2,3], [4]),
      [1,2,3,4])
  })
})

describe('concat', () => {
  it ('works', () => {
    assert.deepEqual(
      concat([1,2,3], [4,5,6]),
      [1,2,3,4,5,6])
    assert.deepEqual(
      concat([1,2,3], [4]),
      [1,2,3,4])
  })
})

describe('reverse', () => {
  it ('works', () => {
    assert.deepEqual(
      rearray(reverseString('asdf')),
      ['f', 'd', 's', 'a'])
  })
})

describe('characters', () => {
  it ('works', () => {
    assert.deepEqual(
      rearray(characters('asdf')),
      ['a','s','d','f'])
    assert.deepEqual(
      rearray(characters('asdf', range(2))),
      ['a','s'])
  })
})

describe('removeTail', () => {
  it ('works', () => {
    assert.deepEqual(
      rearray(removeTail('asdf', 1)),
      ['a','s','d'])
    assert.deepEqual(
      rearray(removeTail('asdf', 2)),
      ['a','s'])
  })
})

describe('substring', () => {
  it ('works', () => {
    assert.deepEqual(
      rearray(substring('012345', {'start': 3})),
      ['3','4','5'])
    assert.deepEqual(
      rearray(substring('012345', {'start': 3, 'stop': 5})),
      ['3','4'])
    assert.deepEqual(
      rearray(substring('012345', {'step': 2})),
      ['0','2','4'])
  })
})

describe('string diffing', () => {
  it ('calculatePrefixLength() works', () => {
    assert.deepEqual(
      6,
      calculatePrefixLength(
        () => '012345asdf',
        () => '0123456789'))
    assert.deepEqual(
      6,
      calculatePrefixLength(
        () => '012345asdf',
        () => '012345'))
    assert.deepEqual(
      6,
      calculatePrefixLength(
        () => '012345',
        () => '012345'))
  })
  it ('calculatePostfixLength() works', () => {
    assert.deepEqual(
      3,
      calculatePostfixLength(
        '9876543210',
        'asdfasd210'))
    assert.deepEqual(
      6,
      calculatePostfixLength(
        '012345',
        '012345'))
    assert.deepEqual(
      3,
      calculatePostfixLength(
        '9876543210',
        '210'))
    assert.deepEqual(
      0,
      calculatePostfixLength(
        '9876543210',
        '987'))
  })
})

describe('maxOfIterable', () => {
  it ('works', () => {
    let intComparitor = (x: number, y: number) => {
      if (x > y) return Greater
      if (x < y) return Less
      if (x === y) return Equal
      throw new Error('wat')
    }
    let ints = [2,5,3,6,1,9,3,5]
    let maxInt = Math.max(...ints)
    assert.equal(maxInt, maxOfIterable(() => ints, intComparitor))
  })
})

describe('allKeys', () => {
  it ('works', () => {
    expect(
      Array.from(allKeys({'a': 1, 'b': 2, 'c': 3}, {'b': 4, 'c': 4, 'd': 5})))
      .to.include.members(['a', 'b', 'c', 'd'])
  })
})

describe('findIndex', () => {
  it ('works', () => {
    assert.equal(
      findIndex(i => i >= 4, [0,1,2,3,4,5,6,7]),
      4)
    assert.equal(
      findIndex(i => i < 4, [0,1,2,3,4,5,6,7]),
      0)
  })
})

describe('findLastIndex', () => {
  it ('works', () => {
    assert.equal(
      findLastIndex(i => i >= 4, [0,1,2,3,4,5,6,7]),
      7)
    assert.equal(
      findLastIndex(i => i <= 4, [0,1,2,3,4,5,6,7]),
      4)
  })
})

function asyncTest(f) {
  return (done) => {
    f().then(done).catch(done)
  }
}
function sleep(time) {
  return new Promise((resolve, reject) => setTimeout(resolve, 0.01 * time))
}


describe('Notify', () => {
  it('notify', asyncTest(async () => {
		let n = new Notify()
    let successes = 0

		;(async () => {
			await n.wait()
      successes += 1
		})()

  	;(async () => {
  		await n.wait()
      successes += 1
  	})()

		;(async () => {
			await n.wait()
      successes += 1
		})()

    await n.notify()
    await sleep(0)

    assert.equal(successes, 3)
	}))

  it('notify', asyncTest(async () => {
		let n = new NotifyAfter(3)

    let successes = 0

		;(async () => {
			await n.wait()
      successes += 1
		})()

  	;(async () => {
  		await n.wait()
      successes += 1
  	})()

		;(async () => {
			await n.wait()
      successes += 1
		})()

    await n.notify()
    await sleep(0)

    assert.equal(successes, 0)

    await n.notify()
    await sleep(0)

    assert.equal(successes, 0)

    await n.notify()
    await sleep(0)

    assert.equal(successes, 3)
	}))

  it('notify once', asyncTest(async () => {
		let n = new NotifyOnce()

    let successes = 0

		;(async () => {
			await n.wait()
      successes += 1
		})()

  	;(async () => {
  		await n.wait()
      successes += 1
  	})()

    await sleep(0)
    assert.equal(successes, 0)

    await n.notify() // THE ONLY NOTIFY
    await sleep(0)

    assert.equal(successes, 2)

		;(async () => {
			await n.wait()
      successes += 1
		})()

    await sleep(0)
    assert.equal(successes, 3)
	}))
})
