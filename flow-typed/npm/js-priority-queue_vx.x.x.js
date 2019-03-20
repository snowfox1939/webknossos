// flow-typed signature: f7c845aa1ded4959c457c2cb20ea95f5
// flow-typed version: <<STUB>>/js-priority-queue_v0.1.5/flow_v0.91.0

/**
 * This is an autogenerated libdef stub for:
 *
 *   'js-priority-queue'
 *
 * Fill this stub out by replacing all the `any` types.
 *
 * Once filled out, we encourage you to share your work with the
 * community by sending a pull request to:
 * https://github.com/flowtype/flow-typed
 */

declare module "js-priority-queue" {
  declare class PriorityQueue<T> {
    length: number;

    constructor(
      options?: $Shape<{ comparator: (T, T) => number, initialValues: Array<T> }>,
    ): PriorityQueue<T>;
    queue(value: T): void;
    peek(): T;
    dequeue(): T;
    clear(): void;
  }
  declare module.exports: typeof PriorityQueue;
}
