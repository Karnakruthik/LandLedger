import { BrowserProvider, Contract } from "ethers";
import { api } from "./api";
const abi = [
  "function registerProperty(string,address,bytes32)",
  "function initiateTransfer(string,address)",
  "function reviewTransfer(string,address,bool)",
];
async function signer() {
  if (!window.ethereum)
    throw Error(
      "MetaMask is unavailable. Open this portal in a browser with MetaMask enabled.",
    );
  await window.ethereum.request({ method: "eth_requestAccounts" });
  return new BrowserProvider(window.ethereum).getSigner();
}
export async function linkWallet() {
  const wallet = await signer();
  const { message } = await api("/wallet/challenge", { method: "POST" });
  return api("/wallet/link", {
    method: "POST",
    body: { signature: await wallet.signMessage(message) },
  });
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
