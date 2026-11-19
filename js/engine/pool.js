/** @template T */
export class ObjectPool {
  /** @type {T[]} */
  #available = [];

  /**
   * @param {() => T} create
   * @param {number} [capacity]
   */
  constructor(create, capacity = Infinity) {
    this.create = create;
    this.capacity = capacity;
  }

  /** @returns {T} */
  acquire() {
    return this.#available.pop() ?? this.create();
  }

  /** @param {T} item */
  release(item) {
    if (this.#available.length < this.capacity) this.#available.push(item);
  }

  /** @param {T[]} active */
  releaseAll(active) {
    for (const item of active) this.release(item);
    active.length = 0;
  }
}
