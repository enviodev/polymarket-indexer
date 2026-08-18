// Simulated events default to the chain start_block (3_764_531), which is
// below most contracts' per-contract start_block — envio 3.7+ drops such
// events before routing ("never reached a handler"). Pin the first fixture
// of each process() call to a block where every configured contract is live;
// later items in the same simulate array inherit it.
export const SIM_BLOCK = { number: 84_902_320 };
