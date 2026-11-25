// Read-only Ethereum adapter. All state changes are signed in the user's browser.
require("dotenv").config();
const http = require("node:http");
const fs = require("node:fs");
const { ethers } = require("ethers");
const network = process.env.REGISTRY_NETWORK || "localhost";
if (!["sepolia", "localhost"].includes(network))
  throw Error("Unsupported network");
const chainId = network === "sepolia" ? 11155111 : 31337;
const abi = [
  "function administrator() view returns(address)",
  "function parcels(string) view returns(address owner,bytes32 documentHash,address proposedOwner)",
  "event Registered(string propertyId,address indexed owner,bytes32 documentHash)",
  ...["Initiated", "Approved", "Rejected"].map(
    (kind) =>
      "event Transfer" +
      kind +
      "(string propertyId,address indexed previousOwner,address indexed newOwner)",
  ),
];
const provider = new ethers.JsonRpcProvider(
  network === "localhost"
    ? process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545"
    : process.env.SEPOLIA_RPC_URL,
  undefined,
  { cacheTimeout: -1 },
);
async function connection() {
  const info = JSON.parse(fs.readFileSync("deployments/" + network + ".json"));
  if (
    Number((await provider.getNetwork()).chainId) !== chainId ||
    info.chainId !== chainId ||
    (await provider.getCode(info.address)) === "0x"
  )
    throw Error("Deployment unavailable");
  const origin = await provider.getBlock(info.startBlock);
  if (!info.deploymentBlockHash || origin?.hash !== info.deploymentBlockHash)
    throw Error("Deployment block changed");
  const contract = new ethers.Contract(info.address, abi, provider);
  return { info, contract };
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === "POST" && url.pathname === "/recover") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) return send(400, {});
        }
        const { message, signature } = JSON.parse(body);
        try {
          return send(200, {
            wallet: ethers.verifyMessage(message, signature).toLowerCase(),
          });
        } catch {
          return send(400, {});
        }
      }
      const { info, contract } = await connection();
      if (url.pathname === "/config")
        return send(200, {
          ...info,
          administrator: await contract.administrator(),
          network,
          available: true,
        });
      if (url.pathname === "/record") {
        const blockTag = Number(url.searchParams.get("block"));
        if (!Number.isSafeInteger(blockTag) || blockTag < info.startBlock)
          return send(400, {});
        const p = await contract.parcels(url.searchParams.get("id"), {
          blockTag,
        });
        return send(200, {
          owner: p.owner.toLowerCase(),
          digest: p.documentHash.slice(2),
          proposed: p.proposedOwner.toLowerCase(),
        });
      }
      if (url.pathname === "/events") {
        const from = Math.max(
          info.startBlock,
          Number(url.searchParams.get("from")),
        );
        // Sepolia indexes finalized blocks. Local Hardhat mines deterministically.
        const head = (
          await provider.getBlock(
            network === "sepolia" ? "finalized" : "latest",
          )
        ).number;
        const to = Math.min(from + 499, head);
        const logs =
          from <= to ? await contract.queryFilter("*", from, to) : [];
        const timestamps = new Map();
        const events = [];
        for (const log of logs) {
          const decoded = contract.interface.parseLog(log);
          if (!decoded) continue;
          if (!timestamps.has(log.blockNumber))
            timestamps.set(
              log.blockNumber,
              (await provider.getBlock(log.blockNumber)).timestamp,
            );
          events.push({
            type: decoded.name,
            id: decoded.args.propertyId,
            previous: (
              decoded.args.previousOwner || ethers.ZeroAddress
            ).toLowerCase(),
            wallet: (decoded.args.newOwner || decoded.args.owner).toLowerCase(),
            digest: decoded.args.documentHash?.slice(2) || "",
            hash: log.transactionHash,
            block: log.blockNumber,
            index: log.index,
            time: timestamps.get(log.blockNumber),
          });
        }
        return send(200, {
          deployment:
            chainId +
            ":" +
            info.address.toLowerCase() +
            ":" +
            info.deploymentBlockHash,
          next: Math.max(from, to + 1),
          events,
          head,
        });
      }
      send(404, {});
    } catch {
      send(503, {
        message:
          "Ethereum connection unavailable. Check the selected RPC and deployed contract.",
      });
    }
  })
  .listen(8546, "127.0.0.1", () =>
    console.log("LandLedger read-only bridge on 127.0.0.1:8546"),
  );
