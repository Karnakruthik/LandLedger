const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
describe("LandRegistry", () => {
  let registry, admin, owner, buyer;
  const id = "LAND-TEST",
    digest = ethers.sha256(ethers.toUtf8Bytes("title deed"));
  beforeEach(async () => {
    [admin, owner, buyer] = await ethers.getSigners();
    registry = await (
      await ethers.getContractFactory("LandRegistry")
    ).deploy(admin.address);
  });
  it("restricts registration, checks identifiers and commits the supplied digest", async () => {
    await assert.rejects(
      registry.connect(owner).registerProperty(id, owner.address, digest),
    );
    await assert.rejects(registry.registerProperty("", owner.address, digest));
    await registry.registerProperty(id, owner.address, digest);
    assert.equal((await registry.parcels(id)).documentHash, digest);
    await assert.rejects(registry.registerProperty(id, buyer.address, digest));
  });
  it("requires owner initiation and admin review and preserves both titles", async () => {
    await registry.registerProperty(id, owner.address, digest);
    await assert.rejects(
      registry.connect(buyer).initiateTransfer(id, buyer.address),
    );
    await registry.connect(owner).initiateTransfer(id, buyer.address);
    await assert.rejects(
      registry.connect(owner).reviewTransfer(id, buyer.address, true),
    );
    await assert.rejects(registry.reviewTransfer(id, admin.address, true));
    await registry.reviewTransfer(id, buyer.address, true);
    assert.equal(await registry.verifyOwnership(id, buyer.address), true);
    assert.equal(
      (await registry.ownershipChange(id, 0)).newOwner,
      owner.address,
    );
    assert.equal(
      (await registry.ownershipChange(id, 1)).previousOwner,
      owner.address,
    );
    assert.equal(await registry.historyLength(id), 2n);
  });
  it("releases rejected proposals and keeps title with the owner", async () => {
    await registry.registerProperty(id, owner.address, digest);
    await registry.connect(owner).initiateTransfer(id, buyer.address);
    await registry.reviewTransfer(id, buyer.address, false);
    assert.equal(
      (await registry.parcels(id)).proposedOwner,
      ethers.ZeroAddress,
    );
    assert.equal(await registry.verifyOwnership(id, owner.address), true);
  });
});
