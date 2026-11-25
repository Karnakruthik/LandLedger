# Classroom demonstration

Allow three separate registry logins and three wallet accounts. Separate browser profiles or sessions can make role changes easier to follow. The packaged PDF contains fictional land details and creates no registry entry until you submit it.

1. **Register the users.** Create a landowner account for Rahul and a buyer account for Arjun. In each dashboard, select **Link MetaMask** and sign the displayed message with a different wallet. Sign in separately as the configured administrator and link the contract administrator wallet.
2. **Submit the land.** From Rahul’s dashboard choose **Register land**. Use the parcel details printed in [the sample deed](demo-deed.pdf) and upload that PDF. Save the generated property ID. The application appears as pending.
3. **Review and anchor.** Open the pending application in the administrator dashboard, download its deed, and inspect the private identification reference. Select **Approve and sign registration**. Confirm the transaction in MetaMask. Once indexed, the application becomes registered and the on-chain total increases.
4. **Verify independently.** Open **Verify ownership** in a public session and enter the ID. Compare the two SHA-256 values, the owner wallet and the block number. On Sepolia the transaction opens in Etherscan. An unknown ID produces a gray result.
5. **Request and authorize a transfer.** In Arjun’s account, verify the same ID and choose **Request transfer**. Rahul’s dashboard shows the buyer’s request. Select **Authorize transfer**, check the recipient and sign. The administrator now sees a proposed transfer. Rahul can also initiate a transfer directly from the property details.
6. **Approve or reject.** As administrator, open the property and review the pending recipient. Sign **Approve transfer**. Arjun gains the property in his dashboard. To demonstrate rejection, choose **Reject transfer** on a separate proposal and check that the owner stays the same.
7. **Show the audit trail.** Verify the ID again. The wallet has changed and the original deed digest is preserved. Inspect the property’s transaction history and download its registration certificate while signed in as the new owner.
8. **Explain tamper detection.** The backend digest test changes area and document bytes independently. For a live classroom exercise, use a disposable database and record the original test value before editing it. A changed committed field produces a red verification result. Restoring the original input restores the match.

## Automated checks

```powershell
npm.cmd run chain:test
mvn -f backend/pom.xml test
npm.cmd run build
```

The Solidity suite checks access restrictions, duplicate registration, competing recipients, approval, rejection and retained ownership history. The Spring tests cover session protection, restricted role assignment, file validation and digest sensitivity.

### End-to-end local test

Use a dedicated local contract and MySQL database for this test. The script submits fictional accounts and deeds and executes real local EVM transactions. It requires the first unlocked Hardhat account to be the contract administrator. Omit `ADMIN_WALLET` when deploying this test instance. Keep your classroom database and contract separate.

1. Create an empty QA database and grant the registry user access. Run a bridge for the QA contract. Start a backend with its `DB_URL` pointing to the QA database and `PORT=18080`. Leave the Hardhat node listening at 127.0.0.1:8545.
2. In a terminal, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the QA administrator credentials. Run the following from the project root.

```powershell
Set-Location blockchain
node scripts/smoke.cjs
```

The script creates disposable wallets, proves wallet control, submits a PDF, checks private access, anchors the title, verifies it, requests a transfer, exercises both admin decisions and checks the new certificate and chain history. Local transactions appear in the QA registry only.
