/**
 * Pipeline Utilities
 *
 * Provides utilities for composing functional pipelines of transformations.
 */

/**
 * Pipes a value through a series of functions sequentially.
 * Each function receives the output of the previous function.
 *
 * @param {*} initialValue - The initial value to start the pipeline
 * @param {...Function} functions - Functions to apply in sequence
 * @returns {*} The final result after all functions have been applied
 *
 * @example
 * const result = pipe(
 *   10,
 *   x => x * 2,
 *   x => x + 5,
 *   x => x / 3
 * ); // result = (10 * 2 + 5) / 3 = 8.33...
 */
export function pipe(initialValue, ...functions) {
  return functions.reduce((value, fn) => fn(value), initialValue);
}

/**
 * Creates a pipeline function from an array of functions.
 * The returned function can be called with an initial value.
 *
 * @param {...Function} functions - Functions to compose into a pipeline
 * @returns {Function} A function that takes an initial value and applies all functions
 *
 * @example
 * const pipeline = createPipeline(
 *   x => x * 2,
 *   x => x + 5,
 *   x => x / 3
 * );
 * const result = pipeline(10); // (10 * 2 + 5) / 3 = 8.33...
 */
export function createPipeline(...functions) {
  return (initialValue) => pipe(initialValue, ...functions);
}

