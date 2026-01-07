export function increment(x: bigint): bigint {
  return x + 1n;
}

export function max(array: bigint[]): bigint {
  let len = array.length;
  let maxValue = 0n;
  // eslint-disable-next-line no-plusplus
  while (len--) {
    const x = array[len];
    if (x === undefined) {
      continue;
    }
    if (x > maxValue) {
      maxValue = x;
    }
  }
  return maxValue;
}
