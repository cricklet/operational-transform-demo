
require('object.observe')
require('array.observe')

type Observer = ((changes: any) => void)

export function unobserveArray <O> (array: Array<O>, observer: Observer): void {
  Array.unobserve(array, observer)
}

export function unobserveObject <O> (object: O, observer: Observer): void {
  Object.unobserve(object, observer)
}

export function observeArray <O> (
  objects: Array<O>,
  onAdd: (obj: O) => void,
  onRemove: (obj: O) => void
): Observer {
  let observer = (changes) => {
    for (let change of changes) {
      if (change.type === 'splice') {
        for (let removed of change.removed) {
          onRemove(removed)
        }
        for (let i = 0; i < change.addedCount; i ++) {
          onAdd(objects[change.index + i])
        }
      }
    }
  }
  Array.observe(objects, observer)
  return observer
}

export function observeEach <O> (
  objects: Array<O>,
  map: (obj: O) => void,
): Observer {
  observeArray(objects,
    o => {
      map(o)
    },
    o => {})
  for (let o of objects) {
    map(o)
  }
}

export function observeObject <O> (
  object: O,
  onKeyAdded: (obj: O, key: string) => void,
  onKeyRemoved: (obj: O, key: string) => void,
  onKeyChanged: (obj: O, key: string) => void
): Observer {
  let observer = (changes) => {
    for (let change of changes) {
      if (change.type === 'add') {
        onKeyAdded(object, change.name)
      }
      if (change.type === 'update') {
        onKeyChanged(object, change.name)
      }
      if (change.type === 'delete') {
        onKeyRemoved(object, change.name)
      }
    }
  }
  Object.observe(object, observer)
  return observer
}

export function autoFill <T> (source: Array<T>, destination: {[key: string]: T}, key: (t: T) => string, val?: (t: T) => string) {
  if (val === undefined) {
    val = t => t
  }
  for (let t of source) {
    destination[key(t)] = val(t)
  }
  observeArray(source,
    (t) => destination[key(t)] = val(t),
    (t) => delete destination[key(t)])
}
