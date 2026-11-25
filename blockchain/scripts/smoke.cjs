// Run only against a dedicated local QA database, bridge and deployment.
const assert = require("node:assert/strict");
const { ethers } = require("ethers");
const fs = require("node:fs");
const crypto = require("node:crypto");
const base = "http://127.0.0.1:18080/api";
async function request(path, token, body, expected = 200) {
  const headers = token ? { Authorization: "Bearer " + token } : {};
  const method = body === undefined ? "GET" : "POST";
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers, body });
  const data = await res.json();
  assert.equal(res.status, expected, path + " " + (data.message || ""));
  return data;
}
async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  assert.equal((await provider.getNetwork()).chainId, 31337n);
  const config = await request("/public/config");
  assert.equal(config.chainId, 31337);
  assert.equal(config.available, true);
  const suffix = crypto.randomUUID().slice(0, 8);
  const password = crypto.randomBytes(24).toString("hex");
  const signup = (role) =>
    request("/auth/signup", null, {
      name: "QA " + role,
      email: role + suffix + "@example.test",
      password,
      role,
    });
  const owner = await signup("LANDOWNER"),
    buyer = await signup("BUYER");
  const admin = await request("/auth/login", null, {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  const registrar = await provider.getSigner(0),
    seller = new ethers.NonceManager(
      ethers.Wallet.createRandom().connect(provider),
    ),
    purchaser = ethers.Wallet.createRandom().connect(provider);
  await (
    await registrar.sendTransaction({
      to: await seller.getAddress(),
      value: ethers.parseEther("1"),
    })
  ).wait();
  async function link(session, signer) {
    if (session.account.wallet) return;
    const c = await request("/wallet/challenge", session.token, {});
    await request("/wallet/link", session.token, {
      signature: await signer.signMessage(c.message),
    });
  }
  await link(owner, seller);
  await link(buyer, purchaser);
  await link(admin, registrar);
  const f = new FormData();
  f.set(
    "details",
    new Blob(
      [
        JSON.stringify({
          ownerName: "QA Citizen",
          identityRef: "QA-PRIVATE",
          location: "Demo Village",
          state: "Demo State",
          district: "Demo District",
          survey: "QA-" + suffix,
          area: 120.5,
          propertyType: "Residential",
          address: "Demo parcel",
        }),
      ],
      { type: "application/json" },
    ),
  );
  f.set(
    "document",
    new Blob([fs.readFileSync("../docs/demo-deed.pdf")], {
      type: "application/pdf",
    }),
    "deed.pdf",
  );
  const { id } = await request("/properties", owner.token, f);
  await request("/properties/" + id, buyer.token, undefined, 403);
  await request("/properties/" + id + "/approve", owner.token, {}, 403);
  assert.equal((await request("/public/verify/" + id)).result, "NOT_FOUND");
  assert.equal(
    (await request("/properties/" + id, admin.token)).identity_ref,
    "QA-PRIVATE",
  );
  const approval = await request(
    "/properties/" + id + "/approve",
    admin.token,
    {},
  );
  const artifact = require("../artifacts/contracts/LandRegistry.sol/LandRegistry.json");
  const registry = new ethers.Contract(config.address, artifact.abi, registrar);
  await (
    await registry.registerProperty(id, approval.wallet, approval.digest)
  ).wait();
  const sync = () => request("/chain/sync", admin.token, {});
  await sync();
  assert.equal(
    (await request("/public/verify/" + id, buyer.token)).result,
    "VERIFIED",
  );
  await request("/properties/" + id + "/request", buyer.token, {});
  const requests = await request("/requests", owner.token);
  assert.ok(requests.some((r) => r.property_id === id));
  const to = await purchaser.getAddress();
  await request("/properties/" + id + "/recipient", owner.token, {
    wallet: to,
  });
  await (await registry.connect(seller).initiateTransfer(id, to)).wait();
  await sync();
  await (await registry.reviewTransfer(id, to, false)).wait();
  await sync();
  assert.equal(
    (await request("/properties/" + id, owner.token)).proposed_wallet,
    null,
  );
  await request("/properties/" + id + "/request", buyer.token, {});
  await (await registry.connect(seller).initiateTransfer(id, to)).wait();
  await sync();
  await (await registry.reviewTransfer(id, to, true)).wait();
  await sync();
  const proof = await request("/public/verify/" + id, buyer.token);
  assert.equal(proof.result, "VERIFIED");
  assert.equal(proof.wallet, to.toLowerCase());
  const cert = await fetch(base + "/properties/" + id + "/certificate", {
    headers: { Authorization: "Bearer " + buyer.token },
  });
  assert.equal(cert.status, 200);
  assert.ok((await cert.text()).includes(to.toLowerCase()));
  assert.equal((await request("/public/history?id=" + id)).length, 5);
  assert.ok(
    (await request("/requests", buyer.token)).some(
      (r) => r.property_id === id && r.status === "COMPLETED",
    ),
  );
  assert.ok(
    (await request("/views", buyer.token)).some((r) => r.property_id === id),
  );
  console.log(
    "PASS: private upload, wallet signatures, role checks, registration, public verification, buyer request, rejected and approved transfers, certificate and indexed history. QA parcel " +
      id,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
