import {
  SuiClient,
  getFullnodeUrl,
  SuiTransactionBlockResponse,
  ObjectOwner,
} from "@mysten/sui.js/client";
type CoinType = string;
type Address = string;
interface ChageResult {
  [key: Address]: { [key: CoinType]: number };
}

// A public fullnode is used here. It is advised to use a dedicated one.
// In that case just provide the custom URL.
const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

const get_latest_checkpoint = async (): Promise<
  SuiTransactionBlockResponse[]
> => {
  const latest_checkpoint = await client.getLatestCheckpointSequenceNumber();
  // For Sui a checkpoint's id is the sequence number.
  // These terms are used interchangeably.
  const checkpoint = await client.getCheckpoint({ id: latest_checkpoint });

  // A public checkpoint might have pagination here, Mysten's own nodes allow
  // up to 50 transactions per request. This can be adjusted in the fullnode's
  // setting file (fullnode.yaml).
  const transactions = await client.multiGetTransactionBlocks({
    digests: checkpoint.transactions,
    options: {
      showBalanceChanges: true,
    },
  });
  return transactions;
};

const parse_tx = (tx: SuiTransactionBlockResponse, result: ChageResult) => {
  console.log(JSON.stringify(tx, null, 2));
  const ret: ChageResult[] = [];
  if (!tx.balanceChanges) {
    return;
  }
  for (let change of tx.balanceChanges!) {
    // An object may also hold balance, we disregard those.
    if (change.owner !== "Immutable" && "AddressOwner" in change.owner) {
      const coin = change.coinType;
      const address = change.owner.AddressOwner;
      // On Sui you can have positive changes even for a simple transactions
      // because of the gas fee rebates. Whenever storage is freed a portion of
      // the gas payed for that storage is returned (99%).
      // This means that if you merge more than 3 coins during a transaction you will see
      // that the gas is negative (your balance is increased).
      const isNegative = change.amount.indexOf("-") === 0;
      const amount = Number(change.amount.replace("-", ""));
      result[address] = result[address] || {};
      result[address][coin] = result[address][coin] || 0;
      result[address][coin] += isNegative ? -amount : amount;
    }
  }
};

const main = async () => {
  // result is supposed to be a database where you store the changes.
  const result: ChageResult = {};
  const txs = await get_latest_checkpoint();
  for (let tx of txs) {
    parse_tx(tx, result);
  }

  console.log(result);
};

main();
