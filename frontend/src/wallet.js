import { BrowserProvider, Contract } from "ethers";
import { api } from "./api.js";
const abi = [
  "function registerProperty(string,address,bytes32)",
  "function initiateTransfer(string,address)",
  "function reviewTransfer(string,address,bool)",
];
async function signer() {
  let provider = await BrowserProvider.discover({
    filter: (wallets) => wallets.find((wallet) => wallet.rdns === "io.metamask"),
  });
  if (!provider) {
    const injected = window.ethereum;
    const legacy = injected?.providers?.find((entry) => entry.isMetaMask) ||
      (injected?.isMetaMask && injected);
    if (!legacy) {
      const error = new Error("MetaMask is unavailable in this browser.");
      error.code = "METAMASK_UNAVAILABLE";
      throw error;
    }
    provider = new BrowserProvider(legacy);
  }
  return provider.getSigner();
}
export async function linkWallet() {
  try {
    const wallet = await signer();
    const { message } = await api("/wallet/challenge", { method: "POST" });
    return await api("/wallet/link", {
      method: "POST",
      body: { signature: await wallet.signMessage(message) },
    });
  } catch (error) {
    const code = error.info?.error?.code ?? error.error?.code ?? error.code;
    if (code === 4001 || error.code === "ACTION_REJECTED")
      throw Error("Wallet linking was cancelled. Select Link MetaMask to try again.");
    if (code === -32002)
      throw Error("A MetaMask request is already open. Open the extension to continue.");
    throw error;
  }
}
export async function writeChain(account, method, args, report) {
  const config = await api("/public/config");
  if (!config.available)
    throw Error(
      "Blockchain connection unavailable. Check the RPC and deployed registry.",
    );
  const wallet = await signer();
  if ((await wallet.getAddress()).toLowerCase() !== account.wallet)
    throw Error("Select your linked wallet in MetaMask.");
  if (Number((await wallet.provider.getNetwork()).chainId) !== config.chainId)
    throw Error(
      "Switch MetaMask to " +
        config.network +
        " (chain " +
        config.chainId +
        ").",
    );
  const contract = new Contract(config.address, abi, wallet);
  const sent = await contract[method](...args);
  report(
    "Transaction submitted to " +
      config.network +
      ". Waiting for confirmation. " +
      sent.hash,
  );
  await sent.wait();
  try {
    await api("/chain/sync", { method: "POST" });
  } catch {
    report(
      "Transaction mined. The registry will synchronize when the connection returns. " +
        sent.hash,
    );
    return;
  }
  report(
    "Transaction mined. " +
      (config.network === "sepolia"
        ? "The registry updates after Ethereum finality. "
        : "") +
      sent.hash,
  );
}
