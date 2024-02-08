import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { fromB64 } from "@mysten/sui.js/utils";

// Using the Sui CLI will result having your private keys stored in:
// ~/.sui/sui_config/sui.keystore
// Getting the key from there requires some manipulation to transform it into a keypair.
// This is mainly because an extra bit is added in front.
const getKeypair = (b64EncodedKey: string) => {
  const privkey: number[] = Array.from(fromB64(b64EncodedKey));
  privkey.shift();
  const privateKey = Uint8Array.from(privkey);
  const keypair = Ed25519Keypair.fromSecretKey(privateKey);

  const address = `${keypair.getPublicKey().toSuiAddress()}`;

  return { address, keypair };
};

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

// Assuming a tx that sends SUI to an address.
// We keep the amount as string because the SDK expects it like that.
// Every Coin is distict in Sui and has a balance.
// If the amount we want to send is bigger than a every single coin's balance,
// we need to merge some coins first.
const buildTx = async (
  from: string, // sender address
  fromCoins: string[], // sender coins
  sponsor: string, // sponsor address
  to: string, // receiver address
  amount: string
) => {
  const tx = new TransactionBlock();
  let fromCoin = tx.object(fromCoins.shift()!);
  // Merging all the coins into the first.
  if (fromCoins.length > 2) {
    tx.mergeCoins(fromCoin, [...fromCoins]);
  }
  const coin = tx.splitCoins(tx.object(fromCoin), [tx.pure.u64(amount)]);
  tx.transferObjects([coin], tx.pure.address(to));
  tx.setSender(from);
  tx.setGasOwner(sponsor);
  return await tx.build({ client });
};

// helper function to read the coins of an address:
const getCoins = async (address: string) => {
  const coins = await client.getCoins({
    coinType: "0x2::sui::SUI",
    owner: address,
  });
  if (coins.data.length > 0) {
    return coins.data[0].coinObjectId;
  }
  return null;
};

const main = async () => {
  // Here we create new keypairs everytime thus the example won't work,
  // because the new addresses aren't funded.
  // If you have the Sui CLIn you can your private keys from the keystore:
  // ~/.sui/sui_config/sui.keystore
  // Then you can pass the b64 encoded strings to getKeypair() and obtain a keypair.
  const sponsor = new Ed25519Keypair();
  const from = new Ed25519Keypair();
  const to = new Ed25519Keypair();
  const amount = "1_000_000_000"; // 1 SUI = 10^9 MIST

  const coinId = await getCoins(from.getPublicKey().toSuiAddress());
  if (coinId) {
    const txBytes = await buildTx(
      from.getPublicKey().toSuiAddress(),
      [coinId!],
      sponsor.getPublicKey().toSuiAddress(),
      to.getPublicKey().toSuiAddress(),
      amount
    );
    const { signature: senderSignature, bytes: _b1 } =
      await from.signTransactionBlock(txBytes);
    const { signature: sponsorSignature, bytes: _b2 } =
      await sponsor.signTransactionBlock(txBytes);

    const response = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: [senderSignature, sponsorSignature],
      options: {
        showBalanceChanges: true,
        showEffects: true,
      },
      // "WaitForLocalExecution" will wait for the fullnode to execute the transaction,
      // thus we will get a response.
      // "WaitForEffectsCert" will only wait for validators to execute, thus we will only have
      // confirmation that our transactions has executed, but we will not even know if it succeeded.
      requestType: "WaitForLocalExecution",
    });

    console.log(response);
  }

  main();
};
