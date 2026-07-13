import { keccak256, encodePacked, concat, getAddress } from "viem";

export function computeCreate2Address(
  deployer: `0x${string}`,
  salt: `0x${string}`,
  initCodeHash: `0x${string}`,
): `0x${string}` {
  const hash = keccak256(
    concat(["0xff" as `0x${string}`, deployer, salt, initCodeHash]),
  );
  // Take last 20 bytes as address, EIP-55 checksummed: envio delivers event
  // params checksummed (default address_format), and Wallet entity ids must
  // match exactly for the USDC Transfer balance lookups to hit.
  return getAddress(`0x${hash.slice(26)}`);
}

export function generateProxyWalletBytecode(
  factory: `0x${string}`,
  implementation: `0x${string}`,
): `0x${string}` {
  const factoryHex = factory.slice(2).toLowerCase();
  const implHex = implementation.slice(2).toLowerCase();
  const bytecodeHex =
    "3d3d606380380380913d393d73" +
    factoryHex +
    "5af4602a57600080fd5b602d8060366000396000f3363d3d373d3d3d363d73" +
    implHex +
    "5af43d82803e903d91602b57fd5bf352e831dd" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    "0000000000000000000000000000000000000000000000000000000000000000";

  return `0x${bytecodeHex}` as `0x${string}`;
}

export function computeProxyWalletAddress(
  signer: `0x${string}`,
  factory: `0x${string}`,
  implementation: `0x${string}`,
): `0x${string}` {
  const salt = keccak256(encodePacked(["address"], [signer]));
  const initCode = generateProxyWalletBytecode(factory, implementation);
  const initCodeHash = keccak256(initCode);
  return computeCreate2Address(factory, salt, initCodeHash);
}
