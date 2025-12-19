import {
  keccak256,
  concatHex,
  hexToBytes,
  bytesToHex,
  type Address,
  type Hex,
} from "viem";

export function generateProxyWalletBytecode(
  factory: Address,
  implementation: Address
): Hex {
  const bytecodeHex =
    "0x" +
    "3d3d606380380380913d393d73" +
    factory.slice(2).toLowerCase() +
    "5af4602a57600080fd5b602d8060366000396000f3363d3d373d3d3d363d73" +
    implementation.slice(2).toLowerCase() +
    "5af43d82803e903d91602b57fd5bf352e831dd" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    "0000000000000000000000000000000000000000000000000000000000000000";

  return bytecodeHex as Hex;
}

export function computeProxyWalletAddress(
  signer: Address,
  factory: Address,
  implementation: Address
): string {
  // salt = keccak256(signer)
  const salt = keccak256(signer);

  // init code hash
  const initCode = generateProxyWalletBytecode(factory, implementation);
  const initCodeHash = keccak256(initCode);

  // CREATE2: keccak256(0xff ++ factory ++ salt ++ initCodeHash)[12:]
  const packed = concatHex(["0xff", factory, salt, initCodeHash]);

  // last 20 bytes
  return `0x${keccak256(packed).slice(26)}`;
}
