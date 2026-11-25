const { ethers, network } = require("hardhat");
const fs = require("node:fs");
async function main() {
  const [signer] = await ethers.getSigners();
  if (!signer)
    throw Error("Configure the deployment signer in blockchain/.env");
  if (network.name === "sepolia" && !process.env.ADMIN_WALLET)
    throw Error("Set ADMIN_WALLET to the reviewer's MetaMask address");
  const admin = process.env.ADMIN_WALLET || signer.address;
  const contract = await (
    await ethers.getContractFactory("LandRegistry")
  ).deploy(admin);
  const receipt = await contract.deploymentTransaction().wait();
  const info = {
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    address: await contract.getAddress(),
    startBlock: receipt.blockNumber,
    deploymentBlockHash: receipt.blockHash,
    administrator: admin,
  };
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(
    "deployments/" + network.name + ".json",
    JSON.stringify(info, null, 2),
  );
  console.log(info);
}
main().catch((e) => {
  console.error(e.shortMessage || e.message);
  process.exitCode = 1;
});
