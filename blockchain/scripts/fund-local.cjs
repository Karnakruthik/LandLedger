const { ethers } = require("ethers");
async function main() {
  const recipient = ethers.getAddress(process.argv[2]);
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  if ((await provider.getNetwork()).chainId !== 31337n)
    throw Error("Local Hardhat chain required");
  const sender = await provider.getSigner(0);
  const receipt = await (
    await sender.sendTransaction({
      to: recipient,
      value: ethers.parseEther("1"),
    })
  ).wait();
  console.log(
    "Sent 1 local test ETH to",
    recipient,
    "in block",
    receipt.blockNumber,
  );
}
main().catch((e) => {
  console.error(e.shortMessage || e.message);
  process.exitCode = 1;
});
