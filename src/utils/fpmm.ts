import BigNumber from "bignumber.js";

const COLLATERAL_SCALE_DEC = new BigNumber(1_000_000);
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

export const ZERO_BD = new BigNumber(0);

export { ADDRESS_ZERO };

export function timestampToDay(timestamp: number): bigint {
  return BigInt(Math.floor(timestamp / 86400));
}

/**
 * Nth root using Newton's method (integer approximation).
 * Adapted from the original AssemblyScript implementation.
 */
export function nthRoot(x: bigint, n: number): bigint {
  if (n <= 0) return 0n;
  if (x === 0n) return 0n;

  const nBig = BigInt(n);
  let root = x;
  let deltaRoot: bigint;

  do {
    let rootPowNLess1 = 1n;
    for (let i = 0; i < n - 1; i++) {
      rootPowNLess1 = rootPowNLess1 * root;
    }
    deltaRoot = (x / rootPowNLess1 - root) / nBig;
    root = root + deltaRoot;
  } while (deltaRoot < 0n);

  return root;
}

/**
 * Calculate outcome token prices from amounts.
 * price[i] = product / amounts[i] / sum(product / amounts[j] for all j)
 */
export function calculatePrices(outcomeTokenAmounts: bigint[]): BigNumber[] {
  const len = outcomeTokenAmounts.length;
  const prices = new Array<BigNumber>(len).fill(ZERO_BD);

  let totalBalance = 0n;
  let product = 1n;
  for (let i = 0; i < len; i++) {
    totalBalance += outcomeTokenAmounts[i]!;
    product *= outcomeTokenAmounts[i]!;
  }

  if (totalBalance === 0n) return prices;

  let denominator = 0n;
  for (let i = 0; i < len; i++) {
    denominator += product / outcomeTokenAmounts[i]!;
  }

  if (denominator === 0n) return prices;

  const denom = new BigNumber(denominator.toString());
  for (let i = 0; i < len; i++) {
    // price = (product / amounts[i]) / denominator
    const numerator = product / outcomeTokenAmounts[i]!;
    prices[i] = new BigNumber(numerator.toString()).dividedBy(denom);
  }

  return prices;
}

export function scaleBigInt(value: bigint): BigNumber {
  return new BigNumber(value.toString()).dividedBy(COLLATERAL_SCALE_DEC);
}

export function maxBigInt(arr: bigint[]): bigint {
  let max = 0n;
  for (const v of arr) {
    if (v > max) max = v;
  }
  return max;
}
